"""Tool definitions for the RC car agent."""

# Serial protocol byte IDs
# Commands (sent to Pi):
#   0x01 = turn left 15°
#   0x02 = turn right 15°
#   0x03 = move forward 1ft
#   0x04 = move forward 2in
#   0x05 = move backward 1ft
#   0x06 = move backward 2in
# Responses (from Pi):
#   0xAA = ACK (command received)
#   0xBB = DONE (movement complete)
#   0xFF = ERROR

CMD_TURN_LEFT_15 = 0x01
CMD_TURN_RIGHT_15 = 0x02
CMD_MOVE_FWD_1FT = 0x03
CMD_MOVE_FWD_2IN = 0x04
CMD_MOVE_BWD_1FT = 0x05
CMD_MOVE_BWD_2IN = 0x06

RESP_ACK = 0xAA
RESP_DONE = 0xBB
RESP_ERROR = 0xFF

TOOL_DEFS = [
    {
        "name": "turn_left_15",
        "description": "Turn the car left by 15 degrees.",
        "cmd_byte": CMD_TURN_LEFT_15,
    },
    {
        "name": "turn_right_15",
        "description": "Turn the car right by 15 degrees.",
        "cmd_byte": CMD_TURN_RIGHT_15,
    },
    {
        "name": "move_forward_1ft",
        "description": "Move the car forwards by 1 foot.",
        "cmd_byte": CMD_MOVE_FWD_1FT,
    },
    {
        "name": "move_forward_2in",
        "description": "Move the car forwards by 2 inches.",
        "cmd_byte": CMD_MOVE_FWD_2IN,
    },
    {
        "name": "move_backward_1ft",
        "description": "Move the car backwards by 1 foot.",
        "cmd_byte": CMD_MOVE_BWD_1FT,
    },
    {
        "name": "move_backward_2in",
        "description": "Move the car backwards by 2 inches.",
        "cmd_byte": CMD_MOVE_BWD_2IN,
    },
]

# Build the Claude API tool schema from our definitions
TASK_COMPLETE_TOOL = {
    "name": "task_complete",
    "description": "Call this tool when you believe the task is fully complete. Provide a short summary of what was accomplished.",
    "input_schema": {
        "type": "object",
        "properties": {
            "summary": {
                "type": "string",
                "description": "A brief summary of what was accomplished.",
            },
        },
        "required": ["summary"],
    },
}


def get_claude_tools():
    """Return tool definitions in Claude API format."""
    movement_tools = [
        {
            "name": t["name"],
            "description": t["description"],
            "input_schema": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        }
        for t in TOOL_DEFS
    ]
    return movement_tools + [TASK_COMPLETE_TOOL]

def get_cmd_byte(tool_name: str) -> int | None:
    """Map a tool name to its 1-byte command ID."""
    for t in TOOL_DEFS:
        if t["name"] == tool_name:
            return t["cmd_byte"]
    return None
