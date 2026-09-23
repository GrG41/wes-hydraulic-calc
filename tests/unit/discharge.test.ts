/**
 * 泄流能力模块测试 —— **测试先行**（AGENTS.md §7.4）。
 *
 * 被测模块：`src/core/formulas/discharge.ts`
 * 来源：SL 253-2018 附录 A.2.1，印张页 46 —— 式（A.2.1-1）（A.2.1-2）（A.2.1-3）
 * 迭代参数：工程师确认（DEC-017 / DEC-019 A-3）—— 初值 H₀ = H、相对残差 1e-6 对 Q 与 H₀ 分别判定、
 *           最大 50 次、不收敛即报错停止。
 */

import { describe, expect, it } from 'vitest'
import { solveDischarge } from '../../src/core/formulas/discharge'
import { GRAVITY, SOLVER_DEFAULTS } from '../../src/core/constants'
import type { CalculationInput } from '../../src/core/types'

/** 构造一组合法输入；用参数覆盖需要变化的字段。 */
function makeInput(overrides: {
  headOverCrest?: number
  downstreamWaterLevel?: number
  upstreamBottomWidth?: number
  submergence?: CalculationInput['submergence']
  maxIterations?: number
  designHead?: CalculationInput['designHead']
}): CalculationInput {
  const head = overrides.headOverCrest ?? 4
  const crest = 100
  return {
    weir: {
      crestElevation: crest,
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
      bedElevation: 100 + head - 4, // 使断面水深恒为 4 m
      shape: { kind: 'rectangular', bottomWidth: overrides.upstreamBottomWidth ?? 1e6 },
    },
    designHead: overrides.designHead ?? { kind: 'direct', value: 5 },
    operation: {
      headOverCrest: head,
      downstreamWaterLevel: overrides.downstreamWaterLevel ?? 99,
    },
    chute: {
      bedSlope: 0.1,
      bedAngleDeg: 5.71,
      roughness: 0.014,
      width: 60,
      startStation: 0,
      endStation: 100,
      segmentation: 'station',
      stationStep: 5,
    },
    boundary: {
      upstream: 'weir-profile-end',
      upstreamDepth: 'from-weir-profile',
      downstreamControl: 'both-by-regime',
      downstreamWaterLevel: 90,
      outputBothBranches: true,
    },
    solver: {
      maxIterations: overrides.maxIterations ?? SOLVER_DEFAULTS.maxIterations,
      relativeTolerance: SOLVER_DEFAULTS.relativeTolerance,
      epsilonFloor: SOLVER_DEFAULTS.epsilonFloor,
      onNonConvergence: 'fail',
    },
    submergence: overrides.submergence ?? { kind: 'auto-free-flow' },
  }
}

describe('solveDischarge —— 自由出流（hs ≤ 0）', () => {
  it('应成功求解并返回完整中间量', () => {
    const r = solveDischarge(makeInput({}))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const v = r.value
    expect(v.dischargeQ).toBeGreaterThan(0)
    expect(v.totalHeadH0).toBeGreaterThanOrEqual(4) // H₀ ≥ H
    expect(v.coefficients.sigmaS).toBe(1)
    expect(v.coefficients.c).toBe(1)
    expect(v.intermediate.designHeadHd).toBe(5)
    // P₁/H_d = 5/5 = 1.0 < 1.33 → 按标准 A.1.1 属【低堰】
    // （此断言原误写为 true，系测试本身的错误，已按标准定义更正，非为通过而放宽）
    expect(v.intermediate.isHighWeir).toBe(false)
    expect(v.intermediate.pierHeightRatioP1OverHd).toBeCloseTo(1, 12)
    expect(v.iterations.length).toBe(v.iterationCount)
    expect(r.diagnostics).toEqual([])
  })

  it('上游断面极大时 v ≈ 0，Q 应等于按 H₀ = H 的闭式解', () => {
    const r = solveDischarge(makeInput({ upstreamBottomWidth: 1e9 }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const v = r.value
    expect(v.totalHeadH0).toBeCloseTo(4, 9)

    const q = r.value.coefficients
    const expected =
      q.c * q.m * q.epsilon * q.sigmaS * 100 * Math.sqrt(2 * GRAVITY) * Math.pow(v.totalHeadH0, 1.5)
    expect(v.dischargeQ).toBeCloseTo(expected, 9)
  })

  it('上游断面收窄应抬高 H₀ 与 Q（行进流速水头为正）', () => {
    const wide = solveDischarge(makeInput({ upstreamBottomWidth: 1e6 }))
    const narrow = solveDischarge(makeInput({ upstreamBottomWidth: 1000 }))
    expect(wide.ok && narrow.ok).toBe(true)
    if (!wide.ok || !narrow.ok) return
    expect(narrow.value.totalHeadH0).toBeGreaterThan(wide.value.totalHeadH0)
    expect(narrow.value.dischargeQ).toBeGreaterThan(wide.value.dischargeQ)
    expect(narrow.value.approachVelocityHead).toBeGreaterThan(0)
  })

  it('迭代过程应记录每次的中间量与两类残差', () => {
    const r = solveDischarge(makeInput({ upstreamBottomWidth: 200 }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    for (const it of r.value.iterations) {
      expect(Number.isFinite(it.totalHeadH0)).toBe(true)
      expect(Number.isFinite(it.dischargeQ)).toBe(true)
      expect(it.headResidual).toBeGreaterThanOrEqual(0)
      expect(it.index).toBeGreaterThanOrEqual(1)
    }
    const last = r.value.iterations[r.value.iterations.length - 1]!
    expect(last.headResidual).toBeLessThanOrEqual(r.value.tolerance)
    expect(last.dischargeResidual).toBeLessThanOrEqual(r.value.tolerance)
  })

  it('Q 应随堰上水头单调增大', () => {
    const q1 = solveDischarge(makeInput({ headOverCrest: 3 }))
    const q2 = solveDischarge(makeInput({ headOverCrest: 4 }))
    expect(q1.ok && q2.ok).toBe(true)
    if (!q1.ok || !q2.ok) return
    expect(q2.value.dischargeQ).toBeGreaterThan(q1.value.dischargeQ)
  })
})

describe('solveDischarge —— σs 处理（DEC-022 路径 A）', () => {
  it('hs > 0 且未人工输入 σs 时应报输入错误，不得默认取 1.0', () => {
    const r = solveDischarge(makeInput({ downstreamWaterLevel: 101.5 })) // hs = 1.5 > 0
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.diagnostics.some((d) => d.level === 'input-error')).toBe(true)
    expect(r.diagnostics.map((d) => d.code)).toContain('SIGMA_S_REQUIRED_WHEN_SUBMERGED')
  })

  it('hs > 0 且人工输入 σs 时应据此计算，且 Q 小于自由出流', () => {
    const free = solveDischarge(makeInput({ downstreamWaterLevel: 99 }))
    const sub = solveDischarge(
      makeInput({ downstreamWaterLevel: 101.5, submergence: { kind: 'manual', sigmaS: 0.85 } }),
    )
    expect(free.ok && sub.ok).toBe(true)
    if (!free.ok || !sub.ok) return
    expect(sub.value.coefficients.sigmaS).toBe(0.85)
    expect(sub.value.dischargeQ).toBeLessThan(free.value.dischargeQ)
    expect(sub.value.intermediate.submergenceRatioHsOverH0).toBeGreaterThan(0)
  })

  it('人工 σs 超出 [0.20, 1.0] 应报输入错误', () => {
    const lo = solveDischarge(
      makeInput({ downstreamWaterLevel: 101.5, submergence: { kind: 'manual', sigmaS: 0.1 } }),
    )
    expect(lo.ok).toBe(false)
    const hi = solveDischarge(
      makeInput({ downstreamWaterLevel: 101.5, submergence: { kind: 'manual', sigmaS: 1.2 } }),
    )
    expect(hi.ok).toBe(false)
  })

  it('hs ≤ 0 时不得出现 σs < 1.0（一致性校验）', () => {
    const r = solveDischarge(
      makeInput({ downstreamWaterLevel: 99, submergence: { kind: 'manual', sigmaS: 0.9 } }),
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.diagnostics.map((d) => d.code)).toContain('SIGMA_S_INCONSISTENT_WITH_FREE_FLOW')
  })
})

describe('solveDischarge —— 输入校验与收敛失败', () => {
  it('堰顶净宽 B ≤ 0 应报输入错误', () => {
    const input = makeInput({})
    const bad: CalculationInput = { ...input, weir: { ...input.weir, netWidthB: 0 } }
    const r = solveDischarge(bad)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.diagnostics.some((d) => d.level === 'input-error')).toBe(true)
  })

  it('单孔宽度 b > B 应报输入错误', () => {
    const input = makeInput({})
    const bad: CalculationInput = { ...input, weir: { ...input.weir, singleOpeningWidthB: 200 } }
    const r = solveDischarge(bad)
    expect(r.ok).toBe(false)
  })

  it('最大迭代次数设为 1 时应判为计算失败而非静默返回', () => {
    const r = solveDischarge(makeInput({ maxIterations: 1, upstreamBottomWidth: 200 }))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.diagnostics.some((d) => d.level === 'failure')).toBe(true)
    expect(r.diagnostics.map((d) => d.code)).toContain('DISCHARGE_ITERATION_NOT_CONVERGED')
  })

  it('上游断面过小导致迭代发散时，应报计算失败且不得泄漏 NaN（§7.1 数值稳定性）', () => {
    // 断面宽 120 m、水深 4 m → A = 480 m²，行近流速约 3.5 m/s，属退化输入。
    // 逐次代换在此不收敛；程序必须显式拦截，而不是返回 NaN 或无穷。
    const r = solveDischarge(makeInput({ upstreamBottomWidth: 120 }))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.diagnostics.map((d) => d.code)).toContain('DISCHARGE_ITERATION_DIVERGED')
    for (const d of r.diagnostics) {
      expect(d.message).not.toMatch(/NaN|Infinity/)
      if (d.value !== undefined) expect(Number.isFinite(d.value)).toBe(true)
    }
  })
})

describe('solveDischarge —— 设计水头 H_d', () => {
  it('直接给定 H_d 时按给定值使用', () => {
    const r = solveDischarge(makeInput({ designHead: { kind: 'direct', value: 5 } }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.intermediate.designHeadHd).toBe(5)
  })

  it('由 H_max 推求时应落在标准给定区间内并标注高/低堰', () => {
    const r = solveDischarge(makeInput({ designHead: { kind: 'from-max-head', maxHead: 5 } }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const { designHeadHd, isHighWeir } = r.value.intermediate
    if (isHighWeir) {
      expect(designHeadHd).toBeGreaterThanOrEqual(0.75 * 5)
      expect(designHeadHd).toBeLessThanOrEqual(0.95 * 5)
    } else {
      expect(designHeadHd).toBeGreaterThanOrEqual(0.65 * 5)
      expect(designHeadHd).toBeLessThanOrEqual(0.85 * 5)
    }
  })
})
