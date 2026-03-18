import "dotenv/config";
import { RCCarAgent } from "./agent.js";
import { Camera } from "./camera.js";

const args = process.argv.slice(2);

// Handle --list-devices flag
if (args.includes("--list-devices")) {
  console.log("Querying AVFoundation devices...\n");
  const output = await Camera.listDevices();
  console.log(output);
  process.exit(0);
}

// Handle --snapshot flag: capture a single frame and save to disk
if (args.includes("--snapshot")) {
  const { writeFileSync } = await import("fs");
  const devIdx = args[args.indexOf("--device") + 1] ?? "0";
  const cam = new Camera(devIdx);
  cam.start(false);
  console.log(`[snapshot] Waiting for a frame from device ${devIdx}...`);
  await new Promise<void>((resolve) => {
    const check = setInterval(() => {
      const frame = cam.getLatestFrame();
      if (frame) {
        clearInterval(check);
        writeFileSync("snapshot.jpg", frame);
        console.log(`[snapshot] Saved snapshot.jpg (${frame.length} bytes)`);
        cam.stop();
        resolve();
      }
    }, 500);
  });
  process.exit(0);
}

// Parse arguments
let prompt: string | undefined;
let port: string | undefined;
let device: string = "0";
let debug = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port" && args[i + 1]) {
    port = args[++i];
  } else if (args[i] === "--device" && args[i + 1]) {
    device = args[++i];
  } else if (args[i] === "--debug") {
    debug = true;
  } else if (!args[i].startsWith("--")) {
    prompt = args[i];
  }
}

// Interactive prompt if not provided
if (!prompt) {
  process.stdout.write("Enter task for the car: ");
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
    if (chunk.toString().includes("\n")) break;
  }
  prompt = Buffer.concat(chunks).toString().trim();
}

if (!prompt) {
  console.error("No task provided. Exiting.");
  process.exit(1);
}

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY not set. Copy .env.example to .env and add your key.");
  process.exit(1);
}

const agent = new RCCarAgent({ serialPort: port, cameraDevice: device, debug });

process.on("SIGINT", () => {
  console.log("\n[ctrl+c] Shutting down...");
  agent.cleanup();
  process.exit(0);
});

try {
  await agent.run(prompt);
} catch (err) {
  console.error("Fatal error:", err);
  agent.cleanup();
  process.exit(1);
}
