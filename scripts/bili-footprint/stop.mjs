#!/usr/bin/env node
/** stop.mjs —— 停掉后台的足迹服务（按 pidfile → 端口 → 进程名兜底） */
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const HOME = process.env.HOME || os.homedir()
const PORT = Number(process.env.PORT || 7801)
const PIDFILE = path.join(HOME, '.dsh', 'surfcore', 'bili-footprint.pid')

const portOpen = () => new Promise((resolve) => {
  const socket = net.connect({ host: '127.0.0.1', port: PORT })
  socket.setTimeout(600)
  socket.once('connect', () => { socket.destroy(); resolve(true) })
  socket.once('timeout', () => { socket.destroy(); resolve(false) })
  socket.once('error', () => resolve(false))
})

const killed = []
try {
  const pid = Number(fs.readFileSync(PIDFILE, 'utf8').trim())
  if (pid > 0) { process.kill(pid); killed.push(pid) }
} catch { /* pidfile 不存在 */ }

if (!killed.length) {
  try {
    const pids = execFileSync('pgrep', ['-f', 'bili-footprint/server.mjs'], { encoding: 'utf8' })
      .split('\n').map(Number).filter(Boolean)
    for (const pid of pids) { try { process.kill(pid); killed.push(pid) } catch {} }
  } catch { /* 没有进程 */ }
}

try { fs.unlinkSync(PIDFILE) } catch {}

for (let i = 0; i < 12; i += 1) {
  await new Promise((r) => setTimeout(r, 250))
  if (!(await portOpen())) break
}

console.log(killed.length ? `已停止（pid ${killed.join(', ')}）` : '本来就没在跑')
