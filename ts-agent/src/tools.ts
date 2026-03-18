import { Type, type FunctionDeclaration } from "@google/genai";

// Command bytes (sent to Pi, followed by a 1-byte value)
export const CMD_BYTES: Record<string, number> = {
  turn_left: 0x01,
  turn_right: 0x02,
  move_forward: 0x03,
  move_backward: 0x04,
  stop: 0x05,
};

// Response bytes (from Pi)
export const RESP_ACK = 0xaa;
export const RESP_DONE = 0xbb;
export const RESP_ERROR = 0xff;

// Gemini function declarations
export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "turn_left",
    description: "Turn the car left by the specified number of degrees. Each unit is 15 degrees, so the value should be a multiple of 15.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        degrees: {
          type: Type.INTEGER,
          description: "Number of degrees to turn left (must be a multiple of 15, e.g. 15, 30, 45, ... 180).",
        },
      },
      required: ["degrees"],
    },
  },
  {
    name: "turn_right",
    description: "Turn the car right by the specified number of degrees. Each unit is 15 degrees, so the value should be a multiple of 15.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        degrees: {
          type: Type.INTEGER,
          description: "Number of degrees to turn right (must be a multiple of 15, e.g. 15, 30, 45, ... 180).",
        },
      },
      required: ["degrees"],
    },
  },
  {
    name: "move_forward",
    description: "Move the car forward by the specified number of inches.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        inches: {
          type: Type.INTEGER,
          description: "Number of inches to move forward (1-72).",
        },
      },
      required: ["inches"],
    },
  },
  {
    name: "move_backward",
    description: "Move the car backward by the specified number of inches.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        inches: {
          type: Type.INTEGER,
          description: "Number of inches to move backward (1-72).",
        },
      },
      required: ["inches"],
    },
  },
  {
    name: "mark_location",
    description:
      "Mark the car's current position with a name so you can navigate back to it later. Use this whenever you see something interesting or want to remember a spot.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: {
          type: Type.STRING,
          description:
            "A short, memorable name for this location (e.g. 'red cup', 'doorway', 'start').",
        },
        description: {
          type: Type.STRING,
          description:
            "A brief description of what's here or why it's interesting.",
        },
      },
      required: ["name", "description"],
    },
  },
  {
    name: "get_marked_locations",
    description:
      "Get a list of all marked locations with their distance and direction from the car's current position.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: "navigate_to_location",
    description:
      "Get turn-by-turn navigation instructions to reach a previously marked location. Returns the turn direction/degrees and distance to drive.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: {
          type: Type.STRING,
          description: "The name of the marked location to navigate to.",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "task_complete",
    description:
      "Call this tool when you believe the task is fully complete. Provide a short summary of what was accomplished.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        summary: {
          type: Type.STRING,
          description: "A brief summary of what was accomplished.",
        },
      },
      required: ["summary"],
    },
  },
];
