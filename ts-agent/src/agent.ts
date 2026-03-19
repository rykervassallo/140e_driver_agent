import OpenAI from "openai";
import { OpenAIRealtimeWebSocket } from "openai/realtime/websocket";
import Mic from "mic";
import Speaker from "speaker";
import { SerialConnection } from "./serial.js";
import { Camera } from "./camera.js";
import { TOOL_DECLARATIONS, CMD_BYTES } from "./tools.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { DISTANCE_MULTIPLIER, MS_PER_DEGREE, MS_PER_INCH, MIN_MOVEMENT_DELAY_MS } from "./constants.js";
import { RolloutLogger } from "./rollout.js";

const MODEL = "gpt-realtime" as const;
const MAX_IDLE_TURNS = 5;

export interface AgentOptions {
  serialPort?: string;
  cameraDevice?: string;
  debug?: boolean;
}

export class RCCarAgent {
  private client: OpenAI;
  private serial: SerialConnection | null;
  private camera: Camera;
  private debug: boolean;
  private rt: OpenAIRealtimeWebSocket | null = null;
  private frameInterval: ReturnType<typeof setInterval> | null = null;
  private micInstance: ReturnType<typeof Mic> | null = null;
  private audioChunks: Buffer[] = [];
  private pendingToolCall: {
    call_id: string;
    name: string;
    arguments: string;
  } | null = null;
  private frameCounter = 0;
  private lastFrameItemId: string | null = null;
  private resolveDone: (() => void) | null = null;
  private rollout: RolloutLogger = new RolloutLogger();
  private consecutiveIdleTurns = 0;

  constructor(options: AgentOptions = {}) {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.debug = options.debug ?? false;
    this.serial = this.debug ? null : new SerialConnection(options.serialPort);
    this.camera = new Camera(options.cameraDevice ?? "0");
  }

  async run(userPrompt: string): Promise<void> {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`[agent] Task: ${userPrompt}`);
    console.log(`${"=".repeat(60)}\n`);

    // Start hardware
    if (this.serial) await this.serial.connect();
    this.camera.start();

    // Wait a moment for ffmpeg to start producing frames
    await new Promise((r) => setTimeout(r, 2000));

    // Connect to OpenAI Realtime API
    this.rt = await OpenAIRealtimeWebSocket.create(this.client, {
      model: MODEL,
    });

    this.setupEventHandlers(userPrompt);

    // Log session setup
    this.rollout.setup({ model: MODEL, systemInstruction: SYSTEM_PROMPT });
    this.rollout.userTask(userPrompt);

    // Wait until task_complete or cleanup
    return new Promise<void>((resolve) => {
      this.resolveDone = resolve;
    });
  }

  // --- Event handlers ---

  private setupEventHandlers(userPrompt: string): void {
    const rt = this.rt!;

    // Session created — configure and kick off
    rt.on("session.created", () => {
      console.log("[session] Connected");

      // Configure session
      rt.send({
        type: "session.update",
        session: {
          type: "realtime",
          instructions: SYSTEM_PROMPT,
          tools: TOOL_DECLARATIONS,
          output_modalities: ["text"],
          truncation: {
            type: "retention_ratio",
            retention_ratio: 0.8,
          },
          audio: {
            input: {
              format: { type: "audio/pcm", rate: 24000 },
              transcription: { model: "gpt-4o-mini-transcribe" },
              turn_detection: {
                type: "semantic_vad",
                eagerness: "high",
                create_response: true,
                interrupt_response: true,
              },
            },
            output: {
              format: { type: "audio/pcm", rate: 24000 },
              voice: "ash",
            },
          },
        },
      });

      // Send initial camera frame
      this.sendCameraFrame();

      // Send initial user task
      rt.send({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: userPrompt }],
        },
      });

      // Trigger first response
      rt.send({ type: "response.create" });

      // Start concurrent audio + video input streams
      this.startVideoStream();
      this.startAudioStream();
    });

    // --- Audio output ---

    rt.on("response.output_audio.delta", (event) => {
      if (event.delta) {
        this.audioChunks.push(Buffer.from(event.delta, "base64"));
      }
    });

    rt.on("response.output_audio.done", () => {
      if (this.audioChunks.length > 0) {
        const combined = Buffer.concat(this.audioChunks);
        this.audioChunks = [];
        const spk = new Speaker({
          channels: 1,
          bitDepth: 16,
          sampleRate: 24000,
        });
        spk.write(combined);
        spk.end();
      }
    });

    // --- Tool calls ---

    rt.on("response.function_call_arguments.done", (event) => {
      if (!this.pendingToolCall) {
        this.pendingToolCall = {
          call_id: event.call_id,
          name: event.name,
          arguments: event.arguments,
        };
      }
    });

    rt.on("response.done", async (event) => {
      this.rollout.turnComplete();

      // If response was cancelled (e.g. interrupted) or failed, drop pending call
      const response = (event as Record<string, any>).response;
      if (
        response?.status === "cancelled" ||
        response?.status === "failed"
      ) {
        if (this.pendingToolCall) {
          this.rollout.toolCallCancellation([this.pendingToolCall.call_id]);
          this.pendingToolCall = null;
        }
        return;
      }

      // Execute the single pending tool call, then send a fresh camera frame
      if (this.pendingToolCall) {
        const call = this.pendingToolCall;
        this.pendingToolCall = null;
        this.consecutiveIdleTurns = 0;

        // task_complete ends the session — no serial command needed
        if (call.name === "task_complete") {
          const args = JSON.parse(call.arguments);
          console.log(`\n[agent] Task complete: ${args.reason}\n`);
          this.rollout.toolCall(call.name, args, call.call_id);
          this.rollout.toolResponse(call.name, "session ended", call.call_id);
          this.cleanup();
          return;
        }

        this.pauseVideoStream();
        await this.handleToolCall(call);

        // Wait for camera to capture a post-movement frame
        await this.camera.waitForNewFrame();
        this.sendCameraFrame();
        this.resumeVideoStream();

        // Trigger model to continue with tool result + new frame
        rt.send({ type: "response.create" });
      } else {
        // Model responded with text only and no tool call — nudge it to continue
        this.consecutiveIdleTurns++;

        if (this.consecutiveIdleTurns >= MAX_IDLE_TURNS) {
          console.log(
            `[agent] Model idle for ${MAX_IDLE_TURNS} consecutive turns, ending session`,
          );
          this.cleanup();
          return;
        }

        console.log(
          `[agent] No tool call — nudging model to continue (${this.consecutiveIdleTurns}/${MAX_IDLE_TURNS})`,
        );

        // Brief delay to let any user voice input start (which would cancel this)
        await new Promise((r) => setTimeout(r, 500));
        if (!this.rt) return;

        this.sendCameraFrame();
        rt.send({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [
              {
                type: "input_text",
                text: "You have not called task_complete, so the task is NOT finished. Look at the camera frame and make your next move. Keep driving toward the target. If truly done, call task_complete.",
              },
            ],
          },
        });
        rt.send({ type: "response.create" });
      }
    });

    // --- Model text output (audio transcript when in audio mode) ---

    rt.on("response.output_text.done", (event) => {
      if (event.text) {
        this.rollout.outputTranscription(event.text);
        console.log(`[agent] ${event.text}`);
      }
    });

    rt.on("response.output_audio_transcript.done", (event) => {
      if (event.transcript) {
        this.rollout.outputTranscription(event.transcript);
        console.log(`[agent] ${event.transcript}`);
      }
    });

    rt.on(
      "conversation.item.input_audio_transcription.completed",
      (event) => {
        if (event.transcript) {
          this.rollout.inputTranscription(event.transcript);
          console.log(`[you]   ${event.transcript}`);
        }
      },
    );

    // --- Interruptions ---

    rt.on("input_audio_buffer.speech_started", () => {
      this.rollout.interrupted();
      this.audioChunks = [];
    });

    // --- Errors ---

    rt.on("error", (error) => {
      this.rollout.error(error.message);
      console.error("[session] Error:", error.message);
    });

    // --- Socket close ---

    rt.socket.addEventListener("close", (e: CloseEvent) => {
      console.log("[session] Closed:", e.reason);
      this.rollout.sessionClose(e.reason ?? "");
      this.rt = null;
      this.cleanup();
    });
  }

  // --- Input streams ---

  private sendCameraFrame(): void {
    const frame = this.camera.getLatestFrame();
    if (!frame || !this.rt) return;

    // Delete the previous frame to keep context lean
    if (this.lastFrameItemId) {
      this.rt.send({
        type: "conversation.item.delete",
        item_id: this.lastFrameItemId,
      });
    }

    const itemId = `cam_${this.frameCounter++}`;
    this.lastFrameItemId = itemId;

    this.rollout.videoFrame();
    // SDK types don't include input_image yet — cast to bypass
    this.rt.send({
      type: "conversation.item.create",
      item: {
        id: itemId,
        type: "message",
        role: "user",
        content: [
          {
            type: "input_image",
            image_url: `data:image/jpeg;base64,${frame.toString("base64")}`,
          },
        ],
      },
    } as any);
  }

  private startVideoStream(): void {
    this.frameInterval = setInterval(() => {
      this.sendCameraFrame();
    }, 2000);
  }

  private pauseVideoStream(): void {
    if (this.frameInterval) {
      clearInterval(this.frameInterval);
      this.frameInterval = null;
    }
  }

  private resumeVideoStream(): void {
    if (!this.frameInterval) {
      this.frameInterval = setInterval(() => {
        this.sendCameraFrame();
      }, 2000);
    }
  }

  private startAudioStream(): void {
    this.micInstance = Mic({
      rate: "24000",
      channels: "1",
      bitwidth: "16",
      encoding: "signed-integer",
    });

    const micStream = this.micInstance.getAudioStream();
    micStream.on("data", (chunk: Buffer) => {
      if (this.rt) {
        this.rt.send({
          type: "input_audio_buffer.append",
          audio: chunk.toString("base64"),
        });
      }
    });

    micStream.on("error", (err: Error) => {
      console.error("[mic] Error:", err.message);
    });

    this.micInstance.start();
    console.log("[mic] Listening...");
  }

  // --- Tool execution ---

  private async handleToolCall(call: {
    call_id: string;
    name: string;
    arguments: string;
  }): Promise<void> {
    const args = JSON.parse(call.arguments);
    this.rollout.toolCall(call.name, args, call.call_id);

    let result: string;

    {
      // --- Movement tools (serial commands) ---
      const degrees = args.degrees;
      const inches = args.inches;
      const cmdByte = CMD_BYTES[call.name]!;
      const value = degrees ?? inches ?? 0;

      console.log(`[agent] Tool: ${call.name}(${value})`);

      // Wait time proportional to movement so the car finishes before we check the camera
      const delayMs = Math.max(
        MIN_MOVEMENT_DELAY_MS,
        (degrees ? degrees * MS_PER_DEGREE : 0) + (inches ? inches * MS_PER_INCH : 0),
      );

      if (this.debug) {
        console.log(
          `[debug] Would send [0x${cmdByte.toString(16).padStart(2, "0")}, ${value}] (wait ${delayMs}ms)`,
        );
        result = `DONE (debug)`;
      } else {
        try {
          const adjustedValue = ["move_forward", "move_backward"].includes(
            call.name,
          )
            ? value * DISTANCE_MULTIPLIER
            : value;
          const serialResult = await this.serial!.sendCommand(
            cmdByte,
            adjustedValue,
          );
          await new Promise((r) => setTimeout(r, delayMs));
          result = serialResult;
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          result = `Error: ${errMsg}`;
        }
      }
    }

    // Send tool result back to the model
    this.rollout.toolResponse(call.name, result, call.call_id);
    this.rt!.send({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: call.call_id,
        output: result,
      },
    });
  }

  cleanup(): void {
    if (this.frameInterval) {
      clearInterval(this.frameInterval);
      this.frameInterval = null;
    }
    if (this.micInstance) {
      this.micInstance.stop();
      this.micInstance = null;
    }
    this.camera.stop();
    this.serial?.disconnect();
    this.audioChunks = [];
    if (this.rt) {
      try {
        this.rt.close();
      } catch {}
      this.rt = null;
    }
    this.resolveDone?.();
  }
}
