import { SerialPort } from "serialport";
import { glob } from "glob";
import { CMD_BYTES } from "./tools.js";

const BAUD_RATE = 115200;
const RESET_DELAY_MS = 2000;
const STOP_BYTE = CMD_BYTES.stop;

export class SerialConnection {
  private port: SerialPort | null = null;
  private portPath: string | null;

  constructor(portPath?: string) {
    this.portPath = portPath ?? null;
  }

  private async findPort(): Promise<string> {
    const patterns = ["/dev/tty.usbmodem*", "/dev/ttyACM*", "/dev/ttyUSB*"];
    const candidates: string[] = [];
    for (const pattern of patterns) {
      candidates.push(...(await glob(pattern)));
    }
    if (candidates.length === 0) {
      throw new Error(
        "No USB serial device found. Is the Raspberry Pi connected?"
      );
    }
    return candidates[0];
  }

  async connect(): Promise<void> {
    const path = this.portPath ?? (await this.findPort());
    console.log(`[serial] Connecting to ${path} at ${BAUD_RATE} baud...`);

    this.port = new SerialPort({ path, baudRate: BAUD_RATE });

    await new Promise<void>((resolve, reject) => {
      this.port!.on("open", resolve);
      this.port!.on("error", reject);
    });

    // Wait for Pi to reset after connection
    await new Promise((r) => setTimeout(r, RESET_DELAY_MS));
    this.port.flush();
    console.log("[serial] Connected.");
  }

  disconnect(): void {
    if (this.port?.isOpen) {
      this.port.close();
      console.log("[serial] Disconnected.");
    }
  }

  private sendByte(byte: number): void {
    this.port!.write(Buffer.from([byte]));
    this.port!.drain();
  }

  async sendTimedCommand(cmdByte: number, durationMs: number): Promise<string> {
    if (!this.port?.isOpen) {
      await this.connect();
    }

    this.sendByte(cmdByte);
    console.log(`[serial] Start: 0x${cmdByte.toString(16).padStart(2, "0")} for ${durationMs}ms`);

    await new Promise((r) => setTimeout(r, durationMs));

    this.sendByte(STOP_BYTE);
    console.log("[serial] Stop sent");
    return "DONE";
  }
}
