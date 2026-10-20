"""Whole-body blur of people and vehicles (section 6, privacy protection).

Each box is padded (so arms, legs and number plates at the edge are covered), pixelated,
then Gaussian-blurred. Pixelating first removes fine detail that a blur alone can leave
partly recoverable. There is no face detection: the whole detected body is hidden.
"""

from __future__ import annotations

from collections.abc import Iterable

from PIL import Image, ImageFilter

PAD = 0.10  # each side, as a share of the box size
MIN_BLOCK = 8  # px


def blur_regions(
    image: Image.Image, boxes: Iterable[tuple[float, float, float, float]]
) -> Image.Image:
    """Return a copy with every (x, y, w, h) box (normalised 0-1) made unrecognisable."""
    out = image.convert("RGB").copy()
    width, height = out.size
    for x, y, w, h in boxes:
        left = max(0, int((x - w * PAD) * width))
        top = max(0, int((y - h * PAD) * height))
        right = min(width, int((x + w * (1 + PAD)) * width) + 1)
        bottom = min(height, int((y + h * (1 + PAD)) * height) + 1)
        if right - left < 2 or bottom - top < 2:
            continue
        region = out.crop((left, top, right, bottom))
        rw, rh = region.size
        block = max(MIN_BLOCK, max(rw, rh) // 12)
        tiny = region.resize((max(1, rw // block), max(1, rh // block)), Image.Resampling.BILINEAR)
        pixelated = tiny.resize((rw, rh), Image.Resampling.NEAREST)
        out.paste(pixelated.filter(ImageFilter.GaussianBlur(max(2, block // 2))), (left, top))
    return out
