#!/usr/bin/env python3
"""裁掉豆包生成图底部的水印（右下角「豆包 AI 生成」）。

用法：crop-watermark.py <in> <out> [px]
px <= 0 时自动按图片高度 6% 估算（至少 80px，覆盖水印文字高度）。
"""
import sys
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
arg = int(sys.argv[3]) if len(sys.argv) > 3 else 0
img = Image.open(src)
w, h = img.size
px = arg if arg > 0 else max(80, round(h * 0.06))
img.crop((0, 0, w, max(1, h - px))).save(dst, quality=92)
print(f"{dst} crop {px}px")
