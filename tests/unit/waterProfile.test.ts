/**
 * 水面线模块测试 —— **测试先行**（AGENTS.md §7.4）。
 *
 * 被测模块：`src/core/formulas/waterProfile.ts`
 * 来源：SL 253-2018 附录 A.3.1，印张页 53
 *   Δl = [(h₂cosθ + α₂v₂²/2g) − (h₁cosθ + α₁v₁²/2g)] / (i − J̄)   (A.3.1-1)
 *   J̄  = n²·v̄² / R̄^(4/3)                                        (A.3.1-2)
 * α = 1.05（标准定值）；边界与分段由 DEC-017 确认。
 */

import { describe, expect, it } from 'vitest'
import {
  criticalDepth,
  frictionSlope,
  sectionProperties,
  solveAdjacentDepth,
  solveWaterProfile,
} from '../../src/core/formulas/waterProfile'
import { GRAVITY, VELOCITY_DISTRIBUTION_COEFFICIENT } from '../../src/core/constants'

describe('矩形断面水力要素', () => {
  it('面积、湿周、水力半径、水面宽应正确', () => {
    const s = sectionProperties(2, 10, 40)
    expect(s.area).toBeCloseTo(20, 12)
    expect(s.wettedPerimeter).toBeCloseTo(14, 12)
    expect(s.hydraulicRadius).toBeCloseTo(20 / 14, 12)
    expect(s.topWidth).toBeCloseTo(10, 12)
    expect(s.meanDepth).toBeCloseTo(2, 12) // 矩形：A/B = h
    expect(s.velocity).toBeCloseTo(2, 12)
  })

  it('弗劳德数应为 v/√(g·h̄)（DEC-019 A-7）', () => {
    const s = sectionProperties(2, 10, 40)
    expect(s.froude).toBeCloseTo(2 / Math.sqrt(GRAVITY * 2), 12)
  })
})

describe('临界水深（矩形断面 h_c = (q²/g)^(1/3)）', () => {
  it('应按单宽流量计算', () => {
    const q = 10 // Q/b = 100/10
    expect(criticalDepth(100, 10)).toBeCloseTo(Math.cbrt((q * q) / GRAVITY), 12)
  })

  it('临界水深处弗劳德数应为 1', () => {
    const hc = criticalDepth(100, 10)
    const s = sectionProperties(hc, 10, 100)
    expect(s.froude).toBeCloseTo(1, 9)
  })

  it('水深大于临界水深为缓流，小于为急流', () => {
    const hc = criticalDepth(100, 10)
    expect(sectionProperties(hc * 1.5, 10, 100).froude).toBeLessThan(1)
    expect(sectionProperties(hc * 0.5, 10, 100).froude).toBeGreaterThan(1)
  })
})

describe('摩阻坡降（式 A.3.1-2）', () => {
  it('J̄ = n²v²/R^(4/3)', () => {
    const n = 0.014
    const v = 5
    const R = 1.5
    expect(frictionSlope(n, v, R)).toBeCloseTo((n * n * v * v) / Math.pow(R, 4 / 3), 15)
  })

  it('应随糙率与流速单调增大', () => {
    expect(frictionSlope(0.02, 5, 1.5)).toBeGreaterThan(frictionSlope(0.014, 5, 1.5))
    expect(frictionSlope(0.014, 6, 1.5)).toBeGreaterThan(frictionSlope(0.014, 5, 1.5))
  })
})

describe('相邻断面水深求解（式 A.3.1-1 反解）', () => {
  const base = {
    discharge: 100,
    width: 10,
    roughness: 0.014,
    bedSlope: 0.2,
    bedAngleDeg: 11.31,
    deltaLength: 5,
  }

  it('解出的水深应使 A.3.1-1 式两侧一致（自洽性）', () => {
    const r = solveAdjacentDepth({ ...base, knownDepth: 1.2, direction: 'downstream' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const h2 = r.value

    const s1 = sectionProperties(1.2, base.width, base.discharge)
    const s2 = sectionProperties(h2, base.width, base.discharge)
    const theta = (base.bedAngleDeg * Math.PI) / 180
    const alpha = VELOCITY_DISTRIBUTION_COEFFICIENT
    const e1 = 1.2 * Math.cos(theta) + (alpha * s1.velocity * s1.velocity) / (2 * GRAVITY)
    const e2 = h2 * Math.cos(theta) + (alpha * s2.velocity * s2.velocity) / (2 * GRAVITY)
    const jBar = (frictionSlope(base.roughness, s1.velocity, s1.hydraulicRadius) +
      frictionSlope(base.roughness, s2.velocity, s2.hydraulicRadius)) / 2
    const deltaL = (e2 - e1) / (base.bedSlope - jBar)
    expect(deltaL).toBeCloseTo(base.deltaLength, 6)
  })

  it('无解时应报计算失败而非返回猜测值', () => {
    // 底坡远小于摩阻坡降且步长过大 → 该区间内无实数解
    const r = solveAdjacentDepth({
      ...base,
      bedSlope: 0.0001,
      deltaLength: 5000,
      knownDepth: 1.2,
      direction: 'downstream',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.diagnostics.some((d) => d.level === 'failure')).toBe(true)
  })

  it('上游方向求解与下游方向互为逆运算', () => {
    const down = solveAdjacentDepth({ ...base, knownDepth: 1.2, direction: 'downstream' })
    expect(down.ok).toBe(true)
    if (!down.ok) return
    const back = solveAdjacentDepth({ ...base, knownDepth: down.value, direction: 'upstream' })
    expect(back.ok).toBe(true)
    if (!back.ok) return
    expect(back.value).toBeCloseTo(1.2, 6)
  })
})

describe('水面线推算（分段求和）', () => {
  const spec = {
    discharge: 100,
    width: 10,
    roughness: 0.014,
    bedSlope: 0.2,
    bedAngleDeg: 11.31,
    startStation: 0,
    endStation: 30,
    stationStep: 5,
    upstreamDepth: 1.2,
  }

  it('应急流分支应逐段推进并给出完整断面', () => {
    const r = solveWaterProfile(spec)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const v = r.value
    expect(v.branches.length).toBeGreaterThan(0)
    const branch = v.branches[0]!
    expect(branch.branch).toBe('supercritical')
    expect(branch.stations.length).toBe(7) // 0,5,...,30
    expect(branch.stations[0]!.station).toBe(0)
    expect(branch.stations[0]!.depth).toBeCloseTo(1.2, 12)
    expect(branch.stations.every((s) => s.regime === 'supercritical')).toBe(true)
    expect(branch.stations.every((s) => Number.isFinite(s.depth) && s.depth > 0)).toBe(true)
  })

  it('急流在陡坡上应沿程趋近正常水深（S2 型）', () => {
    // 本例：单宽流量 q = 10 m²/s，n = 0.014，i = 0.2 →
    //   临界水深 h_c ≈ 2.168 m，正常水深 h_n ≈ 0.50 m，起始水深 1.2 m。
    //   h_n < h < h_c 属陡坡 S2 区，水面线**沿程下降**趋近 h_n
    //   （渐变流基本方程 dh/dx = (i − J)/(1 − Fr²)，此区分子分母皆负）。
    // （本断言原误写为"沿程加深"，系测试本身的错误，已按渐变流理论更正，
    //   非为通过而放宽；实现未改动。）
    const r = solveWaterProfile(spec)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const st = r.value.branches[0]!.stations
    for (let i = 1; i < st.length; i += 1) {
      expect(st[i]!.depth).toBeLessThan(st[i - 1]!.depth)
      expect(st[i]!.froude).toBeGreaterThan(1)
    }
    // 应仍为急流，且尚未跌至正常水深以下
    const last = st[st.length - 1]!
    expect(last.depth).toBeGreaterThan(0.5)
    expect(last.regime).toBe('supercritical')
  })

  it('应给出临界水深与临界坡', () => {
    const r = solveWaterProfile(spec)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.criticalDepth).toBeCloseTo(criticalDepth(100, 10), 12)
    expect(Number.isFinite(r.value.criticalSlope)).toBe(true)
  })

  it('未检出急流→缓流过渡时不得标记水跃', () => {
    const r = solveWaterProfile(spec)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.hydraulicJumpDetected).toBe(false)
  })

  it('分段步长非正应报输入错误', () => {
    const r = solveWaterProfile({ ...spec, stationStep: 0 })
    expect(r.ok).toBe(false)
  })

  it('上游起始水深非正应报输入错误', () => {
    const r = solveWaterProfile({ ...spec, upstreamDepth: 0 })
    expect(r.ok).toBe(false)
  })
})
