# SurfCore macOS 魔改版

> 在 macOS 上跑起来、并且加了一堆「群友想要」的功能的 [SurfCore](https://github.com/Mieksido/surfcore) 分支。
>
> 原项目：DSH（DeepSeek Harness）的 QQ 桥接插件 + 桥接进程，作者 Mieksido，MIT 许可。
> 本仓库只放**代码和文档**：不含任何密钥、聊天记录、头像/表情包素材。

## 这是什么

一套让 AI 角色（这里叫「大肥鱼」，DeepSeek 鲸鱼娘）真正住进 QQ 群的桥接：

- **DSH 插件**（`plugins/surfcore`）：设置页、B站 联动、记忆卡、黑话学习
- **桥接进程**（`src/bridge.js`，端口 3100）：OneBot 11 收发、唤醒策略、工具协议

上游只支持 Windows（SnowLuma）。这个分支把它搬到了 macOS，后端换成了 [NapCat](https://github.com/NapNeko/NapCatQQ)。

## 相对上游的改动

### 1. macOS 适配

- `findNodeExe()` 支持 `/usr/local/bin/node`、`/opt/homebrew/bin/node`、`/usr/bin/node`
- `maskPath()` 用 `~` 代替 `%USERPROFILE%`
- 用 NapCat 顶替 SnowLuma（Windows 专用）
- B站 扫码登录改成原生二维码流程（不依赖 Edge）

### 2. 语音

- 接入 **BreezeBlue** 云端 TTS（大肥鱼音色），失败自动回退火山 Seed Audio，再失败回退 macOS `say`
- `qq_send_tts` 工具：文字 → 语音条，同会话 3 分钟一条
- 唤醒提示里注入「语音 CD 状态」，让角色自己判断什么时候能开口
- 语音消息固定独立成条（QQ 渲染「引用 + 语音」会坏）

### 3. 表情包

- 接入 [dsh-nekowhale-stickers](https://github.com/Loping151/dsh-nekowhale-stickers) 的 322 张大肥鱼表情素材（素材本身不随仓库分发）
- 回复里写 `[sticker:情绪/名字]`，桥接自动换成 GIF 表情发出
- 自动配图：她发文字后按概率补一张贴合表情
- 自动收图：群友发表情时按概率收进收藏库（只收表情类，不碰照片）

### 4. 梗百科 / 黑话

- `qq_meme`：查 [cnmeme.wiki](https://cnmeme.wiki) 公开 API（6600+ 梗），返回标题/摘要/正文/出处，可发图片卡片
- 黑话「提交即生效」：查到的意思随 `qq_slang_submit` 写入，下一轮直接可用
- 新增【最近学到的黑话】注入段，保证新词不被「按出现次数排序」挤掉

### 5. 豆包生图（免费）

- `qq_draw`：通过 CDP 驱动本机豆包客户端（`--remote-debugging-port=9222`）出图
- 自动跳过「点开原图」环节，直接从 DOM 抓 1728×2304 原图
- 自动裁掉底部水印条
- 护栏：同会话 60 秒一张、每天 15 张

### 6. 豆包唱歌（实验）

- 驱动豆包「音乐生成」：主题/歌词/风格 → 歌曲 → 分享页取音频 → 裁 55 秒语音条
- 注意：涉及版权歌词会被平台拦截，只适合原创主题

### 7. B站 集成

- 分享卡片（小程序 ark）+ 强制短评
- 视频分享、动态同步
- 卡片请求失败自动重试，避免一个群卡片、一个群纯链接

### 8. 省钱

- 会话轮换：唤醒满 120 次或 12 小时自动重建 DSH 会话，单轮输入从 30~50 万 tokens 降到 ~3 万
- Token 防爆破、唤醒频率限制

### 9. 称呼与人格

- 可配置称呼：群里叫「鱼王大人」、私聊叫「主人」（`socialV2.naming`）
- 人格卡与提示词分离：人格卡只管性格，行为规则走提示词注入

### 10. 插件内可视化

- 新增一级栏目「魔改」，把语音 / 表情包 / 梗与黑话 / 豆包生图 / 会话轮换 / 称呼集中在一页
- 概览页新增「魔改状态」卡：语音 CD、表情库数量、今日生图张数、CDP 在线状态、会话轮换进度
- 所有需要密钥的功能都有输入框（BreezeBlue、火山 Seed Audio、OneBot token、控制台 token）
- macOS 不可用的入口已从 UI 移除（桌宠、语音包、SnowLuma 安装）

详细改动过程见 [MODS.md](MODS.md)。

## 环境要求

- macOS（Apple Silicon / Intel 均可）
- [DSH](https://github.com/deepseek-ai) 0.2+
- Node.js 20+
- [NapCat](https://github.com/NapNeko/NapCatQQ)（OneBot 11，macOS 安装器）
- QQ 客户端
- 可选：豆包客户端（生图/唱歌）、BreezeBlue API Key、火山引擎语音 Key

## 安装（概要）

```bash
git clone https://github.com/Cirn99/surfcore-macos-mod.git ~/SurfCore
cd ~/SurfCore && npm install
cp config.example.json config.json   # 填自己的配置
node src/bridge.js                   # 启动桥接
```

DSH 插件安装：

```bash
dsh plugin --profile desktop add link:~/SurfCore
```

NapCat 配置、B站 登录、语音/生图参数见 [MODS.md](MODS.md)。

## 不包含什么

- **任何密钥/Token**：`config.json` 已从仓库排除，密钥请自己填
- **聊天记录/记忆卡/人格卡**：属于个人数据
- **头像与表情包素材**：版权归原作者（B站「可以叫我云大人」/ kiriyuki.com，CC BY-NC 4.0），请自行获取
- **ffmpeg 二进制**：请自行安装

## 免责声明

- 仅供学习交流，使用 NapCat / 豆包 / QQ 自动化存在账号风险，请自行评估
- B站、音乐、表情包等素材版权归各自作者，请勿商用
- 本项目基于 MIT 许可的 SurfCore，保留原作者版权声明

## 许可

MIT（见 [LICENSE](LICENSE)），原项目版权归 Derpyu520 及 qq-bridge / QSH 贡献者所有。
