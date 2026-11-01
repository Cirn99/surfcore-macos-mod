#!/usr/bin/env node
/**
 * login.cjs —— 打开真浏览器，让主人自己登录 blablalink，抓登录态 + 公会上下文
 * ============================================================================
 * 为什么必须开窗口：
 *   接口 POST /api/game/proxy/Game/GetUnionRaidData 返回 300001 "game not login"，
 *   认证走浏览器 cookie（credentials: include），没有任何离线换 token 的路子。
 *
 * 抓什么：
 *   ① cookie —— 后续所有请求带上
 *   ② guild_id / nikke_area_id / intl_open_id —— 从站点自己的请求体里抄，
 *      比让主人手填靠谱（这三个是 64 位数字，抄错一位就查不到）
 *
 * 流程：打开首页 → 主人登录 → 脚本自己找「联盟突袭」入口点进去 → 抓到三个 id → 存盘。
 * 15 分钟没抓齐就退出，不留后台进程。
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

// playwright-core 的位置因机器而异：优先环境变量，其次常见的同目录插件，最后交给 node 解析。
function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_CORE,
    path.join(os.homedir(), 'dsh-pixiv-scroll', 'node_modules', 'playwright-core'),
    'playwright-core',
  ].filter(Boolean);
  for (const c of candidates) {
    try { return require(c); } catch { /* 换下一个 */ }
  }
  throw new Error('找不到 playwright-core：设 PLAYWRIGHT_CORE 指向它的目录，或 npm i playwright-core');
}
const { chromium } = loadPlaywright();

const HOME = path.join(os.homedir(), '.dsh', 'surfcore', 'nikke');
const STATE = path.join(HOME, 'state.json');
const LOG = path.join(HOME, 'login.log');
const CHROME = path.join(os.homedir(), 'Applications', 'Google Chrome for Testing.app',
  'Contents', 'MacOS', 'Google Chrome for Testing');

const API_HOST = 'api.blablalink.com';
const GAME_RE = /\/api\/game\/proxy\/Game\/(GetGuildMembers|GetUnionRaidData|GetMyGuildInfo)$/;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  try { fs.appendFileSync(LOG, line + '\n'); } catch { /* 忽略 */ }
  console.log(line);
}

function pickIds(bodyText) {
  try {
    const b = JSON.parse(bodyText);
    const out = {};
    if (b.guild_id) out.guildId = String(b.guild_id);
    const area = b.nikke_area_id ?? b.area_id ?? b.target_nikke_area_id;
    if (area) out.areaId = Number(area);
    const openid = b.intl_open_id ?? b.target_intl_open_id;
    if (openid) out.openid = String(openid);
    return out;
  } catch {
    return {};
  }
}

(async () => {
  fs.mkdirSync(HOME, { recursive: true });
  log('启动浏览器…');

  const browser = await chromium.launch({
    headless: false,
    executablePath: CHROME,
    args: ['--no-first-run', '--no-default-browser-check', '--window-size=1280,900'],
  });
  const context = await browser.newContext({ locale: 'zh-CN', viewport: null });
  const page = await context.newPage();

  const ctxInfo = { guildId: null, areaId: null, openid: null };

  page.on('request', (req) => {
    try {
      if (!req.url().includes(API_HOST) || !GAME_RE.test(new URL(req.url()).pathname)) return;
      const got = pickIds(req.postData() || '');
      if (got.guildId) ctxInfo.guildId = got.guildId;
      if (got.areaId) ctxInfo.areaId = got.areaId;
      if (got.openid) ctxInfo.openid = got.openid;
      if (got.guildId || got.areaId || got.openid) {
        log(`抓到上下文 guild=${ctxInfo.guildId} area=${ctxInfo.areaId} openid=${ctxInfo.openid ?? '?'}`);
      }
    } catch { /* 忽略 */ }
  });

  log('打开 https://www.blablalink.com/ …');
  await page.goto('https://www.blablalink.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });

  let navigated = false;
  const startedAt = Date.now();
  const deadline = startedAt + 15 * 60 * 1000;
  let lastBeat = 0;

  while (Date.now() < deadline) {
    if (ctxInfo.guildId && ctxInfo.areaId && ctxInfo.openid) break;

    if (!navigated && Date.now() - startedAt > 90000) {
      // 给主人 90 秒登录；之后自己找「联盟突袭 / Union Raid」入口点进去
      const hit = await page.evaluate(() => {
        const as = [...document.querySelectorAll('a[href]')];
        const re = /union|联盟|突袭|raid/i;
        for (const a of as) {
          const t = (a.textContent || '').trim();
          if (re.test(t) || re.test(a.getAttribute('href') || '')) return a.getAttribute('href');
        }
        return null;
      }).catch(() => null);
      if (hit) {
        const url = new URL(hit, page.url()).toString();
        log(`找到入口，进入：${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
        navigated = true;
      }
    }

    if (Date.now() - lastBeat > 30000) {
      lastBeat = Date.now();
      log(`等待中…（当前页 ${page.url().slice(0, 90)}）`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (!(ctxInfo.guildId && ctxInfo.areaId && ctxInfo.openid)) {
    log('❌ 15 分钟内没抓齐 guild/area/openid。可能是没登录，或没进「联盟突袭」页面。');
    await browser.close().catch(() => {});
    process.exit(2);
  }

  const storage = await context.storageState();
  const cookies = await context.cookies();

  const state = {
    savedAt: new Date().toISOString(),
    guildId: ctxInfo.guildId,
    areaId: ctxInfo.areaId,
    openid: ctxInfo.openid,
    cookies: cookies.map((c) => ({ name: c.name, value: c.value, domain: c.domain, path: c.path })),
    storage,
  };
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
  fs.chmodSync(STATE, 0o600);
  log(`✅ 已保存登录态 → ${STATE}（guild=${state.guildId} area=${state.areaId}）`);

  // 立刻拿 cookie 打一次接口验证
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const common = JSON.stringify({
    game_id: '16', area_id: 'global', source: 'pc_web', intl_game_id: '29080',
    language: 'ko', env: 'prod', data_statistics_scene: 'outer',
    data_statistics_client_type: 'pc_web', data_statistics_lang: 'ko',
  });
  const res = await fetch('https://api.blablalink.com/api/game/proxy/Game/GetGuildMembers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', 'x-channel-type': '2', 'x-language': 'ko',
      'x-common-params': common, Cookie: cookieHeader,
    },
    body: JSON.stringify({ guild_id: state.guildId, nikke_area_id: String(state.areaId) }),
  });
  const text = await res.text();
  log(`验证 GetGuildMembers：HTTP ${res.status} ${text.slice(0, 200)}`);

  await browser.close().catch(() => {});
})().catch((e) => {
  log(`❌ 异常：${e && e.stack || e}`);
  process.exit(1);
});
