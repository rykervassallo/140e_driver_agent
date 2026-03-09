# RC Car Vision Agent — Implementation Plan

## Overview
A vision-language agent that takes a user prompt, continuously observes a phone webcam feed, and issues tool calls (movement commands) to an RC car until the task is complete.

---

## Phase 1: Core Agent Loop

### 1.1 Define the tool interface
- Define each movement command as a callable tool/function:
  - `turn_left_15()` — Turn left 15 degrees
  - `turn_right_15()` — Turn right 15 degrees
  - `move_forward_1ft()` — Move forwards 1 foot
  - `move_forward_2in()` — Move forwards 2 inches
  - `move_backward_1ft()` — Move backwards 1 foot
  - `move_backward_2in()` — Move backwards 2 inches
- Each tool sends a command string over USB serial to the computer-side Raspberry Pi.

### 1.2 USB serial communication layer
- Open a serial connection to the computer-side Raspberry Pi (e.g. `/dev/tty.usbmodem*`).
- Implement `send_command(cmd: str)` that writes the command and waits for an acknowledgement.
- Handle connection errors, timeouts, and retries.

### 1.3 Webcam capture
- Use the phone webcam feed (likely via a virtual camera app or IP webcam over HTTP).
- Capture frames on demand (snap a frame before each agent step).
- Return frames as base64-encoded JPEG images for the vision model.

### 1.4 Agent loop (the core)
```
1. Receive user prompt (e.g. "drive to the red cup")
2. Loop:
   a. Capture current webcam frame
   b. Send frame + prompt + conversation history to Claude API (vision + tool use)
   c. If model returns tool calls → execute them (send commands to car), append results to history
   d. If model returns a text-only response indicating task is complete → break
   e. Optional: short delay between iterations to let the car settle
```

### 1.5 Completion detection
- The model decides when the task is fulfilled based on visual feedback.
- Include a system prompt instructing the model to respond with a completion message (no tool calls) when done.
- Add a max-iteration safety limit to prevent runaway loops.

---

## Phase 2: Claude API Integration

### 2.1 System prompt design
- Describe the agent's role: "You are controlling an RC car via a webcam. You see what the car's camera sees."
- List available tools and what each one does physically.
- Instruct the model to reason about spatial positioning, obstacles, and goal progress.
- Tell the model to stop calling tools and respond with a summary when the task is complete.

### 2.2 Tool use with vision
- Use the Claude API with:
  - `model`: `claude-sonnet-4-6` (or opus for harder tasks)
  - `tools`: the movement tool definitions
  - `messages`: conversation history including image content blocks (base64 frames)
- Handle the tool-use response loop: when the API returns `tool_use` stop reason, execute the tool, append the `tool_result`, and call the API again.

### 2.3 Context management
- Each iteration appends an image + assistant response + tool result to the history.
- To avoid context overflow, implement a sliding window or summarization strategy:
  - Keep the system prompt + user prompt + last N exchanges.
  - Or periodically summarize older history into a compact state description.

---

## Phase 3: Robustness & UX

### 3.1 Error handling
- Serial disconnection → attempt reconnect, notify user.
- Camera feed loss → pause loop, retry capture.
- API errors → retry with backoff.
- Command timeout → report to model so it can adapt.

### 3.2 User interface
- Simple CLI: user types a prompt, agent runs, prints its reasoning and actions.
- Optional: display the webcam frames in a window so the user can watch.
- Allow the user to interrupt (Ctrl+C) to stop the agent mid-task.

### 3.3 Safety
- Max iterations limit (e.g. 50 steps).
- Optional keepalive/heartbeat — if no command sent for N seconds, stop motors.
- Emergency stop command.

---

## Phase 4: Extensions (as needed)

- Add more tools (e.g. `honk()`, `set_speed()`, variable-angle turns).
- Multi-step planning: have the model output a plan before acting.
- Obstacle avoidance prompting.
- Distance estimation heuristics in the system prompt.

---

## File Structure (proposed)
```
final/
├── PROJECT.md
├── PLAN.md
├── agent/
│   ├── main.py           # Entry point — starts the agent loop
│   ├── agent.py           # Core agent loop logic
│   ├── tools.py           # Tool definitions and execution
│   ├── serial_comm.py     # USB serial communication with Rpi
│   ├── camera.py          # Webcam frame capture
│   └── prompts.py         # System prompt and prompt templates
└── requirements.txt       # anthropic, pyserial, opencv-python, etc.
```

## Dependencies
- `anthropic` — Claude API client
- `pyserial` — USB serial communication
- `opencv-python` — Webcam frame capture
- `Pillow` — Image processing (resize/compress frames)
