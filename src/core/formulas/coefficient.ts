/**
 * 系数模块 —— 泄流能力公式中的各系数。
 *
 * 来源：**SL 253-2018《溢洪道设计规范》附录 A.2.1，印张页 46–47**
 * 对照：`docs/FORMULAS.md` §1.2 ~ §1.5
 *
 * 本模块只用标准给定的表值与公式，不含任何无来源的系数。
 * 超范围一律按"警告 + 钳制到边界"处理（DECISIONS.md DEC-019 A-2，依工程师 Q23 = B）。
 */

import { HEAD_OVER_SINGLE_WIDTH_LIMIT } from '../constants'
import type {
  AbutmentShape,
  Diagnostic,
  PierHeadShape,
  UpstreamSlope,
} from '../types'

/** 查表结果：取值 + 诊断（超范围时为 out-of-range，且值已按边界钳制）。 */
export interface LookupOutcome {
  readonly value: number
  readonly diagnostics: readonly Diagnostic[]
}

/** 侧收缩系数结果：除取值外，回显钳制前后的 H₀/b，供计算书追溯。 */
export interface ContractionOutcome {
  readonly value: number
  /** 原始 H₀/b */
  readonly headOverSingleWidthRaw: number
  /** 按标准钳制后实际采用的 H₀/b */
  readonly headOverSingleWidthApplied: number
  readonly diagnostics: readonly Diagnostic[]
}

// ─────────────────────────────────────────────────────────────────
//  通用线性插值
// ─────────────────────────────────────────────────────────────────

/**
 * 在升序节点 `xs` 上对 `ys` 做线性插值。
 * 调用方须先把 x 钳制到 [xs[0], xs[末尾]] 内，本函数不再钳制。
 * x 恰为节点时按精确节点值返回（不引入浮点漂移）。
 */
function interp(x: number, xs: readonly number[], ys: readonly number[]): number {
  const n = xs.length
  const first = xs[0]!
  if (x <= first) return ys[0]!
  const last = xs[n - 1]!
  if (x >= last) return ys[n - 1]!
  for (let i = 0; i < n - 1; i += 1) {
    const a = xs[i]!
    const b = xs[i + 1]!
    if (x >= a && x <= b) {
      if (x === a) return ys[i]!
      if (x === b) return ys[i + 1]!
      const t = (x - a) / (b - a)
      const ya = ys[i]!
      const yb = ys[i + 1]!
      return ya + t * (yb - ya)
    }
  }
  return ys[n - 1]!
}

// ─────────────────────────────────────────────────────────────────
//  表 A.2.1-1　实用堰流量系数 m（印张页 47）
// ─────────────────────────────────────────────────────────────────

/** 行变量 H₀/H_d（标准表头印作小写 h₀，物理含义为总水头比，见 FORMATS.md §1.3 说明）。 */
const M_HEAD_RATIOS = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3] as const

/** 列变量 P₁/H_d。最后一档为标准给定的开口档 "≥1.33"。 */
const M_PIER_RATIOS = [0.2, 0.4, 0.6, 1.0] as const
const M_PIER_OPEN_ENDED = 1.33

/** 表体（10 行 × 5 列，照录 docs/FORMULAS.md §1.3）。 */
const M_TABLE: readonly (readonly number[])[] = [
  [0.425, 0.430, 0.431, 0.433, 0.436],
  [0.438, 0.442, 0.445, 0.448, 0.451],
  [0.450, 0.455, 0.458, 0.460, 0.464],
  [0.458, 0.463, 0.468, 0.472, 0.476],
  [0.467, 0.474, 0.477, 0.482, 0.486],
  [0.473, 0.480, 0.485, 0.491, 0.494],
  [0.479, 0.486, 0.491, 0.496, 0.501],
  [0.482, 0.491, 0.496, 0.502, 0.507],
  [0.485, 0.495, 0.499, 0.506, 0.510],
  [0.496, 0.498, 0.500, 0.508, 0.513],
]

/**
 * 查表 A.2.1-1 取流量系数 m，双线性插值。
 *
 * 适用范围（表题下注）：二圆弧、三圆弧及椭圆堰头曲线。
 * 定义域：`H₀/H_d ∈ [0.4, 1.3]`，`P₁/H_d ≥ 0.2`（`≥1.33` 为标准给定的开口档）。
 *
 * 超范围处理（DEC-019 A-2）：钳制到最近边界并输出 `out-of-range` 诊断。
 * 其中 `P₁/H_d ≥ 1.33` 取开口档，**属标准给定的定义域，不告警**。
 */
export function dischargeCoefficientM(
  headRatioH0OverHd: number,
  pierHeightRatioP1OverHd: number,
): LookupOutcome {
  const diagnostics: Diagnostic[] = []

  let rowRatio = headRatioH0OverHd
  if (rowRatio < M_HEAD_RATIOS[0]!) {
    diagnostics.push({
      level: 'out-of-range',
      code: 'M_HEAD_RATIO_OUT_OF_RANGE',
      message: `H₀/H_d = ${headRatioH0OverHd} 低于表 A.2.1-1 下限 ${M_HEAD_RATIOS[0]}，已按边界取值`,
      field: 'headRatioH0OverHd',
      value: headRatioH0OverHd,
      limit: M_HEAD_RATIOS[0]!,
    })
    rowRatio = M_HEAD_RATIOS[0]!
  } else if (rowRatio > M_HEAD_RATIOS[M_HEAD_RATIOS.length - 1]!) {
    diagnostics.push({
      level: 'out-of-range',
      code: 'M_HEAD_RATIO_OUT_OF_RANGE',
      message: `H₀/H_d = ${headRatioH0OverHd} 高于表 A.2.1-1 上限 ${M_HEAD_RATIOS[M_HEAD_RATIOS.length - 1]}，已按边界取值`,
      field: 'headRatioH0OverHd',
      value: headRatioH0OverHd,
      limit: M_HEAD_RATIOS[M_HEAD_RATIOS.length - 1]!,
    })
    rowRatio = M_HEAD_RATIOS[M_HEAD_RATIOS.length - 1]!
  }

  let colRatio = pierHeightRatioP1OverHd
  if (colRatio < M_PIER_RATIOS[0]!) {
    diagnostics.push({
      level: 'out-of-range',
      code: 'M_PIER_HEIGHT_RATIO_OUT_OF_RANGE',
      message: `P₁/H_d = ${pierHeightRatioP1OverHd} 低于表 A.2.1-1 下限 ${M_PIER_RATIOS[0]}，已按边界取值`,
      field: 'pierHeightRatioP1OverHd',
      value: pierHeightRatioP1OverHd,
      limit: M_PIER_RATIOS[0]!,
    })
    colRatio = M_PIER_RATIOS[0]!
  }

  // 每一行先按列插值，再沿行插值 —— 双线性
  const perRow = M_TABLE.map((row) => {
    if (colRatio >= M_PIER_OPEN_ENDED) return row[row.length - 1]!
    return interp(colRatio, M_PIER_RATIOS, row.slice(0, M_PIER_RATIOS.length))
  })

  return { value: interp(rowRatio, M_HEAD_RATIOS, perRow), diagnostics }
}

// ─────────────────────────────────────────────────────────────────
//  表 A.2.1-2　上游堰坡影响修正系数 c（印张页 47）
// ─────────────────────────────────────────────────────────────────

const C_PIER_RATIOS = [0.3, 0.4, 0.6, 0.8, 1.0, 1.2, 1.3] as const

const C_TABLE: Readonly<Record<'3:1' | '3:2' | '3:3', readonly number[]>> = {
  '3:1': [1.009, 1.007, 1.004, 1.002, 1.0, 0.998, 0.997],
  '3:2': [1.015, 1.011, 1.005, 1.002, 0.999, 0.996, 0.993],
  '3:3': [1.021, 1.014, 1.007, 1.002, 0.998, 0.993, 0.988],
}

/**
 * 上游堰坡影响修正系数 c。
 *
 * 来源：标准 A.2.1 符号定义（印张页 46）与表 A.2.1-2（印张页 47）。
 * **上游堰面铅直（3:0）时 c = 1.0**，不查表、不告警。
 * 倾斜时按 P₁/H_d 在 [0.3, 1.3] 上线性插值；超范围钳制并告警。
 */
export function upstreamSlopeFactorC(
  upstreamSlope: UpstreamSlope,
  pierHeightRatioP1OverHd: number,
): LookupOutcome {
  if (upstreamSlope === '3:0') {
    return { value: 1.0, diagnostics: [] }
  }

  const diagnostics: Diagnostic[] = []
  const lo = C_PIER_RATIOS[0]!
  const hi = C_PIER_RATIOS[C_PIER_RATIOS.length - 1]!
  let ratio = pierHeightRatioP1OverHd
  if (ratio < lo) {
    diagnostics.push({
      level: 'out-of-range',
      code: 'C_PIER_HEIGHT_RATIO_OUT_OF_RANGE',
      message: `P₁/H_d = ${pierHeightRatioP1OverHd} 低于表 A.2.1-2 下限 ${lo}，已按边界取值`,
      field: 'pierHeightRatioP1OverHd',
      value: pierHeightRatioP1OverHd,
      limit: lo,
    })
    ratio = lo
  } else if (ratio > hi) {
    diagnostics.push({
      level: 'out-of-range',
      code: 'C_PIER_HEIGHT_RATIO_OUT_OF_RANGE',
      message: `P₁/H_d = ${pierHeightRatioP1OverHd} 高于表 A.2.1-2 上限 ${hi}，已按边界取值`,
      field: 'pierHeightRatioP1OverHd',
      value: pierHeightRatioP1OverHd,
      limit: hi,
    })
    ratio = hi
  }

  const row = C_TABLE[upstreamSlope]
  return { value: interp(ratio, C_PIER_RATIOS, row), diagnostics }
}

// ─────────────────────────────────────────────────────────────────
//  表 A.2.1-3　中墩形状系数 ζk（印张页 47）
// ─────────────────────────────────────────────────────────────────

/** Lk = 0 时按 hs/H₀ 取值的档位。 */
const ZK_SUBMERGENCE_RATIOS = [0.75, 0.8, 0.85, 0.9] as const

const ZK_TABLE: Readonly<Record<PierHeadShape, readonly number[]>> = {
  // 列序：Lk=Hs | Lk=0.5Hs | Lk=0 且 hs/H₀ = 0.75 / 0.8 / 0.85 / 0.9
  rectangular: [0.2, 0.4, 0.8, 0.86, 0.92, 0.98],
  'wedge-or-semicircular': [0.15, 0.3, 0.45, 0.51, 0.57, 0.63],
  pointed: [0.15, 0.15, 0.25, 0.32, 0.39, 0.46],
}

export interface PierShapeFactorInput {
  readonly shape: PierHeadShape
  /** 闸墩头伸出上游堰面距离 Lk，m */
  readonly pierHeadExtensionLk: number
  /** 尖墩高度 Hs，m（表 A.2.1-3 两档的基准） */
  readonly pierHeadHeightHs: number
  /** 淹没度 hs/H₀ */
  readonly submergenceRatioHsOverH0: number
}

/**
 * 查表 A.2.1-3 取中墩形状系数 ζk。
 *
 * 表注（照录）：墩尾形状与头形相同；Lk 为闸墩头伸出上游堰面距离；hs 为超过堰顶的下游水深。
 *
 * 插值方式（标准未规定，本实现的选择，见 `docs/ALGORITHM.md`）：
 *   · `Lk ≥ Hs` → 取 `Lk = Hs` 档
 *   · `Lk = 0`  → 按 hs/H₀ 在 0.75 / 0.8 / 0.85 / 0.9 档间线性插值
 *   · `0 < Lk < 0.5Hs` → 在「Lk = 0 值」与「Lk = 0.5Hs 值」间线性插值
 *   · `0.5Hs ≤ Lk < Hs` → 在「Lk = 0.5Hs 值」与「Lk = Hs 值」间线性插值
 * `hs/H₀` 超出 [0.75, 0.9] 时钳制到边界并告警。
 */
export function pierShapeFactorZetaK(input: PierShapeFactorInput): LookupOutcome {
  const diagnostics: Diagnostic[] = []
  const row = ZK_TABLE[input.shape]
  const atHsColumn = row[0]!
  const atHalfColumn = row[1]!
  const submergenceCols = row.slice(2)

  const lo = ZK_SUBMERGENCE_RATIOS[0]!
  const hi = ZK_SUBMERGENCE_RATIOS[ZK_SUBMERGENCE_RATIOS.length - 1]!
  let hsRatio = input.submergenceRatioHsOverH0
  if (hsRatio < lo) {
    hsRatio = lo
  } else if (hsRatio > hi) {
    diagnostics.push({
      level: 'out-of-range',
      code: 'ZETA_K_SUBMERGENCE_OUT_OF_RANGE',
      message: `hs/H₀ = ${input.submergenceRatioHsOverH0} 高于表 A.2.1-3 上限 ${hi}，已按边界取值`,
      field: 'submergenceRatioHsOverH0',
      value: input.submergenceRatioHsOverH0,
      limit: hi,
    })
    hsRatio = hi
  }
  const atZeroColumn = interp(hsRatio, ZK_SUBMERGENCE_RATIOS, submergenceCols)

  const ratio = input.pierHeadExtensionLk / input.pierHeadHeightHs
  if (ratio >= 1) return { value: atHsColumn, diagnostics }
  if (ratio <= 0) return { value: atZeroColumn, diagnostics }
  if (ratio < 0.5) {
    const t = ratio / 0.5
    return { value: atZeroColumn + t * (atHalfColumn - atZeroColumn), diagnostics }
  }
  const t = (ratio - 0.5) / 0.5
  return { value: atHalfColumn + t * (atHsColumn - atHalfColumn), diagnostics }
}

// ─────────────────────────────────────────────────────────────────
//  边墩形状系数 ζ0
// ─────────────────────────────────────────────────────────────────

/**
 * 边墩形状系数 ζ0。
 *
 * 来源：标准 A.2.1 符号定义，印张页 46 ——
 * "对于直角矩形，ζ₀ = 1.0；对于折线或圆形，ζ₀ = 0.7；对于流线形，ζ₀ = 0.4"。
 */
export function abutmentShapeFactorZeta0(shape: AbutmentShape): number {
  switch (shape) {
    case 'rectangular':
      return 1.0
    case 'broken-line-or-circular':
      return 0.7
    case 'streamlined':
      return 0.4
  }
}

// ─────────────────────────────────────────────────────────────────
//  式 A.2.1-2　闸墩侧收缩系数 ε
// ─────────────────────────────────────────────────────────────────

export interface ContractionInput {
  /** 闸孔数目 n */
  readonly openingCount: number
  /** 单孔宽度 b，m */
  readonly singleOpeningWidth: number
  /** 堰上总水头 H₀，m */
  readonly totalHeadH0: number
  /** 中墩形状系数 ζk */
  readonly zetaK: number
  /** 边墩形状系数 ζ₀ */
  readonly zeta0: number
}

/**
 * 闸墩侧收缩系数 ε = 1 − 0.2·[ζk + (n−1)·ζ₀]·H₀/(n·b)。
 *
 * 来源：SL 253-2018 式（A.2.1-2），印张页 46。
 *
 * 标准明文："公式（A.2.1-2）适用于 H₀/b ≤ 1.0，当 H₀/b > 1.0 时，H₀/b 仍取值 1.0"。
 * 即**先对 H₀/b 钳制**，再代入式中的 H₀/(n·b)。该钳制是标准规定的处理，故**不产生告警**，
 * 但钳制前后的比值均回显，供计算书追溯。
 */
export function contractionCoefficient(input: ContractionInput): ContractionOutcome {
  const raw = input.totalHeadH0 / input.singleOpeningWidth
  const applied = Math.min(raw, HEAD_OVER_SINGLE_WIDTH_LIMIT)
  const term = applied / input.openingCount
  const sum = input.zetaK + (input.openingCount - 1) * input.zeta0
  return {
    value: 1 - 0.2 * sum * term,
    headOverSingleWidthRaw: raw,
    headOverSingleWidthApplied: applied,
    diagnostics: [],
  }
}
