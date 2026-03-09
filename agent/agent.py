"""Core agent loop for the RC car controller."""

import anthropic
from .tools import get_claude_tools, get_cmd_byte
from .serial_comm import SerialConnection
from .camera import Camera
from .prompts import SYSTEM_PROMPT

MAX_ITERATIONS = 50
MODEL = "claude-sonnet-4-6"


class RCCarAgent:
    """Vision-language agent that drives an RC car via tool use."""

    def __init__(self, serial_port: str | None = None, camera_source: int | str = 0):
        self.client = anthropic.Anthropic()
        self.serial = SerialConnection(port=serial_port)
        self.camera = Camera(source=camera_source)
        self.tools = get_claude_tools()
        self.messages: list[dict] = []

    def start(self):
        """Connect to hardware."""
        self.serial.connect()
        self.camera.open()

    def stop(self):
        """Disconnect from hardware."""
        self.camera.close()
        self.serial.disconnect()

    def _capture_image_block(self) -> dict:
        """Capture a frame and return a Claude API image content block."""
        b64 = self.camera.capture_frame_base64()
        return {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/jpeg",
                "data": b64,
            },
        }

    def _execute_tool(self, tool_name: str, tool_input: dict) -> str:
        """Execute a tool call by sending the corresponding 1-byte command."""
        cmd = get_cmd_byte(tool_name)
        if cmd is None:
            return f"Error: unknown tool '{tool_name}'"
        try:
            response = self.serial.send_command(cmd)
            return f"OK: {response}"
        except RuntimeError as e:
            return f"Error: {e}"

    def _trim_history(self, keep_recent: int = 10):
        """Keep only the last N exchange pairs to avoid context overflow.

        Preserves the initial user prompt message.
        """
        if len(self.messages) <= keep_recent + 1:
            return
        # Always keep the first message (user prompt) and last N messages
        self.messages = [self.messages[0]] + self.messages[-(keep_recent):]

    def run(self, user_prompt: str):
        """Run the agent loop until the task is complete or max iterations reached."""
        print(f"\n{'='*60}")
        print(f"[agent] Task: {user_prompt}")
        print(f"{'='*60}\n")

        # Initial message: user prompt + first camera frame
        image_block = self._capture_image_block()
        self.messages = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_prompt},
                    image_block,
                ],
            }
        ]

        for i in range(MAX_ITERATIONS):
            print(f"\n--- Step {i + 1}/{MAX_ITERATIONS} ---")

            # Call Claude
            response = self.client.messages.create(
                model=MODEL,
                max_tokens=1024,
                system=SYSTEM_PROMPT,
                tools=self.tools,
                messages=self.messages,
            )

            # Collect assistant content blocks
            assistant_content = response.content
            self.messages.append({"role": "assistant", "content": assistant_content})

            # Check if the model wants to use tools
            tool_uses = [b for b in assistant_content if b.type == "tool_use"]
            text_blocks = [b for b in assistant_content if b.type == "text"]

            # Print any reasoning text
            for tb in text_blocks:
                print(f"[agent] {tb.text}")

            if not tool_uses:
                # Text-only response — model is thinking out loud, send a new frame and continue
                print("[agent] (thinking, no action taken)")
                new_image = self._capture_image_block()
                self.messages.append(
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "No action taken. Here is the current camera view:"},
                            new_image,
                        ],
                    }
                )
                self._trim_history()
                continue

            # Check for task_complete
            for tu in tool_uses:
                if tu.name == "task_complete":
                    summary = tu.input.get("summary", "")
                    print(f"\n[agent] Task complete: {summary}")
                    # Send tool result to keep API happy, then return
                    self.messages.append(
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "tool_result",
                                    "tool_use_id": tu.id,
                                    "content": "Task ended.",
                                }
                            ],
                        }
                    )
                    return

            # Execute each movement tool call and collect results
            tool_results = []
            for tu in tool_uses:
                print(f"[agent] Calling tool: {tu.name}")
                result = self._execute_tool(tu.name, tu.input)
                print(f"[agent] Result: {result}")
                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": tu.id,
                        "content": result,
                    }
                )

            # After executing tools, capture a new frame and send results + new image
            new_image = self._capture_image_block()
            self.messages.append(
                {
                    "role": "user",
                    "content": [
                        *tool_results,
                        {"type": "text", "text": "Here is the updated camera view after the move:"},
                        new_image,
                    ],
                }
            )

            # Trim history to avoid context overflow
            self._trim_history()

        print("\n[agent] Max iterations reached. Stopping.")
