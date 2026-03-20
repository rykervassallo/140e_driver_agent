// Command bytes (sent to Pi, followed by a 1-byte value)
export const CMD_BYTES: Record<string, number> = {
  turn_left: 0x01,
  turn_right: 0x02,
  move_forward: 0x03,
  move_backward: 0x04,
};

// Response bytes (from Pi)
export const RESP_ACK = 0xaa;
export const RESP_DONE = 0xbb;
export const RESP_ERROR = 0xff;

const REASONING_PARAM = {
  type: "string",
  description:
    "REQUIRED: Describe what you see in the current camera frame — where is the target relative to the green guide lines? Why are you making this move?",
};

// OpenAI Realtime function tool declarations
export const TOOL_DECLARATIONS = [
  {
    type: "function" as const,
    name: "turn_left",
    description:
      "Turn the car left by the specified number of degrees. Each unit is 15 degrees, so the value should be a multiple of 15.",
    parameters: {
      type: "object",
      properties: {
        reasoning: REASONING_PARAM,
        degrees: {
          type: "integer",
          description:
            "Number of degrees to turn left (must be a multiple of 15, e.g. 15, 30, 45, ... 180).",
        },
      },
      required: ["reasoning", "degrees"],
    },
  },
  {
    type: "function" as const,
    name: "turn_right",
    description:
      "Turn the car right by the specified number of degrees. Each unit is 15 degrees, so the value should be a multiple of 15.",
    parameters: {
      type: "object",
      properties: {
        reasoning: REASONING_PARAM,
        degrees: {
          type: "integer",
          description:
            "Number of degrees to turn right (must be a multiple of 15, e.g. 15, 30, 45, ... 180).",
        },
      },
      required: ["reasoning", "degrees"],
    },
  },
  {
    type: "function" as const,
    name: "move_forward",
    description:
      "Move the car forward by the specified number of inches. ONLY call this after calling look and confirming the target is between the green guide lines.",
    parameters: {
      type: "object",
      properties: {
        reasoning: REASONING_PARAM,
        inches: {
          type: "integer",
          description: "Number of inches to move forward (1-72).",
        },
      },
      required: ["reasoning", "inches"],
    },
  },
  {
    type: "function" as const,
    name: "move_backward",
    description: "Move the car backward by the specified number of inches.",
    parameters: {
      type: "object",
      properties: {
        reasoning: REASONING_PARAM,
        inches: {
          type: "integer",
          description: "Number of inches to move backward (1-72).",
        },
      },
      required: ["reasoning", "inches"],
    },
  },
  {
    type: "function" as const,
    name: "look",
    description:
      "Do nothing — just get a fresh camera frame. Use this to observe the scene before deciding on a movement. You should call this BEFORE calling move_forward to verify the target is between the green guide lines.",
    parameters: {
      type: "object",
      properties: {
        reasoning: {
          type: "string",
          description:
            "REQUIRED: Describe what you see in the current frame and what you are looking for. Where is the target? Is it between the green lines?",
        },
      },
      required: ["reasoning"],
    },
  },
  {
    type: "function" as const,
    name: "get_depth_grid",
    description:
      "Capture the current frame with a numbered grid overlay (cells 1-12, 4 columns x 3 rows). Use this to see which grid cells contain objects you want to measure, then call get_grid_depth with the cell number.",
    parameters: {
      type: "object",
      properties: {
        reasoning: {
          type: "string",
          description: "What you want to measure and why.",
        },
      },
      required: ["reasoning"],
    },
  },
  {
    type: "function" as const,
    name: "get_grid_depth",
    description:
      "Get the median depth in inches for a specific grid cell. Must call get_depth_grid first to see the numbered grid overlay.",
    parameters: {
      type: "object",
      properties: {
        cell_id: {
          type: "integer",
          description: "Grid cell number (1-12).",
        },
      },
      required: ["cell_id"],
    },
  },
  {
    type: "function" as const,
    name: "ask_smart_friend",
    description:
      "Send the current camera frame to a smarter vision model with a question. Use this when you need help identifying objects, understanding the scene, or making complex spatial judgments. Set use_depth_frame=true after calling get_depth_grid to send the numbered grid overlay instead — the smart friend can tell you which cell the target is in.",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "What you want to know about the current camera frame.",
        },
        use_depth_frame: {
          type: "boolean",
          description:
            "If true, send the depth grid frame (with numbered cells) instead of the raw camera frame. Must call get_depth_grid first.",
        },
      },
      required: ["question"],
    },
  },
];
