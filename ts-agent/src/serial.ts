import { SerialPort } from "serialport";
import { glob } from "glob";

const BAUD_RATE = 115200;
const RESET_DELAY_MS = 2000;
export class SerialConnection {
  private port: SerialPort | null = null;
  private portPath: string | null;

  constructor(portPath?: string) {
    this.portPath = portPath ?? null;
  }

  private async findPort(): Promise<string> {
    const patterns = ["/dev/tty.usbmodem*", "/dev/tty.usbserial*", "/dev/ttyACM*", "/dev/ttyUSB*"];
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

  /** Send a command byte followed by a value byte, then block until ACK (0x06) is received. */
  async sendCommand(cmdByte: number, value: number, timeoutMs = 15000): Promise<string> {
    if (!this.port?.isOpen) {
      await this.connect();
    }

    const clamped = Math.max(0, Math.min(255, Math.round(value)));
    const buf = Buffer.from([cmdByte, clamped]);
    this.port!.write(buf);
    this.port!.drain();
    console.log(`[serial] Sent: [0x${cmdByte.toString(16).padStart(2, "0")}, ${clamped}], waiting for ACK...`);

    return new Promise<string>((resolve, reject) => {
      const onData = (data: Buffer) => {
        for (const byte of data) {
          if (byte === 0x06) {
            cleanup();
            console.log("[serial] ACK received");
            resolve("DONE");
            return;
          }
        }
      };

      const to = setTimeout(() => {
        cleanup();
        console.warn("[serial] ACK timeout");
        resolve("DONE (timeout, no ACK)");
      }, timeoutMs);

      const cleanup = () => {
        this.port!.off("data", onData);
        clearTimeout(to);
      };

      this.port!.on("data", onData);
    });
  }
}
