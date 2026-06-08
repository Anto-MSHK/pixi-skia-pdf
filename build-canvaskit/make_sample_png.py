#!/usr/bin/env python3
"""Генерирует public/assets/sample.png без внешних зависимостей (чистый zlib).

Создаёт 160x160 RGBA-картинку: радиальный градиент + сетка + рамка —
наглядный спрайт для демонстрации рендера PIXI.Sprite как bitmap.
"""
import struct
import zlib
import os

W = H = 160


def px(x, y):
    cx, cy = W / 2, H / 2
    dx, dy = x - cx, y - cy
    d = (dx * dx + dy * dy) ** 0.5
    r = int(120 + 100 * dx / W)
    g = int(120 + 100 * dy / H)
    b = int(200 - d)
    a = 255
    # сетка
    if x % 32 == 0 or y % 32 == 0:
        r, g, b = 255, 255, 255
    # рамка
    if x < 3 or y < 3 or x >= W - 3 or y >= H - 3:
        r, g, b = 20, 20, 40
    clamp = lambda v: max(0, min(255, v))
    return bytes((clamp(r), clamp(g), clamp(b), a))


def main():
    raw = bytearray()
    for y in range(H):
        raw.append(0)  # filter type 0
        for x in range(W):
            raw += px(x, y)

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", W, H, 8, 6, 0, 0, 0)  # 8bit, RGBA
    idat = zlib.compress(bytes(raw), 9)
    png = sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")

    out = os.path.join(os.path.dirname(__file__), "..", "public", "assets", "sample.png")
    out = os.path.abspath(out)
    with open(out, "wb") as f:
        f.write(png)
    print("written", out, len(png), "bytes")


if __name__ == "__main__":
    main()
