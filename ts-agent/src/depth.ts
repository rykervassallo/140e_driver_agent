import { spawn, type ChildProcess } from "child_process";
import { createInterface, type Interface } from "readline";
import { join } from "path";
import { fileURLToPath } from "url";

let proc: ChildProcess | null = null;
let rl: Interface | null = null;
let lastCells: Record<string, number> = {};

const projectRoot = join(fileURLToPath(import.meta.url), "..", "..");
const scriptPath = join(projectRoot, "depth_server.py");

export function startDepthServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    proc = spawn("uv", ["run", scriptPath], {
      cwd: projectRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });

    proc.stderr!.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.error(`[depth] ${msg}`);
    });

    proc.on("close", (code) => {
      if (code !== null && code !== 0) {
        console.error(`[depth] Process exited with code ${code}`);
      }
      proc = null;
      rl = null;
    });

    rl = createInterface({ input: proc.stdout! });

    // Wait for the "ready" signal (model loaded)
    rl.once("line", (line) => {
      try {
        const msg = JSON.parse(line);
        if (msg.status === "ready") {
          console.log("[depth] Model loaded");
          resolve();
        } else {
          reject(new Error(`Unexpected startup message: ${line}`));
        }
      } catch {
        reject(new Error(`Bad startup message: ${line}`));
      }
    });

    setTimeout(() => reject(new Error("Depth server startup timeout")), 120_000);
  });
}

export function stopDepthServer(): void {
  if (proc) {
    proc.kill("SIGTERM");
    proc = null;
    rl = null;
  }
}

export async function getDepthGrid(
  jpeg: Buffer,
): Promise<{ annotated: Buffer; cells: Record<string, number> }> {
  if (!proc || !rl) throw new Error("Depth server not running");

  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ jpeg: jpeg.toString("base64") }) + "\n";
    proc!.stdin!.write(payload);

    rl!.once("line", (line) => {
      try {
        const resp = JSON.parse(line);
        if (resp.error) {
          reject(new Error(resp.error));
          return;
        }
        lastCells = resp.cells;
        resolve({
          annotated: Buffer.from(resp.annotated, "base64"),
          cells: resp.cells,
        });
      } catch {
        reject(new Error(`Bad depth response: ${line}`));
      }
    });
  });
}

export function getGridDepth(cellId: number): number | null {
  return lastCells[String(cellId)] ?? null;
}
