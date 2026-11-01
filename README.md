# SurfCore macOS Mod

> 上游 [**Mieksido/surfcore**](https://github.com/Mieksido/surfcore) 的 **macOS 魔改分支**。
>
> 不是重写：上游代码原样保留，本分支只做两件事——**让它在 macOS 上跑起来**，
> 以及在它之上**加一批上游没有的功能**（语音、表情包、生图、视频栏目、B站投稿、NIKKE 会战出刀表…）。
>
> 上游 README 原样留档：[README.upstream.md](README.upstream.md)（英文版见 [README.en.md](README.en.md)，同样来自上游）。

| | |
| --- | --- |
| 版本 | `0.6.22-mod.4`（`mod.5` 未发布：NIKKE 出刀表） |
| 基线 | SurfCore `0.6.22` |
| 平台 | **macOS**（Apple Silicon / Intel）；Windows 未验证 |
| 依赖 | DSH `0.2.1-rc.x`、Node 18+、一个 OneBot 11 后端（macOS 用 NapCat） |
| 许可 | MIT（与上游一致）；SnowLuma 为第三方专有运行时，**不随本仓库分发** |

---

## 这是什么

简单说：**上游 SurfCore 是给 DSH agent 一个身份（QQ × B站 × 桌宠）的插件**，但它只支持 Windows——绑定 SnowLuma、PowerShell 脚本、ACL 沙箱那一套。

这个分支把「能跑」这件事在 macOS 上重做了一遍：用 NapCat 顶替 SnowLuma，补 node 路径解析，砍掉 macOS 上不可用的入口；然后在这个基础上继续加功能。

**它不是官方版本**。上游作者是 **Mieksido**，本分支的所有改动由 **Cirn99** 维护，问题请提到本仓库，不要打扰上游。

## 引用来源与致谢

| 来源 | 作者 | 在本项目里的角色 |
| --- | --- | --- |
| [surfcore](https://github.com/Mieksido/surfcore) | **Mieksido** | **上游本体**。QQ 桥接、DSH 插件、人格/记忆/对齐体系、设置页框架全部来自这里，MIT 许可 |
| [surfvoicelocal](https://github.com/Mieksido/surfvoicelocal) · [surfvoicecloud](https://github.com/Mieksido/surfvoicecloud) · [surfpet](https://github.com/Mieksido/surfpet) | Mieksido | 上游配套仓库（语音包 / 云端语音 / 桌宠）。本分支**未**修改，macOS 上部分不可用 |
| DSH（DeepSeek Harness） | DeepSeek | agent 运行时；本插件以 bundle 形式挂载在它的 profile 里 |
| SnowLuma | SnowLuma 项目 | 上游默认的 OneBot 网关，**Windows 专用**。本分支不使用、也不分发它 |
| NapCat | NapNeko | macOS 的 OneBot 11 后端，本分支用它顶替 SnowLuma |
| [cnmeme.wiki](https://cnmeme.wiki) | 梗百科 | `qq_meme` 的梗/黑话检索数据源 |
| 豆包 | 字节跳动 | `qq_draw` 通过 CDP 驱动本机豆包客户端出图，不走官方 API |
| 火山引擎 Seed Audio | 字节跳动 | 云端 TTS（`openspeech` 接口），失败回退 macOS `say` |
| [blablalink](https://www.blablalink.com) | ShiftUp | NIKKE 联盟突袭的成员/战报数据源（非官方接口，可能变） |
| [B站](https://www.bilibili.com) | 哔哩哔哩 | 动态、评论、收藏、投稿等接口 |
| dsh-nekowhale-stickers | 社区 | 表情素材来源（**素材不随本仓库分发**） |
| fisharchive.cc | 社区 | 头像同人图来源 |

> 这些第三方服务/素材各有各的使用条款。本仓库只包含代码，**不含任何素材文件、账号数据或密钥**。

## 相对上游改了什么

### 1. macOS 适配（让上游能跑）

- `findNodeExe()` 补上 `/usr/local/bin/node`、`/opt/homebrew/bin/node`、`/usr/bin/node`
- `maskPath()` 非 Windows 用 `~` 代替 `%USERPROFILE%`
- **NapCat 顶替 SnowLuma**：OneBot 11 标准接口，HTTP 3000 + 正向 WS 3001
- B站扫码登录改为原生二维码流程，不依赖 Edge
- 移除 macOS 不可用入口：桌宠、语音包安装、SnowLuma 安装器

### 2. 语音

- 云端 TTS（火山 Seed Audio `seed-audio-1.0`，直接返回 base64 mp3），失败回退 macOS `say`
- `qq_send_tts`：文字 → 语音条，同会话限频
- 唤醒提示注入「语音 CD 状态」，让她自己判断什么时候开口
- 语音固定独立成条（QQ 渲染「引用 + 语音」会坏）

### 3. 表情包

- 接入社区表情素材（不随仓库分发），`[sticker:情绪/名字]` 标记自动换成 GIF
- 发完文字按概率补一张贴合表情；群友发表情时按概率收进收藏库
- NapCat 不支持 `modify_custom_face` 时自动降级为本地备注，不再刷错误日志

### 4. 梗与黑话

- `qq_meme`：查 cnmeme.wiki 公开 API，带匹配质量判断与图片卡片
- 黑话「提交即生效」；新增「最近学到的黑话」注入段，避免新词被旧词挤掉

### 5. 生图与唱歌（豆包驱动）

- `qq_draw`：CDP 驱动本机豆包客户端出图，**免 API Key**
- 自动裁掉底部水印；护栏：同会话 60 秒一张、每天 15 张
- 实验性「豆包唱歌」：主题/歌词/风格 → 歌曲 → 取音频

### 6. B站

- 分享卡片（小程序 ark）+ 强制短评，失败自动重试
- 动态同步到 QQ 群
- 换头像 / 发动态：新版 `face/update` 一律 `-400`，改用旧版 `pendant/updateFace`
- 投稿：审核通过后自动公开
- **插件视频栏目**：素材生成 → 投稿 → 稿件管理，一条龙

### 7. NIKKE 联盟突袭出刀表（本分支新增，`mod.5`）

群里发「查会战 / 会战表 / 谁没打 / 谁没出刀 / 出刀表 / 查出刀」，直接出一张出刀表图：

- 数据源 blablalink：`GetGuildMembers`（完整名单）− `GetUnionRaidData`（战报）= **未出刀**
- 按伤害排序，带今日出刀 / 总刀 / 占比；未出刀的标红垫底
- **桥接本地执行，不经过模型、不花 token**
- 群级 2 分钟 / 个人 1 分钟冷却 + 提示节流，防刷屏
- 设置页「NIKKE 联盟突袭（出刀表）」分组可改：启用、生效群号、触发口令、冷却
- 脚本在 `scripts/nikke/`：`union.py` 出表、`login.cjs` 抓登录态、`probe.py` 调试

### 8. 设置页

- 新增一级栏目「魔改」（语音 / 表情包 / 梗与黑话 / 豆包生图 / 会话轮换 / 称呼）
- 概览新增「魔改状态」卡：语音 CD、表情库数量、今日生图、CDP 在线、会话轮换进度
- 新增「NIKKE 联盟突袭」分组 + 状态卡（登录态 / 上次结果 / 试跑一次）
- 所有要密钥的功能都有输入框，不再手改 config.json

### 9. 省钱

- 会话轮换：满 120 次唤醒或 12 小时自动重建 DSH 会话，单轮输入从 30~50 万 tokens 降到约 3 万

### 10. B站活动足迹（本地只读后台）

```bash
node scripts/bili-footprint/start.mjs --open    # 后台启动 → http://127.0.0.1:7801
node scripts/bili-footprint/stop.mjs            # 停止
```

> ⚠️ 别用 `nohup node ... &` 起：它挂在当时的进程组里，DSH 一重启（GUI 端口会变）
> 整棵子树就被收走，页面变成浏览器的「Load failed」。
> `start.mjs` 用 `spawn({detached:true})` 起，ppid 变 1，DSH 重启、终端关闭都不影响。

聚合她自己的记账，按天分组的时间线：

- **看过什么**：视频标题 / UP / 时长 / 浅看·抽帧·深看
- **评论了谁**：回复对象（从正文开头的 `@某人` 解析）、在哪条视频下、说了什么
- **发过什么动态**：正文 + 动态链接
- **收藏**、**私信**（`dm.mjs` 发送成功后记一条，独立 jsonl，不占额度）

特点：只读、不写任何文件、不碰账号；独立进程，改完刷新即可，不用重启 DSH。标题缺失时后台会去 B站 补一次并缓存。

## 安装

安装流程与上游一致（`npm install` → `setup-dsh.mjs` → 重启 DSH → 诊断一键安装），差异和踩坑记在 [MODS.md](MODS.md)：

- NapCat 怎么装、QQ 怎么切过去、WebUI token 在哪
- QQ 发图片 / 换头像 / 发动态实测过的接口
- 斗图库怎么起步、云端 TTS 怎么配

**先读 MODS.md 再动手**，里面都是踩过的坑。

## 数据与隐私

- **本仓库不含任何真实数据**：`config.json`（含 token）和 `state/`（记忆、会话、登录态）都在 `.gitignore` 里
- 角色卡是脱敏示例，群号 / QQ 号 / B站 mid 一律占位符（`<BOT_QQ>`、`<OWNER_QQ>`）
- 运行时数据只留在你自己的机器上（`~/.dsh/surfcore/`、`~/SurfCore/config.json`）

## 已知限制

- SnowLuma 在 macOS 不可用（Windows 专用）；语音包 `run.bat`、桌宠的 PowerShell 调用同样不可用
- 上游升级会覆盖 `paths.js` 的两处 macOS 补丁，需要重新打（见 MODS.md）
- blablalink 是非官方接口，NIKKE 赛季/字段变化可能让出刀表失效
- 豆包生图依赖本机客户端保持登录 + CDP 端口

## 许可

MIT，与上游一致。上游版权归 **Mieksido**；本分支新增部分归 **Cirn99**。
SnowLuma 为第三方专有运行时，不随本仓库分发。
