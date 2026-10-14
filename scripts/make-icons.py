"""Draws Cortex's icons from the colour tokens, so the icon never drifts from the app.

    python3 scripts/make-icons.py

Reads --color-ground and --color-accent from src/renderer/styles/tokens.css and writes
resources/icon.png (256), resources/tray.png (32) and resources/icon.ico (16-256).
Needs Pillow. The outputs are committed; rerun this only when the tokens or the design change.
"""
import re
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
css = (ROOT / "src/renderer/styles/tokens.css").read_text()


def token(name: str) -> str:
    match = re.search(rf"--color-{name}:\s*(#[0-9a-fA-F]{{6}})", css)
    if not match:
        raise SystemExit(f"--color-{name} not found in tokens.css")
    return match.group(1)


GROUND, ACCENT = token("ground"), token("accent")
SCALE = 8


def draw(size: int, with_background: bool) -> Image.Image:
    s = size * SCALE
    image = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(image)
    if with_background:
        d.rounded_rectangle((0, 0, s - 1, s - 1), radius=int(s * 0.22), fill=GROUND)
    # A "C": an open ring, plus a dot where the ring opens - a thought being captured.
    pad = s * (0.22 if with_background else 0.1)
    width = int(s * (0.12 if with_background else 0.2))
    box = (pad, pad, s - pad, s - pad)
    d.arc(box, start=40, end=320, fill=ACCENT, width=width)
    r = s * (0.07 if with_background else 0.11)
    cx = s / 2 + (s / 2 - pad - width / 2) * 0.766
    cy = s / 2 - (s / 2 - pad - width / 2) * 0.643
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=ACCENT)
    return image.resize((size, size), Image.LANCZOS)


out = ROOT / "resources"
out.mkdir(exist_ok=True)
draw(256, True).save(out / "icon.png")
draw(32, False).save(out / "tray.png")
draw(256, True).save(out / "icon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print("wrote resources/icon.png, tray.png, icon.ico")
