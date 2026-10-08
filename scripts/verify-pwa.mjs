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

// ── 7. 运行时不联网：只对**真正的取数型调用**判失败 ───────────────
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
