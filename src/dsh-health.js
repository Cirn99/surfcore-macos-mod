// DSH 升级后的健康检查（摘自上流 v0.8.5，macOS 分支适配）。
//
// 两个独立故障面：
//   ① profile 里的 MCP 条目被摘 → 新会话也拿不到 qq_* 工具（要重跑 setup-dsh.mjs + 重启 DSH）；
//   ② 旧会话是在 preset 还完整时创建的 → 工具表定死，修复 profile 后旧会话仍然没有 qq_*，
//      必须重建会话。
//
// 这里只做纯判断，读写/DSH 调用由 bridge 做。
//
// ⚠️ 与上游的差异（macOS 分支）：
//   上游把「所有 profile」都算进去，只要有一个 profile 健康就放行。这台机器除了
//   desktop 还有 headless（pixiv 值班用，本来就不该有这三条 MCP），于是：
//     · headless 永远在 broken 列表里，真出问题时提示会指向错误的 profile；
//     · 判断口径也变成「随便哪个 profile 健康就行」。
//   这里改成**只看挂了 surfcore 的 profile**——那才是 QQ 桥接真正跑的 profile。
import fs from 'node:fs';
import path from 'node:path';

export const REQUIRED_MCP_IDS = Object.freeze(['mcp-snowluma', 'mcp-snowluma-host', 'mcp-web-search-safe']);

/** 扫 ~/.dsh/profiles/<name>/cordis.patch.yml，找哪些 profile 缺了 MCP 条目。 */
/** 这个 profile 是不是跑 QQ 桥接的那一个（bundle 在 package.json 里，patch 文本里通常没有）。 */
function profileHasSurfcore(home, name, patchText) {
  const dir = path.join(String(home || ''), '.dsh', 'profiles', name);
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    const bundles = pkg?.dsh?.profile?.bundles ?? [];
    if (Array.isArray(bundles) && bundles.some((b) => String(b).includes('surfcore'))) return true;
    const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
    if (Object.keys(deps).some((k) => k.includes('surfcore'))) return true;
  } catch { /* 没有 package.json 就退回看 patch 文本 */ }
  return /\bsurfcore\b/.test(patchText);
}

export function checkProfileMcp(home, { ids = REQUIRED_MCP_IDS } = {}) {
  const root = path.join(String(home || ''), '.dsh', 'profiles');
  const profiles = [];
  let names = [];
  try {
    names = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch { /* 没有 profiles 目录就当作没得查 */ }

  for (const name of names) {
    const file = path.join(root, name, 'cordis.patch.yml');
    let text = '';
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    profiles.push({
      name,
      file,
      missing: ids.filter((id) => !new RegExp(`(^|\\n)\\s*-?\\s*(?:id:\\s*)?${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text)),
      // 注意：挂没挂 surfcore 不能只看 patch 文本 —— 现在 bundle 是在
      // profile 的 package.json（dsh.profile.bundles）里声明的，patch 里一个 surfcore 字样都没有。
      hasSurfcore: profileHasSurfcore(home, name, text),
    });
  }

  // 只审计「挂了 surfcore」的 profile：别的 profile（如 headless）本来就不该有这些 MCP。
  const relevant = profiles.filter((p) => p.hasSurfcore);
  const broken = relevant.filter((p) => p.missing.length > 0);
  return {
    ok: broken.length === 0,
    checked: relevant.length,
    healthy: relevant.filter((p) => p.missing.length === 0).map((p) => p.name),
    broken: broken.map((p) => ({ profile: p.name, missing: p.missing, file: p.file })),
  };
}

/**
 * 会话的 preset 是否与当前配置不一致。
 * 只在「实际值存在且与期望不同」时判为不一致；实际值缺失（旧会话没记录 preset）只告警不动，
 * 避免把一批老会话全删掉。
 */
export function presetMismatch(expected, actual) {
  const want = String(expected ?? '').trim();
  const got = String(actual ?? '').trim();
  if (!want || !got) return false;
  return want !== got;
}
