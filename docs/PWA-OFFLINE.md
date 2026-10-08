# 离线能力与 PWA（阶段 5）

> 依据：AGENTS.md §2.7「离线优先：PWA 可离线使用」、§6 阶段 5。

## 1. 离线策略

本程序的离线能力建立在一条**强约束**之上：

> **运行时完全不访问网络。** 所有计算在 `src/core/` 内完成，图表由本地打包的 ECharts 绘制，
> 计算书由本地打包的 SheetJS 生成，界面字体使用**系统字体**（不下载 Web 字体）。

因此**不需要任何运行时缓存策略**（无 API 缓存、无 stale-while-revalidate、无 CDN 回退）：
Service Worker 在安装时把应用外壳**一次性整体预缓存**，之后所有请求都从缓存命中。

| 项 | 取值 | 说明 |
|---|---|---|
| 注册方式 | `autoUpdate` | 新版本自动接管（`skipWaiting` + `clientsClaim`） |
| 预缓存范围 | `**/*.{js,css,html,svg,png,webmanifest}` | 应用外壳整体 |
| 导航回退 | `index.html` | 单页应用（当前无路由，按最佳实践配置） |
| 过期缓存清理 | `cleanupOutdatedCaches` | 版本升级后清理旧缓存 |
| 单资源上限 | 2 MiB | 当前最大分包 572 kB |
| 开发模式 | **不启用 SW** | 避免缓存干扰调试；离线能力以**构建产物**验证 |

### 1.1 关于代码分包与预缓存

图表（ECharts，572 kB）与导出（SheetJS，291 kB）采用**按需加载**以缩短首屏时间，
但它们**仍然全部进入预缓存**——离线可用的要求是「断网后**全部功能**可用」，
而不是「断网后只能看首屏」。首屏体积与预缓存总量是两回事（现取值见构建产物 `dist/sw.js`
的预缓存清单，本文不手抄——手抄的会过期）。

## 2. 验收检查

### 2.1 静态验收（可复现，CI 可用）

```bash
pnpm verify          # = pnpm build && node scripts/verify-pwa.mjs
```

`scripts/verify-pwa.mjs` 对 `dist/` 逐项断言，退出码非 0 即失败。
**下表「结果」列是某一次运行的记录**（项数与资源数随构建变化，现取值请直接跑命令）：

| # | 检查项 |
|---|---|
| 1 | 预缓存清单**无重复条目** |
| 2 | 清单中每个 URL 在 `dist/` 下**确实存在** |
| 3 | `dist/` 下所有可缓存资源**全部进入预缓存** |
| 4 | manifest 必填项齐全（含 192/512 图标与 maskable） |
| 5 | 入口 HTML 已注入 SW 注册脚本 |
| 6 | 入口 HTML **未引用任何外部资源** |
| 7 | **基路径自洽**：index.html 资源前缀 = manifest.start_url = manifest.scope |
| 8 | 入口 HTML 已声明 `<meta name="color-scheme">` 且为暗色 |
| 9 | 产物 CSS 声明的 `color-scheme` 含 dark |
| 10 | manifest 的 `theme_color` / `background_color` 与页面底色（`--canvas`）一致 |
| 11 | 产物中**无取数型外部调用**（fetch / XHR / WebSocket / sendBeacon） |
| 12 | 产物中出现的域名清单（供人工复核） |

> 第 7 项是**子路径部署**的白屏陷阱：产物写死 `/assets/…` 而站点在 `/<repo>/` 下时，
> 浏览器去域名根取资源、整页白屏——而第 2、3 项都是绿的（它们验的是相对路径）。
> 第 8–10 项是**主题自述**：页面既然是固定暗色，就必须向浏览器声明；
> 声明缺了会被再自动暗化一遍（二次暗色），manifest 两色与页面底色不一致则安装后启动闪色。
>
> 第 11 项与第 12 项的区分很重要：构建产物里**必然**存在形如 URL 的字符串
> （OOXML 命名空间 `schemas.openxmlformats.org`、React 错误信息链接 `react.dev`），
> 但它们**永不被解引用**。验收判据是「网络 API 是否紧邻外部 URL 字面量」，
> 而不是「是否出现 URL 字符串」——后者会产生大量误报。

**本次静态验收曾真实抓出一个缺陷**：`vite-plugin-pwa` 会自动把 `manifest.icons` 与
`manifest.webmanifest` 加入预缓存，而 `globPatterns` 又会从 `dist/` 匹配一遍，
导致清单中出现**重复条目**（pwa-192×2、pwa-512×2、manifest.webmanifest×2）。
已用 `globIgnores` 排除。

### 2.2 运行时可达性

**2026-10-08 起改为在线上站点上核**：`scripts/acceptance.mjs` 对**已发布的那一份**
逐一发起真实请求（含预缓存清单里的全部 URL），不再用本地静态服务托管 `dist/`。
因此本节原先记录的"本地静态服务可达性检查"连同 `vite preview` 一并退役——
本地不再起服务、不开端口，见 [`DEPLOYMENT.md`](DEPLOYMENT.md)。

### 2.3 阶段 6 的浏览器验收（**已完成**，见 ACCEPTANCE.md）

下表是阶段 5 结束时"尚需真实浏览器"的项。**阶段 6 已用 CDP 驱动的真实 Chromium
全部跑通**（含断网重载、断网完成计算），结果记录在
[`ACCEPTANCE.md`](ACCEPTANCE.md) §2.4（9 项）与 [`DEPLOYMENT.md`](DEPLOYMENT.md)
（线上站点 9 项）。其中三项仍**未执行**，如实留着：

| 项 | 状态 |
|---|---|
| 断网后重新加载页面仍可用 | ✅ 已在阶段 6 验证 |
| Service Worker 实际激活并接管（`navigator.serviceWorker.ready`） | ✅ 已在阶段 6 验证（判据等 `activated` **终态**，不量瞬间） |
| 应用安装到桌面/主屏（`beforeinstallprompt` / iOS「添加到主屏幕」） | ❌ **未执行** |
| 跨浏览器（Chrome / Edge / Firefox / Safari）行为一致性 | ⚠️ 仅 **Chromium 内核**；Firefox / Safari 未执行 |
| iOS Safari 的 SW 与存储配额行为 | ❌ **未执行**（需真机） |

## 3. 已知限制与风险

1. **iOS Safari**：对**未安装到主屏**的站点，长期不用可能回收脚本可写存储
   （影响 IndexedDB 中的算例）。故界面常驻提示「请务必定期导出备份」，
   JSON 导出文件才是算例的可携带、可长期保存载体。
2. **首次访问必须联网**：离线能力来自 SW 的安装，而安装需要一次成功的在线访问。
   界面底部的离线状态指示会明确区分「已缓存（断网可用）」与
   「已断网且尚未缓存（不可用）」，避免使用者误判。
3. **无 Web 字体**：界面使用系统 CJK 字体栈，不同平台字形略有差异，
   这是为完全离线与体积控制所做的取舍。

## 4. 离线状态指示

`src/ui/OfflineStatus.tsx` 在页脚常驻显示三态，使用者**一眼可判**当前设备能否断网使用：

| 状态 | 显示 |
|---|---|
| SW 已激活且在线 | 🟢 离线就绪 —— 断网后全部功能仍可使用 |
| 在线、SW 尚未激活 | ⚪ 正在准备离线缓存…… |
| 已断网、SW 已激活 | 🟢 已断网 —— 计算功能可正常使用 |
| **已断网、SW 未激活** | 🔴 **已断网且尚未缓存，无法使用** |
| 浏览器不支持 SW | ⚪ 当前浏览器不支持离线缓存 |
