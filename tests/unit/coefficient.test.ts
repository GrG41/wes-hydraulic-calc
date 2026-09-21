/**
 * 系数模块测试 —— **测试先行**（AGENTS.md §7.4）。
 *
 * 被测模块：`src/core/formulas/coefficient.ts`
 * 数据来源：SL 253-2018 附录 A.2.1，印张页 46–47（表 A.2.1-1 / A.2.1-2 / A.2.1-3）
 * 期望值全部取自 `docs/FORMULAS.md` 的转录结果，**不得为通过测试而放宽**。
 */

import { describe, expect, it } from 'vitest'
import {
  abutmentShapeFactorZeta0,
  contractionCoefficient,
  dischargeCoefficientM,
  pierShapeFactorZetaK,
  upstreamSlopeFactorC,
} from '../../src/core/formulas/coefficient'

// ── 表 A.2.1-1　实用堰流量系数 m ───────────────────────────────

describe('dischargeCoefficientM（表 A.2.1-1，印张页 47）', () => {
  it('表内格点应精确返回表值', () => {
    // H0/Hd = 1.0, P1/Hd >= 1.33 → 0.501
    expect(dischargeCoefficientM(1.0, 1.33).value).toBe(0.501)
    // H0/Hd = 0.4, P1/Hd = 0.2 → 0.425
    expect(dischargeCoefficientM(0.4, 0.2).value).toBe(0.425)
    // H0/Hd = 1.3, P1/Hd = 1.0 → 0.508
    expect(dischargeCoefficientM(1.3, 1.0).value).toBe(0.508)
  })

  it('P1/Hd ≥ 1.33 一律取"≥1.33"列，且不告警（标准给定的开口档）', () => {
    const r = dischargeCoefficientM(1.0, 3.0)
    expect(r.value).toBe(0.501)
    expect(r.diagnostics).toEqual([])
  })

  it('行方向双线性插值：H0/Hd = 0.65 时取 0.6 与 0.7 行的中点', () => {
    // P1/Hd = 0.2：(0.450 + 0.458) / 2 = 0.454
    expect(dischargeCoefficientM(0.65, 0.2).value).toBeCloseTo(0.454, 10)
  })

  it('列方向线性插值：P1/Hd = 0.5 时取 0.4 与 0.6 列的中点', () => {
    // H0/Hd = 1.0：(0.486 + 0.491) / 2 = 0.4885
    expect(dischargeCoefficientM(1.0, 0.5).value).toBeCloseTo(0.4885, 10)
  })

  it('H0/Hd 低于表范围应钳制到 0.4 并告警（DEC-019 A-2）', () => {
    const r = dischargeCoefficientM(0.2, 0.4)
    expect(r.value).toBe(0.430)
    expect(r.diagnostics.map((d) => d.code)).toContain('M_HEAD_RATIO_OUT_OF_RANGE')
  })

  it('H0/Hd 高于表范围应钳制到 1.3 并告警', () => {
    const r = dischargeCoefficientM(1.8, 0.4)
    expect(r.value).toBe(0.498)
    expect(r.diagnostics.map((d) => d.code)).toContain('M_HEAD_RATIO_OUT_OF_RANGE')
  })

  it('P1/Hd 低于 0.2 应钳制到 0.2 并告警', () => {
    const r = dischargeCoefficientM(1.0, 0.05)
    expect(r.value).toBe(0.479)
    expect(r.diagnostics.map((d) => d.code)).toContain('M_PIER_HEIGHT_RATIO_OUT_OF_RANGE')
  })

  it('m 应随 H0/Hd 单调不减（表值本身单调，插值不得破坏）', () => {
    const ratios = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3]
    const values = ratios.map((r) => dischargeCoefficientM(r, 1.0).value)
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]!).toBeGreaterThanOrEqual(values[i - 1]!)
    }
  })
})

// ── 表 A.2.1-2　上游堰坡影响修正系数 c ─────────────────────────

describe('upstreamSlopeFactorC（表 A.2.1-2，印张页 47）', () => {
  it('上游堰面铅直（3:0）时 c = 1.0，且不查表、不告警', () => {
    const r = upstreamSlopeFactorC('3:0', 0.3)
    expect(r.value).toBe(1.0)
    expect(r.diagnostics).toEqual([])
  })

  it('表内格点应精确返回表值', () => {
    expect(upstreamSlopeFactorC('3:3', 0.3).value).toBe(1.021)
    expect(upstreamSlopeFactorC('3:1', 1.3).value).toBe(0.997)
    expect(upstreamSlopeFactorC('3:2', 0.8).value).toBe(1.002)
  })

  it('列方向线性插值：P1/Hd = 0.5 取 0.4 与 0.6 中点', () => {
    // 3:3：(1.014 + 1.007) / 2 = 1.0105
    expect(upstreamSlopeFactorC('3:3', 0.5).value).toBeCloseTo(1.0105, 10)
  })

  it('P1/Hd 超出 [0.3, 1.3] 应钳制并告警', () => {
    const lo = upstreamSlopeFactorC('3:1', 0.1)
    expect(lo.value).toBe(1.009)
    expect(lo.diagnostics.map((d) => d.code)).toContain('C_PIER_HEIGHT_RATIO_OUT_OF_RANGE')

    const hi = upstreamSlopeFactorC('3:1', 2.0)
    expect(hi.value).toBe(0.997)
    expect(hi.diagnostics.map((d) => d.code)).toContain('C_PIER_HEIGHT_RATIO_OUT_OF_RANGE')
  })
})

// ── 表 A.2.1-3　中墩形状系数 ζk ───────────────────────────────

describe('pierShapeFactorZetaK（表 A.2.1-3，印张页 47）', () => {
  it('Lk = Hs 时取第一档，与淹没度无关', () => {
    const r = pierShapeFactorZetaK({
      shape: 'rectangular',
      pierHeadExtensionLk: 1.0,
      pierHeadHeightHs: 1.0,
      submergenceRatioHsOverH0: 0.9,
    })
    expect(r.value).toBe(0.2)
  })

  it('Lk = 0 时按 hs/H0 在 ≤0.75 / 0.8 / 0.85 / 0.9 间插值', () => {
    const at = (ratio: number) =>
      pierShapeFactorZetaK({
        shape: 'rectangular',
        pierHeadExtensionLk: 0,
        pierHeadHeightHs: 1.0,
        submergenceRatioHsOverH0: ratio,
      }).value
    expect(at(0.75)).toBe(0.8)
    expect(at(0.8)).toBe(0.86)
    expect(at(0.825)).toBeCloseTo(0.89, 10) // (0.86 + 0.92) / 2
    expect(at(0.9)).toBe(0.98)
  })

  it('Lk = 0 且 hs/H0 低于 0.75 时取 ≤0.75 档', () => {
    const r = pierShapeFactorZetaK({
      shape: 'pointed',
      pierHeadExtensionLk: 0,
      pierHeadHeightHs: 1.0,
      submergenceRatioHsOverH0: 0.2,
    })
    expect(r.value).toBe(0.25)
  })

  it('hs/H0 高于 0.9 应钳制到 0.9 并告警', () => {
    const r = pierShapeFactorZetaK({
      shape: 'rectangular',
      pierHeadExtensionLk: 0,
      pierHeadHeightHs: 1.0,
      submergenceRatioHsOverH0: 1.0,
    })
    expect(r.value).toBe(0.98)
    expect(r.diagnostics.map((d) => d.code)).toContain('ZETA_K_SUBMERGENCE_OUT_OF_RANGE')
  })

  it('三种墩头形状在同等条件下应符合表值', () => {
    const at = (shape: 'rectangular' | 'wedge-or-semicircular' | 'pointed') =>
      pierShapeFactorZetaK({
        shape,
        pierHeadExtensionLk: 0.5,
        pierHeadHeightHs: 1.0,
        submergenceRatioHsOverH0: 0.8,
      }).value
    expect(at('rectangular')).toBe(0.4)
    expect(at('wedge-or-semicircular')).toBe(0.3)
    expect(at('pointed')).toBe(0.15)
  })
})

// ── 边墩形状系数 ζ0 ──────────────────────────────────────────

describe('abutmentShapeFactorZeta0（标准 A.2.1 符号定义，印张页 46）', () => {
  it('三种边墩形状取值应为 1.0 / 0.7 / 0.4', () => {
    expect(abutmentShapeFactorZeta0('rectangular')).toBe(1.0)
    expect(abutmentShapeFactorZeta0('broken-line-or-circular')).toBe(0.7)
    expect(abutmentShapeFactorZeta0('streamlined')).toBe(0.4)
  })
})

// ── 式 A.2.1-2　闸墩侧收缩系数 ε ──────────────────────────────

describe('contractionCoefficient（式 A.2.1-2，印张页 46）', () => {
  it('单孔（n = 1）且 H0/b = 0.5、ζk = 0.2 时 ε = 1 − 0.2·0.2·0.5 = 0.98', () => {
    const r = contractionCoefficient({
      openingCount: 1,
      singleOpeningWidth: 10,
      totalHeadH0: 5,
      zetaK: 0.2,
      zeta0: 1.0,
    })
    expect(r.value).toBeCloseTo(0.98, 12)
    expect(r.headOverSingleWidthApplied).toBeCloseTo(0.5, 12)
  })

  it('多孔时应计入 (n−1)·ζ0 项', () => {
    // n=3, b=8, H0=4 → H0/b = 0.5；ζk=0.15, ζ0=0.7
    // ε = 1 − 0.2·[0.15 + 2·0.7]·(0.5/3) = 1 − 0.2·1.55·0.166666… = 0.948333…
    const r = contractionCoefficient({
      openingCount: 3,
      singleOpeningWidth: 8,
      totalHeadH0: 4,
      zetaK: 0.15,
      zeta0: 0.7,
    })
    expect(r.value).toBeCloseTo(1 - 0.2 * 1.55 * (0.5 / 3), 12)
  })

  it('H0/b > 1.0 时应按标准钳制到 1.0（不告警，但须记录实际采用值）', () => {
    // n=3, b=8, H0=12 → H0/b = 1.5 → 钳制到 1.0；采用比值 1.0/3
    const r = contractionCoefficient({
      openingCount: 3,
      singleOpeningWidth: 8,
      totalHeadH0: 12,
      zetaK: 0.15,
      zeta0: 0.7,
    })
    expect(r.headOverSingleWidthRaw).toBeCloseTo(1.5, 12)
    expect(r.headOverSingleWidthApplied).toBeCloseTo(1.0, 12)
    expect(r.value).toBeCloseTo(1 - 0.2 * 1.55 * (1.0 / 3), 12)
    // 标准规定的处理，不产生告警
    expect(r.diagnostics).toEqual([])
  })

  it('ε 必须落在 (0, 1] 内（数值合理性）', () => {
    const r = contractionCoefficient({
      openingCount: 6,
      singleOpeningWidth: 5,
      totalHeadH0: 8,
      zetaK: 0.98,
      zeta0: 1.0,
    })
    expect(r.value).toBeGreaterThan(0)
    expect(r.value).toBeLessThanOrEqual(1)
  })
})
