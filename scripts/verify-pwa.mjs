#!/usr/bin/env node
/**
 * PWA 构建产物验收检查。
 *
 * 依据：AGENTS.md §2.7「离线优先」、§6 阶段 5「离线可用性验证」。
 *
 * 本脚本对 `dist/` 做**静态**校验（不需要浏览器、不需要起服务），逐项断言：
 *   1. 运行时需要的每个资源都在 Service Worker 预缓存清单中（缺一即断网残缺）
 *   2. 预缓存清单中**没有重复条目**
 *   3. 预缓存清单中的每个 URL 在 dist 下**确实存在**（避免 404 导致安装失败）
 *   4. manifest 必填项齐全（名称、图标、start_url、display）
 *   5. 入口 HTML 已注入 SW 注册，且**未引用任何外部来源**
 *   6. **基路径自洽**：index.html 资源前缀 = manifest.start_url = manifest.scope
 *      （三者不一致时，部署到 `/<repo>/` 子路径会整页白屏）
 *
 * 用法：pnpm build && node scripts/verify-pwa.mjs
 * 退出码非 0 即失败，可直接用于 CI。
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, extname } from 'node:path'

const DIST = 'dist'
const REQUIRED_CACHEABLE_EXT = new Set(['.js', '.css', '.html', '.svg', '.png', '.webmanifest'])

const failures = []
const notes = []

function fail(msg) {
  failures.push(msg)
}

function ok(msg) {
  notes.push(msg)
}

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

// ── 前置：dist 必须存在 ──────────────────────────────────────────
if (!existsSync(DIST)) {
  console.error(`✗ 未找到 ${DIST}/，请先执行 pnpm build`)
  process.exit(1)
}

// ── 1. 解析 sw.js 的预缓存清单 ───────────────────────────────────
const swPath = join(DIST, 'sw.js')
if (!existsSync(swPath)) {
  console.error('✗ 未生成 sw.js —— Service Worker 未构建')
  process.exit(1)
}
const sw = readFileSync(swPath, 'utf8')

const precacheUrls = [...sw.matchAll(/\{url:"([^"]+)",revision:/g)].map((m) => m[1])
if (precacheUrls.length === 0) {
  fail('sw.js 中未解析到任何预缓存条目')
}

// ── 2. 重复条目 ──────────────────────────────────────────────────
const seen = new Map()
for (const u of precacheUrls) seen.set(u, (seen.get(u) ?? 0) + 1)
const dupes = [...seen.entries()].filter(([, n]) => n > 1)
if (dupes.length > 0) {
  fail(`预缓存清单存在重复条目：${dupes.map(([u, n]) => `${u}×${n}`).join('、')}`)
} else {
  ok(`预缓存无重复条目（共 ${precacheUrls.length} 条）`)
}

// ── 3. 清单中的 URL 必须真实存在 ─────────────────────────────────
for (const u of new Set(precacheUrls)) {
  const p = join(DIST, u.replace(/^\//, ''))
  if (!existsSync(p)) fail(`预缓存清单中的 ${u} 在 ${DIST}/ 下不存在（会导致 SW 安装失败）`)
}
if (failures.length === 0) ok('预缓存清单中的每个 URL 在 dist 下均存在')

// ── 4. 运行时需要的资源必须全部被预缓存 ──────────────────────────
// sw.js 自身与 workbox 运行时由浏览器按需加载，不参与预缓存；registerSW.js 会被缓存。
const EXCLUDE_FROM_PRECACHE = new Set(['sw.js'])
const required = walk(DIST)
  .map((p) => relative(DIST, p))
  .filter((rel) => REQUIRED_CACHEABLE_EXT.has(extname(rel)))
  .filter((rel) => !EXCLUDE_FROM_PRECACHE.has(rel))
  .filter((rel) => !rel.startsWith('workbox-'))

const missing = required.filter((rel) => !seen.has(rel))
if (missing.length > 0) {
  fail(`以下资源未被预缓存，断网后将缺失：${missing.join('、')}`)
} else {
  ok(`dist 下 ${required.length} 个可缓存资源全部进入预缓存`)
}

// ── 5. manifest 必填项 ───────────────────────────────────────────
const mfPath = join(DIST, 'manifest.webmanifest')
if (!existsSync(mfPath)) {
  fail('未生成 manifest.webmanifest')
} else {
  const mf = JSON.parse(readFileSync(mfPath, 'utf8'))
  for (const key of ['name', 'short_name', 'start_url', 'display', 'icons']) {
    if (mf[key] === undefined) fail(`manifest 缺少必填项：${key}`)
  }
  if (mf.display !== 'standalone') fail(`manifest display 应为 standalone，实为 ${mf.display}`)
  const sizes = (mf.icons ?? []).map((i) => i.sizes)
  for (const need of ['192x192', '512x512']) {
    if (!sizes.includes(need)) fail(`manifest 缺少 ${need} 图标（安装到主屏的必要条件）`)
  }
  const maskable = (mf.icons ?? []).some((i) => String(i.purpose ?? '').includes('maskable'))
  if (!maskable) fail('manifest 缺少 maskable 图标（Android 自适应图标需要）')
  if (!failures.some((f) => f.startsWith('manifest'))) ok('manifest 必填项齐全')
}

// ── 6. 入口 HTML：SW 注册 + 无外部引用 ───────────────────────────
const html = readFileSync(join(DIST, 'index.html'), 'utf8')
if (!/registerSW\.js/.test(html)) fail('index.html 未注入 Service Worker 注册脚本')
else ok('index.html 已注入 SW 注册脚本')

const external = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1])
if (external.length > 0) {
  fail(`index.html 引用了外部资源，违反完全离线约束：${external.join('、')}`)
} else {
  ok('index.html 未引用任何外部资源')
}

// ── 7. 基路径自洽 ────────────────────────────────────────────────
//
// 反例（2026-10-08 实测）：产物里写死 `/assets/…`，而站点部署在
// `https://<user>.github.io/<repo>/` —— 浏览器去域名根取资源，全部 404，页面白屏。
// 当时**没有任何判据会响**，是我用真实浏览器打开才知道的。这条守在这里：
// index.html 里资源引用的前缀、manifest 的 start_url、manifest 的 scope，
// 三者必须指向同一个基路径。
const absRefs = [...html.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1])
if (absRefs.length === 0) {
  fail('index.html 中没有任何绝对路径资源引用，无法判定基路径（构建是否正常？）')
} else {
  let common = absRefs[0]
  for (const r of absRefs) {
    while (!r.startsWith(common)) common = common.slice(0, -1)
  }
  const htmlBase = common.slice(0, common.lastIndexOf('/') + 1) || '/'
  const pathOf = (u) => {
    try {
      return new URL(u, 'http://placeholder.invalid').pathname
    } catch {
      return null
    }
  }
  const mfPath = join(DIST, 'manifest.webmanifest')
  const mf = existsSync(mfPath) ? JSON.parse(readFileSync(mfPath, 'utf8')) : {}
  const startPath = pathOf(mf.start_url ?? '')
  const scopePath = pathOf(mf.scope ?? '')
  const bad = []
  if (startPath !== htmlBase) bad.push(`manifest.start_url = ${JSON.stringify(mf.start_url)}（应为 ${htmlBase}）`)
  if (scopePath !== htmlBase) bad.push(`manifest.scope = ${JSON.stringify(mf.scope)}（应为 ${htmlBase}）`)
  if (bad.length > 0) {
    fail(
      `基路径不自洽，部署到子路径会白屏：index.html 的资源前缀为 ${htmlBase}，但 ${bad.join('；')}。\n` +
        `    构建时应设 VITE_BASE=<部署基路径>（见 docs/DEPLOYMENT.md）。`,
    )
  } else {
    ok(`基路径自洽：index.html 资源前缀 = manifest.start_url = manifest.scope = ${htmlBase}`)
  }
}

// ── 8. 主题自述与实际一致（固定暗色）─────────────────────────────
//
// 界面是**固定暗色**，并且要向浏览器声明这件事——声明缺了，浏览器会把本页当作
// "不支持暗色的页面"再自动暗化一遍（二次暗色）。
// 这里钉三件事：① HTML 有声明；② 产物 CSS 里声明的是暗色而不是浅色；
// ③ manifest 的两个色与页面底色一致（否则安装到主屏启动时会先闪另一种颜色）。
const colorSchemeMeta = html.match(/<meta\s+name="color-scheme"\s+content="([^"]*)"\s*\/?>/)
if (!colorSchemeMeta) {
  fail('index.html 没有 <meta name="color-scheme">：未向浏览器声明配色，可能被自动暗化')
} else if (!/\bdark\b/.test(colorSchemeMeta[1])) {
  fail(`<meta name="color-scheme" content="${colorSchemeMeta[1]}"> 未声明 dark`)
} else {
  ok(`index.html 已声明 color-scheme: ${colorSchemeMeta[1]}`)
}

const cssFiles = walk(DIST).filter((f) => extname(f) === '.css')
const cssText = cssFiles.map((f) => readFileSync(f, 'utf8')).join('\n')
const schemeDecl = [...cssText.matchAll(/color-scheme:\s*([^;}]+)/g)].map((m) => m[1].trim())
if (schemeDecl.length === 0) {
  fail('产物 CSS 里没有 color-scheme 声明（与界面"固定暗色"的自述不符）')
} else if (!schemeDecl.some((v) => /\bdark\b/.test(v))) {
  fail(`产物 CSS 的 color-scheme 是 ${schemeDecl.join(' / ')}，没有 dark`)
} else {
  ok(`产物 CSS 声明 color-scheme: ${schemeDecl.join(' / ')}`)
}

const canvasMatch = cssText.match(/--canvas:\s*(#[0-9a-fA-F]{3,8})/)
if (!canvasMatch) {
  fail('产物 CSS 里找不到 --canvas，无法核对 manifest 配色是否与页面底色一致')
} else {
  const canvas = canvasMatch[1].toLowerCase()
  const mfFile = join(DIST, 'manifest.webmanifest')
  const mfJson = existsSync(mfFile) ? JSON.parse(readFileSync(mfFile, 'utf8')) : {}
  const tc = String(mfJson.theme_color ?? '').toLowerCase()
  const bc = String(mfJson.background_color ?? '').toLowerCase()
  const bad = []
  if (tc !== canvas) bad.push(`theme_color = ${mfJson.theme_color}（页面底色是 ${canvas}）`)
  if (bc !== canvas) bad.push(`background_color = ${mfJson.background_color}（页面底色是 ${canvas}）`)
  if (bad.length > 0) {
    fail(`manifest 配色与页面底色不一致：${bad.join('；')}——安装到主屏后启动会闪色`)
  } else {
    ok(`manifest 配色与页面底色一致（${canvas}）`)
  }
}

// ── 9. 运行时不联网：只对**真正的取数型调用**判失败 ───────────────
//
// 注意区分两类外部字符串（初版脚本曾把两者都判为失败，属误报）：
//   · **XML 命名空间**（如 http://schemas.openxmlformats.org/...）—— 只是标识符，
//     规范要求其形如 URL，但**永不被解引用**，不产生任何网络请求；
//   · **错误信息中的链接**（如 React 的 https://react.dev/errors/）—— 只是给人看的文案。
// 真正需要拦截的是「网络 API 紧邻外部 URL 字面量」这种实际取数写法。
const NETWORK_APIS = /(?:fetch|sendBeacon|new\s+WebSocket|new\s+EventSource)\s*\(\s*["'`](https?:\/\/[^"'`]+)/
const XHR_OPEN = /\.open\s*\(\s*["'`](?:GET|POST|PUT|DELETE)["'`]\s*,\s*["'`](https?:\/\/[^"'`]+)/

const jsFiles = walk(DIST).filter((p) => extname(p) === '.js' && !/workbox-|sw\.js$/.test(p))
const offenders = []
const domains = new Set()

for (const f of jsFiles) {
  const src = readFileSync(f, 'utf8')
  for (const re of [NETWORK_APIS, XHR_OPEN]) {
    for (const m of src.matchAll(new RegExp(re.source, 'g'))) {
      offenders.push(`${relative(DIST, f)} → ${m[1]}`)
    }
  }
  for (const m of src.matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/g)) domains.add(m[1])
}

if (offenders.length > 0) {
  fail(`构建产物中存在取数型外部调用（运行时可能联网）：\n    ${offenders.join('\n    ')}`)
} else {
  ok('构建产物中未发现取数型外部调用（fetch / XHR / WebSocket / sendBeacon）')
}

if (domains.size > 0) {
  ok(
    `产物中出现的域名（仅供人工复核，含 XML 命名空间与错误信息链接）：` +
      [...domains].sort().join('、'),
  )
}

// ── 汇总 ─────────────────────────────────────────────────────────
console.log('\nPWA 构建产物验收检查\n' + '─'.repeat(60))
for (const n of notes) console.log(`  ✓ ${n}`)
for (const f of failures) console.log(`  ✗ ${f}`)
console.log('─'.repeat(60))

if (failures.length > 0) {
  console.log(`结果：失败（${failures.length} 项）\n`)
  process.exit(1)
}
console.log(`结果：通过（${notes.length} 项检查）\n`)
