/**
 * src/core 隔离性检查。
 *
 * 强制 AGENTS.md 的硬性要求：src/core 必须零 UI 依赖、零浏览器 API 依赖，
 * 可在 Node 环境直接运行测试。
 *
 * 本测试与 tsconfig.core.json（lib 不含 DOM）构成双重保障：
 *   · 编译期 —— `pnpm typecheck`
 *   · 测试期 —— `pnpm test`
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const CORE_DIR = join(process.cwd(), 'src', 'core')

function collectSources(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      found.push(...collectSources(full))
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      found.push(full)
    }
  }
  return found
}

/** 去除注释，避免说明性文字造成误判。 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ')
}

const FORBIDDEN_IMPORTS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /from\s+['"]react(-dom)?(\/[^'"]*)?['"]/, reason: '禁止依赖 React' },
  { pattern: /from\s+['"][^'"]*\/ui(\/|['"])/, reason: '禁止依赖 UI 层' },
  { pattern: /from\s+['"][^'"]*\/store(\/|['"])/, reason: '禁止依赖状态层' },
  { pattern: /from\s+['"][^'"]*\/export(\/|['"])/, reason: '禁止依赖导出层' },
  { pattern: /from\s+['"][^'"]*\/pwa(\/|['"])/, reason: '禁止依赖 PWA 层' },
  { pattern: /from\s+['"]\.\.\/(ui|store|export|pwa)\//, reason: '禁止跨层引用' },
]

const FORBIDDEN_GLOBALS: ReadonlyArray<{ pattern: RegExp; name: string }> = [
  { pattern: /\bdocument\b/, name: 'document' },
  { pattern: /\bwindow\b/, name: 'window' },
  { pattern: /\blocalStorage\b/, name: 'localStorage' },
  { pattern: /\bsessionStorage\b/, name: 'sessionStorage' },
  { pattern: /\bnavigator\b/, name: 'navigator' },
  { pattern: /\bindexedDB\b/, name: 'indexedDB' },
  { pattern: /\brequestAnimationFrame\b/, name: 'requestAnimationFrame' },
  { pattern: /\bfetch\s*\(/, name: 'fetch' },
  { pattern: /\bXMLHttpRequest\b/, name: 'XMLHttpRequest' },
  { pattern: /\bWebSocket\b/, name: 'WebSocket' },
]

describe('src/core 隔离性', () => {
  const files = collectSources(CORE_DIR)

  it('应能扫描到 core 源文件（阶段 2 起会显著增加）', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('不得引入 UI / 状态 / 导出 / PWA 层或 React', () => {
    const violations: string[] = []
    for (const file of files) {
      const body = stripComments(readFileSync(file, 'utf8'))
      for (const { pattern, reason } of FORBIDDEN_IMPORTS) {
        if (pattern.test(body)) {
          violations.push(`${relative(CORE_DIR, file)}: ${reason}`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('不得使用浏览器 API', () => {
    const violations: string[] = []
    for (const file of files) {
      const body = stripComments(readFileSync(file, 'utf8'))
      for (const { pattern, name } of FORBIDDEN_GLOBALS) {
        if (pattern.test(body)) {
          violations.push(`${relative(CORE_DIR, file)}: 使用了 ${name}`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('阶段 2 起 core 允许实现文件，隔离性与浏览器 API 检查仍然生效', () => {
    // 阶段 1 的"只允许类型定义"限制已随阶段 2 开始解除；
    // 本文件前述两项检查（禁止跨层 import、禁止浏览器 API）继续强制执行。
    expect(files.length).toBeGreaterThan(0)
  })

  it('阶段 2 交付物应存在：constants.ts 与 formulas/', () => {
    const rel = files.map((file) => file.slice(CORE_DIR.length + 1))
    expect(rel).toContain('constants.ts')
    expect(rel.some((r) => r.startsWith('formulas/'))).toBe(true)
  })
})
