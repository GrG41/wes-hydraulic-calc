#!/usr/bin/env node
/**
 * 生成「验收摘要」页：`public/verification.html`。
 *
 * 用途：部署到 GitHub Pages 后，工程师打开站点即可看到**这一版验过什么、没验什么、
 * 自己怎么复核**，而不必先读源码。
 *
 * 三条纪律（本脚本存在的理由）：
 *
 *   1. **数字一律现取**，不手写。提交号、提交时间、工作区是否干净、测试项数都来自
 *      本次运行；取不到就报错停下，不会印一个"看起来对"的数。
 *   2. **正文不抄**，从 `docs/ACCEPTANCE.md` / `docs/VALIDATION.md` 里**抽取**。
 *      文档是单一来源，本页只是它的一份渲染；锚点找不到即**失败退出**，
 *      不产出缺章节的页面（缺章节的页面比没有页面更坏）。
 *   3. **测试没通过就不生成**。对外展示的页面不允许建立在红的测试之上。
 *
 * 用法：node scripts/gen-verification-page.mjs
 * 退出码：0 = 已生成；1 = 内容前置条件不满足（测试红 / 文档锚点缺失）；2 = 环境不可用。
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public', 'verification.html')

const die = (msg, code = 1) => {
  console.error(`✗ ${msg}`)
  process.exit(code)
}

const sh = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()

// ─────────────────────────────────────────────────────────────────
//  1. 现取：仓库事实
// ─────────────────────────────────────────────────────────────────
let commit, commitShort, commitDate, subject, branch, dirty
try {
  commit = sh('rev-parse', 'HEAD')
  commitShort = sh('rev-parse', '--short=7', 'HEAD')
  commitDate = sh('log', '-1', '--format=%cI')
  subject = sh('log', '-1', '--format=%s')
  branch = sh('rev-parse', '--abbrev-ref', 'HEAD')
  dirty = sh('status', '--porcelain').length > 0
} catch (e) {
  die(`无法读取 git 信息：${e.message}`, 2)
}

let remote = ''
try {
  // 远端可能未配置（本地仓库很常见）——这不是错误，故把 git 的 stderr 也吞掉，
  // 免得在构建日志里留下一行看着像失败的 "No such remote 'origin'"。
  remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
} catch {
  remote = ''
}

/** `git@github.com:a/b.git` 与 `https://github.com/a/b.git` 都归一成网页地址。 */
function toWebUrl(url) {
  const m = url.match(/^(?:git@([^:]+):|https?:\/\/([^/]+)\/)(.+?)(?:\.git)?$/)
  if (!m) return null
  const host = m[1] ?? m[2]
  return `https://${host}/${m[3]}`
}
const repoUrl = remote ? toWebUrl(remote) : null

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const basePath = (() => {
  const raw = process.env.VITE_BASE ?? '/'
  return `/${raw.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/')
})()

// ─────────────────────────────────────────────────────────────────
//  2. 现取：测试收据（红即停）
// ─────────────────────────────────────────────────────────────────
const vitestBin = join(ROOT, 'node_modules', '.bin', 'vitest')
if (!existsSync(vitestBin)) {
  die(`未找到 ${vitestBin}，请先 pnpm install`, 2)
}

const tmp = mkdtempSync(join(tmpdir(), 'wes-verify-'))
const reportPath = join(tmp, 'report.json')
let receipt
try {
  execFileSync(vitestBin, ['run', '--reporter=json', `--outputFile=${reportPath}`], {
    cwd: ROOT,
    stdio: 'inherit',
  })
  const r = JSON.parse(readFileSync(reportPath, 'utf8'))
  receipt = {
    files: r.numTotalTestSuites,
    total: r.numTotalTests,
    passed: r.numPassedTests,
    failed: r.numFailedTests,
  }
} catch {
  rmSync(tmp, { recursive: true, force: true })
  die('测试未全部通过 —— 拒绝生成对外展示的验收摘要页')
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

// ─────────────────────────────────────────────────────────────────
//  3. 抽取：从仓库文档里取正文（文档是单一来源）
// ─────────────────────────────────────────────────────────────────
/**
 * 取某标题下的正文行，直到下一个标题（`#`~`######`）为止。
 * 标题用**前缀**匹配：`### 2.4 浏览器端到端验收（9 项…）` 这种把易变数字写进标题的
 * 情况不会因为数字变化就让本脚本失效，但**章节被删掉/改名会立刻失败**。
 */
function section(md, headingPrefix) {
  const lines = md.split('\n')
  const start = lines.findIndex((l) => l.trim().startsWith(headingPrefix))
  if (start < 0) return null
  const out = []
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^#{1,6}\s/.test(lines[i])) break
    out.push(lines[i])
  }
  // 去掉首尾空行与分隔线
  while (out.length && (out[0].trim() === '' || out[0].trim() === '---')) out.shift()
  while (out.length && (out.at(-1).trim() === '' || out.at(-1).trim() === '---')) out.pop()
  return { heading: lines[start].replace(/^#+\s*/, '').trim(), lines: out }
}

const acceptanceMd = readFileSync(join(ROOT, 'docs', 'ACCEPTANCE.md'), 'utf8')
const validationMd = readFileSync(join(ROOT, 'docs', 'VALIDATION.md'), 'utf8')

const ANCHORS = [
  ['acceptanceSummary', acceptanceMd, '### 2.1 汇总', '自动验收汇总（docs/ACCEPTANCE.md §2.1）'],
  ['browserAcceptance', acceptanceMd, '### 2.4 浏览器端到端验收', '浏览器端到端验收（docs/ACCEPTANCE.md §2.4）'],
  ['manualChecklist', acceptanceMd, '### 3.3 手工验收清单', '可自行执行的复核步骤（docs/ACCEPTANCE.md §3.3）'],
  ['limits', acceptanceMd, '### 4.1 功能边界', '功能边界（docs/ACCEPTANCE.md §4.1）'],
  ['verdict', acceptanceMd, '## 5. 验收结论', '验收结论（docs/ACCEPTANCE.md §5）'],
  ['noValidation', validationMd, '## ⚠️ 强制声明', '未经独立数据验证的声明（docs/VALIDATION.md）'],
]

const missing = ANCHORS.filter(([, md, prefix]) => section(md, prefix) === null)
if (missing.length > 0) {
  die(
    '以下锚点在文档里找不到，拒绝生成缺章节的页面：\n' +
      missing.map(([, , prefix]) => `    ${prefix}`).join('\n'),
  )
}
const S = Object.fromEntries(ANCHORS.map(([k, md, prefix]) => [k, section(md, prefix)]))

// ─────────────────────────────────────────────────────────────────
//  4. 渲染：够用的 Markdown 子集 → HTML
// ─────────────────────────────────────────────────────────────────
const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** 行内标记：`code`、**粗体**、[文本](链接)。 */
function inline(s) {
  let out = esc(s)
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>')
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => {
    // 文档里的相对链接（如 `docs/DECISIONS.md`）在站点上不存在，改指向仓库；
    // 仓库地址未知时**不假装能点**，退化成代码文本。
    const h = esc(href)
    if (/^https?:/.test(href)) return `<a href="${h}" rel="noreferrer">${text}</a>`
    if (repoUrl) return `<a href="${esc(repoUrl)}/blob/${branch}/${h.replace(/^\.?\//, '')}" rel="noreferrer">${text}</a>`
    return `<code>${text}</code>`
  })
  return out
}

/** 把抽取到的 Markdown 行渲染成 HTML 块。 */
function render(lines) {
  const html = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // 表格
    if (line.trim().startsWith('|')) {
      const rows = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(lines[i].trim())
        i += 1
      }
      const cells = rows.map((r) =>
        r
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((c) => c.trim()),
      )
      const body = cells.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)))
      if (body.length > 0) {
        const [head, ...rest] = body
        html.push(
          '<table class="tbl"><thead><tr>' +
            head.map((c) => `<th>${inline(c)}</th>`).join('') +
            '</tr></thead><tbody>' +
            rest
              .map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>')
              .join('') +
            '</tbody></table>',
        )
      }
      continue
    }

    // 引用块（源文档里按行折行，这里按空行分段重新拼成整段）
    if (line.trim().startsWith('>')) {
      const quote = []
      while (i < lines.length && (lines[i].trim().startsWith('>') || lines[i].trim() === '')) {
        if (lines[i].trim() === '' && !(lines[i + 1] ?? '').trim().startsWith('>')) break
        quote.push(lines[i].replace(/^\s*>\s?/, '').trim())
        i += 1
      }
      const paras = []
      let cur = []
      // 折行处拼接：两侧都是非 ASCII（中文语境）时不留空格，否则留一个 ——
      // 否则 "适用性（是否…" 会变成 "适用性 （是否…"。
      const joinLines = (arr) =>
        arr.reduce((acc, s, n) => {
          if (n === 0) return s
          const prev = acc.at(-1) ?? ''
          const bothCjk = /[^\x00-\x7F]/.test(prev) && /^[^\x00-\x7F]/.test(s)
          return acc + (bothCjk ? '' : ' ') + s
        }, '')
      for (const q of quote) {
        if (q === '') {
          if (cur.length) paras.push(joinLines(cur))
          cur = []
        } else {
          cur.push(q)
        }
      }
      if (cur.length) paras.push(joinLines(cur))
      html.push(
        '<blockquote>' + paras.map((p) => `<p>${inline(p)}</p>`).join('') + '</blockquote>',
      )
      continue
    }

    // 有序清单
    if (/^\d+\.\s/.test(line.trim())) {
      const start = Number(line.trim().match(/^(\d+)\./)[1])
      const items = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s*/, ''))
        i += 1
      }
      html.push(
        `<ol start="${start}">` + items.map((t) => `<li>${inline(t)}</li>`).join('') + '</ol>',
      )
      continue
    }

    // 无序清单
    if (/^[-*]\s/.test(line.trim())) {
      const items = []
      while (i < lines.length && /^[-*]\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s*/, ''))
        i += 1
      }
      html.push('<ul>' + items.map((t) => `<li>${inline(t)}</li>`).join('') + '</ul>')
      continue
    }

    // 整行加粗（清单的分组标题）
    if (/^\*\*[^*]+\*\*$/.test(line.trim())) {
      html.push(`<h3>${inline(line.trim().replace(/\*\*/g, ''))}</h3>`)
      i += 1
      continue
    }

    if (line.trim() === '') {
      i += 1
      continue
    }

    html.push(`<p>${inline(line.trim())}</p>`)
    i += 1
  }
  return html.join('\n')
}

// ─────────────────────────────────────────────────────────────────
//  5. 组页
// ─────────────────────────────────────────────────────────────────
const links = (rel, label) => (repoUrl ? `<a href="${repoUrl}/blob/${branch}/${rel}" rel="noreferrer">${label}</a>` : `<code>${rel}</code>`)

const page = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>验收摘要 · WES 型实用堰计算程序</title>
<style>
  :root { color-scheme: light dark; --fg:#1a1a1a; --bg:#ffffff; --muted:#5b6470; --line:#dfe3e8; --accent:#1a5fb4; --warn-bg:#fff6e5; --warn-line:#e0a800; }
  @media (prefers-color-scheme: dark) { :root { --fg:#e8eaed; --bg:#16181c; --muted:#9aa3af; --line:#2c313a; --accent:#7cb0ff; --warn-bg:#2a2416; --warn-line:#8a6d1f; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.7 system-ui,-apple-system,"Noto Sans CJK SC","Source Han Sans SC",sans-serif; }
  main { max-width: 900px; margin: 0 auto; padding: 1.5rem 1.25rem 4rem; }
  h1 { font-size: 1.5rem; margin: 0 0 .25rem; }
  h2 { font-size: 1.15rem; margin: 2.25rem 0 .75rem; padding-bottom:.35rem; border-bottom:1px solid var(--line); }
  h3 { font-size: 1rem; margin: 1.5rem 0 .5rem; }
  a { color: var(--accent); }
  code { background: color-mix(in srgb, var(--fg) 8%, transparent); padding:.1em .35em; border-radius:3px; font-size:.9em; }
  .lead { color: var(--muted); margin:.25rem 0 0; }
  .nav { display:flex; gap:1rem; flex-wrap:wrap; margin:1rem 0 0; font-size:.95rem; }
  .facts { display:grid; grid-template-columns: max-content 1fr; gap:.35rem 1rem; margin:0; }
  .facts dt { color:var(--muted); }
  .facts dd { margin:0; overflow-wrap:anywhere; }
  .tbl { width:100%; border-collapse: collapse; margin:.75rem 0; font-size:.92rem; display:block; overflow-x:auto; }
  .tbl th, .tbl td { border:1px solid var(--line); padding:.45rem .6rem; text-align:left; vertical-align:top; }
  .tbl th { background: color-mix(in srgb, var(--fg) 5%, transparent); font-weight:600; }
  .callout { border-left:4px solid var(--warn-line); background:var(--warn-bg); padding:.9rem 1rem; margin:1rem 0; border-radius:0 4px 4px 0; }
  .callout p { margin:.4rem 0; }
  ol, ul { padding-left:1.5rem; }
  li { margin:.3rem 0; }
  .ok { color:#18794e; font-weight:600; }
  footer { margin-top:3rem; padding-top:1rem; border-top:1px solid var(--line); color:var(--muted); font-size:.88rem; }
</style>
</head>
<body>
<main>
  <h1>验收摘要</h1>
  <p class="lead">WES 型实用堰泄流能力与堰流水面线计算程序 —— 这版<strong>验过什么、没验什么、怎么自己复核</strong>。</p>
  <p class="nav"><a href="./">← 返回计算程序</a>${repoUrl ? ` <a href="${repoUrl}" rel="noreferrer">仓库（源码与全部文档）</a>` : ''}</p>

  <h2>1. 本页从哪来</h2>
  <p>本页由构建流程自动生成（<code>scripts/gen-verification-page.mjs</code>），
  <strong>数字取自本次构建时的实际运行，不是手写</strong>；正文从仓库文档里抽取，随文档更新。
  生成时测试若有任何一项未通过，本页不会产出。</p>

  <h2>2. 本次构建</h2>
  <dl class="facts">
    <dt>程序版本</dt><dd>${esc(pkg.version)}（package.json）</dd>
    <dt>提交</dt><dd><code>${esc(commitShort)}</code>（完整：<code>${esc(commit)}</code>）</dd>
    <dt>提交时间</dt><dd>${esc(commitDate)}</dd>
    <dt>提交说明</dt><dd>${esc(subject)}</dd>
    <dt>分支</dt><dd>${esc(branch)}</dd>
    <dt>工作区</dt><dd>${dirty ? '<strong>有未提交改动</strong>（本页对应的构建并非该提交的干净状态）' : '干净（构建内容 == 该提交）'}</dd>
    <dt>构建基路径</dt><dd><code>${esc(basePath)}</code></dd>
    <dt>生成时间</dt><dd>${esc(new Date().toISOString())}</dd>
    <dt>Node</dt><dd>${esc(process.version)}</dd>
    <dt>本页生成前实测</dt><dd><span class="ok">${receipt.passed}/${receipt.total} 项测试通过</span>（${receipt.files} 个文件，失败 ${receipt.failed}）</dd>
  </dl>

  <h2>3. 未经独立数据验证 —— 请先读这一条</h2>
  <div class="callout">
${render(S.noValidation.lines)}
  </div>

  <h2>4. 自动化验收结果（仓库文档记载）</h2>
  <p class="lead">${esc(S.acceptanceSummary.heading)}</p>
${render(S.acceptanceSummary.lines)}

  <h3>4.1 浏览器端到端验收（真实 Chromium）</h3>
${render(S.browserAcceptance.lines)}

  <h2>5. 你可以自己复核的步骤</h2>
  <p class="lead">${esc(S.manualChecklist.heading)}</p>
${render(S.manualChecklist.lines)}

  <h2>6. 已知边界（设计决定，非缺陷）</h2>
${render(S.limits.lines)}

  <h2>7. 验收结论</h2>
${render(S.verdict.lines)}

  <h2>8. 文档与复现</h2>
  <ul>
    <li>公式与取值来源：${links('docs/FORMULAS.md', 'docs/FORMULAS.md')}</li>
    <li>完整验收报告：${links('docs/ACCEPTANCE.md', 'docs/ACCEPTANCE.md')}</li>
    <li>验证报告（含「不执行独立数据验证」的完整说明）：${links('docs/VALIDATION.md', 'docs/VALIDATION.md')}</li>
    <li>决策记录：${links('docs/DECISIONS.md', 'docs/DECISIONS.md')}</li>
    <li>算法设计说明：${links('docs/ALGORITHM.md', 'docs/ALGORITHM.md')}</li>
  </ul>
  <p>在本地复现全部验收：</p>
  <pre><code>pnpm install
pnpm typecheck    # 类型检查（含 src/core 零浏览器依赖约束）
pnpm test         # 单元与验证测试
pnpm verify       # 构建 + PWA 静态验收
nix shell nixpkgs#chromium --command pnpm acceptance   # 真实浏览器端到端验收</code></pre>

  <footer>
    本页由 <code>scripts/gen-verification-page.mjs</code> 生成于 ${esc(new Date().toISOString())}，
    对应提交 <code>${esc(commitShort)}</code>。
    ${repoUrl ? `文档与源码：<a href="${repoUrl}" rel="noreferrer">${esc(repoUrl.replace(/^https:\/\//, ''))}</a>。` : ''}
    计算依据：SL 253-2018《溢洪道设计规范》。
  </footer>
</main>
</body>
</html>
`

writeFileSync(OUT, page, 'utf8')

console.log(
  `\n✓ 已生成 ${OUT.replace(`${ROOT}/`, '')}\n` +
    `  提交 ${commitShort}${dirty ? '（工作区有未提交改动）' : ''}｜` +
    `测试 ${receipt.passed}/${receipt.total} 通过｜基路径 ${basePath}\n` +
    `  抽取章节：${ANCHORS.map(([, , prefix]) => prefix).join('、')}\n`,
)
