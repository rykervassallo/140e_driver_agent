"""USB serial communication with the computer-side Raspberry Pi."""

import glob
import time
import serial


class SerialConnection:
    """Manages the serial link to the computer-side Raspberry Pi."""

    def __init__(self, port: str | None = None, baudrate: int = 115200, timeout: float = 5.0):
        self.baudrate = baudrate
        self.timeout = timeout
        self.port = port or self._find_port()
        self.ser: serial.Serial | None = None

    @staticmethod
    def _find_port() -> str:
        """Auto-detect the Raspberry Pi serial port."""
        candidates = glob.glob("/dev/tty.usbmodem*") + glob.glob("/dev/ttyACM*") + glob.glob("/dev/ttyUSB*")
        if not candidates:
            raise RuntimeError("No USB serial device found. Is the Raspberry Pi connected?")
        return candidates[0]

    def connect(self):
        """Open the serial connection."""
        print(f"[serial] Connecting to {self.port} at {self.baudrate} baud...")
        self.ser = serial.Serial(self.port, self.baudrate, timeout=self.timeout)
        time.sleep(2)  # wait for Pi to reset after connection
        self.ser.reset_input_buffer()
        print("[serial] Connected.")

    def disconnect(self):
        """Close the serial connection."""
        if self.ser and self.ser.is_open:
            self.ser.close()
            print("[serial] Disconnected.")

    def send_command(self, command: str) -> str:
        """Send a command and wait for an ACK line from the Pi.

        Returns the response string from the Pi.
        Raises RuntimeError on timeout or serial error.
        """
        if not self.ser or not self.ser.is_open:
            self.connect()

        line = command.strip() + "\n"
        self.ser.write(line.encode("utf-8"))
        self.ser.flush()
        print(f"[serial] Sent: {command}")

        # Read response (expect ACK or error)
        response = self.ser.readline().decode("utf-8").strip()
        if not response:
            raise RuntimeError(f"Timeout waiting for response to '{command}'")
        print(f"[serial] Received: {response}")
        return response
