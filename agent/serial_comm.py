"""USB serial communication with the computer-side Raspberry Pi."""

import glob
import time
import serial
from .tools import RESP_ACK, RESP_DONE, RESP_ERROR


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

    def _read_byte(self, timeout: float | None = None) -> int:
        """Read a single byte, using the given timeout (or default)."""
        old_timeout = self.ser.timeout
        if timeout is not None:
            self.ser.timeout = timeout
        data = self.ser.read(1)
        if timeout is not None:
            self.ser.timeout = old_timeout
        if not data:
            raise RuntimeError("Timeout waiting for response byte")
        return data[0]

    def send_command(self, cmd_byte: int) -> str:
        """Send a 1-byte command, wait for ACK byte, then wait for DONE byte.

        Protocol:
          1. Send: cmd_byte (1 byte)
          2. Receive: 0xAA (ACK — command received)
          3. Receive: 0xBB (DONE — movement complete)

        Returns "DONE" on success.
        Raises RuntimeError on timeout or error response.
        """
        if not self.ser or not self.ser.is_open:
            self.connect()

        self.ser.write(bytes([cmd_byte]))
        self.ser.flush()
        print(f"[serial] Sent: 0x{cmd_byte:02X}")

        # Phase 1: Wait for ACK (short timeout)
        resp = self._read_byte()
        if resp == RESP_ERROR:
            raise RuntimeError(f"Pi returned ERROR (0xFF) for command 0x{cmd_byte:02X}")
        if resp != RESP_ACK:
            raise RuntimeError(f"Expected ACK (0xAA), got 0x{resp:02X}")
        print("[serial] ACK received")

        # Phase 2: Wait for DONE (longer timeout for movement)
        resp = self._read_byte(timeout=self.move_timeout)
        if resp == RESP_ERROR:
            raise RuntimeError(f"Pi returned ERROR during movement for 0x{cmd_byte:02X}")
        if resp != RESP_DONE:
            raise RuntimeError(f"Expected DONE (0xBB), got 0x{resp:02X}")
        print("[serial] Movement complete")
        return "DONE"
