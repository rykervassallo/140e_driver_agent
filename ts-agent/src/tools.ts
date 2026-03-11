import { Type, type FunctionDeclaration } from "@google/genai";

// Command bytes (sent to Pi)
export const CMD_BYTES: Record<string, number> = {
  turn_left_15: 0x01,
  turn_right_15: 0x02,
  move_forward_1ft: 0x03,
  move_forward_2in: 0x04,
  move_backward_1ft: 0x05,
  move_backward_2in: 0x06,
};

// Response bytes (from Pi)
export const RESP_ACK = 0xaa;
export const RESP_DONE = 0xbb;
export const RESP_ERROR = 0xff;

// Gemini function declarations
export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  { name: "turn_left_15", description: "Turn the car left by 15 degrees." },
  { name: "turn_right_15", description: "Turn the car right by 15 degrees." },
  { name: "move_forward_1ft", description: "Move the car forwards by 1 foot." },
  { name: "move_forward_2in", description: "Move the car forwards by 2 inches." },
  { name: "move_backward_1ft", description: "Move the car backwards by 1 foot." },
  { name: "move_backward_2in", description: "Move the car backwards by 2 inches." },
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
