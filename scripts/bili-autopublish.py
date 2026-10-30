#!/usr/bin/env python3
"""投稿后自动公开：轮询审核状态，通过后把 is_only_self 改成 0（公开）。

依赖 bili-agent 的 bili_cli 包（脚本里不直接调上传，只复用它的 archive 读取和 edit 载荷构造）。

用法：
  # 只看状态
  python3 bili-autopublish.py --bvid BV1xxxxxxxxx

  # 等审核通过（最多等 6 小时，每 5 分钟查一次），通过就公开
  python3 bili-autopublish.py --bvid BV1xxxxxxxxx --wait 21600 --public
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time

from bilibili_api import Api

from bili_cli import config
from bili_cli.commands import upload as U

POLL_SECONDS = 300


async def get_state(cred, bvid: str) -> dict:
    view = await U._archive_view(cred, bvid)
    arc = view.get("archive") or {}
    return {
        "bvid": bvid,
        "state": arc.get("state"),
        "state_desc": arc.get("state_desc"),
        "private": arc.get("is_only_self") == 1,
        "title": arc.get("title"),
    }


async def set_public(cred, bvid: str) -> dict:
    view = await U._archive_view(cred, bvid)
    arc = view.get("archive") or {}
    if arc.get("is_only_self") in (0, False, None):
        return {"bvid": bvid, "already_public": True}
    payload = U.build_edit(view, {})
    payload["is_only_self"] = 0
    res = await (
        Api(url=U.EDIT_URL, method="POST", verify=True, credential=cred, no_csrf=True, json_body=True)
        .update_params(csrf=cred.bili_jct, t=int(time.time()))
        .update_data(**payload, csrf=cred.bili_jct)
        .update_headers(referer="https://member.bilibili.com")
        .result
    )
    return {"bvid": bvid, "edit": res}


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bvid", required=True)
    ap.add_argument("--wait", type=int, default=0, help="最多等多少秒；0 = 只查一次")
    ap.add_argument("--public", action="store_true", help="审核通过后改成公开")
    args = ap.parse_args()

    cred = config.require_credential()
    deadline = time.time() + max(0, args.wait)
    while True:
        st = await get_state(cred, args.bvid)
        print(json.dumps(st, ensure_ascii=False))
        if st["state"] == 0:
            if args.public and st["private"]:
                print(json.dumps(await set_public(cred, args.bvid), ensure_ascii=False))
                print(json.dumps(await get_state(cred, args.bvid), ensure_ascii=False))
            return 0
        if st["state"] in (-1, -2, -3, -4, -16, -100):
            print("稿件未通过审核，停止等待", file=sys.stderr)
            return 2
        if time.time() >= deadline:
            print("等待超时，仍在审核中", file=sys.stderr)
            return 1
        await asyncio.sleep(min(POLL_SECONDS, max(1, int(deadline - time.time()))))


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
