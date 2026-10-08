# 部署说明（DEPLOYMENT.md）

演示站：**<https://grg41.github.io/wes-hydraulic-calc/>**
验收摘要页：<https://grg41.github.io/wes-hydraulic-calc/verification.html>

本文说明这个站点**怎么发**、**发之前必须过什么**，以及它**已知会怎样坏**。

---

## 1. 形态

| 项 | 值 |
|---|---|
| 站点类型 | GitHub Pages **项目站**（`https://<owner>.github.io/<repo>/`） |
| 部署方式 | **分支部署**：构建产物推到 `gh-pages` 分支，Pages 以 legacy 方式构建该分支根目录 |
| 构建产物 | `dist/`（Vite 构建 + Service Worker 预缓存 + 验收摘要页） |
| 是否需要 Actions | 否。本仓库没有 `.github/workflows/` |

**为什么用分支部署而不是 GitHub Actions**：本机 `gh` 凭据（账号 `GrG41`）的 scope 是
`gist, read:org, repo`，**没有 `workflow`**——推送 `.github/workflows/*.yml` 会被 GitHub 拒绝。
要改成 CI 自动部署，先 `gh auth refresh -s workflow`，再加工作流。

**为什么仓库必须公开**：免费计划**不支持私有仓库开启 Pages**（实测：对私有仓调用
`POST /repos/{owner}/{repo}/pages` 返回 422 `Your current plan does not support GitHub Pages
for this repository.`）。

---

## 2. 部署基路径（最容易踩的一脚）

项目站在子路径下，产物里的资源引用**必须**带同样的前缀，否则整页白屏。

- 构建时用 `VITE_BASE=/<repo>/` 指定（`vite.config.ts` 读它，并补正首尾斜杠）；
- PWA manifest 的 `start_url` 与 `scope` 由该 `base` 派生，**不要手写 `'/'`**；
- `scripts/verify-pwa.mjs` 第 7 项判据把这条钉住：**index.html 的资源前缀 =
  manifest.start_url = manifest.scope**，三者不一致即构建期失败。

> 这条判据来自一次真实故障：产物写死 `/assets/…` 而站点在 `/wes-hydraulic-calc/` 下，
> 浏览器去域名根取资源全 404，页面白屏——而当时**没有任何静态检查会响**。

---

## 3. 发一次要过七道

一键：`nix develop --command pnpm deploy:pages`（或 `scripts/deploy-pages.sh`）

| # | 步骤 | 过不去的后果 |
|---|---|---|
| 1 | 工作区必须干净 | 拒绝发布（`--allow-dirty` 可越过，但验收摘要页会写明"对应不上任何提交"） |
| 2 | 构建：typecheck → 生成验收摘要页 → vite build | 任一失败即停，**站点不动** |
| 3 | PWA 静态验收 `scripts/verify-pwa.mjs`（12 项，**不需要服务器**） | 失败即停，**站点不动** |
| 4 | 记下上一版 `gh-pages` 的提交 | 无——首次发布时记为空，第 7 步就没有可退的版本 |
| 5 | 推送 `dist/` 到 `gh-pages`，等 GitHub 构建完成 | 构建 errored 或超时即停 |
| 6 | **线上**真实浏览器验收 `scripts/acceptance.mjs --url=<站点地址>` | 失败 → 第 7 步 |
| 7 | 把站点退回第 4 步记下的那一版，并以失败退出 | 首次发布时无处可退，脚本明说"需人工处置" |

**本地不再起任何服务、不开任何端口**（2026-10-08 起）：`scripts/acceptance.mjs`
只验**已经发布出去的那一份**，地址默认由 `origin` 远端推导
（`https://<owner>.github.io/<repo>/`）。本地 `dist/` 由 `verify-pwa.mjs` 做静态检查。

**这条取舍写在明处**：不再有"发布前先在本机浏览器里跑一遍"这道闸，所以
**坏的构建会先上站**，直到第 6 步发现它、第 7 步把它退回去——中间那段时间
（通常 1～2 分钟）站点是可被访问的。换来的是：验的就是**工程师打开的那一份**，
而且判据里不再有"本地的那份"这种替身。

**退出码约定**（`scripts/acceptance.mjs`）：`0` 通过；`1` 有检查项失败；
`2` **没能验到**（Chromium 缺失、目标不可达、预检不过）——`2` 不算通过。

Chromium 不在 PATH 时用 `CHROMIUM_BIN` 指定，例如：

```bash
CHROMIUM_BIN=$(nix build --no-link --print-out-paths nixpkgs#chromium)/bin/chromium \
  bash scripts/deploy-pages.sh
```

---

## 4. 验收摘要页（站点上的那一页）

`scripts/gen-verification-page.mjs` 在**每次构建前**生成 `public/verification.html`：

- **数字现取**：提交号、提交时间、工作区是否干净、构建基路径、以及本次构建前**实跑**的测试收据。
  取不到就报错停下，不印一个"看起来对"的数。
- **正文抽取**：从 `docs/ACCEPTANCE.md`、`docs/VALIDATION.md` 里按标题锚点抽章节渲染。
  文档是单一来源；锚点找不到即**失败退出**——宁可不产出页面，也不产出缺章节的页面。
  （改这些文档的小节标题时，要同步改 `scripts/gen-verification-page.mjs` 里的 `ANCHORS`。）
- **测试红就不生成**：对外展示的页面不允许建立在未通过的测试之上。

该文件是生成物，已在 `.gitignore` 中；它随 `pnpm build` 一起产出，因此 `pnpm build` 会跑一次
`vitest`（当前不足 2 秒）。

---

## 5. 已知会怎样坏（边界，不是缺陷）

| 情形 | 表现 | 处置 |
|---|---|---|
| 重新部署后的短暂时段 | GitHub Pages 对 `index.html` 有约 10 分钟 HTTP 缓存；期间访问可能拿到**旧壳**，而旧的带哈希资源已被替换 → 可能白屏 | 强制刷新（Ctrl/Cmd+Shift+R）即可；SW 的 `autoUpdate` 会随后接管。首次部署无此问题 |
| `gh-pages` 分支历史 | 该分支是**纯产物分支**，每次 `--force` 整体覆盖，不留半新半旧的树 | 需要审计产物历史时，以主分支的提交为准 |
| 本站不索引 | 未做 `robots.txt` 限制，站点可被搜索引擎索引 | 需要禁止索引时加 `public/robots.txt` |
| 离线能力依赖首次访问 | SW 只在**至少成功在线打开一次**之后才能离线工作 | 这是 PWA 的固有前提，验收项 6 已在断网下验证 |
| 本机截图用的字体 | 本机没有任何中文字体（`fc-list :lang=zh` 为空），截图需临时挂 Noto CJK | 只影响本机截图，不影响站点 |
| **发布后的 1～2 分钟窗口** | 本地不再预先跑浏览器验收，所以坏的构建**会先上站**，直到线上验收发现并回滚 | 这是"只验线上那一份"的代价。要看某次发布是否真的上去了，跑一次验收——它会打印站点产物对应的提交 |
| 本地无法预览"发布后长什么样" | 本地服务器不再对外（`vite dev` 只服务本机），同事/手机看不到本地构建 | 要看就看线上；需要局域网预览时**显式**给 Vite 加回主机名白名单，默认不开 |

---

## 6. 复现线上验收（不经部署）

```bash
node scripts/acceptance.mjs                      # 地址由 origin 远端推导
node scripts/acceptance.mjs --url=<其他地址>      # 或显式指定
```

它会先做 HTTP 预检（可达、200、标题对得上），再从站点的验收摘要页读出**该产物对应的提交**
并与本地 HEAD 对照（只打印、不判失败），然后在真实 Chromium 里跑 9 项检查，
其中包含**断网重载**与**断网完成一次计算**。全程**不起本地服务、不开本地端口**。
