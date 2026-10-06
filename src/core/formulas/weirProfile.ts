/**
 * 堰面曲线模块 —— WES 幂曲线与上游堰头参数。
 *
 * 来源：**SL 253-2018《溢洪道设计规范》附录 A.1.1，印张页 41**
 * 对照：`docs/FORMULAS.md` §2.1 ~ §2.3
 *
 *       x^n = k · H_d^(n−1) · y      即  y = x^n / (k · H_d^(n−1))        (A.1.1)
 *
 *   k 的取值规则（标准 A.1.1 原文）：
 *     · P₁/H_d > 1.0  → k 查表 A.1.1
 *     · P₁/H_d ≤ 1.0  → k 取 2.0 ~ 2.2（标准给区间而非定值）
 *
 * ⚠️ 上游堰头曲线（双圆弧 / 三圆弧 / 椭圆）的**完整几何构造定义在图 A.1.2-1 ~ A.1.2-3**，
 *    属图纸信息。开发方当前图像读取能力不可用，OCR 不足以复现几何，
 *    故本模块**只输出表 A.1.1 给出的上游堰头参数**（R₁、a、R₂、b，均为 H_d 的倍数），
 *    几何构造留待图纸转录后再实现——**不凭印象补全**。
 */

import {
  POWER_CURVE_K_LOW_WEIR_DEFAULT,
  POWER_CURVE_K_LOW_WEIR_MAX,
  POWER_CURVE_K_LOW_WEIR_MIN,
} from '../constants'
import type { CalcResult, CrestCurveType, Diagnostic, UpstreamSlope } from '../types'

// ─────────────────────────────────────────────────────────────────
//  表 A.1.1　堰面曲线参数（印张页 41）
// ─────────────────────────────────────────────────────────────────

/** 表 A.1.1 的一行。R₁、a、R₂、b 均以 **H_d 的倍数** 表示；表中为 "—" 的档位为 undefined。 */
export interface TableA11Row {
  readonly k: number
  readonly n: number
  readonly r1: number
  readonly a: number
  readonly r2?: number
  readonly b?: number
}

/**
 * 表 A.1.1 全文（照录 `docs/FORMULAS.md` §2.2）。
 *
 * ⚠️ 3:1 行的 a 值在原扫描件中被红色水印遮挡，读为 0.13；
 * 该单元格已提请工程师核对纸质原件，答复为"整表确认无误"。
 */
const TABLE_A11: Readonly<Record<UpstreamSlope, TableA11Row>> = {
  '3:0': { k: 2.0, n: 1.85, r1: 0.5, a: 0.175, r2: 0.2, b: 0.282 },
  '3:1': { k: 1.936, n: 1.836, r1: 0.68, a: 0.13, r2: 0.21, b: 0.237 },
  '3:2': { k: 1.939, n: 1.81, r1: 0.48, a: 0.115, r2: 0.22, b: 0.214 },
  '3:3': { k: 1.873, n: 1.776, r1: 0.45, a: 0.119 },
}

/** 查表 A.1.1。 */
export function tableA11Params(slope: UpstreamSlope): TableA11Row {
  return TABLE_A11[slope]
}

// ─────────────────────────────────────────────────────────────────
//  k 的解析
// ─────────────────────────────────────────────────────────────────

/** k 的来源，须写入计算书以便追溯。 */
export type PowerCurveKSource = 'table' | 'range-default' | 'range-override'

export interface PowerCurve {
  readonly k: number
  readonly n: number
  readonly kSource: PowerCurveKSource
}

export interface ResolvePowerCurveInput {
  readonly upstreamSlope: UpstreamSlope
  /** P₁/H_d */
  readonly pierHeightRatioP1OverHd: number
  /** 定型设计水头 H_d，m（仅用于校验其为正） */
  readonly designHeadHd: number
  /** P₁/H_d ≤ 1.0 时对 k 的覆盖值，须落在 [2.0, 2.2]（DEC-019 A-6） */
  readonly kOverride?: number
}

/**
 * 解析幂曲线的 k 与 n。
 *
 * `P₁/H_d > 1.0` 时 k 查表 A.1.1；`≤ 1.0` 时 k 取区间 [2.0, 2.2]，
 * 未给覆盖值时取中值（DEC-019 A-6 —— 本设计中唯一取自标准区间的系数取值）。
 * `n` 无论何种情形均取自表 A.1.1（标准只把 k 改为区间）。
 */
export function resolvePowerCurve(input: ResolvePowerCurveInput): CalcResult<PowerCurve> {
  const row = TABLE_A11[input.upstreamSlope]

  if (!(input.designHeadHd > 0)) {
    return {
      ok: false,
      diagnostics: [
        {
          level: 'input-error',
          code: 'DESIGN_HEAD_INVALID',
          message: '定型设计水头 H_d 必须为正值',
          field: 'designHeadHd',
          value: input.designHeadHd,
        },
      ],
    }
  }

  if (input.pierHeightRatioP1OverHd > 1.0) {
    return { ok: true, value: { k: row.k, n: row.n, kSource: 'table' }, diagnostics: [] }
  }

  const k = input.kOverride ?? POWER_CURVE_K_LOW_WEIR_DEFAULT
  const diagnostics: Diagnostic[] = []
  if (k < POWER_CURVE_K_LOW_WEIR_MIN || k > POWER_CURVE_K_LOW_WEIR_MAX) {
    return {
      ok: false,
      diagnostics: [
        {
          level: 'input-error',
          code: 'POWER_CURVE_K_OUT_OF_RANGE',
          message:
            `P₁/H_d ≤ 1.0 时 k 须落在标准给定区间 [${POWER_CURVE_K_LOW_WEIR_MIN}, ${POWER_CURVE_K_LOW_WEIR_MAX}]，` +
            `当前为 ${k}`,
          field: 'kOverride',
          value: k,
        },
      ],
    }
  }

  return {
    ok: true,
    value: {
      k,
      n: row.n,
      kSource: input.kOverride === undefined ? 'range-default' : 'range-override',
    },
    diagnostics,
  }
}

// ─────────────────────────────────────────────────────────────────
//  幂曲线几何（式 A.1.1）
// ─────────────────────────────────────────────────────────────────

/** 幂曲线的最小定义：k、n、H_d。 */
export interface PowerCurveGeometry {
  readonly k: number
  readonly n: number
  readonly designHeadHd: number
}

/**
 * 幂曲线：`y = x^n / (k · H_d^(n−1))`。
 * x 为自堰顶原点向下游的水平坐标（m），y 为向下游的竖向坐标（m，向下为正）。
 */
export function powerCurveY(x: number, curve: PowerCurveGeometry): number {
  return Math.pow(x, curve.n) / (curve.k * Math.pow(curve.designHeadHd, curve.n - 1))
}

/** 幂曲线反函数：`x = (y · k · H_d^(n−1))^(1/n)`。 */
export function powerCurveX(y: number, curve: PowerCurveGeometry): number {
  return Math.pow(y * curve.k * Math.pow(curve.designHeadHd, curve.n - 1), 1 / curve.n)
}

/**
 * 幂曲线与下游直线段（坡度 i）的切点横坐标。
 *
 * 由 `dy/dx = n·x^(n−1) / (k·H_d^(n−1)) = i` 解得：
 *   `x_t = ( i · k · H_d^(n−1) / n )^(1/(n−1))`
 *
 * 该点即曲线段与直线段的分界（标准 A.1 未直接给出，属幂曲线的解析几何性质）。
 */
export function powerCurveTangentX(curve: PowerCurveGeometry, downstreamSlope: number): number {
  const numerator = downstreamSlope * curve.k * Math.pow(curve.designHeadHd, curve.n - 1)
  return Math.pow(numerator / curve.n, 1 / (curve.n - 1))
}

// ─────────────────────────────────────────────────────────────────
//  曲线生成
// ─────────────────────────────────────────────────────────────────

export interface WeirProfileSpec {
  readonly upstreamSlope: UpstreamSlope
  /** 上游堰高 P₁，m */
  readonly upstreamHeightP1: number
  /** 定型设计水头 H_d，m（正值） */
  readonly designHeadHd: number
  /** 下游直线段坡度 i（正值） */
  readonly downstreamSlope: number
  /** 上游堰头曲线型式（本期仅记录，几何待图纸转录） */
  readonly crestCurveType: CrestCurveType
  /** P₁/H_d ≤ 1.0 时对 k 的覆盖值 */
  readonly kOverride?: number
  /** 离散点数量（默认 20 段） */
  readonly segments?: number
}

/** 堰面曲线几何结果（幂曲线段）。 */
export interface WeirProfileGeometryResult {
  readonly designHeadHd: number
  readonly k: number
  readonly n: number
  readonly kSource: PowerCurveKSource
  readonly crestCurveType: CrestCurveType
  /** 表 A.1.1 的上游堰头参数，均以 H_d 的倍数表示 */
  readonly crestParams: TableA11Row
  /** 幂曲线离散点（自堰顶原点至与下游坡的切点） */
  readonly points: readonly { readonly x: number; readonly y: number; readonly segment: 'power-curve' }[]
  /** 下游堰面终点（曲线段与直线段的切点） */
  readonly downstreamEnd: { readonly x: number; readonly y: number; readonly segment: 'power-curve' }
  /** 曲线段与直线段分界处的坡度（应等于 downstreamSlope） */
  readonly endSlope: number
}

/**
 * 生成堰面幂曲线段的几何。
 *
 * 本期仅实现**堰顶下游的幂曲线段**；上游堰头曲线（双圆弧 / 三圆弧 / 椭圆）的几何构造
 * 定义在图 A.1.2-1 ~ A.1.2-3 中，属图纸信息，**待转录后再实现**。
 */
export function buildWeirProfile(spec: WeirProfileSpec): CalcResult<WeirProfileGeometryResult> {
  if (!(spec.downstreamSlope > 0)) {
    return {
      ok: false,
      diagnostics: [
        {
          level: 'input-error',
          code: 'DOWNSTREAM_SLOPE_INVALID',
          message: '下游直线段坡度 i 必须为正值',
          field: 'downstreamSlope',
          value: spec.downstreamSlope,
        },
      ],
    }
  }

  const pierHeightRatio = spec.upstreamHeightP1 / spec.designHeadHd
  const resolved = resolvePowerCurve({
    upstreamSlope: spec.upstreamSlope,
    pierHeightRatioP1OverHd: pierHeightRatio,
    designHeadHd: spec.designHeadHd,
    ...(spec.kOverride === undefined ? {} : { kOverride: spec.kOverride }),
  })
  if (!resolved.ok) return { ok: false, diagnostics: resolved.diagnostics }

  const geometry: PowerCurveGeometry = {
    k: resolved.value.k,
    n: resolved.value.n,
    designHeadHd: spec.designHeadHd,
  }
  const xEnd = powerCurveTangentX(geometry, spec.downstreamSlope)
  const segments = Math.max(1, Math.floor(spec.segments ?? 20))

  const points = Array.from({ length: segments + 1 }, (_, i) => {
    const x = (xEnd * i) / segments
    return { x, y: powerCurveY(x, geometry), segment: 'power-curve' as const }
  })

  const end = points[points.length - 1]!

  return {
    ok: true,
    value: {
      designHeadHd: spec.designHeadHd,
      k: resolved.value.k,
      n: resolved.value.n,
      kSource: resolved.value.kSource,
      crestCurveType: spec.crestCurveType,
      crestParams: TABLE_A11[spec.upstreamSlope],
      points,
      downstreamEnd: end,
      endSlope: spec.downstreamSlope,
    },
    diagnostics: resolved.diagnostics,
  }
}
