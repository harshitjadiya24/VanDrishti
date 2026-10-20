import os
from types import SimpleNamespace

import numpy as np
import pytest
from PIL import Image, ImageFilter

from vandrishti.core.config import Settings
from vandrishti.db.models import ScreenOutcome
from vandrishti.pipeline.quality import QualityConfig, assess, difference_hash, hamming
from vandrishti.pipeline.screen import outcome_of
from vandrishti.privacy.blur import blur_regions


def noise(size: tuple[int, int] = (640, 480), level: int = 255) -> Image.Image:
    raw = np.frombuffer(os.urandom(size[0] * size[1] * 3), dtype=np.uint8).astype(np.uint16)
    data = (raw * level // 255).astype(np.uint8)  # scale to 0..level
    return Image.fromarray(data.reshape(size[1], size[0], 3))


def test_sharp_frame_passes_without_flags() -> None:
    r = assess(noise(), QualityConfig())
    assert r.passed and "blurry" not in r.flags and r.dhash and len(r.dhash) == 16


def test_black_and_white_frames_fail() -> None:
    assert assess(Image.new("RGB", (400, 300), (3, 3, 3)), QualityConfig()).flags[0] == "too_dark"
    white = assess(Image.new("RGB", (400, 300), (255, 255, 255)), QualityConfig())
    assert not white.passed and "white_out" in white.flags


def test_mostly_white_frame_is_only_a_warning() -> None:
    # A 75%-white frame can still show a vehicle (seen in the test sample): never fail it.
    im = Image.new("RGB", (400, 400), (255, 255, 255))
    im.paste(noise((400, 100)), (0, 300))
    r = assess(im, QualityConfig())
    assert r.passed and "overexposed" in r.flags


def test_blur_and_dimness_are_warnings_not_failures() -> None:
    blurred = noise().filter(ImageFilter.GaussianBlur(8))
    r = assess(blurred, QualityConfig())
    assert r.passed and "blurry" in r.flags
    dim = assess(noise(level=60), QualityConfig())
    assert dim.passed and "dim" in dim.flags


def test_grey_frames_are_marked_infrared() -> None:
    grey = noise().convert("L").convert("RGB")
    assert "night_ir" in assess(grey, QualityConfig()).flags


def test_near_duplicates_by_difference_hash() -> None:
    im = noise()
    same = difference_hash(im)
    assert hamming(same, difference_hash(im.copy())) == 0
    assert "near_duplicate" in assess(im, QualityConfig(), previous_dhash=same).flags
    assert hamming(same, difference_hash(noise())) > 10


def test_blur_hides_the_box_and_leaves_the_rest() -> None:
    im = noise((400, 400))
    out = blur_regions(im, [(0.25, 0.25, 0.5, 0.5)])
    a, b = np.asarray(im, dtype=np.int16), np.asarray(out, dtype=np.int16)
    inside = np.abs(a[150:250, 150:250] - b[150:250, 150:250]).mean()
    outside = np.abs(a[:50, :50] - b[:50, :50]).mean()
    assert inside > 30 and outside == 0
    # Detail is gone: the blurred region is nearly flat.
    assert b[150:250, 150:250].std() < a[150:250, 150:250].std() / 4


def box(category: str, confidence: float) -> SimpleNamespace:
    return SimpleNamespace(category=category, confidence=confidence)


@pytest.mark.parametrize(
    ("boxes", "expected"),
    [
        ([], ScreenOutcome.NO_OBJECT),
        ([box("animal", 0.1)], ScreenOutcome.NO_OBJECT),  # below the animal threshold
        ([box("animal", 0.6)], ScreenOutcome.ANIMAL),
        ([box("animal", 0.9), box("person", 0.12)], ScreenOutcome.HUMAN_VEHICLE),
        ([box("vehicle", 0.15)], ScreenOutcome.HUMAN_VEHICLE),  # privacy errs on the safe side
        ([box("person", 0.05)], ScreenOutcome.NO_OBJECT),
    ],
)
def test_outcomes_put_privacy_first(boxes: list[SimpleNamespace], expected: ScreenOutcome) -> None:
    assert outcome_of(boxes, Settings()) is expected
