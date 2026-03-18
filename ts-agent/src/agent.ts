import { GoogleGenAI, Modality, StartSensitivity, EndSensitivity, ActivityHandling, TurnCoverage, type LiveServerMessage, type Session } from "@google/genai";
import Mic from "mic";
import Speaker from "speaker";
import { SerialConnection } from "./serial.js";
import { Camera } from "./camera.js";
import { TOOL_DECLARATIONS, CMD_BYTES } from "./tools.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { PositionTracker } from "./position.js";

const MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";

export interface AgentOptions {
  serialPort?: string;
  cameraDevice?: string;
  debug?: boolean;
}

export class RCCarAgent {
  private ai: GoogleGenAI;
  private serial: SerialConnection | null;
  private camera: Camera;
  private debug: boolean;
  private session: Session | null = null;
  private frameInterval: ReturnType<typeof setInterval> | null = null;
  private micInstance: ReturnType<typeof Mic> | null = null;
  private audioChunks: Buffer[] = [];
  private lastHandle: string | undefined;
  private resolveDone: (() => void) | null = null;
  private tracker: PositionTracker = new PositionTracker();

  constructor(options: AgentOptions = {}) {
    this.ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
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

    // Connect to Gemini Live API
    this.session = await this.ai.live.connect({
      model: MODEL,
      callbacks: {
        onopen: () => console.log("[session] Connected"),
        onmessage: (msg: LiveServerMessage) => this.handleMessage(msg),
        onerror: (e: ErrorEvent) => console.error("[session] Error:", e.message),
        onclose: (e: CloseEvent) => {
          console.log("[session] Closed:", e.reason);
          this.cleanup();
        },
      },
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: SYSTEM_PROMPT,
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        contextWindowCompression: { slidingWindow: {} },
        sessionResumption: {},
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        realtimeInputConfig: {
          automaticActivityDetection: {
            startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
            endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
            prefixPaddingMs: 20,
            silenceDurationMs: 300,
          },
          activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
          turnCoverage: TurnCoverage.TURN_INCLUDES_ONLY_ACTIVITY,
        },
      },
    });

    // Send initial task prompt
    this.session.sendClientContent({
      turns: userPrompt,
      turnComplete: true,
    });

    // Start concurrent audio + video input streams
    this.startVideoStream();
    this.startAudioStream();

    // Speaker is created lazily on first audio data to avoid buffer underflow

    // Wait until task_complete or cleanup
    return new Promise<void>((resolve) => {
      this.resolveDone = resolve;
    });
  }

  // --- Concurrent input streams ---

  private startVideoStream(): void {
    this.frameInterval = setInterval(() => {
      const frame = this.camera.getLatestFrame();
      if (frame && this.session) {
        this.session.sendRealtimeInput({
          video: {
            data: frame.toString("base64"),
            mimeType: "image/jpeg",
          },
        });
      }
    }, 500);
  }

  private startAudioStream(): void {
    this.micInstance = Mic({
      rate: "16000",
      channels: "1",
      bitwidth: "16",
      encoding: "signed-integer",
    });

    const micStream = this.micInstance.getAudioStream();
    micStream.on("data", (chunk: Buffer) => {
      if (this.session) {
        this.session.sendRealtimeInput({
          audio: {
            data: chunk.toString("base64"),
            mimeType: "audio/pcm;rate=16000",
          },
        });
      }
    });

    micStream.on("error", (err: Error) => {
      console.error("[mic] Error:", err.message);
    });

    this.micInstance.start();
    console.log("[mic] Listening...");
  }

  // --- Receive handler ---

  private async handleMessage(msg: LiveServerMessage): Promise<void> {
    // Buffer model's audio responses, flush on turn complete
    const content = msg.serverContent;
    if (content?.modelTurn?.parts) {
      for (const part of content.modelTurn.parts) {
        if (part.inlineData?.data) {
          this.audioChunks.push(Buffer.from(part.inlineData.data, "base64"));
        }
      }
    }

    // If the model was interrupted by user speech, drop buffered audio
    if (content?.interrupted) {
      this.audioChunks = [];
    }

    // Flush buffered audio when the model's turn is complete
    if (content?.turnComplete && this.audioChunks.length > 0) {
      const combined = Buffer.concat(this.audioChunks);
      this.audioChunks = [];
      const spk = new Speaker({ channels: 1, bitDepth: 16, sampleRate: 24000 });
      spk.write(combined);
      spk.end();
    }

    // Log transcriptions
    if (content?.outputTranscription?.text) {
      console.log(`[agent] ${content.outputTranscription.text}`);
    }
    if (content?.inputTranscription?.text) {
      console.log(`[you]   ${content.inputTranscription.text}`);
    }

    // Handle tool calls
    if (msg.toolCall) {
      const functionResponses: Array<{
        id: string;
        name: string;
        response: { result: string };
      }> = [];

      for (const fc of msg.toolCall.functionCalls ?? []) {
        if (fc.name === "task_complete") {
          const summary = (fc.args as Record<string, string>)?.summary ?? "";
          console.log(`\n[agent] Task complete: ${summary}`);
          functionResponses.push({
            id: fc.id!,
            name: fc.name,
            response: { result: "Task noted. Continue listening for further instructions." },
          });
          continue;
        }

        // --- Memory tools (no serial commands) ---
        if (fc.name === "mark_location") {
          const args = fc.args as Record<string, string>;
          this.tracker.markLocation(args.name, args.description ?? "");
          console.log(`[agent] Marked location: "${args.name}" at (${Math.round(this.tracker.position.x)}", ${Math.round(this.tracker.position.y)}")`);
          functionResponses.push({
            id: fc.id!,
            name: fc.name,
            response: { result: `Location "${args.name}" marked. ${this.tracker.getStatusString()}` },
          });
          continue;
        }

        if (fc.name === "get_marked_locations") {
          const locations = this.tracker.getMarkedLocations();
          const result = locations.length === 0
            ? "No locations marked yet."
            : locations.map((l) => `"${l.name}": ${l.description} — ${l.distanceInches}" away, ${l.relativeBearing}`).join("\n");
          console.log(`[agent] Get marked locations (${locations.length} total)`);
          functionResponses.push({
            id: fc.id!,
            name: fc.name,
            response: { result: `${result}\n\nCurrent: ${this.tracker.getStatusString()}` },
          });
          continue;
        }

        if (fc.name === "navigate_to_location") {
          const args = fc.args as Record<string, string>;
          const nav = this.tracker.navigateTo(args.name);
          const result = nav.found
            ? nav.description!
            : `No location named "${args.name}" found. Use get_marked_locations to see available locations.`;
          console.log(`[agent] Navigate to "${args.name}": ${result}`);
          functionResponses.push({
            id: fc.id!,
            name: fc.name,
            response: { result: `${result}\n\nCurrent: ${this.tracker.getStatusString()}` },
          });
          continue;
        }

        // --- Movement tools (serial commands) ---
        const args = fc.args as Record<string, number>;
        const degrees = args?.degrees;
        const inches = args?.inches;
        const cmdByte = CMD_BYTES[fc.name!]!;
        const value = degrees ?? inches ?? 0;

        console.log(`[agent] Tool: ${fc.name}(${value})`);

        // Update position tracker
        if (fc.name === "turn_left") {
          this.tracker.applyTurn(-(degrees ?? 0));
        } else if (fc.name === "turn_right") {
          this.tracker.applyTurn(degrees ?? 0);
        } else if (fc.name === "move_forward") {
          this.tracker.applyMove(inches ?? 0);
        } else if (fc.name === "move_backward") {
          this.tracker.applyMove(-(inches ?? 0));
        }

        console.log(`[pos] ${this.tracker.getStatusString()}`);

        if (this.debug) {
          console.log(`[debug] Would send [0x${cmdByte.toString(16).padStart(2, "0")}, ${value}]`);
          functionResponses.push({
            id: fc.id!,
            name: fc.name!,
            response: { result: `DONE (debug). ${this.tracker.getStatusString()}` },
          });
        } else {
          try {
            const result = await this.serial!.sendCommand(cmdByte, value);
            functionResponses.push({
              id: fc.id!,
              name: fc.name!,
              response: { result: `${result}. ${this.tracker.getStatusString()}` },
            });
          } catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            functionResponses.push({
              id: fc.id!,
              name: fc.name!,
              response: { result: `Error: ${errMsg}` },
            });
          }
        }
      }

      if (functionResponses.length > 0) {
        this.session!.sendToolResponse({ functionResponses });
      }
    }

    // Track session resumption handles
    if (msg.sessionResumptionUpdate?.newHandle) {
      this.lastHandle = msg.sessionResumptionUpdate.newHandle;
    }
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
    this.resolveDone?.();
  }
}
