import { spawn, type ChildProcess } from "child_process";

// JPEG markers
const SOI = Buffer.from([0xff, 0xd8]); // Start of Image
const EOI = Buffer.from([0xff, 0xd9]); // End of Image

/**
 * Captures JPEG frames from an AVFoundation camera device (e.g. Continuity Camera)
 * using a long-running ffmpeg process that outputs MJPEG at 1 FPS.
 *
 * Only one ffmpeg process opens the camera. Preview is fed by piping
 * parsed JPEG frames into ffplay via stdin (avoids device contention).
 */
export class Camera {
  private ffmpeg: ChildProcess | null = null;
  private ffplay: ChildProcess | null = null;
  private latestFrame: Buffer | null = null;
  private buffer: Buffer = Buffer.alloc(0);

  constructor(
    private deviceIndex: string = "0",
    private videoSize: string = "1920x1440",
  ) {}

  private captureArgs(): string[] {
    const args = ["-f", "avfoundation", "-pixel_format", "nv12"];
    if (this.videoSize) {
      args.push("-video_size", this.videoSize);
    }
    args.push("-framerate", "30", "-i", `${this.deviceIndex}:none`);
    return args;
  }

  start(showPreview = true): void {
    this.ffmpeg = spawn(
      "ffmpeg",
      [
        ...this.captureArgs(),
        "-r", "2",
        "-f", "image2pipe",
        "-vcodec", "mjpeg",
        "-q:v", "5",
        "-loglevel", "error",
        "pipe:1",
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    this.ffmpeg.stdout!.on("data", (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.extractFrames();
    });

    this.ffmpeg.stderr!.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.error(`[camera] ${msg}`);
    });

    this.ffmpeg.on("close", (code) => {
      if (code !== null && code !== 0) {
        console.error(`[camera] ffmpeg exited with code ${code}`);
      }
    });

    console.log(`[camera] Started capture from device ${this.deviceIndex}`);

    // Preview: ffplay reads MJPEG from stdin (no second device open)
    if (showPreview) {
      this.ffplay = spawn(
        "ffplay",
        [
          "-f", "mjpeg",
          "-probesize", "32",
          "-i", "pipe:0",
          "-window_title", "RC Car Camera",
          "-x", "640",
          "-y", "480",
          "-loglevel", "error",
        ],
        { stdio: ["pipe", "ignore", "pipe"] }
      );

      this.ffplay.stderr!.on("data", (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) console.error(`[preview] ${msg}`);
      });

      this.ffplay.on("close", () => {
        this.ffplay = null;
      });
    }
  }

  private extractFrames(): void {
    // Find complete JPEG frames in the buffer (SOI → EOI)
    while (true) {
      const soiIdx = this.buffer.indexOf(SOI);
      if (soiIdx === -1) break;

      const eoiIdx = this.buffer.indexOf(EOI, soiIdx + 2);
      if (eoiIdx === -1) break;

      // Extract the complete JPEG frame (including the EOI marker)
      this.latestFrame = this.buffer.subarray(soiIdx, eoiIdx + 2);

      // Trim the buffer past this frame
      this.buffer = this.buffer.subarray(eoiIdx + 2);

      // Forward frame to ffplay preview
      if (this.ffplay?.stdin?.writable) {
        this.ffplay.stdin.write(this.latestFrame);
      }
    }
  }

  getLatestFrame(): Buffer | null {
    return this.latestFrame;
  }

  stop(): void {
    if (this.ffplay) {
      this.ffplay.stdin?.end();
      this.ffplay.kill("SIGTERM");
      this.ffplay = null;
    }
    if (this.ffmpeg) {
      this.ffmpeg.kill("SIGTERM");
      this.ffmpeg = null;
      console.log("[camera] Stopped.");
    }
  }

  /**
   * List available AVFoundation devices by running ffmpeg -list_devices.
   * Returns the stderr output which contains the device list.
   */
  static listDevices(): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn("ffmpeg", [
        "-f", "avfoundation",
        "-list_devices", "true",
        "-i", "",
      ]);
      let output = "";
      proc.stderr.on("data", (data: Buffer) => {
        output += data.toString();
      });
      proc.on("close", () => resolve(output));
      proc.on("error", reject);
    });
  }
}
