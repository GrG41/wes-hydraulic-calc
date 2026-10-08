/**
 * 阶段 3 · 数值精度专项 —— **链式计算 vs decimal.js 高精度对比**。
 *
 * 依据：AGENTS.md §7.1 Verification ——「浮点精度：高精度库对比，关键结果偏差 < 0.01%」
 *      AGENTS.md §2.6 ——「中间计算禁止提前舍入；迭代收敛容差 ≤ 1×10⁻⁶；仅在展示层格式化」
 *
 * 做法：用 decimal.js（40 位有效数字）按同一公式独立重算，与 core 的双精度结果比对。
 * 本文件属于**验证测试**，不参与 src/core，可用第三方库。
 */

import Decimal from 'decimal.js'
import { describe, expect, it } from 'vitest'
import { solveDischarge } from '../../src/core/formulas/discharge'
import { dischargeCoefficientM } from '../../src/core/formulas/coefficient'
import { powerCurveY } from '../../src/core/formulas/weirProfile'
import { GRAVITY } from '../../src/core/constants'
import type { CalculationInput } from '../../src/core/types'

Decimal.set({ precision: 40 })

/** AGENTS.md §7.1 的通过标准：关键结果偏差 < 0.01%。 */
const PRECISION_LIMIT = 1e-4

function makeInput(headOverCrest = 4, upstreamBottomWidth = 1e6): CalculationInput {
  return {
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
      bedElevation: 100 + headOverCrest - 4,
      shape: { kind: 'rectangular', bottomWidth: upstreamBottomWidth },
    },
    designHead: { kind: 'direct', value: 5 },
    operation: { headOverCrest, downstreamWaterLevel: 99 },
    chute: {
      bedSlope: 0.1,
      bedAngleDeg: 5.7392,
      roughness: 0.014,
      width: 40,
      startStation: 0,
      endStation: 50,
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
    solver: { maxIterations: 50, relativeTolerance: 1e-6, epsilonFloor: 1e-12, onNonConvergence: 'fail' },
    submergence: { kind: 'auto-free-flow' },
  }
}

/** 相对偏差。 */
function relativeDeviation(exact: Decimal, approx: number): number {
  return exact.minus(approx).abs().div(exact.abs()).toNumber()
}

describe('泄流量 Q 的链式计算精度', () => {
  it('单点：double 结果与 Decimal 高精度结果偏差应 < 0.01%', () => {
    const input = makeInput()
    const r = solveDischarge(input)
    expect(r.ok).toBe(true)
    if (!r.ok) return

    const v = r.value
    const exact = new Decimal(v.coefficients.c)
      .times(v.coefficients.m)
      .times(v.coefficients.epsilon)
      .times(v.coefficients.sigmaS)
      .times(input.weir.netWidthB)
      .times(new Decimal(2).times(GRAVITY).sqrt())
      .times(new Decimal(v.totalHeadH0).pow(1.5))

    expect(relativeDeviation(exact, v.dischargeQ)).toBeLessThan(PRECISION_LIMIT)
  })

  it('扫描：堰上水头 1.0~6.0 全程偏差均应 < 0.01%', () => {
    for (let head = 1; head <= 6; head += 0.5) {
      const input = makeInput(head)
      const r = solveDischarge(input)
      expect(r.ok).toBe(true)
      if (!r.ok) continue
      const v = r.value
      const exact = new Decimal(v.coefficients.c)
        .times(v.coefficients.m)
        .times(v.coefficients.epsilon)
        .times(v.coefficients.sigmaS)
        .times(input.weir.netWidthB)
        .times(new Decimal(2).times(GRAVITY).sqrt())
        .times(new Decimal(v.totalHeadH0).pow(1.5))
      expect(relativeDeviation(exact, v.dischargeQ)).toBeLessThan(PRECISION_LIMIT)
    }
  })

  it('幂曲线 y(x) 的 double 结果与 Decimal 结果偏差应 < 0.01%', () => {
    const curve = { k: 2.0, n: 1.85, designHeadHd: 5 }
    for (const x of [0.5, 1, 2.5, 4, 7.3, 12]) {
      const exact = new Decimal(x)
        .pow(1.85)
        .div(new Decimal(2.0).times(new Decimal(5).pow(0.85)))
      expect(relativeDeviation(exact, powerCurveY(x, curve))).toBeLessThan(PRECISION_LIMIT)
    }
  })
})

describe('流量系数插值的精度', () => {
  it('双线性插值结果应与 Decimal 按同一权重算出的值一致到 1e-12', () => {
    // H₀/H_d = 0.65 → 0.6 行与 0.7 行的中点；
    // P₁/H_d = 0.5  → 该行内 0.4 列与 0.6 列的中点。
    // 表 A.2.1-1 行 0.6 = [0.450, 0.455, 0.458, 0.460, 0.464]（列 0.2/0.4/0.6/1.0/≥1.33）
    //             行 0.7 = [0.458, 0.463, 0.468, 0.472, 0.476]
    // （本断言初版误取了 0.2 列的值作为列插值端点，系测试自身的取值错误，
    //   已按表格实际列序更正，非为通过而放宽；实现未改动。）
    const row06 = new Decimal('0.455').plus('0.458').div(2) // = 0.4565
    const row07 = new Decimal('0.463').plus('0.468').div(2) // = 0.4655
    const exact = row06.plus(row07).div(2) // = 0.461
    const actual = dischargeCoefficientM(0.65, 0.5).value
    expect(relativeDeviation(exact, actual)).toBeLessThan(1e-12)
  })
})

describe('迭代收敛残差（AGENTS.md §2.6）', () => {
  it('收敛时最后一步的 H₀ 与 Q 相对残差均应 ≤ 1×10⁻⁶', () => {
    const r = solveDischarge(makeInput(4, 500))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const last = r.value.iterations[r.value.iterations.length - 1]!
    expect(last.headResidual).toBeLessThanOrEqual(1e-6)
    expect(last.dischargeResidual).toBeLessThanOrEqual(1e-6)
    expect(r.value.tolerance).toBe(1e-6)
  })

  it('迭代过程中的中间量不得被提前舍入（应保留双精度全位数）', () => {
    const r = solveDischarge(makeInput(4, 500))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const some = r.value.iterations[0]!
    // 若被舍入到 3~6 位小数，以下判断会失败
    const rounded = Math.abs(some.totalHeadH0 * 1e9 - Math.round(some.totalHeadH0 * 1e9)) < 1e-3
    expect(rounded).toBe(false)
  })
})
