/**
 * 算例持久化测试 —— 测试先行（AGENTS.md §7.4）。
 *
 * 使用 `fake-indexeddb` 在 Node 环境下提供 IndexedDB 实现，
 * 使同一份生产代码可在测试中直接运行（不打桩、不复制逻辑）。
 */

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  CASE_SCHEMA_VERSION,
  clearAllCases,
  deleteCase,
  exportCasesJson,
  getCase,
  hasCaseNamed,
  importCases,
  listCases,
  parseCasesJson,
  saveCase,
} from '../../src/persistence/cases'
import { createDefaultInput } from '../../src/store/parameterStore'
import type { CaseBundle } from '../../src/persistence/cases'
import type { CalculationInput } from '../../src/core'

async function freshDb(): Promise<void> {
  await clearAllCases()
}

function inputWithHead(head: number): CalculationInput {
  const base = createDefaultInput()
  return { ...base, operation: { ...base.operation, headOverCrest: head } }
}

beforeEach(freshDb)

describe('IndexedDB 算例 CRUD', () => {
  it('保存后应能读回，且内容一致', async () => {
    const input = inputWithHead(3.5)
    const saved = await saveCase('初设方案 A', input)
    expect(saved.id).toBeTruthy()
    expect(saved.name).toBe('初设方案 A')
    expect(saved.schemaVersion).toBe(CASE_SCHEMA_VERSION)

    const back = await getCase(saved.id)
    expect(back).toBeDefined()
    expect(back!.input.operation.headOverCrest).toBe(3.5)
  })

  it('名称首尾空白应被去除；空名称应拒绝', async () => {
    const s = await saveCase('  带空格  ', createDefaultInput())
    expect(s.name).toBe('带空格')
    await expect(saveCase('   ', createDefaultInput())).rejects.toThrow()
  })

  it('按 id 更新时应保留 createdAt，并刷新 updatedAt', async () => {
    const first = await saveCase('方案甲', inputWithHead(2))
    await new Promise((r) => setTimeout(r, 5))
    const updated = await saveCase('方案甲（修订）', inputWithHead(4), first.id)

    expect(updated.id).toBe(first.id)
    expect(updated.createdAt).toBe(first.createdAt)
    expect(updated.updatedAt >= first.updatedAt).toBe(true)

    const all = await listCases()
    expect(all.length).toBe(1)
    expect(all[0]!.name).toBe('方案甲（修订）')
  })

  it('列表应按更新时间倒序', async () => {
    await saveCase('旧', createDefaultInput())
    await new Promise((r) => setTimeout(r, 5))
    await saveCase('新', createDefaultInput())
    const all = await listCases()
    expect(all[0]!.name).toBe('新')
    expect(all[1]!.name).toBe('旧')
  })

  it('删除应只影响目标算例', async () => {
    const a = await saveCase('A', createDefaultInput())
    await saveCase('B', createDefaultInput())
    await deleteCase(a.id)
    const all = await listCases()
    expect(all.length).toBe(1)
    expect(all[0]!.name).toBe('B')
    expect(await getCase(a.id)).toBeUndefined()
  })

  it('清空后列表应为空', async () => {
    await saveCase('A', createDefaultInput())
    await saveCase('B', createDefaultInput())
    await clearAllCases()
    expect(await listCases()).toEqual([])
  })

  it('同名判定应忽略首尾空白', async () => {
    await saveCase('校核工况', createDefaultInput())
    expect(await hasCaseNamed('  校核工况  ')).toBe(true)
    expect(await hasCaseNamed('设计工况')).toBe(false)
  })
})

describe('算例 JSON 导出 / 导入', () => {
  it('导出再解析应还原算例', async () => {
    const saved = await saveCase('方案甲', inputWithHead(3))
    const json = exportCasesJson([saved])
    const parsed = parseCasesJson(json)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.cases.length).toBe(1)
    expect(parsed.cases[0]!.name).toBe('方案甲')
    expect(parsed.cases[0]!.input.operation.headOverCrest).toBe(3)
    expect(parsed.skipped).toBe(0)
  })

  it('导出的 JSON 应带 kind 标识，便于识别来源', () => {
    const bundle = JSON.parse(exportCasesJson([])) as CaseBundle
    expect(bundle.kind).toBe('wes-hydraulic-calc/cases')
    expect(bundle.schemaVersion).toBe(CASE_SCHEMA_VERSION)
    expect(typeof bundle.exportedAt).toBe('string')
  })

  it('非 JSON 文本应报错而非抛异常', () => {
    const r = parseCasesJson('这不是 JSON')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toContain('JSON')
  })

  it('非本程序的 JSON 应报错并说明缺少 kind', () => {
    const r = parseCasesJson(JSON.stringify({ foo: 1 }))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toContain('kind')
  })

  it('部分记录损坏时应跳过并计数，其余正常载入', () => {
    const good = {
      id: 'x',
      name: '好的',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      schemaVersion: 1,
      input: createDefaultInput(),
    }
    const r = parseCasesJson(
      JSON.stringify({
        kind: 'wes-hydraulic-calc/cases',
        schemaVersion: 1,
        exportedAt: '2026-01-01T00:00:00.000Z',
        cases: [good, { name: '' }, null, { name: '缺 input' }],
      }),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.cases.length).toBe(1)
    expect(r.skipped).toBe(3)
  })

  it('全部记录都不可识别时应报错', () => {
    const r = parseCasesJson(
      JSON.stringify({ kind: 'wes-hydraulic-calc/cases', cases: [null, { name: '' }] }),
    )
    expect(r.ok).toBe(false)
  })

  it('导入应为每条算例重新分配 id，不覆盖本机已有算例', async () => {
    const local = await saveCase('本机方案', createDefaultInput())
    const parsed = parseCasesJson(
      exportCasesJson([
        {
          id: local.id, // 故意与外来的 id 冲突
          name: '外来方案',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          schemaVersion: 1,
          input: inputWithHead(5),
        },
      ]),
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const n = await importCases(parsed.cases)
    expect(n).toBe(1)

    const all = await listCases()
    expect(all.length).toBe(2)
    expect(all.map((c) => c.name).sort()).toEqual(['外来方案', '本机方案'])
  })
})
