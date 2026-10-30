# 版本与发布约定

本仓库是 [SurfCore](https://github.com/Mieksido/surfcore) 的 macOS 魔改分支。

## 版本号

```
0.6.22-mod.N
│      │
│      └── 本分支改动序号，每改一次 +1
└───────── 跟随上游 SurfCore 的版本
```

上游升级时（例如到 0.7.17），版本变成 `0.7.17-mod.1`，`mod` 序号从 1 重新开始；
旧版本的 `mod` 记录保留在 CHANGELOG 里。

## 每次改动必须做

1. 改代码
2. `package.json` 的 `version` 升 `mod.N`
3. `CHANGELOG.md` 顶部加一条对应版本的条目（写清楚改了什么）
4. 推送到 GitHub `main`
5. 打 tag：`v0.6.22-mod.N`
6. 在 GitHub 发 Release，标题用 tag，正文直接贴 CHANGELOG 里这一段

## tag / Release 格式

- tag：`v0.6.22-mod.1`
- Release 标题：`v0.6.22-mod.1`
- Release 正文：CHANGELOG 对应段落（功能 / 修复 / 破坏性变更）

## 破坏性变更

如果改动会破坏已有配置（例如删字段、改默认行为），在 CHANGELOG 里单独用
`### 破坏性变更` 标出，并在 Release 正文里置顶。
