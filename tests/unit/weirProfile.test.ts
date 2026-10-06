/**
 * 堰面曲线模块测试 —— **测试先行**（AGENTS.md §7.4）。
 *
 * 被测模块：`src/core/formulas/weirProfile.ts`
 * 来源：SL 253-2018 附录 A.1.1（印张页 41）与表 A.1.1
 * 期望值取自 `docs/FORMULAS.md` §2.1 ~ §2.3；表 A.1.1 已经 OCR 独立复核。
 */

import { describe, expect, it } from 'vitest'
import {
  buildWeirProfile,
  powerCurveTangentX,
  powerCurveX,
  powerCurveY,
  resolvePowerCurve,
  tableA11Params,
} from '../../src/core/formulas/weirProfile'
import { POWER_CURVE_K_LOW_WEIR_DEFAULT } from '../../src/core/constants'

describe('tableA11Params（表 A.1.1，印张页 41）', () => {
  it('四种上游堰坡度的 k、n 应与表值一致', () => {
    expect(tableA11Params('3:0').k).toBe(2.0)
    expect(tableA11Params('3:0').n).toBe(1.85)
    expect(tableA11Params('3:1').k).toBe(1.936)
    expect(tableA11Params('3:1').n).toBe(1.836)
    expect(tableA11Params('3:2').k).toBe(1.939)
    expect(tableA11Params('3:2').n).toBe(1.81)
    expect(tableA11Params('3:3').k).toBe(1.873)
    expect(tableA11Params('3:3').n).toBe(1.776)
  })

  it('R₁、a、R₂、b 应为 H_d 的倍数形式', () => {
    expect(tableA11Params('3:0').r1).toBe(0.5)
    expect(tableA11Params('3:0').a).toBe(0.175)
    expect(tableA11Params('3:1').r1).toBe(0.68)
    expect(tableA11Params('3:2').r2).toBe(0.22)
    expect(tableA11Params('3:3').r2).toBeUndefined() // 表中为 "—"
    expect(tableA11Params('3:3').b).toBeUndefined()
  })
})

describe('resolvePowerCurve —— k 的取值规则（标准 A.1.1）', () => {
  it('P₁/H_d > 1.0 时应取表 A.1.1 的值', () => {
    const r = resolvePowerCurve({ upstreamSlope: '3:0', pierHeightRatioP1OverHd: 1.2, designHeadHd: 5 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.k).toBe(2.0)
    expect(r.value.n).toBe(1.85)
    expect(r.value.kSource).toBe('table')
    expect(r.diagnostics).toEqual([])
  })

  it('P₁/H_d ≤ 1.0 时应取区间默认中值并标注来源', () => {
    const r = resolvePowerCurve({ upstreamSlope: '3:0', pierHeightRatioP1OverHd: 0.8, designHeadHd: 5 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.k).toBe(POWER_CURVE_K_LOW_WEIR_DEFAULT)
    expect(r.value.kSource).toBe('range-default')
    // n 仍取自表 A.1.1（标准只把 k 改为区间）
    expect(r.value.n).toBe(1.85)
  })

  it('区间内覆盖值应被接受并标注为 range-override', () => {
    const r = resolvePowerCurve({
      upstreamSlope: '3:1',
      pierHeightRatioP1OverHd: 0.9,
      designHeadHd: 5,
      kOverride: 2.2,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.k).toBe(2.2)
    expect(r.value.kSource).toBe('range-override')
  })

  it('覆盖值超出 [2.0, 2.2] 应报输入错误', () => {
    const lo = resolvePowerCurve({
      upstreamSlope: '3:0',
      pierHeightRatioP1OverHd: 0.9,
      designHeadHd: 5,
      kOverride: 1.9,
    })
    expect(lo.ok).toBe(false)
    const hi = resolvePowerCurve({
      upstreamSlope: '3:0',
      pierHeightRatioP1OverHd: 0.9,
      designHeadHd: 5,
      kOverride: 2.5,
    })
    expect(hi.ok).toBe(false)
  })
})

describe('幂曲线几何（式 A.1.1）', () => {
  const curve = { k: 2.0, n: 1.85, designHeadHd: 5 }

  it('x = 0 时 y = 0（堰顶原点）', () => {
    expect(powerCurveY(0, curve)).toBe(0)
  })

  it('在 x = H_d·k^(1/n) 处应恰好 y = H_d', () => {
    const x = 5 * Math.pow(2.0, 1 / 1.85)
    expect(powerCurveY(x, curve)).toBeCloseTo(5, 9)
  })

  it('y(x) 与 x(y) 应互为反函数', () => {
    for (const x of [1, 2.5, 4, 8]) {
      const y = powerCurveY(x, curve)
      expect(powerCurveX(y, curve)).toBeCloseTo(x, 9)
    }
  })

  it('y 应随 x 单调递增', () => {
    let prev = -1
    for (let x = 0; x <= 12; x += 0.5) {
      const y = powerCurveY(x, curve)
      expect(y).toBeGreaterThan(prev)
      prev = y
    }
  })

  it('切点 x 处的曲线斜率应等于下游坡 i', () => {
    const i = 0.1
    const xt = powerCurveTangentX(curve, i)
    const h = 1e-6
    const slope = (powerCurveY(xt + h, curve) - powerCurveY(xt - h, curve)) / (2 * h)
    expect(slope).toBeCloseTo(i, 6)
  })

  it('下游坡越陡，切点越靠下游（x 越大）', () => {
    // 幂曲线的坡度 dy/dx = n·x^(n−1)/(k·H_d^(n−1)) 随 x 单调递增（n > 1），
    // 故要达到更陡的坡度，必须走到更下游 → 切点 x 更大。
    // （本断言原误写为"越陡越靠上游"，系测试本身的错误，已按幂曲线性质更正，
    //   非为通过而放宽；实现未改动。）
    const gentle = powerCurveTangentX(curve, 0.05)
    const steep = powerCurveTangentX(curve, 0.5)
    expect(steep).toBeGreaterThan(gentle)
  })
})

describe('buildWeirProfile', () => {
  it('应输出幂曲线离散点与下游终点', () => {
    const r = buildWeirProfile({
      upstreamSlope: '3:0',
      upstreamHeightP1: 6,
      designHeadHd: 5,
      downstreamSlope: 0.1,
      crestCurveType: 'double-arc',
      segments: 10,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const p = r.value
    expect(p.k).toBe(2.0)
    expect(p.n).toBe(1.85)
    expect(p.points.length).toBe(11)
    expect(p.points[0]!.x).toBe(0)
    expect(p.points[0]!.y).toBe(0)
    expect(p.points.every((pt) => pt.segment === 'power-curve')).toBe(true)
    expect(p.downstreamEnd.x).toBeCloseTo(powerCurveTangentX({ k: 2, n: 1.85, designHeadHd: 5 }, 0.1), 9)
  })

  it('P₁/H_d ≤ 1.0 时应在结果中标注 k 的来源', () => {
    const r = buildWeirProfile({
      upstreamSlope: '3:2',
      upstreamHeightP1: 4,
      designHeadHd: 5,
      downstreamSlope: 0.2,
      crestCurveType: 'ellipse',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.kSource).toBe('range-default')
    expect(r.value.k).toBe(POWER_CURVE_K_LOW_WEIR_DEFAULT)
  })

  it('应回显表 A.1.1 的上游堰头参数（H_d 倍数）', () => {
    const r = buildWeirProfile({
      upstreamSlope: '3:1',
      upstreamHeightP1: 8,
      designHeadHd: 5,
      downstreamSlope: 0.1,
      crestCurveType: 'double-arc',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.crestParams.r1).toBe(0.68)
    expect(r.value.crestParams.a).toBe(0.13)
    expect(r.value.crestParams.r2).toBe(0.21)
    expect(r.value.crestParams.b).toBe(0.237)
  })

  it('下游坡非正应报输入错误', () => {
    const r = buildWeirProfile({
      upstreamSlope: '3:0',
      upstreamHeightP1: 6,
      designHeadHd: 5,
      downstreamSlope: 0,
      crestCurveType: 'double-arc',
    })
    expect(r.ok).toBe(false)
  })
})
