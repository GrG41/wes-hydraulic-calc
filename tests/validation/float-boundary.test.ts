/**
 * 阶段 3 · 数值精度专项 —— **浮点边界用例**。
 *
 * 依据：AGENTS.md §6 阶段 3 ——「浮点边界用例测试（.1/.2/.3 结尾、.5 舍入边界）」
 *      AGENTS.md §2.6 ——「中间计算禁止提前舍入……仅在展示层格式化」
 *
 * 目的：确认二进制浮点上表现"不干净"的十进制小数不会污染结果，
 *      且表内格点、中点等特殊位置不会因浮点表示误差而偏离解析值。
 */

import { describe, expect, it } from 'vitest'
import { dischargeCoefficientM, upstreamSlopeFactorC } from '../../src/core/formulas/coefficient'
import { powerCurveX, powerCurveY } from '../../src/core/formulas/weirProfile'
import { sectionProperties } from '../../src/core/formulas/waterProfile'

describe('表内格点：不得因浮点表示误差而偏离表值', () => {
  it('H₀/H_d 取 .1/.2/.3 结尾的表内值时，m 必须精确等于表值', () => {
    // 表 A.2.1-1 行：0.4 0.5 0.6 0.7 0.8 0.9 1.0 1.1 1.2 1.3
    const cases: readonly (readonly [number, number])[] = [
      [1.1, 0.4, ],
      [1.2, 0.6],
      [1.3, 1.0],
      [0.4, 0.4],
      [0.6, 0.4],
      [0.7, 0.4],
      [0.9, 0.4],
    ]
    for (const [row, col] of cases) {
      const r = dischargeCoefficientM(row, col)
      expect(r.diagnostics).toEqual([])
      // 与十进制字面量构造的表值完全相等（非 closeTo）
      const expected = tableValueOf(row, col)
      expect(r.value).toBe(expected)
    }
  })

  it('P₁/H_d = 1.0 与 1.33 两个关键节点应精确', () => {
    expect(dischargeCoefficientM(1.0, 1.0).value).toBe(0.496)
    expect(dischargeCoefficientM(1.0, 1.33).value).toBe(0.501)
    expect(dischargeCoefficientM(1.0, 1.34).value).toBe(0.501) // 开口档
  })

  it('c 的表内格点同样应精确', () => {
    expect(upstreamSlopeFactorC('3:1', 1.0).value).toBe(1.0)
    expect(upstreamSlopeFactorC('3:3', 1.3).value).toBe(0.988)
    expect(upstreamSlopeFactorC('3:2', 0.3).value).toBe(1.015)
  })
})

describe('.5 舍入边界：中点插值应为两端的精确算术平均', () => {
  it('行中点 0.65 应等于 0.6 与 0.7 行的算术平均（ULP 级一致）', () => {
    // 注意：`ya + t·(yb − ya)` 与 `(ya + yb)/2` 数学等价，但在 IEEE 754 下**不保证逐位相等**。
    // 本断言初版要求 toBe（位相等），属对测试的过度要求——若坚持位相等，测的是编译器而非代码。
    // 改为 ULP 级相对容差，并同时校验其与十进制精确值的偏差。
    const a = dischargeCoefficientM(0.6, 1.0).value
    const b = dischargeCoefficientM(0.7, 1.0).value
    const mid = dischargeCoefficientM(0.65, 1.0).value
    expect(Math.abs(mid - (a + b) / 2) / mid).toBeLessThan(1e-15)
    // 十进制精确值：(0.460 + 0.472) / 2 = 0.466
    expect(Math.abs(mid - 0.466) / 0.466).toBeLessThan(1e-15)
  })

  it('列中点 0.5 应等于 0.4 与 0.6 列的算术平均（ULP 级一致）', () => {
    const a = dischargeCoefficientM(1.0, 0.4).value
    const b = dischargeCoefficientM(1.0, 0.6).value
    const mid = dischargeCoefficientM(1.0, 0.5).value
    expect(Math.abs(mid - (a + b) / 2) / mid).toBeLessThan(1e-15)
    // 十进制精确值：(0.486 + 0.491) / 2 = 0.4885
    expect(Math.abs(mid - 0.4885) / 0.4885).toBeLessThan(1e-15)
  })
})

describe('幂曲线在非整洁小数处的反函数一致性', () => {
  it('x 取 .1/.2/.3 结尾时，x → y → x 应回到原值（相对误差 < 1e-12）', () => {
    const curve = { k: 2.0, n: 1.85, designHeadHd: 5 }
    for (const x of [0.1, 0.2, 0.3, 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.3]) {
      const back = powerCurveX(powerCurveY(x, curve), curve)
      expect(Math.abs(back - x) / x).toBeLessThan(1e-12)
    }
  })

  it('x = 0 处 y 应为精确 0（幂函数在原点不产生 -0 或 NaN）', () => {
    const y = powerCurveY(0, { k: 2, n: 1.85, designHeadHd: 5 })
    expect(y).toBe(0)
    expect(Object.is(y, -0)).toBe(false)
  })
})

describe('断面水力要素在边界水深处不得产生异常值', () => {
  it('极小水深应给出有限值（不得出现 Infinity / NaN）', () => {
    for (const h of [1e-6, 1e-3, 0.1]) {
      const s = sectionProperties(h, 10, 100)
      expect(Number.isFinite(s.area)).toBe(true)
      expect(Number.isFinite(s.hydraulicRadius)).toBe(true)
      expect(Number.isFinite(s.velocity)).toBe(true)
      expect(Number.isFinite(s.froude)).toBe(true)
    }
  })

  it('极大水深应给出有限值', () => {
    const s = sectionProperties(1e6, 10, 100)
    expect(Number.isFinite(s.froude)).toBe(true)
    expect(s.froude).toBeGreaterThanOrEqual(0)
  })
})

/** 表 A.2.1-1 的十进制字面量表值（用于格点精确性断言）。 */
function tableValueOf(row: number, col: number): number {
  const rows = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3]
  const cols = [0.2, 0.4, 0.6, 1.0]
  const table = [
    [0.425, 0.43, 0.431, 0.433, 0.436],
    [0.438, 0.442, 0.445, 0.448, 0.451],
    [0.45, 0.455, 0.458, 0.46, 0.464],
    [0.458, 0.463, 0.468, 0.472, 0.476],
    [0.467, 0.474, 0.477, 0.482, 0.486],
    [0.473, 0.48, 0.485, 0.491, 0.494],
    [0.479, 0.486, 0.491, 0.496, 0.501],
    [0.482, 0.491, 0.496, 0.502, 0.507],
    [0.485, 0.495, 0.499, 0.506, 0.51],
    [0.496, 0.498, 0.5, 0.508, 0.513],
  ]
  const ri = rows.indexOf(row)
  const ci = col >= 1.33 ? 4 : cols.indexOf(col)
  return table[ri]![ci]!
}
