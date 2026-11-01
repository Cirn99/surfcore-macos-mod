#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""probe.py —— 用已保存的登录态打一次接口，把原始响应落盘，看清字段结构。"""
import json
import sys
from pathlib import Path

import requests

HOME = Path.home() / ".dsh" / "surfcore" / "nikke"
STATE = HOME / "state.json"
COMMON = {
    "game_id": "16", "area_id": "global", "source": "pc_web", "intl_game_id": "29080",
    "language": "ko", "env": "prod", "data_statistics_scene": "outer",
    "data_statistics_client_type": "pc_web", "data_statistics_lang": "ko",
}


def headers(cookie):
    return {
        "Content-Type": "application/json",
        "x-channel-type": "2",
        "x-language": "ko",
        "x-common-params": json.dumps(COMMON, separators=(",", ":")),
        "Cookie": cookie,
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36",
    }


def main():
    st = json.loads(STATE.read_text())
    cookie = "; ".join(f"{c['name']}={c['value']}" for c in st["cookies"])
    area = st["areaId"]
    jobs = {
        "members": ("GetGuildMembers", {"guild_id": st["guildId"], "nikke_area_id": str(area)}),
        "raid": ("GetUnionRaidData", {"guild_id": st["guildId"], "nikke_area_id": area,
                                      "intl_open_id": st["openid"]}),
        "guild": ("GetMyGuildInfo", {"target_intl_open_id": st["openid"],
                                     "target_nikke_area_id": area}),
    }
    for name, (method, payload) in jobs.items():
        r = requests.post(f"https://api.blablalink.com/api/game/proxy/Game/{method}",
                          headers=headers(cookie), json=payload, timeout=30)
        out = HOME / f"raw-{name}.json"
        try:
            body = r.json()
        except Exception:
            print(name, r.status_code, r.text[:300])
            continue
        out.write_text(json.dumps(body, ensure_ascii=False, indent=1))
        data = body.get("data")
        print(f"{name}: HTTP {r.status_code} code={body.get('code')} msg={body.get('msg')!r} "
              f"data_keys={list(data)[:12] if isinstance(data, dict) else type(data).__name__}")
        if isinstance(data, dict):
            for k, v in data.items():
                if isinstance(v, list):
                    print(f"   {k}: list[{len(v)}] sample={json.dumps(v[0], ensure_ascii=False)[:300] if v else ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
