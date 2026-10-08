/**
 * 图表数据构建与 Excel 计算书导出测试 —— 测试先行（AGENTS.md §7.4）。
 *
 * 被测：
 *   · `src/ui/charts/options.ts`（纯函数，与 React 解耦）
 *   · `src/export/excel.ts`（工作簿构建部分，不触发浏览器下载）
 */

import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { calculate } from '../../src/core/calculate'
import type { CalculationInput, CalculationOutput } from '../../src/core'
import {
  bedElevation,
  buildWaterProfileChartData,
  curveHeads,
  dischargeCurveOption,
  waterProfileOption,
} from '../../src/ui/charts/options'
import { buildCalculationWorkbook } from '../../src/export/excel'

function makeInput(patch: Partial<CalculationInput> = {}): CalculationInput {
  const base: CalculationInput = {
    weir: {
      crestElevation: 100,
      downstreamBedElevation: 95,
      upstreamHeightP1: 8,
      upstreamSlope: '3:0',
      crestCurveType: 'double-arc',
      netWidthB: 100,
      singleOpeningWidthB: 100,
      openingCount: 1,
    },
    piers: {
      pierHeadShape: 'rectangular',
      pierHeadExtensionLk: 1,
      pierHeadHeightHs: 1,
      abutmentShape: 'rectangular',
    },
    upstreamSection: {
      distanceOverHeadRatio: 3,
      bedElevation: 100,
      shape: { kind: 'rectangular', bottomWidth: 1000 },
    },
    designHead: { kind: 'direct', value: 5 },
    operation: { headOverCrest: 4, downstreamWaterLevel: 99 },
    chute: {
      bedSlope: 0.1,
      bedAngleDeg: 5.7392,
      roughness: 0.014,
      width: 40,
      startStation: 0,
      endStation: 50,
      segmentation: 'station',
      stationStep: 5,
      startBedElevation: 94,
      entranceDepth: 1.5,
    },
    boundary: {
      upstream: 'weir-profile-end',
      upstreamDepth: 'from-weir-profile',
      downstreamControl: 'both-by-regime',
      downstreamWaterLevel: 90,
      outputBothBranches: true,
    },
    solver: {
      maxIterations: 50,
      relativeTolerance: 1e-6,
      epsilonFloor: 1e-12,
      onNonConvergence: 'fail',
    },
    submergence: { kind: 'auto-free-flow' },
  }
  return { ...base, ...patch }
}

function runOk(input: CalculationInput): CalculationOutput {
  const r = calculate(input)
  if (!r.ok) throw new Error(`夹具应能求解：${JSON.stringify(r.diagnostics)}`)
  return r.value
}

describe('bedElevation —— 槽底高程', () => {
  it('起点处即为起点槽底高程', () => {
    expect(bedElevation(0, 0, 94, 0.1)).toBe(94)
  })

  it('沿程按 Δs·i 下降（与标准 i = sinθ 一致）', () => {
    expect(bedElevation(10, 0, 94, 0.1)).toBeCloseTo(93, 12)
    expect(bedElevation(50, 0, 94, 0.1)).toBeCloseTo(89, 12)
  })

  it('起点桩号非 0 时应相对起点计算', () => {
    expect(bedElevation(120, 100, 50, 0.02)).toBeCloseTo(49.6, 12)
  })
})

describe('buildWaterProfileChartData', () => {
  it('水面高程应等于槽底高程加水深', () => {
    const input = makeInput()
    const data = buildWaterProfileChartData(input, runOk(input))
    expect(data.supercritical.length).toBeGreaterThan(1)
    for (const p of data.supercritical) {
      expect(p.waterLevel).toBeCloseTo(p.bedLevel + p.depth, 12)
    }
  })

  it('槽底应沿程下降', () => {
    const input = makeInput()
    const data = buildWaterProfileChartData(input, runOk(input))
    for (let i = 1; i < data.supercritical.length; i += 1) {
      expect(data.supercritical[i]!.bedLevel).toBeLessThan(data.supercritical[i - 1]!.bedLevel)
    }
  })

  it('应回显临界水深与起点槽底高程', () => {
    const input = makeInput()
    const out = runOk(input)
    const data = buildWaterProfileChartData(input, out)
    expect(data.criticalDepth).toBeCloseTo(out.waterProfile.criticalDepth, 12)
    expect(data.startBedElevation).toBe(94)
  })

  it('给出下游控制水位且为缓流边界时应同时给出两条分支', () => {
    // 缓流分支要求下游水深 > 临界水深。此处**不手算**，先探算一次取实际临界水深，
    // 再据此设置下游控制水位 —— 避免因泄流量随堰体参数变化而使工况失效。
    const base = makeInput({
      chute: {
        ...makeInput().chute,
        bedSlope: 0.002,
        bedAngleDeg: 0.1146,
        endStation: 30,
        startBedElevation: 100,
      },
    })
    const hc = runOk(base).waterProfile.criticalDepth
    const bedAtEnd = 100 - 30 * 0.002
    const input: CalculationInput = {
      ...base,
      boundary: { ...base.boundary, downstreamWaterLevel: bedAtEnd + hc * 1.5 },
    }
    const out = runOk(input)
    const data = buildWaterProfileChartData(input, out)
    expect(data.supercritical.length).toBeGreaterThan(0)
    expect(data.subcritical.length).toBeGreaterThan(0)
  })

  it('未给起点槽底高程时退化为相对高程（基准 0）', () => {
    const base = makeInput()
    const input: CalculationInput = {
      ...base,
      chute: { ...base.chute, startBedElevation: undefined },
    }
    delete (input.chute as { startBedElevation?: number }).startBedElevation
    const data = buildWaterProfileChartData(input, runOk(input))
    expect(data.startBedElevation).toBe(0)
    expect(data.supercritical[0]!.bedLevel).toBe(0)
  })
})

describe('图表配置', () => {
  it('水面线配置应产出可序列化的 option 且含槽底与水面线两条序列', () => {
    const input = makeInput()
    const data = buildWaterProfileChartData(input, runOk(input))
    const option = waterProfileOption(data, true) as {
      series: { name: string; data: number[][] }[]
      xAxis: { name: string }
    }
    expect(Array.isArray(option.series)).toBe(true)
    expect(option.series.length).toBeGreaterThanOrEqual(2)
    expect(option.series.map((s) => s.name)).toContain('槽底')
    expect(option.xAxis.name).toContain('桩号')
    expect(() => JSON.stringify(option)).not.toThrow()
  })

  it('泄流曲线配置应跳过求解失败的点', () => {
    const option = dischargeCurveOption(
      [
        { head: 2, discharge: 100 },
        { head: 3, discharge: null },
        { head: 4, discharge: 200 },
      ],
      5,
    ) as { series: { data: number[][] }[] }
    expect(option.series[0]!.data.length).toBe(2)
  })

  it('curveHeads 应覆盖表 A.2.1-1 的行域 [0.4H_d, 1.3H_d]', () => {
    const heads = curveHeads(5, 25)
    expect(heads.length).toBe(25)
    expect(heads[0]).toBeCloseTo(2, 6) // 0.4 × 5
    expect(heads[heads.length - 1]).toBeCloseTo(6.5, 6) // 1.3 × 5
    for (let i = 1; i < heads.length; i += 1) {
      expect(heads[i]!).toBeGreaterThan(heads[i - 1]!)
    }
  })
})

describe('Excel 计算书工作簿', () => {
  it('成功结果应包含六张工作表', () => {
    const input = makeInput()
    const wb = buildCalculationWorkbook(input, calculate(input))
    expect(wb.SheetNames).toEqual([
      '输入参数',
      '计算结果',
      '迭代过程',
      '水面线',
      '适用范围检查',
      '依据与声明',
    ])
  })

  it('迭代过程表的行数应与迭代次数一致（含表头两行）', () => {
    const input = makeInput()
    const result = calculate(input)
    const wb = buildCalculationWorkbook(input, result)
    const ws = wb.Sheets['迭代过程']!
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(rows.length).toBe(result.value.discharge.iterationCount + 2)
  })

  it('水面线表的行数应等于各分支断面数之和（含表头两行）', () => {
    const input = makeInput()
    const result = calculate(input)
    const wb = buildCalculationWorkbook(input, result)
    const ws = wb.Sheets['水面线']!
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 })
    if (!result.ok) return
    const total = result.value.waterProfile.branches.reduce((n, b) => n + b.stations.length, 0)
    expect(rows.length).toBe(total + 2)
  })

  it('输入参数表应逐项标注单位', () => {
    const input = makeInput()
    const wb = buildCalculationWorkbook(input, calculate(input))
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(wb.Sheets['输入参数']!, {
      header: 1,
    })
    const flat = rows.flat().filter((c) => typeof c === 'string') as string[]
    // 输入表的单位列（m³/s 出现在计算结果表，输入表中不存在）
    expect(flat).toContain('m')
    expect(flat).toContain('孔')
    expect(flat).toContain('°')
    expect(flat.some((s) => s.includes('溢流堰总净宽 B'))).toBe(true)
    // 表头应含"单位"列
    expect(flat).toContain('单位')
  })

  it('计算结果表应标注 m³/s 等单位', () => {
    const input = makeInput()
    const wb = buildCalculationWorkbook(input, calculate(input))
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(wb.Sheets['计算结果']!, {
      header: 1,
    })
    const flat = rows.flat().filter((c) => typeof c === 'string') as string[]
    expect(flat.some((s) => s.includes('m³/s'))).toBe(true)
    expect(flat.some((s) => s.includes('流量 Q'))).toBe(true)
  })

  it('计算失败时不得输出数值结果，但应保留诊断与依据表', () => {
    const input = makeInput()
    const failed = calculate({ ...input, weir: { ...input.weir, netWidthB: 0 } })
    expect(failed.ok).toBe(false)
    const wb = buildCalculationWorkbook(input, failed)
    expect(wb.SheetNames).toContain('适用范围检查')
    expect(wb.SheetNames).toContain('依据与声明')
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(wb.Sheets['计算结果']!, {
      header: 1,
    })
    expect(rows.flat().some((c) => typeof c === 'string' && c.includes('未完成'))).toBe(true)
  })

  it('依据表应载明未执行独立数据验证的免责声明', () => {
    const input = makeInput()
    const wb = buildCalculationWorkbook(input, calculate(input))
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(wb.Sheets['依据与声明']!, {
      header: 1,
    })
    const flat = rows.flat().filter((c) => typeof c === 'string') as string[]
    expect(flat.some((s) => s.includes('未经独立数据验证'))).toBe(true)
    expect(flat.some((s) => s.includes('SL 253-2018'))).toBe(true)
  })
})
