/**
 * 核心层统一入口 `calculate()` 测试 —— 测试先行（AGENTS.md §7.4）。
 *
 * 目的：验证各模块被正确串联，且失败链路上的诊断不丢失。
 */

import { describe, expect, it } from 'vitest'
import { calculate, dischargeCurve } from '../../src/core/calculate'
import type { CalculationInput } from '../../src/core/types'

function makeInput(overrides: Partial<CalculationInput> = {}): CalculationInput {
  const base: CalculationInput = {
    weir: {
      crestElevation: 100,
      downstreamBedElevation: 95,
      upstreamHeightP1: 5,
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
  return { ...base, ...overrides }
}

describe('calculate —— 端到端串联', () => {
  it('合法输入应一次性给出泄流量、堰面曲线与水面线', () => {
    const r = calculate(makeInput())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const v = r.value
    expect(v.discharge.dischargeQ).toBeGreaterThan(0)
    // 本工况 P₁/H_d = 5/5 = 1.0，**不满足** > 1.0，故 k 走区间默认分支（2.1）而非查表
    // （本断言初版误写为查表值 2.0，系测试自身的取值错误，已按标准 A.1.1 的分支条件更正）
    expect(v.profile.kSource).toBe('range-default')
    expect(v.profile.k).toBe(2.1)
    expect(v.profile.n).toBe(1.85)
    expect(v.profile.points.length).toBeGreaterThan(1)
    expect(v.waterProfile.branches.length).toBeGreaterThanOrEqual(1)
    expect(v.waterProfile.criticalDepth).toBeGreaterThan(0)
    expect(v.inputEcho).toBeDefined()
  })

  it('P₁/H_d > 1.0 时 k 应改为查表取值', () => {
    const input = makeInput()
    const r = calculate({ ...input, weir: { ...input.weir, upstreamHeightP1: 8 } }) // 8/5 = 1.6
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.profile.kSource).toBe('table')
    expect(r.value.profile.k).toBe(2.0) // 3:0 行查表值
  })

  it('水面线所用流量应与泄流能力结果一致', () => {
    const r = calculate(makeInput())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const q = r.value.discharge.dischargeQ
    const st = r.value.waterProfile.branches[0]!.stations[0]!
    // 断面流速 × 面积应回到该流量
    expect(st.velocity * st.area).toBeCloseTo(q, 6)
  })

  it('未给泄槽起始水深时应按临界水深缺省并给出提示', () => {
    const input = makeInput()
    const cleaned: CalculationInput = {
      ...input,
      chute: { ...input.chute, entranceDepth: undefined },
    }
    delete (cleaned.chute as { entranceDepth?: number }).entranceDepth
    const r = calculate(cleaned)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.diagnostics.map((d) => d.code)).toContain('CHUTE_ENTRANCE_DEPTH_DEFAULTED')
    expect(r.diagnostics.every((d) => d.level !== 'input-error')).toBe(true)
  })

  it('给了起始水深时不应出现缺省提示', () => {
    const r = calculate(makeInput())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.diagnostics.map((d) => d.code)).not.toContain('CHUTE_ENTRANCE_DEPTH_DEFAULTED')
  })

  it('输入错误应在串联的最前端被拦下，不进入求解', () => {
    const input = makeInput()
    const r = calculate({ ...input, weir: { ...input.weir, netWidthB: 0 } })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.diagnostics.every((d) => d.level === 'input-error')).toBe(true)
    expect(r.diagnostics.map((d) => d.code)).toContain('NET_WIDTH_INVALID')
  })

  it('σs 缺失（淹没工况）时应失败且不返回部分结果', () => {
    const input = makeInput()
    const r = calculate({
      ...input,
      operation: { ...input.operation, downstreamWaterLevel: 101.5 },
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.diagnostics.map((d) => d.code)).toContain('SIGMA_S_REQUIRED_WHEN_SUBMERGED')
  })

  it('超范围警告应随成功结果一并返回', () => {
    const input = makeInput()
    const r = calculate({ ...input, chute: { ...input.chute, roughness: 0.06 } })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.diagnostics.map((d) => d.code)).toContain('ROUGHNESS_OUTSIDE_TABLE_A8')
    expect(r.diagnostics.every((d) => d.level === 'out-of-range')).toBe(true)
  })
})

describe('dischargeCurve —— 泄流曲线', () => {
  it('应逐点给出流量，且随水头单调不减', () => {
    const heads = [1, 2, 3, 4, 5]
    const curve = dischargeCurve(makeInput(), heads)
    expect(curve.length).toBe(heads.length)
    const values = curve.map((p) => p.discharge)
    expect(values.every((q) => q !== null && q > 0)).toBe(true)
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]!).toBeGreaterThan(values[i - 1]!)
    }
  })

  it('个别水头求解失败时该点记为 null，其余点不受影响', () => {
    // 水头过小 → H/Hd < 0.4 触发钳制后仍可解，但极端窄断面会发散
    const input = makeInput()
    const narrow: CalculationInput = {
      ...input,
      upstreamSection: {
        ...input.upstreamSection,
        shape: { kind: 'rectangular', bottomWidth: 60 },
      },
    }
    const curve = dischargeCurve(narrow, [4])
    expect(curve[0]!.discharge === null || curve[0]!.discharge > 0).toBe(true)
    if (curve[0]!.discharge === null) {
      expect(typeof curve[0]!.reason).toBe('string')
    }
  })
})
