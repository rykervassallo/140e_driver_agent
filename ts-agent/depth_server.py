"""Depth estimation sidecar — communicates with the TS agent via stdio JSON lines.

Dependencies: pip install torch transformers Pillow numpy
"""

import sys, json, base64, io
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import torch
from transformers import pipeline

COLS, ROWS = 4, 3
MODEL = "depth-anything/Depth-Anything-V2-Metric-Indoor-Base-hf"

device = "mps" if torch.backends.mps.is_available() else "cpu"
pipe = pipeline("depth-estimation", model=MODEL, device=device)

# Use a system font for grid labels (macOS)
try:
    font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 20)
except Exception:
    font = ImageFont.load_default()

print(json.dumps({"status": "ready"}), flush=True)

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        req = json.loads(line)
        jpeg_bytes = base64.b64decode(req["jpeg"])
        img = Image.open(io.BytesIO(jpeg_bytes)).convert("RGB")
        w, h = img.size

        # Run depth estimation
        result = pipe(img)
        depth_map = result["predicted_depth"].cpu().to(torch.float32).numpy()

        # Resize depth map to image dimensions
        depth_pil = Image.fromarray(depth_map)
        depth_resized = np.array(depth_pil.resize((w, h), Image.BILINEAR))

        # Compute per-cell median depth (meters -> inches)
        cw, ch = w // COLS, h // ROWS
        cells = {}
        for j in range(ROWS):
            for i in range(COLS):
                cell_id = j * COLS + i + 1
                region = depth_resized[j * ch : (j + 1) * ch, i * cw : (i + 1) * cw]
                cells[str(cell_id)] = round(float(np.median(region)) * 39.3701, 1)

        # Draw grid overlay on image
        draw = ImageDraw.Draw(img)
        for i in range(1, COLS):
            draw.line([(i * cw, 0), (i * cw, h)], fill="red", width=2)
        for j in range(1, ROWS):
            draw.line([(0, j * ch), (w, j * ch)], fill="red", width=2)

        for j in range(ROWS):
            for i in range(COLS):
                cell_id = str(j * COLS + i + 1)
                cx, cy = i * cw + cw // 2, j * ch + ch // 2
                bbox = font.getbbox(cell_id)
                tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
                draw.rectangle(
                    [cx - tw // 2 - 4, cy - th // 2 - 4, cx + tw // 2 + 4, cy + th // 2 + 4],
                    fill="red",
                )
                draw.text((cx - tw // 2, cy - th // 2), cell_id, fill="white", font=font)

        # Encode annotated image
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        resp = {
            "annotated": base64.b64encode(buf.getvalue()).decode(),
            "cells": cells,
        }
        print(json.dumps(resp), flush=True)

    except Exception as e:
        print(json.dumps({"error": str(e)}), flush=True)
