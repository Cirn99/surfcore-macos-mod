#!/usr/bin/env node
/**
 * server.mjs —— 大肥鱼的 B站活动足迹（本地只读后台）
 * ============================================================================
 * 为什么单独起一个服务，而不是塞进 DSH 设置页：
 *   · 设置页是插件 bundle，改一次要重启 DSH；这个页面是独立进程，改完刷新就行
 *   · 这里只读文件、不写任何东西，也不碰账号，崩了不影响桥接和插件
 *
 * 数据全部来自她自己的记账（按角色隔离）：
 *   characters/<id>/bili/watch-history.jsonl   看过的视频
 *   characters/<id>/bili/quota.json            评论记账（type=comment）
 *   characters/<id>/bili/bili-memory.json      发过的动态
 *   characters/<id>/bili/favorites.json        收藏
 *   characters/<id>/bili/bili-video-titles.json 标题缓存（补评论所指的视频）
 *
 * 用法：node scripts/bili-footprint/server.mjs [--port 7801] [--open]
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const HOME = process.env.HOME || os.homedir()
const SURFCORE = path.join(HOME, '.dsh', 'surfcore')
const CURRENT = path.join(SURFCORE, 'characters', 'current.json')

const argv = process.argv.slice(2)
const argOf = (name, def) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def
}
const PORT = Number(argOf('port', process.env.PORT || 7801))
const TITLE_CACHE = path.join(SURFCORE, 'bili-footprint-titles.json')
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0 Safari/537.36'
const HOST = '127.0.0.1'

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}
function readJsonl(file) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => {
      try { return JSON.parse(line) } catch { return null }
    }).filter(Boolean)
  } catch { return [] }
}
function iso(value) {
  const d = new Date(value ?? 0)
  return Number.isFinite(d.getTime()) ? d.toISOString() : ''
}
const bvOf = (v) => (/BV[0-9A-Za-z]{10}/.exec(String(v ?? '')) || [])[0] || ''
const videoUrl = (bv) => (bv ? `https://www.bilibili.com/video/${bv}` : '')
const fmtDur = (s) => {
  const n = Number(s) || 0
  if (!n) return ''
  const m = Math.floor(n / 60)
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}` : `${m}:${String(n % 60).padStart(2, '0')}`
}

/** 动态正文常以和标题相同的「【…】」打头，还带一条裸链接；展示时去掉，标题已经能点。 */
function cleanDynamicText(text, title) {
  let s = String(text ?? '').trim()
  const lead = /^【[^】]{0,24}】/.exec(s)
  const leadT = /^【[^】]{0,24}】/.exec(String(title ?? ''))
  if (lead && leadT && lead[0] === leadT[0]) s = s.slice(lead[0].length).trim()
  s = s.replace(/\s*https?:\/\/\S+\s*$/, '').trim()
  return s
}

/** 评论正文开头通常是「@某人 内容」，把对象拆出来单独展示。 */
function splitReplyTarget(note) {
  const s = String(note ?? '').trim()
  const m = /^@([^\s，,：:]{1,24})\s*(.*)$/.exec(s)
  return m ? { replyTo: m[1], text: m[2] } : { replyTo: '', text: s }
}

let titleCache = readJson(TITLE_CACHE, {}) || {}
let resolving = false

/** 标题缓存里没有的 BV，后台慢慢问 B站（每次最多 8 条，250ms 间隔，失败就跳过）。 */
async function resolveTitles(bvs) {
  if (resolving) return
  const missing = [...new Set(bvs.filter(Boolean))].filter((bv) => !titleCache[bv]?.title).slice(0, 8)
  if (!missing.length) return
  resolving = true
  for (const bv of missing) {
    try {
      const res = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bv)}`, {
        headers: { 'user-agent': UA, referer: 'https://www.bilibili.com/' },
        signal: AbortSignal.timeout(8000),
      })
      const json = await res.json()
      if (json.code === 0 && json.data?.title) {
        titleCache[bv] = { title: json.data.title, owner: json.data.owner?.name || '' }
      }
    } catch { /* 拿不到就下次再试 */ }
    await new Promise((r) => setTimeout(r, 250))
  }
  try { fs.writeFileSync(TITLE_CACHE, JSON.stringify(titleCache)) } catch { /* 忽略 */ }
  resolving = false
}

function characterInfo() {
  const cur = readJson(CURRENT, null)
  if (!cur?.id) return { id: '', name: '未知角色', dir: '' }
  return { id: cur.id, name: cur.name || cur.id, dir: path.join(SURFCORE, 'characters', cur.id, 'bili') }
}

function loadEvents() {
  const ch = characterInfo()
  const dir = ch.dir
  const titles = (readJson(path.join(dir, 'bili-video-titles.json'), {}) || {}).items || {}
  const titleOf = (bv) => titles[bv]?.title || titleCache[bv]?.title || ''
  const upOf = (bv) => titles[bv]?.owner || titleCache[bv]?.owner || ''

  const events = []

  // ── 看过的视频 ──────────────────────────────────────────────────────────
  for (const w of readJsonl(path.join(dir, 'watch-history.jsonl'))) {
    const bv = w.bvid || bvOf(w.bvid)
    events.push({
      kind: 'watch',
      at: iso(w.at),
      title: w.title || titleOf(bv),
      url: videoUrl(bv),
      bvid: bv,
      up: w.up || upOf(bv),
      detail: '',
      meta: {
        mode: w.mode || '',
        duration: fmtDur(w.duration),
        score: Number(w.score) || 0,
        source: w.source || '',
      },
    })
  }

  // ── 评论（谁、在哪条视频下、说了什么）──────────────────────────────────
  const quota = readJson(path.join(dir, 'quota.json'), { log: [] }) || { log: [] }
  for (const c of quota.log || []) {
    if (c.type !== 'comment') continue
    const bv = bvOf(c.target)
    const { replyTo, text } = splitReplyTarget(c.note)
    events.push({
      kind: 'comment',
      at: iso(c.at),
      title: titleOf(bv) || bv || '（标题未缓存）',
      url: videoUrl(bv),
      bvid: bv,
      up: upOf(bv),
      detail: text,
      meta: {
        replyTo,
        form: c.share ? '分享评论' : c.mine ? '动态回复' : c.reply ? '回复别人' : c.ta ? '主动搭话' : '主评论',
        parent: c.parent || '',
      },
    })
  }

  // ── 发过的动态 ──────────────────────────────────────────────────────────
  const mem = readJson(path.join(dir, 'bili-memory.json'), { entries: [] }) || { entries: [] }
  for (const e of mem.entries || []) {
    if (e.type !== 'dynamic') continue
    events.push({
      kind: 'dynamic',
      at: iso(e.at),
      title: e.title || '（无标题动态）',
      url: e.url || '',
      bvid: bvOf(e.bvid || ''),
      up: '',
      detail: cleanDynamicText(e.text, e.title),
      meta: { dynId: String(e.id || '').replace(/^dynamic:/, '') },
    })
  }

  // ── 收藏 ────────────────────────────────────────────────────────────────
  const fav = readJson(path.join(dir, 'favorites.json'), { items: [] }) || { items: [] }
  for (const f of fav.items || []) {
    const bv = f.bv || bvOf(f.bv)
    events.push({
      kind: 'favorite',
      at: iso(f.at),
      title: f.title || titleOf(bv),
      url: videoUrl(bv),
      bvid: bv,
      up: f.up || upOf(bv),
      detail: f.reason || '',
      meta: { tag: f.kind || '' },
    })
  }

  // ── 私信（只发给主人，dm.mjs 成功后才记）──────────────────────────────
  for (const d of readJsonl(path.join(dir, 'dm-history.jsonl'))) {
    events.push({
      kind: 'dm',
      at: iso(d.at),
      title: `私信 ${d.name || d.mid || ''}`.trim(),
      url: d.mid ? `https://space.bilibili.com/${d.mid}` : '',
      bvid: '',
      up: '',
      detail: d.text || '',
      meta: { share: Boolean(d.share) },
    })
  }

  // ── 去重（同一秒同一 bvid 同类型只留一条）─────────────────────────────
  const seen = new Set()
  const deduped = events.filter((e) => {
    const key = `${e.kind}|${e.bvid}|${e.at}`
    if (e.at && seen.has(key)) return false
    if (e.at) seen.add(key)
    return true
  }).sort((a, b) => String(b.at).localeCompare(String(a.at)))

  resolveTitles(deduped.filter((e) => e.bvid && (!e.title || e.title === e.bvid)).map((e) => e.bvid))
    .catch(() => {})
  return { character: { id: ch.id, name: ch.name }, events: deduped, generatedAt: new Date().toISOString() }
}

function stats(events) {
  const now = Date.now()
  const day = 24 * 3600 * 1000
  const bucket = { total: events.length, today: 0, week: 0, byKind: {} }
  for (const e of events) {
    bucket.byKind[e.kind] = (bucket.byKind[e.kind] || 0) + 1
    const t = Date.parse(e.at)
    if (!Number.isFinite(t)) continue
    if (now - t < day) bucket.today += 1
    if (now - t < 7 * day) bucket.week += 1
  }
  return bucket
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`)
  if (url.pathname === '/api/events') {
    try {
      const data = loadEvents()
      data.stats = stats(data.events)
      const body = JSON.stringify(data)
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(body)
    } catch (error) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: false, error: String(error?.message || error) }))
    }
    return
  }
  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, uptime: process.uptime() }))
    return
  }
  if (url.pathname === '/' || url.pathname === '/index.html') {
    try {
      const html = fs.readFileSync(path.join(HERE, 'index.html'))
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      res.end(html)
    } catch (error) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(`读不到 index.html：${error.message}`)
    }
    return
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('not found')
})

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}/`
  console.log(`B站活动足迹：${url}`)
  if (argv.includes('--open')) {
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open'
    execFile(opener, [url], () => {})
  }
})
