#!/bin/bash
# 发布一个版本：打包 zip → 打 tag → 推 main/tag → 建 Release → 上传 zip 附件
#
# 用法：
#   GITHUB_TOKEN=ghp_xxx bash scripts/release.sh
#
# 前提：
#   1. package.json 的 version 已改成新版本
#   2. CHANGELOG.md 顶部已写对应版本的条目
#   3. 当前工作区干净、已 commit
set -euo pipefail

REPO="${REPO:-Cirn99/surfcore-macos-mod}"
VERSION=$(node -e "console.log(require('./package.json').version)")
TAG="v${VERSION}"
OUT="dist/surfcore-macos-mod-${VERSION}.zip"

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "缺少 GITHUB_TOKEN 环境变量" >&2
  exit 1
fi
if ! grep -q "## \[${VERSION}\]" CHANGELOG.md; then
  echo "CHANGELOG.md 里没有 ## [${VERSION}] 条目，先补上" >&2
  exit 1
fi
# README 顶部版本行随 Release 自动同步
sed -i '' -E "s/> 当前版本：\*\*v[0-9A-Za-z._-]+\*\*/> 当前版本：**v${VERSION}**/" README.md 2>/dev/null || \
  sed -i -E "s/> 当前版本：\*\*v[0-9A-Za-z._-]+\*\*/> 当前版本：**v${VERSION}**/" README.md
if [ -n "$(git status --porcelain README.md)" ]; then
  git add README.md
  git commit -q -m "docs: README 版本行同步到 v${VERSION}"
  echo "README 版本行已同步到 v${VERSION} 并提交"
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "工作区不干净，先 commit" >&2
  exit 1
fi

mkdir -p dist
git archive --format=zip --prefix="surfcore-macos-mod-${VERSION}/" HEAD -o "$OUT"
echo "打包完成：$OUT（$(du -h "$OUT" | cut -f1)）"

# tag（已存在则跳过）
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "tag $TAG 已存在，跳过创建"
else
  git tag -a "$TAG" -m "SurfCore macOS 魔改版 $TAG"
fi
git push origin main
git push origin "$TAG"

# Release
API="https://api.github.com/repos/${REPO}"
BODY=$(node -e "
const fs=require('fs');
const s=fs.readFileSync('CHANGELOG.md','utf8');
const i=s.indexOf('## [${VERSION}]');
const rest=s.slice(i);
const next=rest.indexOf('\n## [', 4);
process.stdout.write(JSON.stringify(rest.slice(0, next<0?undefined:next)));
")
TAG_JSON=$(printf '%s' "$TAG" | node -e "process.stdout.write(JSON.stringify(require('fs').readFileSync(0,'utf8')))")
TITLE_JSON=$(printf 'SurfCore macOS 魔改版 %s' "$VERSION" | node -e "process.stdout.write(JSON.stringify(require('fs').readFileSync(0,'utf8')))")
REL=$(curl -sS -m 30 -X POST "$API/releases" \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"tag_name\":$TAG_JSON,\"name\":$TITLE_JSON,\"body\":$BODY}")
RELEASE_ID=$(printf '%s' "$REL" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.id||'')})")
if [ -z "$RELEASE_ID" ]; then echo "Release 创建失败：$REL" | head -c 400; exit 1; fi
echo "Release 已创建：${REPO}/releases/tag/${TAG}"

# 上传 zip 附件
UP=$(curl -sS -m 120 -X POST "https://uploads.github.com/repos/${REPO}/releases/${RELEASE_ID}/assets?name=$(basename "$OUT")" \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Content-Type: application/zip" \
  --data-binary @"$OUT")
echo "$UP" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.browser_download_url?('附件：'+j.browser_download_url):('上传附件失败：'+s.slice(0,200)))})"
