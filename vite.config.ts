import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * 部署基路径（Vite `base`）。
 *
 * 默认 `/`：本地开发服务器与部署在**域名根路径**下时用它。
 * GitHub Pages 的**项目站**位于 `https://<user>.github.io/<repo>/`，此时必须以
 * `VITE_BASE=/<repo>/` 构建——否则产物里的 `/assets/…` 指向域名根，页面白屏。
 *
 * 这里统一补正首尾斜杠，使 `VITE_BASE=wes-x` 这种写法不会静默产出错误 URL。
 */
const rawBase = process.env.VITE_BASE ?? '/'
const base = `/${rawBase.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/')

/**
 * 本地服务器**不再对外**。
 *
 * 这里原先配了 `server.allowedHosts` / `preview.allowedHosts`，用来让局域网里的
 * 其它设备按主机名打开本地 dev/preview（Vite 的 DNS 重绑定防护要求把主机名显式列出）。
 * 2026-10-08 起改为**只看 GitHub Pages**：发布与验收一律走线上站点，
 * 本地服务器只服务本机（IP 与 localhost 默认放行），不再需要任何主机名白名单。
 *
 * 因此这里不再声明 `server` / `preview`，也不再读 `VITE_DEV_HOSTS`。
 * 若哪天又要在别的设备上看本地构建，**先想清楚那是把开发服务器暴露到网段上**，
 * 再显式加回白名单——默认不开。
 */
export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // ⚠️ 不要在此声明 includeAssets —— globPatterns 已覆盖 svg/png，
      // 两处同时声明会在预缓存清单中产生重复条目（本项目曾出现，已修正）。
      manifest: {
        name: 'WES 型实用堰泄流能力与堰流水面线计算程序',
        short_name: 'WES 堰计算',
        description:
          '按 SL 253-2018《溢洪道设计规范》计算 WES 型实用堰泄流能力与堰流水面线',
        lang: 'zh-CN',
        dir: 'ltr',
        // 界面固定暗色（见 src/ui/app.css 与 index.html 的 color-scheme 声明）。
        // manifest 的两色取自同一组 token：theme_color 用在任务切换/状态栏，
        // background_color 用在启动闪屏——若留浅色，安装到主屏后启动会先白闪一下。
        theme_color: '#11161c',
        background_color: '#11161c',
        display: 'standalone',
        orientation: 'any',
        // ⚠️ 不要在此声明 `start_url` / `scope`：vite-plugin-pwa 的默认值就是
        // `base`（见其 generateWebManifest 的 defaultManifest），而手写 `'/'`
        // 会在项目站（`/wes-hydraulic-calc/`）下把作用域钉死在域名根，
        // 安装到主屏后落到 404。让 base 做单一来源。
        categories: ['engineering', 'productivity', 'utilities'],
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // 应用外壳**整体预缓存**。本项目为完全离线计算，运行时**不访问任何网络**，
        // 故不需要任何运行时缓存策略：全部资源在 SW 安装时一次性预缓存。
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // vite-plugin-pwa 会自动把 manifest.icons 与 manifest.webmanifest 加入预缓存；
        // 若 globPatterns 再匹配一遍，清单中会出现重复条目。此处排除，保证每项只出现一次。
        globIgnores: ['**/pwa-192.png', '**/pwa-512.png', '**/manifest.webmanifest'],
        // 单页应用：导航请求回退到应用外壳（当前无路由，仍按最佳实践配置）
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // 单个资源上限 2 MiB（当前最大分包 572 kB，留有余量）
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
      },
      devOptions: {
        // 开发模式不启用 SW，避免缓存干扰调试；离线能力以构建产物验证
        enabled: false,
      },
    }),
  ],
})
