#!/bin/bash
# 启动豆包客户端并开启 CDP 调试端口（大肥鱼生图用）
# 用法：bash ~/SurfCore/scripts/start-doubao-cdp.sh
PORT="${1:-9222}"
APP="/Applications/Doubao.app/Contents/MacOS/Doubao"
if [ ! -x "$APP" ]; then echo "找不到豆包：$APP"; exit 1; fi
osascript -e 'quit app "Doubao"' 2>/dev/null
sleep 2
pkill -f "Doubao.app/Contents/MacOS/Doubao" 2>/dev/null
sleep 1
nohup "$APP" --remote-debugging-port="$PORT" >/tmp/doubao-cdp.log 2>&1 &
sleep 5
if curl -sS -m 3 "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; then
  echo "✅ 豆包已启动，CDP 端口 ${PORT} 可用"
else
  echo "❌ 启动失败，看 /tmp/doubao-cdp.log"
  exit 1
fi
