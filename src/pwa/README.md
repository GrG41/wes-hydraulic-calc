# src/pwa

Service Worker 与 Manifest 的**配置**集中在仓库根目录的 `vite.config.ts`
（`vite-plugin-pwa` 的 `manifest` 与 `workbox` 字段），构建时可自动生成
`sw.js` 与 `manifest.webmanifest`，因此本目录当前不含源文件。

若后续需要自定义 Service Worker 逻辑（例如接管更新提示、按需缓存计算书模板），
在此目录放置 `sw.ts`，并在 `vite.config.ts` 中改用 `strategies: 'injectManifest'`。

## 离线要求（AGENTS.md §2.7）

断网后**全部计算功能必须可用**。本项目为纯客户端计算，运行时零网络依赖：

- 应用外壳由 Workbox 预缓存（`globPatterns`）；
- 算例与历史记录存于 IndexedDB（阶段 4）；
- 计算书导出在本地生成（阶段 4）。

阶段 6 需专项验证：断网后计算、保存、导出一律可用，且 Service Worker 更新不丢失用户数据。
