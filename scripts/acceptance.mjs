#!/usr/bin/env node
/**
 * 端到端验收（真实浏览器）。
 *
 * 依据：AGENTS.md §6 阶段 6「跨浏览器/跨平台测试、验收测试」。
 *
 * 本脚本用**真实的 Chromium** 通过 CDP（Chrome DevTools Protocol）驱动 `dist/` 构建产物，
 * 覆盖 `scripts/verify-pwa.mjs` 静态检查**无法覆盖**的运行时行为：
 *   1. 应用在浏览器中**真实渲染**（React 挂载、无运行时崩溃）
 *   2. 点击「计算」后**出结果**（整条链路在浏览器里跑通）
 *   3. Service Worker **实际注册并激活**
 *   4. 页面控制台**无错误**
 *   5. **断网后重新加载仍然可用**（§2.7 离线优先的核心验收项）
 *   6. 断网后**仍能完成一次计算**（不只是能打开）
 *
 * 零第三方依赖：仅用 Node 内置的 http / fs / child_process / fetch / WebSocket。
 *
 * 用法：
 *   pnpm build && node scripts/acceptance.mjs
 *   node scripts/acceptance.mjs --base=/wes-hydraulic-calc/     # 按子路径托管 dist/（模拟 GitHub Pages 项目站）
 *   node scripts/acceptance.mjs --url=https://example.com/app/  # 直接验**线上站点**（不起本地服务）
 *
 * 退出码：0 = 全部通过；1 = 有检查项失败；2 = **没能验到**（环境/目标不可达，不是通过）。
 */

import { createServer } from 'node:http'
import { readFile, mkdtemp } from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'

const DIST = 'dist'
const CDP_PORT = 9333
const APP_PORT = 4174

// ─────────────────────────────────────────────────────────────────
//  命令行参数
// ─────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)

/** 取 `--名字=值` / `--名字 值` 形式的参数；未给出返回 undefined。 */
function argValue(name) {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`))
  if (hit === undefined) return undefined
  const eq = hit.indexOf('=')
  if (eq >= 0) return hit.slice(eq + 1)
  const i = argv.indexOf(hit)
  return argv[i + 1]
}

/** 归一化基路径：始终形如 `/` 或 `/x/y/`。 */
function normalizeBasePath(p) {
  const s = String(p ?? '/').trim()
  return `/${s.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/')
}

const TARGET_URL = argValue('url')
const BASE_PATH = normalizeBasePath(argValue('base') ?? process.env.APP_BASE ?? '/')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

const results = []
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` —— ${detail}` : ''}`)
}

// ─────────────────────────────────────────────────────────────────
//  静态服务器（按 `BASE_PATH` 托管，模拟部署基路径）
// ─────────────────────────────────────────────────────────────────
function startServer(basePath) {
  const root = resolve(DIST)
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const pathname = decodeURIComponent(url.pathname)
      // 基路径之外一律 404：若产物仍引用根路径资源，这里会**当场暴露**，
      // 而不是静默回退成 index.html 让应用白屏。
      if (!pathname.startsWith(basePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end(`404：${pathname} 不在部署基路径 ${basePath} 下`)
        return
      }
      let rel = pathname.slice(basePath.length)
      if (rel === '' || rel.endsWith('/')) rel += 'index.html'
      let file = resolve(root, rel)
      if (!file.startsWith(root + sep)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('403')
        return
      }
      // 单页应用：非文件请求回退到 index.html（与 SW 的 navigateFallback 一致）
      if (!existsSync(file)) file = join(root, 'index.html')
      const body = await readFile(file)
      res.writeHead(200, {
        'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
        'Service-Worker-Allowed': basePath,
        'Cache-Control': 'no-cache',
      })
      res.end(body)
    } catch (e) {
      res.writeHead(500).end(String(e))
    }
  })
  return new Promise((resolve_) => {
    server.listen(APP_PORT, '127.0.0.1', () => resolve_(server))
  })
}

// ─────────────────────────────────────────────────────────────────
//  CDP 客户端
// ─────────────────────────────────────────────────────────────────
class Cdp {
  #ws
  #id = 0
  #pending = new Map()
  #events = []

  static async connect(wsUrl) {
    const c = new Cdp()
    c.#ws = new WebSocket(wsUrl)
    await new Promise((resolve, reject) => {
      c.#ws.addEventListener('open', resolve, { once: true })
      c.#ws.addEventListener('error', reject, { once: true })
    })
    c.#ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id !== undefined) {
        const p = c.#pending.get(msg.id)
        if (p) {
          c.#pending.delete(msg.id)
          msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result)
        }
      } else {
        c.#events.push(msg)
      }
    })
    return c
  }

  send(method, params = {}) {
    const id = ++this.#id
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject })
      this.#ws.send(JSON.stringify({ id, method, params }))
    })
  }

  /** 等待某个 CDP 事件（含超时）。 */
  waitEvent(method, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + timeoutMs
      const tick = () => {
        const i = this.#events.findIndex((e) => e.method === method)
        if (i >= 0) return resolve(this.#events.splice(i, 1)[0])
        if (Date.now() > deadline) return reject(new Error(`等待事件 ${method} 超时`))
        setTimeout(tick, 60)
      }
      tick()
    })
  }

  async evaluate(expression, awaitPromise = false) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
    })
    if (r.exceptionDetails) {
      throw new Error(`页面内求值异常：${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`)
    }
    return r.result.value
  }

  /** 取走累计的控制台错误。 */
  drainConsoleErrors() {
    const errs = []
    for (let i = this.#events.length - 1; i >= 0; i -= 1) {
      const e = this.#events[i]
      if (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') {
        errs.push(e.params.args.map((a) => a.value ?? a.description ?? '').join(' '))
        this.#events.splice(i, 1)
      }
      if (e.method === 'Runtime.exceptionThrown') {
        errs.push(e.params.exceptionDetails?.exception?.description ?? '未捕获异常')
        this.#events.splice(i, 1)
      }
    }
    return errs
  }
}

// ─────────────────────────────────────────────────────────────────
//  主流程
// ─────────────────────────────────────────────────────────────────
async function main() {
  // 目标：要么是本地 dist/ 按基路径托管，要么是**线上站点**。
  let server = null
  let target
  if (TARGET_URL !== undefined) {
    if (!/^https?:\/\//.test(TARGET_URL)) {
      console.error(`✗ --url 需要完整地址，收到：${TARGET_URL}`)
      process.exit(2)
    }
    target = TARGET_URL.endsWith('/') ? TARGET_URL : `${TARGET_URL}/`
    console.log(`\n目标（线上）： ${target}`)
    const pre = await preflight(target)
    if (!pre.ok) {
      console.error(`✗ 目标不可达或返回异常：${pre.detail}`)
      process.exit(2)
    }
    console.log(`线上预检： HTTP ${pre.status}，标题「${pre.title}」`)
  } else {
    if (!existsSync(join(DIST, 'index.html'))) {
      console.error('✗ 未找到 dist/，请先执行 pnpm build')
      process.exit(2)
    }
    server = await startServer(BASE_PATH)
    target = `http://127.0.0.1:${APP_PORT}${BASE_PATH}`
    console.log(`\n本地静态服务： ${target}（托管 ${DIST}/，基路径 ${BASE_PATH}）`)
  }
  const base = target

  const profile = await mkdtemp(join(tmpdir(), 'wes-acceptance-'))
  const chrome = spawn(
    CHROMIUM,
    [
      '--headless=new',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1440,900',
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let chromeErr = ''
  chrome.stderr.on('data', (d) => {
    chromeErr += d.toString()
  })

  // 等 CDP 端点就绪。
  //
  // ⚠️ 必须连**页面级** target：`/json/version` 给出的是**浏览器级**端点，
  // 它不支持 `Page` / `Runtime` 等页面域（会返回 -32601 'Page.enable' wasn't found）。
  // 页面级端点在 `/json/list` 中，type 为 "page"。
  let wsUrl = null
  for (let i = 0; i < 100; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) {
        wsUrl = page.webSocketDebuggerUrl
        break
      }
      // 没有页面 target 时主动建一个
      await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(base)}`, {
        method: 'PUT',
      }).catch(() => {})
    } catch {
      /* 尚未就绪 */
    }
    await sleep(300)
  }
  if (!wsUrl) {
    console.error('✗ 无法连接 Chromium 的页面调试端点\n', chromeErr.slice(-800))
    chrome.kill()
    server?.close()
    process.exit(2)
  }

  const cdp = await Cdp.connect(wsUrl)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Network.enable')

  try {
    // ── 1. 首次加载：真实渲染 ─────────────────────────────────
    const nav = cdp.waitEvent('Page.loadEventFired')
    await cdp.send('Page.navigate', { url: base })
    await nav
    await sleep(1200)

    const title = await cdp.evaluate(`document.querySelector('.shell__title')?.textContent ?? ''`)
    record('应用在真实浏览器中渲染', typeof title === 'string' && title.includes('WES'), `标题：${title.slice(0, 24)}…`)

    const fieldCount = await cdp.evaluate(`document.querySelectorAll('.field').length`)
    record('参数表单渲染出字段', fieldCount > 20, `${fieldCount} 个字段`)

    // ── 2. Service Worker 注册并激活 ─────────────────────────
    const swState = await cdp.evaluate(
      `(async () => {
         if (!('serviceWorker' in navigator)) return 'unsupported'
         const reg = await Promise.race([
           navigator.serviceWorker.ready,
           new Promise((r) => setTimeout(() => r(null), 15000)),
         ])
         if (!reg) return 'timeout'
         return (reg.active || {}).state ?? 'no-active'
       })()`,
      true,
    )
    record('Service Worker 注册并激活', swState === 'activated', `状态：${swState}`)

    // ── 3. 在线状态下跑一次完整计算 ──────────────────────────
    const onlineCalc = await runCalculation(cdp)
    record('在线：点击「计算」后出结果', onlineCalc.ok, onlineCalc.detail)

    // ── 4. 控制台无错误 ──────────────────────────────────────
    const errsOnline = cdp.drainConsoleErrors()
    record(
      '在线：页面控制台无错误',
      errsOnline.length === 0,
      errsOnline.length ? errsOnline.slice(0, 2).join(' | ').slice(0, 160) : '',
    )

    // ── 5. 切断网络并重新加载 ────────────────────────────────
    await cdp.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    })
    await sleep(300)

    const nav2 = cdp.waitEvent('Page.loadEventFired')
    await cdp.send('Page.reload', { ignoreCache: false })
    await nav2
    await sleep(1500)

    const offlineTitle = await cdp.evaluate(`document.querySelector('.shell__title')?.textContent ?? ''`)
    record(
      '断网后重新加载页面仍可用（§2.7 核心验收项）',
      typeof offlineTitle === 'string' && offlineTitle.includes('WES'),
      offlineTitle ? '' : '页面为空 —— 离线缓存未生效',
    )

    const offlineNav = await cdp.evaluate(`navigator.onLine`)
    record('浏览器已报告离线', offlineNav === false, `navigator.onLine = ${offlineNav}`)

    // ── 6. 断网状态下仍能完成计算 ───────────────────────────
    const offlineCalc = await runCalculation(cdp)
    record('断网：仍能完成一次完整计算', offlineCalc.ok, offlineCalc.detail)

    const errsOffline = cdp.drainConsoleErrors()
    record(
      '断网：页面控制台无错误',
      errsOffline.length === 0,
      errsOffline.length ? errsOffline.slice(0, 2).join(' | ').slice(0, 160) : '',
    )

    // ── 7. 恢复网络 ──────────────────────────────────────────
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    })
  } finally {
    chrome.kill()
    server?.close()
  }

  const failed = results.filter((r) => !r.ok)
  console.log('\n' + '─'.repeat(64))
  if (failed.length > 0) {
    console.log(`结果：失败（${failed.length}/${results.length} 项）\n`)
    process.exit(1)
  }
  console.log(`结果：全部通过（${results.length} 项）\n`)
}

/**
 * 线上预检：目标可达、返回 200、且确实是本应用。
 *
 * 与浏览器内的检查**不重复**：它回答的是「我连上的是不是这台机器」，
 * 好在 `--url` 打错、Pages 尚未构建完成（404）、或代理插了一脚时给出明确诊断，
 * 而不是等到浏览器里报一堆看不懂的错。
 */
async function preflight(url) {
  try {
    const res = await fetch(url, { redirect: 'follow' })
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status} ${res.statusText}` }
    const html = await res.text()
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1]?.trim() ?? ''
    if (!title.includes('WES')) {
      return { ok: false, detail: `返回的 HTML 不含预期标题（实际：「${title.slice(0, 40)}」）` }
    }
    return { ok: true, status: res.status, title: title.slice(0, 40) }
  } catch (e) {
    return { ok: false, detail: String(e?.message ?? e) }
  }
}

/** 在页面内点击「计算」并读取主结果。 */
async function runCalculation(cdp) {
  const clicked = await cdp.evaluate(`(() => {
    const btn = [...document.querySelectorAll('.toolbar .btn')]
      .find((b) => /计算/.test(b.textContent ?? ''))
    if (!btn) return false
    btn.click()
    return true
  })()`)
  if (!clicked) return { ok: false, detail: '未找到「计算」按钮' }

  await sleep(1800)
  const q = await cdp.evaluate(
    `document.querySelector('.kpi--primary .kpi__value')?.textContent ?? ''`,
  )
  const hasIter = await cdp.evaluate(
    `document.querySelectorAll('.results .tbl--dense tbody tr').length`,
  )
  const ok = typeof q === 'string' && q !== '' && q !== '—' && Number(q) > 0
  return { ok, detail: ok ? `Q = ${q} m³/s，迭代表 ${hasIter} 行` : `未取到有效流量（读数：${q}）` }
}

/**
 * 定位 Chromium 可执行文件。
 *
 * 优先取环境变量 `CHROMIUM_BIN`；否则在 PATH 中依次尝试常见名称。
 * **不硬编码 `/nix/store/...` 路径** —— 该路径在 gc 后会失效（AGENTS.md 约定）。
 */
function resolveChromium() {
  if (process.env.CHROMIUM_BIN) return process.env.CHROMIUM_BIN
  const names = ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable', 'chrome']
  const dirs = (process.env.PATH ?? '').split(':').filter(Boolean)
  for (const d of dirs) {
    for (const n of names) {
      const p = join(d, n)
      try {
        if (existsSync(p) && statSync(p).isFile()) return p
      } catch {
        /* 忽略不可读项 */
      }
    }
  }
  return null
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const CHROMIUM = resolveChromium()
if (!CHROMIUM) {
  console.error(
    '✗ 未找到 Chromium。请把它装进 PATH，或用 CHROMIUM_BIN 指定可执行文件路径。\n' +
      '  例：nix shell nixpkgs#chromium --command node scripts/acceptance.mjs',
  )
  process.exit(2)
}

// 顶层兜底：脚本自己崩了要报「没能验到（退出码 2）」，而不是让 Node 抛一串堆栈
// 让人误以为「检查失败了」。**「没能验到」与「验了不通过」是两件事。**
try {
  await main()
} catch (e) {
  console.error(`\n✗ 验收未能完成（不属于检查项失败）：${e?.message ?? e}`)
  console.error('  退出码 2 = 没能验到，不是通过。')
  process.exit(2)
}
