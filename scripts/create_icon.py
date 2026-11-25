"""Create a small multi-resolution Windows ICO without third-party packages."""
from __future__ import annotations

import math
import os
import struct

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT = os.path.join(ROOT, "public", "ByAzen.ico")
SIZES = (16, 24, 32, 48, 64, 128, 256)
BACKGROUND = (32, 39, 32, 255)  # #202720
FOREGROUND = (195, 212, 173, 255)  # #C3D4AD
DOT = (145, 167, 125, 255)  # #91A77D


def distance_to_segment(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
    dx, dy = bx - ax, by - ay
    length = dx * dx + dy * dy
    t = 0 if length == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / length))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def inside_round_rect(x: float, y: float) -> bool:
    left, top, right, bottom, radius = 3, 3, 61, 61, 19
    if x < left or x > right or y < top or y > bottom:
        return False
    nearest_x = min(max(x, left + radius), right - radius)
    nearest_y = min(max(y, top + radius), bottom - radius)
    return (x - nearest_x) ** 2 + (y - nearest_y) ** 2 <= radius**2


def sample_color(x: float, y: float) -> tuple[int, int, int, int]:
    # Artwork coordinates follow the 64px SVG mark in public/favicon.svg.
    if not inside_round_rect(x, y):
        return (0, 0, 0, 0)
    if math.hypot(x - 47, y - 17) <= 4:
        return DOT
    if (
        distance_to_segment(x, y, 19, 43.5, 31.9, 16) <= 2.25
        or distance_to_segment(x, y, 31.9, 16, 45, 43.5) <= 2.25
        or distance_to_segment(x, y, 24.2, 33, 39.7, 33) <= 2.25
    ):
        return FOREGROUND
    return BACKGROUND


def render(size: int) -> tuple[bytes, bytes]:
    scale = 4
    pixels: list[list[tuple[int, int, int, int]]] = []
    for y in range(size):
        row = []
        for x in range(size):
            channels = [0, 0, 0, 0]
            for sy in range(scale):
                for sx in range(scale):
                    px = (x + (sx + 0.5) / scale) * 64 / size
                    py = (y + (sy + 0.5) / scale) * 64 / size
                    color = sample_color(px, py)
                    for channel in range(4):
                        channels[channel] += color[channel]
            row.append(tuple(round(value / (scale * scale)) for value in channels))
        pixels.append(row)

    xor = bytearray()
    mask = bytearray()
    mask_stride = ((size + 31) // 32) * 4
    for y in range(size - 1, -1, -1):  # ICO DIB rows are bottom-up.
        row = pixels[y]
        for red, green, blue, alpha in row:
            xor.extend((blue, green, red, alpha))
        mask_row = bytearray(mask_stride)
        for x, (_, _, _, alpha) in enumerate(row):
            if alpha < 128:
                mask_row[x // 8] |= 1 << (7 - x % 8)
        mask.extend(mask_row)
    return bytes(xor), bytes(mask)


def build_icon() -> None:
    images = []
    for size in SIZES:
        xor, mask = render(size)
        dib = struct.pack(
            "<IIIHHIIIIII",
            40, size, size * 2, 1, 32, 0, len(xor) + len(mask), 0, 0, 0, 0,
        ) + xor + mask
        images.append((size, dib))

    header = struct.pack("<HHH", 0, 1, len(images))
    offset = 6 + 16 * len(images)
    entries = bytearray()
    payload = bytearray()
    for size, image in images:
        dimension = 0 if size == 256 else size
        entries.extend(struct.pack("<BBBBHHII", dimension, dimension, 0, 0, 1, 32, len(image), offset))
        payload.extend(image)
        offset += len(image)

    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    with open(OUTPUT, "wb") as handle:
        handle.write(header + entries + payload)
    print(f"Created {OUTPUT} ({os.path.getsize(OUTPUT):,} bytes)")


if __name__ == "__main__":
    build_icon()
