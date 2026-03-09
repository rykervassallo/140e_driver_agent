"""USB serial communication with the computer-side Raspberry Pi."""

import glob
import time
import serial


class SerialConnection:
    """Manages the serial link to the computer-side Raspberry Pi."""

    def __init__(self, port: str | None = None, baudrate: int = 115200, timeout: float = 5.0, move_timeout: float = 30.0):
        self.baudrate = baudrate
        self.timeout = timeout
        self.move_timeout = move_timeout
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
        """Send a command, wait for ACK, then wait for DONE when movement completes.

        Protocol:
          1. Send: "COMMAND\\n"
          2. Receive: "ACK\\n"  (Pi received the command)
          3. Receive: "DONE\\n" (movement finished)

        Returns "DONE" on success.
        Raises RuntimeError on timeout, NACK, or serial error.
        """
        if not self.ser or not self.ser.is_open:
            self.connect()

        line = command.strip() + "\n"
        self.ser.write(line.encode("utf-8"))
        self.ser.flush()
        print(f"[serial] Sent: {command}")

        # Phase 1: Wait for ACK (short timeout)
        ack = self.ser.readline().decode("utf-8").strip()
        if not ack:
            raise RuntimeError(f"Timeout waiting for ACK to '{command}'")
        if ack != "ACK":
            raise RuntimeError(f"Expected ACK, got '{ack}' for '{command}'")
        print(f"[serial] ACK received")

        # Phase 2: Wait for DONE (longer timeout for movement to complete)
        old_timeout = self.ser.timeout
        self.ser.timeout = self.move_timeout
        done = self.ser.readline().decode("utf-8").strip()
        self.ser.timeout = old_timeout
        if not done:
            raise RuntimeError(f"Timeout waiting for movement to complete: '{command}'")
        if done != "DONE":
            raise RuntimeError(f"Expected DONE, got '{done}' for '{command}'")
        print(f"[serial] Movement complete")
        return "DONE"
