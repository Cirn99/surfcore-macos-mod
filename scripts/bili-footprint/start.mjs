#!/usr/bin/env node
/**
 * start.mjs —— 以后台方式启动足迹服务，并且**脱离启动它的进程树**
 * ============================================================================
 * 为什么需要它：
 *   用 `nohup node ... &` 起，进程仍然挂在当时的 shell/DSH 的进程组里，
 *   DSH 一重启（GUI 端口会变），整棵子树被收走，页面就变成「读取失败」。
 *   这里用 spawn({detached:true}) 让它成为新会话的首进程（ppid 变 1），
 *   DSH 重启、终端关闭都不影响它。
 *
 * 用法：
 *   node scripts/bili-footprint/start.mjs          # 起（已在跑则不重复起）
 *   node scripts/bili-footprint/start.mjs --open   # 起完顺手打开浏览器
 *   node scripts/bili-footprint/stop.mjs           # 停
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const HOME = process.env.HOME || os.homedir()
const PORT = Number(process.env.PORT || 7801)
const HOST = '127.0.0.1'
const LOG = path.join(HOME, '.dsh', 'surfcore', 'bili-footprint.log')
const PIDFILE = path.join(HOME, '.dsh', 'surfcore', 'bili-footprint.pid')
const URL = `http://${HOST}:${PORT}/`

const portOpen = () => new Promise((resolve) => {
  const socket = net.connect({ host: HOST, port: PORT })
  socket.setTimeout(600)
  socket.once('connect', () => { socket.destroy(); resolve(true) })
  socket.once('timeout', () => { socket.destroy(); resolve(false) })
  socket.once('error', () => resolve(false))
})

if (await portOpen()) {
  console.log(`已经在跑：${URL}`)
  process.exit(0)
}

fs.mkdirSync(path.dirname(LOG), { recursive: true })
const fd = fs.openSync(LOG, 'a')
const args = [path.join(HERE, 'server.mjs'), '--port', String(PORT), ...(process.argv.includes('--open') ? ['--open'] : [])]
const child = spawn(process.execPath, args, {
  cwd: HERE,
  detached: true,
  stdio: ['ignore', fd, fd],
  env: process.env,
})
child.unref()
try { fs.writeFileSync(PIDFILE, String(child.pid)) } catch { /* 无所谓 */ }

// 等它真的监听上，再告诉用户
for (let i = 0; i < 20; i += 1) {
  await new Promise((r) => setTimeout(r, 250))
  if (await portOpen()) {
    console.log(`已后台启动（pid ${child.pid}）→ ${URL}`)
    console.log(`日志：${LOG}`)
    process.exit(0)
  }
}
console.error(`启动失败，看日志：${LOG}`)
process.exit(1)
