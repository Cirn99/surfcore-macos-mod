#!/usr/bin/env python3
"""图文视频生成：TTS 旁白 + 幻灯片 + ffmpeg 合成。

用法：
  python3 make-video.py --spec spec.json --out out.mp4

spec.json：
{
  "title": "总标题",
  "subtitle": "副标题",
  "cover": "/path/bg.jpg",          # 可选，标题页背景
  "voice": {"apiKey": "...", "baseUrl": "https://api.breeze.blue", "voiceId": "..."},
  "ffmpeg": "/path/ffmpeg",
  "segments": [
    {"title": "...", "bullets": ["..."], "source": "来源：...", "narration": "旁白", "image": "/path.png"},
    {"kind": "credits", "title": "参考与致谢", "bullets": ["..."], "source": "...", "narration": "..."}
  ]
}
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request

W, H = 1920, 1080
FONT = "/System/Library/Fonts/PingFang.ttc"
TEXT = (238, 242, 250)
DIM = (148, 158, 178)
ACCENT = (106, 169, 255)
SRC = (120, 132, 152)


def log(msg: str) -> None:
    print(msg, flush=True)


def font(size):
    from PIL import ImageFont
    for path in (FONT, "/System/Library/Fonts/STHeiti Medium.ttc"):
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


def bg():
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (W, H), (15, 17, 24))
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=(int(15 + 9 * t), int(17 + 13 * t), int(24 + 20 * t)))
    return img


def wrap(draw, text, f, width):
    lines, cur = [], ""
    for ch in text:
        if draw.textlength(cur + ch, font=f) <= width:
            cur += ch
        else:
            lines.append(cur)
            cur = ch
    if cur:
        lines.append(cur)
    return lines


def rounded(img, radius=22):
    from PIL import Image, ImageDraw
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.size[0], img.size[1]], radius=radius, fill=255)
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def paste_right(canvas, path, max_w=720, max_h=820):
    from PIL import Image
    im = Image.open(path).convert("RGB")
    scale = min(max_w / im.width, max_h / im.height)
    im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.LANCZOS)
    im = rounded(im)
    canvas.paste(im, (W - 110 - im.width, (H - im.height) // 2), im)


def make_slide(seg, idx, total, spec, out_png):
    from PIL import Image, ImageDraw, ImageFilter
    canvas = bg()
    d = ImageDraw.Draw(canvas)
    if idx == 0:
        cover = spec.get("cover")
        if cover and os.path.isfile(cover):
            im = Image.open(cover).convert("RGB")
            scale = max(W / im.width, H / im.height)
            im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
            left = (im.width - W) // 2
            top = max(0, (im.height - H) // 2 - 300)
            im = im.crop((left, top, left + W, top + H)).filter(ImageFilter.GaussianBlur(6))
            canvas.paste(im, (0, 0))
            dark = Image.new("RGBA", (W, H), (8, 10, 16, 195))
            canvas.paste(dark, (0, 0), dark)
        d.text((110, 300), seg.get("title") or spec.get("title", ""), font=font(66), fill=TEXT)
        d.text((110, 410), spec.get("subtitle", ""), font=font(36), fill=DIM)
        d.text((110, H - 90), "SurfCore · macOS 魔改版 · MIT", font=font(24), fill=(90, 100, 120))
        canvas.save(out_png)
        return
    if seg.get("kind") == "credits":
        d.text((110, 150), seg.get("title", "参考与致谢"), font=font(58), fill=TEXT)
        y = 280
        for b in seg.get("bullets", []):
            d.text((110, y), b, font=font(30), fill=TEXT)
            y += 62
        if seg.get("source"):
            d.text((110, H - 120), seg["source"], font=font(26), fill=SRC)
        canvas.save(out_png)
        return
    d.text((110, 150), f"{idx:02d}", font=font(30), fill=ACCENT)
    d.text((110, 200), seg.get("title", ""), font=font(58), fill=TEXT)
    y = 330
    for b in seg.get("bullets", []):
        d.ellipse([112, y + 16, 124, y + 28], fill=ACCENT)
        for line in wrap(d, b, font(30), 900):
            d.text((146, y), line, font=font(30), fill=TEXT)
            y += 46
        y += 14
    if seg.get("source"):
        d.text((110, H - 120), seg["source"], font=font(24), fill=SRC)
    d.text((110, H - 80), "SurfCore · macOS 魔改版", font=font(20), fill=(80, 90, 110))
    if seg.get("image") and os.path.isfile(seg["image"]):
        paste_right(canvas, seg["image"])
    else:
        big = Image.new("RGBA", (520, 520), (0, 0, 0, 0))
        bd = ImageDraw.Draw(big)
        bd.text((20, 60), f"{idx:02d}", font=font(420), fill=(106, 169, 255, 18))
        canvas.paste(big, (W - 620, 260), big)
        ImageDraw.Draw(canvas).line([(W - 120, 300), (W - 120, 780)], fill=(60, 70, 90), width=2)
    canvas.save(out_png)


def tts(text, voice, out_mp3):
    body = json.dumps({"text": text, "language_code": "zh"}).encode()
    req = urllib.request.Request(
        f"{voice['baseUrl'].rstrip('/')}/v1/text-to-speech/{voice['voiceId']}?output_format=mp3",
        data=body,
        headers={"content-type": "application/json", "xi-api-key": voice["apiKey"], "user-agent": "Mozilla/5.0"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read()
    if not data:
        raise RuntimeError("TTS 返回空音频")
    with open(out_mp3, "wb") as f:
        f.write(data)


def duration(ffmpeg, path):
    p = subprocess.run([ffmpeg, "-i", path], capture_output=True, text=True)
    for line in p.stderr.splitlines():
        if "Duration:" in line:
            t = line.split("Duration:")[1].split(",")[0].strip()
            h, m, s = t.split(":")
            return int(h) * 3600 + int(m) * 60 + float(s)
    return 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--spec", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    spec = json.load(open(args.spec, encoding="utf-8"))
    ffmpeg = spec.get("ffmpeg") or shutil.which("ffmpeg")
    if not ffmpeg or not os.path.isfile(ffmpeg):
        raise SystemExit("找不到 ffmpeg")
    voice = spec["voice"]
    segments = spec["segments"]
    work = tempfile.mkdtemp(prefix="surfvideo-")
    try:
        pieces = []
        for i, seg in enumerate(segments):
            log(f"PROGRESS {i}/{len(segments)} 生成第 {i + 1} 段")
            mp3 = os.path.join(work, f"seg{i}.mp3")
            png = os.path.join(work, f"slide{i}.png")
            mp4 = os.path.join(work, f"seg{i}.mp4")
            tts(seg["narration"], voice, mp3)
            make_slide(seg, i, len(segments), spec, png)
            dur = duration(ffmpeg, mp3) + 0.5
            subprocess.run([
                ffmpeg, "-y", "-loop", "1", "-i", png, "-i", mp3,
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
                "-c:a", "aac", "-b:a", "160k", "-pix_fmt", "yuv420p",
                "-t", f"{dur:.2f}", "-r", "30", "-vf", "scale=1920:1080", mp4,
            ], check=True, capture_output=True)
            pieces.append(mp4)
        list_file = os.path.join(work, "list.txt")
        with open(list_file, "w") as f:
            for p in pieces:
                f.write(f"file '{p}'\n")
        subprocess.run([ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", list_file, "-c", "copy", args.out],
                       check=True, capture_output=True)
        log(f"PROGRESS {len(segments)}/{len(segments)} 完成")
        log(f"OUTPUT {args.out}")
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
