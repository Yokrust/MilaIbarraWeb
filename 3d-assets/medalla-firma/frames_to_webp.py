"""
Converts the turntable renders (render_giro.py) into the WebP frames the
Home banner loads: theme/assets/mi-giro-d-##.webp and mi-giro-m-##.webp.

    python3 3d-assets/medalla-firma/frames_to_webp.py <render_dir>

<render_dir> contains desktop/giro_###.png and mobile/giro_###.png.
Needs Pillow with WebP support.
"""

import glob
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.normpath(os.path.join(HERE, "..", "..", "theme", "assets"))
VARIANTS = {"desktop": ("d", 72), "mobile": ("m", 70)}  # prefix, WebP quality


def main(render_dir):
    total = 0
    for variant, (prefix, quality) in VARIANTS.items():
        frames = sorted(glob.glob(os.path.join(render_dir, variant, "giro_*.png")))
        if not frames:
            print(f"no frames for {variant}")
            continue
        for index, path in enumerate(frames):
            out = os.path.join(ASSETS, f"mi-giro-{prefix}-{index:02d}.webp")
            Image.open(path).convert("RGB").save(out, "WEBP", quality=quality, method=6)
            total += os.path.getsize(out)
        print(f"{variant}: {len(frames)} frames")
    print(f"total {total / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    main(sys.argv[1])
