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
        degrees: {
          type: "integer",
          description:
            "Number of degrees to turn left (must be a multiple of 15, e.g. 15, 30, 45, ... 180).",
        },
      },
      required: ["degrees"],
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
        degrees: {
          type: "integer",
          description:
            "Number of degrees to turn right (must be a multiple of 15, e.g. 15, 30, 45, ... 180).",
        },
      },
      required: ["degrees"],
    },
  },
  {
    type: "function" as const,
    name: "move_forward",
    description: "Move the car forward by the specified number of inches.",
    parameters: {
      type: "object",
      properties: {
        inches: {
          type: "integer",
          description: "Number of inches to move forward (1-72).",
        },
      },
      required: ["inches"],
    },
  },
  {
    type: "function" as const,
    name: "move_backward",
    description: "Move the car backward by the specified number of inches.",
    parameters: {
      type: "object",
      properties: {
        inches: {
          type: "integer",
          description: "Number of inches to move backward (1-72).",
        },
      },
      required: ["inches"],
    },
  },
  {
    type: "function" as const,
    name: "task_complete",
    description:
      "Call this ONLY when the task is fully complete (target is within arm's reach and fills most of the frame) or you are completely stuck and cannot make further progress. This ends the session.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description:
            "Brief explanation of why the task is complete or why you cannot continue.",
        },
      },
      required: ["reason"],
    },
  },
];
