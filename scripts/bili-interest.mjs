#!/usr/bin/env node
// 从聊天里出现过的 BV 号学习「主人/B站」的兴趣标签，累加到 bili/interest.json
import fs from 'node:fs';
import path from 'node:path';

const HOME = process.env.HOME || '';
const STATE = path.join(HOME, 'SurfCore', 'state', 'social-v2.json');
const OUT = path.join(HOME, '.dsh', 'surfcore', 'bili', 'interest.json');

function readJson(p, d) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } }

const state = readJson(STATE, { conversations: {} });
const bvs = new Map(); // bv -> weight
for (const st of Object.values(state.conversations || {})) {
  for (const m of st.recentMessages || []) {
    const t = String(m.text || '');
    for (const bv of t.match(/BV[0-9A-Za-z]{10}/g) || []) {
      const w = m.isSelf ? 1 : 3; // 主人发的权重高
      bvs.set(bv, (bvs.get(bv) || 0) + w);
    }
  }
}

// 再加「主人 B站 观看历史」——真实口味信号，权重 2
if (process.env.SKIP_HISTORY !== '1') {
  try {
    const cred = JSON.parse(fs.readFileSync(path.join(HOME, '.dsh', 'surfcore', 'bili', 'owner-credentials.json'), 'utf8'));
    const cookie = `SESSDATA=${cred.sessdata}; bili_jct=${cred.bili_jct}; buvid3=${cred.buvid3 || ''}`;
    let max = 0;
    for (let page = 0; page < 4; page += 1) {
      const url = 'https://api.bilibili.com/x/web-interface/history/cursor?ps=30' + (max ? `&max=${max}` : '');
      const r = await fetch(url, { headers: { cookie, 'user-agent': 'Mozilla/5.0', referer: 'https://www.bilibili.com/' }, signal: AbortSignal.timeout(15000) });
      const j = await r.json();
      if (j.code !== 0) break;
      for (const it of j.data?.list || []) {
        const bv = String(it.history?.bvid || it.bvid || '');
        if (/^BV[0-9A-Za-z]{10}$/.test(bv)) bvs.set(bv, Math.max(bvs.get(bv) || 0, 2));
      }
      max = j.data?.cursor?.max || 0;
      if (!max) break;
    }
  } catch { /* 历史拉不到就跳过 */ }
}

const interest = readJson(OUT, { updatedAt: '', tags: {}, videos: {} });
// 时间衰减：每次更新先把旧权重乘 0.85，避免口味被历史永久压死
for (const k of Object.keys(interest.tags)) {
  interest.tags[k] = Math.round(interest.tags[k] * 0.85 * 10) / 10;
  if (interest.tags[k] < 1) delete interest.tags[k];
}
// 太老的视频（90 天）从候选里清掉
const cutoff = Date.now() - 90 * 86400000;
for (const [bv, v] of Object.entries(interest.videos || {})) {
  const at = Date.parse(v.at || '') || 0;
  if (at && at < cutoff) delete interest.videos[bv];
}

let added = 0;
for (const [bv, w] of bvs) {
  if (interest.videos[bv]) { interest.videos[bv].hits += w; continue; }
  try {
    const r = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bv}`, {
      headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://www.bilibili.com/' },
      signal: AbortSignal.timeout(15000),
    });
    const j = await r.json();
    const d = j.data || {};
    const tags = [];
    if (d.tname) tags.push(String(d.tname));
    const tr = await fetch(`https://api.bilibili.com/x/tag/archive/tags?bvid=${bv}`, {
      headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://www.bilibili.com/' },
      signal: AbortSignal.timeout(15000),
    }).then((x) => x.json()).catch(() => ({}));
    for (const tg of tr.data || []) if (tg.tag_name) tags.push(String(tg.tag_name));
    interest.videos[bv] = { title: d.title || '', owner: d.owner?.name || '', tags, hits: w, at: new Date().toISOString() };
    for (const tg of tags) interest.tags[tg] = (interest.tags[tg] || 0) + w;
    added += 1;
  } catch { /* 单条失败跳过 */ }
}
interest.updatedAt = new Date().toISOString();
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(interest, null, 2) + '\n');
const top = Object.entries(interest.tags).sort((a, b) => b[1] - a[1]).slice(0, 15);
console.log(`新增 ${added} 条，累计 ${Object.keys(interest.videos).length} 条视频`);
console.log(top.map(([t, n]) => `${t}:${n}`).join(' '));
