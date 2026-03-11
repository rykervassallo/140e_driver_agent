import { SerialPort } from "serialport";
import { glob } from "glob";
import { RESP_ACK, RESP_DONE, RESP_ERROR } from "./tools.js";

const BAUD_RATE = 115200;
const ACK_TIMEOUT_MS = 5000;
const MOVE_TIMEOUT_MS = 30000;
const RESET_DELAY_MS = 2000;

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

  private readByte(timeoutMs: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.port?.removeListener("data", onData);
        reject(new Error("Timeout waiting for response byte"));
      }, timeoutMs);

      const onData = (data: Buffer) => {
        clearTimeout(timer);
        this.port?.removeListener("data", onData);
        resolve(data[0]);
      };

      this.port!.on("data", onData);
    });
  }

  async sendCommand(cmdByte: number): Promise<string> {
    if (!this.port?.isOpen) {
      await this.connect();
    }

    this.port!.write(Buffer.from([cmdByte]));
    this.port!.drain();
    console.log(`[serial] Sent: 0x${cmdByte.toString(16).padStart(2, "0")}`);

    // Phase 1: Wait for ACK
    const ack = await this.readByte(ACK_TIMEOUT_MS);
    if (ack === RESP_ERROR) {
      throw new Error(
        `Pi returned ERROR (0xFF) for command 0x${cmdByte.toString(16).padStart(2, "0")}`
      );
    }
    if (ack !== RESP_ACK) {
      throw new Error(
        `Expected ACK (0xAA), got 0x${ack.toString(16).padStart(2, "0")}`
      );
    }
    console.log("[serial] ACK received");

    // Phase 2: Wait for DONE
    const done = await this.readByte(MOVE_TIMEOUT_MS);
    if (done === RESP_ERROR) {
      throw new Error(
        `Pi returned ERROR during movement for 0x${cmdByte.toString(16).padStart(2, "0")}`
      );
    }
    if (done !== RESP_DONE) {
      throw new Error(
        `Expected DONE (0xBB), got 0x${done.toString(16).padStart(2, "0")}`
      );
    }
    console.log("[serial] Movement complete");
    return "DONE";
  }
}
