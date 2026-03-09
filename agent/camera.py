"""Webcam frame capture for the RC car agent."""

import base64
import cv2
from PIL import Image
import io


class Camera:
    """Captures frames from a webcam (phone camera or USB cam)."""

    def __init__(self, source: int | str = 0, max_width: int = 1024):
        """
        Args:
            source: Camera index (0 for default) or URL for IP webcam
                    (e.g. "http://192.168.1.10:8080/video").
            max_width: Resize frames to this max width to save tokens.
        """
        self.source = source
        self.max_width = max_width
        self.cap: cv2.VideoCapture | None = None

    def open(self):
        """Open the camera."""
        print(f"[camera] Opening source: {self.source}")
        self.cap = cv2.VideoCapture(self.source)
        if not self.cap.isOpened():
            raise RuntimeError(f"Failed to open camera source: {self.source}")
        print("[camera] Camera opened.")

    def close(self):
        """Release the camera."""
        if self.cap:
            self.cap.release()
            print("[camera] Camera closed.")

    def capture_frame_base64(self) -> str:
        """Capture a single frame and return it as a base64-encoded JPEG.

        Automatically resizes to max_width to keep API payloads small.
        """
        if not self.cap or not self.cap.isOpened():
            self.open()

        ret, frame = self.cap.read()
        if not ret:
            raise RuntimeError("Failed to capture frame from camera.")

        # Convert BGR (OpenCV) to RGB (PIL)
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        img = Image.fromarray(frame_rgb)

        # Resize if needed
        if img.width > self.max_width:
            ratio = self.max_width / img.width
            new_size = (self.max_width, int(img.height * ratio))
            img = img.resize(new_size, Image.LANCZOS)

        # Encode to JPEG
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=80)
        return base64.standard_b64encode(buf.getvalue()).decode("utf-8")
