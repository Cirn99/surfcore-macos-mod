# 本地改动（macOS 安装）

上游 SurfCore 只支持 Windows。这台机器上装了 DSH 插件这半边，为了让设置页能用，做了两处本地修改：

1. `plugins/surfcore/lib/paths.js` → `findNodeExe()`：补 `/usr/local/bin/node`、`/opt/homebrew/bin/node`、`/usr/bin/node`。
   不改的话它退回 Electron 可执行文件，设置页「启动QQ」必然报「找不到真正的 node.exe」。
2. `plugins/surfcore/lib/paths.js` → `maskPath()`：非 Windows 用 `~` 代替 `%USERPROFILE%`（只影响显示）。

已知在这台机器上不可用：SnowLuma（Windows 专用）、语音包（`run.bat`）、桌宠的部分 powershell 调用。
QQ 桥接本身能跑（`node src/bridge.js`），但需要自备 OneBot v11 后端。

升级本仓库时这两处会被覆盖，需要重新打。

## NapCat（macOS 的 OneBot v11 后端）

SurfCore 的 QQ 桥接走 OneBot 11，macOS 上用一个官方支持 mac 的 NapCat 顶替 SnowLuma：

- 安装器：`~/Applications/NapCatInstaller.app`（NapCat-Mac-Installer v1.7，官方 NapNeko 仓库）
- QQ：`/Applications/QQ.app` 的入口已切到 NapCat（安装器里可切回「原版 QQ」）
- NapCat 配置目录：`~/Library/Containers/com.tencent.qq/Data/Library/Application Support/QQ/NapCat/config/`
  - `onebot11_<BOT_QQ>.json`：HTTP 3000 + 正向 WS 3001，token 与 `config.json` 的 `snowluma.accessToken` 一致
  - `webui.json`：WebUI 6099 的登录 token
- 启动顺序：`NapCatInstaller.app` → 「启动 NapCat」→ 看到登录成功后，再让 SurfCore 桥接连上来

注意：

- SurfCore 设置页的「启动QQ」是找 SnowLuma 的，在 macOS 上会失败；启动 NapCat 要用安装器的启动面板。
- 桥接进程：`cd ~/SurfCore && node src/bridge.js`（DSH 启动时插件会自动拉一次）。
- 机器人账号 <BOT_QQ>（Cirn9），ownerQQ <OWNER_QQ>，私聊白名单只有它；群白名单为空。

## QQ 资料

- 昵称：派对的大肥鱼（2026-10-29 通过 `set_qq_profile` 改）
- 头像：`assets/party-fat-fish-avatar.png`（本地生成，`set_qq_avatar` + base64 传入）
- 踩坑：`set_qq_avatar` 传**本地文件路径**会让 NapCat/QQ 掉线（loginPhase=waiting_qrcode），必须用 `base64://`；掉线后到 `http://127.0.0.1:6099/webui?token=<webui.json 里的 token>` 重新扫码即可。
- 2026-10-29 二次换头像：鲸鱼娘同人图（来源 EDMOK/blue-fish-archive 的 character-art/v1/card/deepseek-chibi.webp，取自 fisharchive.cc 表情包档案馆），裁成方图存档为 `assets/whalechan-avatar.png`。

## QQ 发图片（本地新增能力）

2026-10-29 加：AI 可以在 QQ 会话里发任意图片（不只是收藏表情）。

- 桥接：`src/bridge.js` 新增 `sendImageV2()` + `POST /api/socialV2/send-image`
  （复用表情通道的白名单/限频/静默/引用校验；支持 `http(s)` 直链、`data:image/...`、`base64://...`，
  图片由桥接下载并校验 PNG/JPEG/GIF/WebP）。
- MCP：`src/mcp-snowluma-safe.js` 新增工具 `qq_send_image`（开关 `socialV2.tools.sendImage`，默认开）。
- 生效条件：桥接重启即可用接口；**DSH 重启后** QQ 会话的工具清单里才会出现 `qq_send_image`。
- 未做：本地文件路径（QQ 会话没有文件工具，暂不支持读本机图片）；收藏表情的 `add_custom_face`
  base64 路径 bug 仍存在（NapCat 会把 base64 当文件名，报 ENAMETOOLONG）。

## B站 换头像 / 发动态（2026-10-29 实测）

- 头像：新版 `POST https://api.bilibili.com/x/member/web/face/update` 一律 `-400`（补 WBI / platform /
  buvid3/4 / b_nut / csrf header 都无效）；改用旧版
  `POST https://account.bilibili.com/pendant/updateFace`，multipart 字段 `dopost=save` + `face=@图片`
  → `{"code":0,"status":true}`，立刻生效（nav.face 变成上传的图）。
- 动态：`node plugins/surfcore/tools/bili.mjs dynamic post --text "..." --go`（WBI 签名）→ `code=0`；
  `dynamic check --id` 可读回；`dynamic rm --id --go` 可删除。全部验证通过。
- 账号是 Lv2 正式会员（不是 Lv0，早先 nav 读到 0 是误读）。

## 斗图库（2026-10-29）

- 修好收藏：`collectStickerV2` 把图片写到 QQ 容器内临时目录再 `add_custom_face`（路径），
  NapCat 不返回 emoji_id 时用同步后的新增条目反推。
- 起步包：从 DeepSeek 表情包仓库（the-beating-light-of-the-nail/deepseek-chan-meme-pack）导入 20 张，
  逐张标了情绪/内容/关键词，存进 QQ 收藏表情（md5 与本地文件一一对应）。
- 现有 21 张（20 表情包 + 1 张群里收的图）；发送用 `qq_send_sticker("#编号")`。

## 私聊指挥群发（2026-10-29）

- `buildWakePromptV2` 新增两块，只对**主人私聊**（`private:<ownerQQ>`）注入：
  1. `ownerGroupTokenBlock`：白名单群（allow.groups）的群号/群名 + 该群的会话令牌，
     解决「私聊里没有群令牌 → 她拒绝去群里发消息」。
  2. 群聊侧反向注入 `ownerPrivateContextBlock`：主人最近 6 条私聊原文（带"别外泄"约束）。
- 私聊里说「去群里发：xxx」即可，她走 `qq_send_message(key=group:xxx, token=群令牌)`。
- 只列白名单群；令牌每会话随机生成，重启后仍在 state/social-v2.json。

## 云端 TTS（火山 Seed Audio）2026-10-29

- 接口：`POST https://openspeech.bytedance.com/api/v3/tts/create`，头 `X-Api-Key`，
  body `{model:'seed-audio-1.0', text_prompt, audio_config:{format:'mp3',sample_rate:24000}, watermark:{}}`，
  **同步返回 base64 mp3**（不用 app_id、不用 voxd、不用复刻音色）。
- 桥接：`sendTtsV2` 在 `socialV2.voice.cloud.apiKey` 非空时走云端；失败自动回退 macOS `say`。
- 配置：`config.json` → `socialV2.voice.cloud = {apiKey, model, baseUrl, format, sampleRate}`；
  `socialV2.voice.minGapMs = 300000`（同会话 5 分钟一条）。
- 备注：`voice`/`speaker` 字段被接口忽略（默认音色）；'zh_female_vv_uranus_bigtts' 是系统音色 ID，走的是旧的
  `/api/v3/tts/unidirectional` + AppID/Token 体系（那套凭据 401，已弃用）。
- `~/SurfVoiceCloud`（voxd）已装但用不上，保留作备份。

- 2026-10-29 选定音色：云端 TTS 用 promptPrefix「【年轻女声，轻快，略带得意】」前置到 text_prompt（对比样本 B 的效果），配置在 config.json 的 socialV2.voice.cloud.promptPrefix。
