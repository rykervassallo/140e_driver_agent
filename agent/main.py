"""Entry point for the RC car agent."""

import argparse
import sys
from .agent import RCCarAgent


def main():
    parser = argparse.ArgumentParser(description="RC Car Vision Agent")
    parser.add_argument("prompt", nargs="?", help="Task for the car (e.g. 'drive to the red cup')")
    parser.add_argument("--port", default=None, help="Serial port for the Raspberry Pi (auto-detected if omitted)")
    parser.add_argument("--camera", default=0, help="Camera source: index (0) or IP webcam URL")
    args = parser.parse_args()

    # Get prompt interactively if not provided
    prompt = args.prompt
    if not prompt:
        prompt = input("Enter task for the car: ").strip()
        if not prompt:
            print("No prompt given. Exiting.")
            sys.exit(1)

    # Parse camera source — integer index or string URL
    camera_source = args.camera
    try:
        camera_source = int(camera_source)
    except (ValueError, TypeError):
        pass

    agent = RCCarAgent(serial_port=args.port, camera_source=camera_source)
    try:
        agent.start()
        agent.run(prompt)
    except KeyboardInterrupt:
        print("\n[agent] Interrupted by user.")
    finally:
        agent.stop()


if __name__ == "__main__":
    main()
