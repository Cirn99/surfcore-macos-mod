#!/usr/bin/env python3
"""把梗百科词条渲染成一张竖版卡片（PNG）。

用法：
  python3 render-meme-card.py --out /tmp/x.png --json '{"title":"...","tags":[...],"text":"...","source":"..."}'
"""
import argparse
import json
import sys

from PIL import Image, ImageDraw, ImageFont

W = 760
PAD = 40
BG = (16, 19, 26)
PANEL = (27, 32, 48)
ACCENT = (77, 107, 254)
TEXT = (232, 236, 245)
DIM = (150, 158, 176)

FONT_CANDIDATES = [
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/STHeiti Medium.ttc",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
]


def load_font(size):
    for path in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


def wrap(draw, text, font, max_width):
    lines = []
    for raw in str(text or "").split("\n"):
        if not raw.strip():
            lines.append("")
            continue
        line = ""
        for ch in raw:
            if draw.textlength(line + ch, font=font) <= max_width:
                line += ch
            else:
                lines.append(line)
                line = ch
        lines.append(line)
    return lines


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--json", required=True)
    args = ap.parse_args()

    data = json.loads(args.json)
    title = str(data.get("title") or "梗")
    tags = [str(t) for t in (data.get("tags") or [])][:5]
    body = str(data.get("text") or data.get("summary") or "")
    source = str(data.get("source") or "")

    title_font = load_font(44)
    tag_font = load_font(24)
    body_font = load_font(28)
    foot_font = load_font(20)

    tmp = Image.new("RGB", (W, 100), BG)
    draw = ImageDraw.Draw(tmp)
    inner = W - PAD * 2
    title_lines = wrap(draw, title, title_font, inner)
    body_lines = wrap(draw, body, body_font, inner)[:18]

    height = PAD + len(title_lines) * 58 + 20
    if tags:
        height += 46
    height += len(body_lines) * 42 + 24
    if source:
        height += 46
    height += PAD + 30
    height = max(height, 420)

    img = Image.new("RGB", (W, height), BG)
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([16, 16, W - 16, height - 16], radius=28, fill=PANEL)
    draw.rounded_rectangle([16, 16, W - 16, 16 + 10], radius=6, fill=ACCENT)

    y = PAD + 8
    for line in title_lines:
        draw.text((PAD, y), line, font=title_font, fill=TEXT)
        y += 58

    if tags:
        x = PAD
        for tag in tags:
            tw = draw.textlength(tag, font=tag_font)
            draw.rounded_rectangle([x, y, x + tw + 28, y + 38], radius=19, fill=(38, 46, 70))
            draw.text((x + 14, y + 5), tag, font=tag_font, fill=(168, 186, 255))
            x += tw + 38
            if x > W - PAD - 80:
                break
        y += 46

    for line in body_lines:
        draw.text((PAD, y), line, font=body_font, fill=TEXT)
        y += 42

    if source:
        y += 8
        draw.text((PAD, y), f"出处：{source}", font=foot_font, fill=DIM)
        y += 34

    draw.text((PAD, height - PAD - 18), "梗百科 · cnmeme.wiki", font=foot_font, fill=DIM)
    img.save(args.out, "PNG")
    print(args.out)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        print(f"render failed: {exc}", file=sys.stderr)
        sys.exit(1)
