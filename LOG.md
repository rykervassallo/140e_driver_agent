# Development Log

## Session 1 — Initial Implementation

### Completed
- **agent/tools.py** — Tool definitions mapping tool names to Claude API schemas and serial command strings. Six movement tools defined: turn left/right 15°, move forward/backward 1ft and 2in.
- **agent/serial_comm.py** — Serial communication layer. Auto-detects USB serial ports (`/dev/tty.usbmodem*`, `/dev/ttyACM*`, `/dev/ttyUSB*`). Sends command strings and waits for ACK response from the Pi.
- **agent/camera.py** — Webcam capture using OpenCV. Supports both local camera indices and IP webcam URLs. Resizes frames to max 1024px wide and returns base64-encoded JPEG for the Claude API.
- **agent/prompts.py** — System prompt instructing the model on its role, available tools, and when to stop (no tool calls = task complete).
- **agent/agent.py** — Core agent loop (`RCCarAgent`). Each step: captures frame → calls Claude with vision + tools → executes any tool calls via serial → captures new frame → repeats. Includes history trimming (keep last 10 exchanges) and max iteration limit (50).
- **agent/main.py** — CLI entry point with argparse. Accepts prompt, serial port, and camera source args.
- **requirements.txt** — anthropic, pyserial, opencv-python, Pillow.

### Architecture decisions
- Used Claude's native tool_use API — the model returns `tool_use` blocks which we execute, then send `tool_result` blocks back with a new camera frame.
- History trimming keeps the first message (user prompt) + last 10 messages to stay within context limits.
- Agent stops only when the model explicitly calls `task_complete`. Text-only responses are treated as "thinking out loud" — the loop sends a fresh camera frame and continues.

## Session 2 — Explicit task_complete tool

### Changes
- **agent/tools.py** — Added `task_complete` tool with a `summary` parameter. The model must call this to end the loop.
- **agent/prompts.py** — Updated guidelines: text-only responses continue the loop; `task_complete` is the only way to finish.
- **agent/agent.py** — Text-only responses now send a new camera frame and `continue` the loop instead of returning. Added `task_complete` handling that prints the summary and exits.

### Still to do
- Test with actual hardware (serial + camera).
- Tune system prompt based on real-world behavior.
- Add more tools as needed per PROJECT.md.
- Consider adding a `--dry-run` mode for testing without hardware.
