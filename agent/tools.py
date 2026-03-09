"""Tool definitions for the RC car agent."""

# Each tool: (name, description, serial_command)
TOOL_DEFS = [
    {
        "name": "turn_left_15",
        "description": "Turn the car left by 15 degrees.",
        "command": "TURN_LEFT_15",
    },
    {
        "name": "turn_right_15",
        "description": "Turn the car right by 15 degrees.",
        "command": "TURN_RIGHT_15",
    },
    {
        "name": "move_forward_1ft",
        "description": "Move the car forwards by 1 foot.",
        "command": "MOVE_FWD_1FT",
    },
    {
        "name": "move_forward_2in",
        "description": "Move the car forwards by 2 inches.",
        "command": "MOVE_FWD_2IN",
    },
    {
        "name": "move_backward_1ft",
        "description": "Move the car backwards by 1 foot.",
        "command": "MOVE_BWD_1FT",
    },
    {
        "name": "move_backward_2in",
        "description": "Move the car backwards by 2 inches.",
        "command": "MOVE_BWD_2IN",
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

def get_serial_command(tool_name: str) -> str | None:
    """Map a tool name to its serial command string."""
    for t in TOOL_DEFS:
        if t["name"] == tool_name:
            return t["command"]
    return None
