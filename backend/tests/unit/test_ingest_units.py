from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from PIL import Image

from tests.images import write_jpeg
from vandrishti.ingest.metadata import load_manifest, local_to_utc, read_exif
from vandrishti.ingest.preprocess import check_image, make_display
from vandrishti.ingest.sequences import group_bursts
from vandrishti.ingest.watch import InboxScanner


def test_exif_time_gps_and_camera(tmp_path: Path) -> None:
    p = write_jpeg(
        tmp_path / "a.jpg", taken="2024:01:13 03:40:12", gps=(22.3375, -80.6), serial="SN9"
    )
    info = read_exif(p)
    assert info.captured_local == datetime(2024, 1, 13, 3, 40, 12)
    assert (info.latitude, info.longitude) == (pytest.approx(22.3375), pytest.approx(-80.6))
    assert (info.make, info.serial) == ("TestCam", "SN9")
    assert info.subset()["gps"] == [info.latitude, info.longitude]


def test_no_gps_fix_and_missing_time(tmp_path: Path) -> None:
    info = read_exif(write_jpeg(tmp_path / "b.jpg", gps=(0.0, 0.0)))
    assert info.latitude is None and info.captured_local is None


def test_camera_clock_is_read_in_the_reserve_time_zone() -> None:
    # 03:40 on an Indian camera is 22:10 UTC the previous day.
    assert local_to_utc(datetime(2024, 1, 13, 3, 40), "Asia/Kolkata") == datetime(
        2024, 1, 12, 22, 10, tzinfo=UTC
    )


def test_manifest_times_default_to_local_clock(tmp_path: Path) -> None:
    csv = tmp_path / "manifest.csv"
    csv.write_text("file_name,datetime\n2017/10/x.jpg,2017-10-21 05:03:46+00:00\n")
    local = load_manifest(csv).get("2017/10/x.jpg")
    assert local == datetime(2017, 10, 21, 5, 3, 46) and local.tzinfo is None
    utc = load_manifest(csv, times_are_local=False).get("2017/10/x.jpg")
    assert utc == datetime(2017, 10, 21, 5, 3, 46, tzinfo=UTC)


def test_corruption_checks(tmp_path: Path) -> None:
    good = write_jpeg(tmp_path / "good.jpg")
    assert check_image(good).ok and check_image(good).width == 320
    empty = tmp_path / "empty.jpg"
    empty.write_bytes(b"")
    assert check_image(empty).reason == "empty file"
    text = tmp_path / "notes.jpg"
    text.write_text("not a picture")
    assert check_image(text).reason == "not an image"
    truncated = tmp_path / "cut.jpg"
    truncated.write_bytes(good.read_bytes()[: good.stat().st_size // 2])
    assert not check_image(truncated).ok


def test_display_copy_is_oriented_resized_rgb_and_leaves_original_alone(tmp_path: Path) -> None:
    src = write_jpeg(tmp_path / "rot.jpg", size=(400, 200), orientation=6)  # rotate 90°
    before = src.read_bytes()
    data, params = make_display(src, max_side=100, denoise=True)
    out = tmp_path / "out.jpg"
    out.write_bytes(data)
    with Image.open(out) as im:
        assert im.mode == "RGB" and im.size == (50, 100)  # portrait after orientation
    assert params["denoise"] == "median3" and params["size"] == [50, 100]
    assert src.read_bytes() == before


def test_bursts_split_on_gaps_and_ignore_order() -> None:
    t0 = datetime(2024, 1, 1, tzinfo=UTC)
    frames = [
        ("c", t0 + timedelta(seconds=4)),
        ("a", t0),
        ("b", t0 + timedelta(seconds=2)),
        ("d", t0 + timedelta(minutes=5)),
    ]
    assert group_bursts(frames, gap_seconds=10) == [["a", "b", "c"], ["d"]]
    assert group_bursts([], 10) == []


def test_inbox_waits_for_files_to_stop_changing(tmp_path: Path) -> None:
    f = write_jpeg(tmp_path / "RES" / "CAM1" / "DCIM" / "a.jpg")
    write_jpeg(tmp_path / "too-shallow.jpg")  # not inside RESERVE/CAMERA: ignored
    scanner = InboxScanner(tmp_path)
    assert scanner.poll() == []  # first sighting
    assert scanner.poll() == [f]  # unchanged since: ready
    assert scanner.poll() == []  # handled
    f.write_bytes(f.read_bytes() + b"\0")  # changed again (e.g. still copying)
    assert scanner.poll() == [] and scanner.poll() == [f]
    scanner.retry([f])
    assert scanner.poll() == [f]
