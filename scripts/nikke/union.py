#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
union.py —— 联盟突袭出刀表：拉数据 → 对名单 → 出图
============================================================================
核心：blablalink 的战报只有「打了的人」，看不到「没打的人」。
      所以拿 GetGuildMembers 的完整名单，减去战报里出现过的 openid，差集就是没出刀的。

输出：
  · stdout 最后一行是 JSON（给桥接读）：{ok, png, total, done, missing:[...], summary}
  · 图片落 ~/.dsh/surfcore/nikke/out/
  · 原始响应缓存 60 秒，避免群里连发时把接口打爆
"""
from __future__ import annotations

import json
import sys
import time
from datetime import datetime
from pathlib import Path

import requests
from PIL import Image, ImageDraw, ImageFont

HOME = Path.home() / ".dsh" / "surfcore" / "nikke"
STATE = HOME / "state.json"
OUT = HOME / "out"
CACHE_TTL = 60

COMMON = {
    "game_id": "16", "area_id": "global", "source": "pc_web", "intl_game_id": "29080",
    "language": "ko", "env": "prod", "data_statistics_scene": "outer",
    "data_statistics_client_type": "pc_web", "data_statistics_lang": "ko",
}

# 配色
BG = (18, 20, 26); CARD = (26, 29, 37); LINE = (44, 48, 60)
FG = (232, 235, 242); DIM = (138, 145, 160); GOLD = (240, 195, 74)
RED = (232, 96, 96); GREEN = (110, 200, 140)

FONT_BOLD = "/System/Library/Fonts/STHeiti Medium.ttc"
FONT_REG = "/System/Library/Fonts/Hiragino Sans GB.ttc"


def font(size, bold=False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)


def api(method: str, payload: dict, cookie: str) -> dict:
    r = requests.post(
        f"https://api.blablalink.com/api/game/proxy/Game/{method}",
        headers={
            "Content-Type": "application/json",
            "x-channel-type": "2",
            "x-language": "ko",
            "x-common-params": json.dumps(COMMON, separators=(",", ":")),
            "Cookie": cookie,
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                          "(KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36",
        },
        json=payload, timeout=30,
    )
    body = r.json()
    if body.get("code") != 0:
        raise RuntimeError(f"{method} 失败：code={body.get('code')} {body.get('msg')}")
    return body.get("data") or {}


def cached(name: str, fn):
    f = HOME / f"cache-{name}.json"
    if f.exists() and time.time() - f.stat().st_mtime < CACHE_TTL:
        return json.loads(f.read_text())
    data = fn()
    f.write_text(json.dumps(data, ensure_ascii=False))
    return data


def fmt(n: int) -> str:
    n = float(n)
    if n >= 1e12:
        return f"{n/1e12:.2f}T"
    if n >= 1e9:
        return f"{n/1e9:.2f}B"
    if n >= 1e6:
        return f"{n/1e6:.1f}M"
    if n >= 1e3:
        return f"{n/1e3:.1f}K"
    return str(int(n))


def collect():
    st = json.loads(STATE.read_text())
    cookie = "; ".join(f"{c['name']}={c['value']}" for c in st["cookies"])
    guild_id, area, openid = st["guildId"], st["areaId"], st["openid"]

    members = cached("members", lambda: api(
        "GetGuildMembers", {"guild_id": guild_id, "nikke_area_id": str(area)}, cookie))
    raid = cached("raid", lambda: api(
        "GetUnionRaidData", {"guild_id": guild_id, "nikke_area_id": area, "intl_open_id": openid}, cookie))
    return members, raid


def aggregate(members, raid):
    rows = []
    attacks = {}
    for rec in raid.get("participate_data") or []:
        oid = str(rec.get("openid") or "")
        if not oid:
            continue
        a = attacks.setdefault(oid, {"n": 0, "dmg": 0, "days": {}, "bosses": {}})
        a["n"] += 1
        a["dmg"] += int(rec.get("total_damage") or 0)
        d = int(rec.get("day") or 0)
        a["days"][d] = a["days"].get(d, 0) + 1
        b = (rec.get("name_localvalues") or {}).get("zh-tw") or \
            (rec.get("name_localvalues") or {}).get("en") or "?"
        a["bosses"][b] = a["bosses"].get(b, 0) + 1

    max_day = max((int(r.get("day") or 0) for r in (raid.get("participate_data") or [])), default=0)

    nick_count = {}
    for m in members.get("items") or []:
        nick_count[m.get("nickname")] = nick_count.get(m.get("nickname"), 0) + 1

    for m in members.get("items") or []:
        oid = str(m.get("member_id"))
        a = attacks.get(oid)
        name = m.get("nickname") or "?"
        if nick_count.get(name, 0) > 1:
            name = f"{name}#{oid[-4:]}"
        rows.append({
            "name": name,
            "openid": oid,
            "synchro": m.get("synchro_level") or 0,
            "attacks": a["n"] if a else 0,
            "today": a["days"].get(max_day, 0) if a else 0,
            "damage": a["dmg"] if a else 0,
            "missing": a is None,
        })

    rows.sort(key=lambda r: (-r["damage"], r["name"]))
    total = sum(r["damage"] for r in rows)
    done = sum(1 for r in rows if not r["missing"])
    missing = [r["name"] for r in rows if r["missing"]]
    return rows, total, done, missing, max_day


def render(rows, total, done, missing, max_day, guild_name):
    W = 920
    RH = 32
    H = 300 + RH * len(rows) + 80
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([24, 24, W - 24, H - 24], 22, fill=CARD)
    d.rectangle([24, 24, W - 24, 30], fill=GOLD)

    L, R = 60, W - 60
    d.text((L, 58), "NIKKE 联盟突袭 · 出刀表", font=font(34, True), fill=FG)
    now = datetime.now().strftime("%m-%d %H:%M")
    d.text((L, 106), f"{guild_name} · {done}/{len(rows)} 已出刀 · 总伤害 {fmt(total)} · 更新 {now}",
           font=font(18), fill=DIM)

    chips = [(f"已出刀 {done}", GREEN), (f"未出刀 {len(missing)}", RED), (f"第 {max_day + 1} 天", GOLD)]
    cx = L
    for t, c in chips:
        w = d.textlength(t, font=font(17))
        d.rounded_rectangle([cx, 146, cx + w + 26, 180], 17, fill=tuple(v // 3 for v in c))
        d.text((cx + 13, 152), t, font=font(17), fill=c)
        cx += w + 40

    C0, C1, C2, C3, C4, C5 = L, L + 52, L + 300, L + 372, L + 460, L + 700
    hy = 206
    for xx, t in [(C0, "#"), (C1, "成员"), (C2, "今日"), (C3, "总刀"), (C4, "伤害"), (C5, "状态")]:
        d.text((xx, hy), t, font=font(16), fill=DIM)
    d.line([L, hy + 28, R, hy + 28], fill=LINE, width=1)

    y = 248
    max_dmg = max((r["damage"] for r in rows), default=0) or 1
    for idx, r in enumerate(rows, 1):
        if idx % 2 == 0:
            d.rectangle([44, y - 5, R - 16, y + RH - 7], fill=(30, 34, 43))
        c = RED if r["missing"] else FG
        d.text((C0, y), f"{idx:02d}", font=font(17), fill=RED if r["missing"] else DIM)
        d.text((C1, y), r["name"], font=font(18), fill=c)
        if r["missing"]:
            d.text((C2, y), "0", font=font(17), fill=RED)
            d.text((C3, y), "0", font=font(17), fill=RED)
            d.text((C4, y), "0", font=font(17), fill=RED)
            d.text((C5, y), "未出刀", font=font(16), fill=RED)
        else:
            d.text((C2, y), f'{r["today"]}/3', font=font(17), fill=c)
            d.text((C3, y), str(r["attacks"]), font=font(17), fill=c)
            d.text((C4, y), fmt(r["damage"]), font=font(17), fill=c)
            pct = r["damage"] / max_dmg
            d.rounded_rectangle([C5 - 130, y + 9, C5 - 40, y + 17], 4, fill=(43, 47, 58))
            d.rounded_rectangle([C5 - 130, y + 9, C5 - 130 + max(4, int(90 * pct)), y + 17],
                                4, fill=GOLD)
            d.text((C5, y), "已出刀", font=font(16), fill=GREEN)
        y += RH

    d.text((L, H - 54), "数据源 blablalink · 未出刀 = 公会名单里有、战报里没记录",
           font=font(14), fill=(105, 112, 126))
    OUT.mkdir(parents=True, exist_ok=True)
    p = OUT / f"union-{datetime.now().strftime('%Y%m%d-%H%M%S')}.png"
    img.save(p, quality=95)
    return p


def record(payload: dict):
    """记最近一次结果，插件 UI 的「状态」卡片读它。"""
    try:
        (HOME / "last-run.json").write_text(json.dumps(
            {"at": datetime.now().isoformat(timespec="seconds"), **payload}, ensure_ascii=False))
    except Exception:
        pass


def main():
    members, raid = collect()
    if not (raid.get("participate_data") or []):
        return {"ok": False, "error": "本期没有战报（会战没开或已结束）"}
    rows, total, done, missing, max_day = aggregate(members, raid)
    guild_name = "本会"
    try:
        g = json.loads((HOME / "raw-guild.json").read_text())
        guild_name = g["data"]["card"]["guild_name"]
    except Exception:
        pass
    png = render(rows, total, done, missing, max_day, guild_name)
    summary = (f"{done}/{len(rows)} 已出刀，未出刀 {len(missing)} 人"
               + (f"：{'、'.join(missing[:8])}" if missing else ""))
    return {"ok": True, "png": str(png), "total": total, "done": done,
            "count": len(rows), "missing": missing, "summary": summary}


if __name__ == "__main__":
    started = time.time()
    try:
        payload = main()
    except Exception as e:
        payload = {"ok": False, "error": f"{type(e).__name__}: {e}"}
    payload["ms"] = int((time.time() - started) * 1000)
    record(payload)
    print(json.dumps(payload, ensure_ascii=False))
    sys.exit(0 if payload.get("ok") else 1)
