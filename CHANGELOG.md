# 更新日志（macOS 魔改版）

版本格式：`0.6.22-mod.N` —— 前半段跟随上游 SurfCore 版本，`mod.N` 是本分支自己的改动序号。
每次改动都会：升 `mod.N` → 更新本文件 → 打 tag → 在 GitHub 发 Release。

上游更新日志见 [CHANGELOG.upstream.md](CHANGELOG.upstream.md)。

## [0.6.22-mod.1] - 2026-10-30

首个公开版本：在 macOS 上跑通 SurfCore，并加入语音、表情包、梗百科、豆包生图等功能。

### macOS 适配

- `findNodeExe()` 支持 `/usr/local/bin/node`、`/opt/homebrew/bin/node`、`/usr/bin/node`
- `maskPath()` 用 `~` 代替 `%USERPROFILE%`
- 用 NapCat 顶替 Windows 专用的 SnowLuma（OneBot 11）
- B站 扫码登录改为原生二维码流程（不依赖 Edge）

### 语音

- 接入 BreezeBlue 云端 TTS（大肥鱼音色），失败回退火山 Seed Audio，再失败回退 macOS `say`
- `qq_send_tts` 工具：文字 → 语音条，同会话 3 分钟一条
- 唤醒提示注入「语音 CD 状态」，让她自己判断何时开口
- 语音消息固定独立成条（QQ 渲染「引用 + 语音」会坏）
- 插件 UI 提供 BreezeBlue / 火山的 API Key 输入框

### 表情包

- 接入 dsh-nekowhale-stickers 的 322 张大肥鱼表情素材（素材不随仓库分发）
- 回复里的 `[sticker:情绪/名字]` 标记自动换成 GIF 表情
- 自动配图：发文字后按概率补一张贴合表情
- 自动收图：群友发表情时按概率收进收藏库（只收表情类）
- NapCat 不支持 `modify_custom_face` 时自动降级为本地备注，不再刷错误日志

### 梗与黑话

- `qq_meme`：查 cnmeme.wiki 公开 API（6600+ 梗），支持匹配质量判断与图片卡片
- 黑话「提交即生效」：`qq_slang_submit` 带 meaning 直接 confirmed
- 新增【最近学到的黑话】注入段，避免新词被按出现次数排序挤掉

### 豆包生图

- `qq_draw`：通过 CDP 驱动本机豆包客户端出图（免 API Key）
- 每次提示词追加「只生成 1 张图片」，且只取本轮第一张
- 自动裁掉底部水印（按高度 6% 自适应）
- 护栏：同会话 60 秒一张、每天 15 张

### 豆包唱歌（实验）

- 驱动豆包「音乐生成」：主题/歌词/风格 → 歌曲 → 分享页取音频
- 涉及版权歌词会被平台拦截，仅适合原创主题

### B站 集成

- 分享卡片（小程序 ark）+ 强制短评
- 卡片请求失败自动重试，避免单群退化成纯链接
- 动态同步到 QQ

### 省钱

- 会话轮换：满 120 次唤醒或 12 小时自动重建 DSH 会话
- 单轮输入从 30~50 万 tokens 降到约 3 万

### 称呼与人格

- `socialV2.naming`：群里叫「鱼王大人」、私聊叫「主人」
- 人格卡与行为规则分离（人格卡只管性格，规则走提示词注入）

### 插件 UI

- 新增一级栏目「魔改」：语音 / 表情包 / 梗与黑话 / 豆包生图 / 会话轮换 / 称呼
- 概览新增「魔改状态」卡：语音 CD、表情库数量、今日生图、CDP 在线、会话轮换进度
- 移除 macOS 不可用入口：桌宠、语音包、SnowLuma 安装
- 所有需要密钥的功能都有输入框（BreezeBlue、火山、OneBot token、控制台 token）
