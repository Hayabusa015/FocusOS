"""Makes Cortex's icons from the logo, so the icon never drifts from it.

    python3 scripts/make-icons.py

Reads resources/logo-mark.png (the round brain-and-pulse mark, 512 px) and writes
resources/icon.png (256), resources/tray.png (32) and resources/icon.ico (16-256).
The sidebar uses a 128 px copy at src/renderer/assets/logo-mark.png. Needs Pillow. The outputs are committed; rerun this only when the logo changes.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
logo = Image.open(ROOT / "resources/logo-mark.png").convert("RGBA")

out = ROOT / "resources"
out.mkdir(exist_ok=True)
logo.resize((256, 256), Image.LANCZOS).save(out / "icon.png")
logo.resize((32, 32), Image.LANCZOS).save(out / "tray.png")
logo.save(out / "icon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print("wrote resources/icon.png, tray.png, icon.ico")
