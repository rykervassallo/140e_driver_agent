import { writeFileSync, appendFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROLLOUTS_DIR = join(__dirname, "..", "rollouts");

export class RolloutLogger {
  private filePath: string;
  private startTime: number;

  constructor() {
    mkdirSync(ROLLOUTS_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    this.filePath = join(ROLLOUTS_DIR, `rollout-${ts}.jsonl`);
    this.startTime = Date.now();
    console.log(`[rollout] Logging to ${this.filePath}`);
  }

  private append(event: Record<string, unknown>): void {
    const line = JSON.stringify({
      t: Date.now() - this.startTime,
      ts: new Date().toISOString(),
      ...event,
    });
    appendFileSync(this.filePath, line + "\n");
  }

  /** Log the session config (system prompt, tools, model, etc.) */
  setup(config: Record<string, unknown>): void {
    this.append({ type: "setup", ...config });
  }

  /** Log the initial user task */
  userTask(prompt: string): void {
    this.append({ type: "user_task", prompt });
  }

  /** Log a video frame being sent (no binary data, just metadata) */
  videoFrame(): void {
    this.append({ type: "video_frame" });
  }

  /** Log a transcription from the user (speech-to-text) */
  inputTranscription(text: string): void {
    this.append({ type: "input_transcription", text });
  }

  /** Log a transcription of the model's audio output */
  outputTranscription(text: string): void {
    this.append({ type: "output_transcription", text });
  }

  /** Log that the model was interrupted by user speech */
  interrupted(): void {
    this.append({ type: "interrupted" });
  }

  /** Log the model's turn completing */
  turnComplete(): void {
    this.append({ type: "turn_complete" });
  }

  /** Log a tool call from the model */
  toolCall(name: string, args: unknown, id: string): void {
    this.append({ type: "tool_call", name, args, id });
  }

  /** Log a tool response sent back to the model */
  toolResponse(name: string, result: string, id: string): void {
    this.append({ type: "tool_response", name, result, id });
  }

  /** Log a tool call cancellation */
  toolCallCancellation(ids: string[]): void {
    this.append({ type: "tool_call_cancellation", ids });
  }

  /** Log session close */
  sessionClose(reason: string): void {
    this.append({ type: "session_close", reason });
  }

  /** Log any error */
  error(message: string): void {
    this.append({ type: "error", message });
  }
}
