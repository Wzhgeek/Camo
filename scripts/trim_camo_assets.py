#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import TypedDict

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_ROOT = ROOT / "public" / "camo"
BACKUP_ROOT = ROOT / "Camo_asset" / "untrimmed-public"
THEMES = ("grey", "perple")
PADDING = 32


class Box(TypedDict):
    left: int
    top: int
    right: int
    bottom: int


def union_box(boxes: list[tuple[int, int, int, int]], size: tuple[int, int]) -> tuple[int, int, int, int]:
    left = max(0, min(box[0] for box in boxes) - PADDING)
    top = max(0, min(box[1] for box in boxes) - PADDING)
    right = min(size[0], max(box[2] for box in boxes) + PADDING)
    bottom = min(size[1], max(box[3] for box in boxes) + PADDING)
    return left, top, right, bottom


def as_box(box: tuple[int, int, int, int]) -> Box:
    return {"left": box[0], "top": box[1], "right": box[2], "bottom": box[3]}


def backup_theme(theme: str, files: list[Path]) -> None:
    target_dir = BACKUP_ROOT / theme
    target_dir.mkdir(parents=True, exist_ok=True)
    for file in files:
        target = target_dir / file.name
        if not target.exists():
            shutil.copy2(file, target)


def trim_theme(theme: str) -> dict[str, object]:
    source_dir = PUBLIC_ROOT / theme
    files = sorted(source_dir.glob("*.png"))
    if not files:
        raise RuntimeError(f"No PNG files found for theme: {theme}")

    backup_theme(theme, files)

    boxes: list[tuple[int, int, int, int]] = []
    original_size: tuple[int, int] | None = None
    file_boxes: dict[str, tuple[int, int, int, int]] = {}

    for file in files:
        with Image.open(file).convert("RGBA") as image:
            if original_size is None:
                original_size = image.size
            elif image.size != original_size:
                raise RuntimeError(f"Mixed image sizes in {theme}: {file.name} is {image.size}, expected {original_size}")
            bbox = image.getchannel("A").getbbox()
            if not bbox:
                raise RuntimeError(f"Image has no visible pixels: {file}")
            boxes.append(bbox)
            file_boxes[file.name] = bbox

    assert original_size is not None
    crop_box = union_box(boxes, original_size)
    output_size = (crop_box[2] - crop_box[0], crop_box[3] - crop_box[1])

    for file in files:
        with Image.open(file).convert("RGBA") as image:
            image.crop(crop_box).save(file)

    return {
        "originalSize": {"width": original_size[0], "height": original_size[1]},
        "cropBox": as_box(crop_box),
        "outputSize": {"width": output_size[0], "height": output_size[1]},
        "files": {
            name: {
                "visibleBox": as_box(box),
                "source": str((PUBLIC_ROOT / theme / name).relative_to(ROOT)),
                "backup": str((BACKUP_ROOT / theme / name).relative_to(ROOT)),
            }
            for name, box in file_boxes.items()
        },
    }


def main() -> None:
    BACKUP_ROOT.mkdir(parents=True, exist_ok=True)
    manifest = {
        "padding": PADDING,
        "themes": {theme: trim_theme(theme) for theme in THEMES},
    }
    (BACKUP_ROOT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
