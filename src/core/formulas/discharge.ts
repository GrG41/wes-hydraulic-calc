/**
 * 泄流能力模块 —— 式（A.2.1-1）（A.2.1-2）（A.2.1-3）与行进流速水头迭代。
 *
 * 来源：**SL 253-2018《溢洪道设计规范》附录 A.2.1，印张页 46**
 * 对照：`docs/FORMULAS.md` §1.1 ~ §1.2；`docs/ALGORITHM.md` §3
 *
 *       Q  = c · m · ε · σs · B · √(2g) · H₀^(3/2)          (A.2.1-1)
 *       ε  = 1 − 0.2[ζk + (n−1)ζ₀] · H₀/(n·b)               (A.2.1-2)
 *       H₀ = H + v²/(2g)                                      (A.2.1-3)
 *
 * 迭代参数（工程师确认，DECISIONS.md DEC-017 / DEC-019 A-3）：
 *   初值 H₀ = H、最大 50 次、相对残差 1e-6 对 Q 与 H₀ 分别判定、不收敛即报错停止。
 *
 * 上游计算断面（DEC-017 Q19-1）：取堰前 3H 处，面积按实际断面几何计算，不计墩体占位。
 */

import { GRAVITY } from '../constants'
import {
  abutmentShapeFactorZeta0,
  contractionCoefficient,
  dischargeCoefficientM,
  pierShapeFactorZetaK,
  upstreamSlopeFactorC,
} from './coefficient'
import type {
  CalcResult,
  CalculationInput,
  Diagnostic,
  DischargeIteration,
  DischargeResult,
  UpstreamSection,
} from '../types'

// ─────────────────────────────────────────────────────────────────
//  辅助
// ─────────────────────────────────────────────────────────────────

/** 上游计算断面的过水面积，m²（DEC-019 A-4：矩形 `b·h`；对称梯形 `(b + m·h)·h`）。 */
function sectionArea(section: UpstreamSection, depth: number): number {
  const shape = section.shape
  switch (shape.kind) {
    case 'rectangular':
      return shape.bottomWidth * depth
    case 'trapezoidal':
      return (shape.bottomWidth + shape.sideSlope * depth) * depth
  }
}

/** 设计水头 H_d 的判定结果。 */
interface DesignHeadOutcome {
  readonly designHeadHd: number
  readonly isHighWeir: boolean
  readonly error?: Diagnostic
}

/**
 * 确定堰面曲线定型设计水头 H_d。
 *
 * 来源：SL 253-2018 附录 A.1.1，印张页 41 ——
 * 高堰（P₁ ≥ 1.33H_d）取 H_d = (0.75~0.95)H_max；低堰（P₁ < 1.33H_d）取 H_d = (0.65~0.85)H_max。
 *
 * 标准只给**区间**，故区间内系数由使用者给定（默认取区间中值 0.85 / 0.75），
 * 属工程判断（归纳取向 P3）。
 */
function resolveDesignHead(input: CalculationInput): DesignHeadOutcome {
  const spec = input.designHead
  const p1 = input.weir.upstreamHeightP1

  if (spec.kind === 'direct') {
    if (!(spec.value > 0)) {
      return {
        designHeadHd: Number.NaN,
        isHighWeir: false,
        error: {
          level: 'input-error',
          code: 'DESIGN_HEAD_INVALID',
          message: '定型设计水头 H_d 必须为正值',
          field: 'designHead.value',
          value: spec.value,
        },
      }
    }
    return { designHeadHd: spec.value, isHighWeir: p1 >= 1.33 * spec.value }
  }

  const hMax = spec.maxHead
  if (!(hMax > 0)) {
    return {
      designHeadHd: Number.NaN,
      isHighWeir: false,
      error: {
        level: 'input-error',
        code: 'MAX_HEAD_INVALID',
        message: '校核流量下的堰上水头 H_max 必须为正值',
        field: 'designHead.maxHead',
        value: hMax,
      },
    }
  }
  const highFactor = spec.highWeirFactor ?? 0.85
  const lowFactor = spec.lowWeirFactor ?? 0.75
  const trialHigh = highFactor * hMax
  if (p1 >= 1.33 * trialHigh) {
    return { designHeadHd: trialHigh, isHighWeir: true }
  }
  return { designHeadHd: lowFactor * hMax, isHighWeir: false }
}

// ─────────────────────────────────────────────────────────────────
//  主求解
// ─────────────────────────────────────────────────────────────────

/**
 * 求解泄流能力 Q。
 *
 * 失败时不抛异常，返回 `{ ok: false, diagnostics }`；诊断级别严格区分
 * 输入错误 / 超范围警告 / 计算失败（AGENTS.md §8.3）。
 */
export function solveDischarge(input: CalculationInput): CalcResult<DischargeResult> {
  /** 查表产生的诊断按 code 去重，避免迭代过程中重复堆积。 */
  const lookupDiagnostics = new Map<string, Diagnostic>()
  const absorb = (list: readonly Diagnostic[]) => {
    for (const d of list) if (!lookupDiagnostics.has(d.code)) lookupDiagnostics.set(d.code, d)
  }

  const { weir, piers, upstreamSection, operation, solver, submergence } = input

  // ── 1) 基本输入校验 ──────────────────────────────────────────
  const inputErrors: Diagnostic[] = []
  if (!(weir.netWidthB > 0)) {
    inputErrors.push({
      level: 'input-error',
      code: 'NET_WIDTH_INVALID',
      message: '溢流堰总净宽 B 必须为正值',
      field: 'weir.netWidthB',
      value: weir.netWidthB,
    })
  }
  if (!(weir.singleOpeningWidthB > 0)) {
    inputErrors.push({
      level: 'input-error',
      code: 'SINGLE_WIDTH_INVALID',
      message: '单孔宽度 b 必须为正值',
      field: 'weir.singleOpeningWidthB',
      value: weir.singleOpeningWidthB,
    })
  }
  if (!Number.isInteger(weir.openingCount) || weir.openingCount < 1) {
    inputErrors.push({
      level: 'input-error',
      code: 'OPENING_COUNT_INVALID',
      message: '闸孔数目 n 必须为不小于 1 的整数',
      field: 'weir.openingCount',
      value: weir.openingCount,
    })
  }
  if (weir.singleOpeningWidthB > weir.netWidthB) {
    inputErrors.push({
      level: 'input-error',
      code: 'SINGLE_WIDTH_EXCEEDS_NET_WIDTH',
      message: '单孔宽度 b 不得大于溢流堰总净宽 B',
      field: 'weir.singleOpeningWidthB',
      value: weir.singleOpeningWidthB,
      limit: weir.netWidthB,
    })
  }
  if (!(operation.headOverCrest > 0)) {
    inputErrors.push({
      level: 'input-error',
      code: 'HEAD_OVER_CREST_INVALID',
      message: '堰上水头 H 必须为正值',
      field: 'operation.headOverCrest',
      value: operation.headOverCrest,
    })
  }
  if (inputErrors.length > 0) return { ok: false, diagnostics: inputErrors }

  // ── 2) 设计水头 ──────────────────────────────────────────────
  const designHead = resolveDesignHead(input)
  if (designHead.error) return { ok: false, diagnostics: [designHead.error] }
  const { designHeadHd, isHighWeir } = designHead

  // ── 3) 上游计算断面与面积 ────────────────────────────────────
  const upstreamWaterLevel = weir.crestElevation + operation.headOverCrest
  const sectionDepth = upstreamWaterLevel - upstreamSection.bedElevation
  if (!(sectionDepth > 0)) {
    return {
      ok: false,
      diagnostics: [
        {
          level: 'input-error',
          code: 'UPSTREAM_SECTION_DRY',
          message: '上游计算断面的水深非正，请检查断面底高程与上游水位',
          field: 'upstreamSection.bedElevation',
          value: upstreamSection.bedElevation,
          limit: upstreamWaterLevel,
        },
      ],
    }
  }
  const area = sectionArea(upstreamSection, sectionDepth)
  if (!(area > 0)) {
    return {
      ok: false,
      diagnostics: [
        {
          level: 'input-error',
          code: 'UPSTREAM_SECTION_AREA_INVALID',
          message: '上游计算断面过水面积非正',
          field: 'upstreamSection.shape',
        },
      ],
    }
  }

  // ── 4) 淹没系数 σs（DEC-022 路径 A）─────────────────────────
  const hs = operation.downstreamWaterLevel - weir.crestElevation
  const p2 = weir.crestElevation - weir.downstreamBedElevation
  let sigmaS: number
  if (hs <= 0) {
    if (submergence.kind === 'manual' && submergence.sigmaS < 1) {
      return {
        ok: false,
        diagnostics: [
          {
            level: 'input-error',
            code: 'SIGMA_S_INCONSISTENT_WITH_FREE_FLOW',
            message: `下游水位不高于堰顶（hs = ${hs} m ≤ 0）属自由出流，σs 应取 1.0，不接受 ${submergence.sigmaS}`,
            field: 'submergence.sigmaS',
            value: submergence.sigmaS,
          },
        ],
      }
    }
    sigmaS = 1
  } else if (submergence.kind !== 'manual') {
    // 潜在淹没：程序不自动取值，避免静默高估泄流量
    return {
      ok: false,
      diagnostics: [
        {
          level: 'input-error',
          code: 'SIGMA_S_REQUIRED_WHEN_SUBMERGED',
          message:
            `下游水位高于堰顶（hs = ${hs} m > 0），可能淹没。` +
            '图 A.2.1-3 无法自动数字化，请按该图查取 σs 后以 manual 方式输入。',
          field: 'submergence',
          value: hs,
        },
      ],
    }
  } else if (submergence.sigmaS < 0.2 || submergence.sigmaS > 1) {
    return {
      ok: false,
      diagnostics: [
        {
          level: 'input-error',
          code: 'SIGMA_S_OUT_OF_RANGE',
          message: `人工输入的淹没系数 σs = ${submergence.sigmaS} 超出图 A.2.1-3 的曲线范围 [0.20, 1.00]`,
          field: 'submergence.sigmaS',
          value: submergence.sigmaS,
        },
      ],
    }
  } else {
    sigmaS = submergence.sigmaS
  }

  // ── 5) 迭代求解 ──────────────────────────────────────────────
  const p1OverHd = weir.upstreamHeightP1 / designHeadHd
  const zeta0 = abutmentShapeFactorZeta0(piers.abutmentShape)
  const sqrt2g = Math.sqrt(2 * GRAVITY)
  const tol = solver.relativeTolerance
  const floor = solver.epsilonFloor

  interface EvalOutcome {
    readonly q: number
    readonly m: number
    readonly c: number
    readonly epsilon: number
    readonly zetaK: number
    readonly headRatio: number
    readonly hsRatio: number
    readonly headOverSingleWidth: number
  }

  const evaluate = (h0: number): EvalOutcome => {
    const headRatio = h0 / designHeadHd
    const hsRatio = hs > 0 ? hs / h0 : 0

    const mOut = dischargeCoefficientM(headRatio, p1OverHd)
    const cOut = upstreamSlopeFactorC(weir.upstreamSlope, p1OverHd)
    const zkOut = pierShapeFactorZetaK({
      shape: piers.pierHeadShape,
      pierHeadExtensionLk: piers.pierHeadExtensionLk,
      pierHeadHeightHs: piers.pierHeadHeightHs,
      submergenceRatioHsOverH0: hsRatio,
    })
    const epsOut = contractionCoefficient({
      openingCount: weir.openingCount,
      singleOpeningWidth: weir.singleOpeningWidthB,
      totalHeadH0: h0,
      zetaK: zkOut.value,
      zeta0,
    })
    absorb([...mOut.diagnostics, ...cOut.diagnostics, ...zkOut.diagnostics])

    const q =
      cOut.value * mOut.value * epsOut.value * sigmaS * weir.netWidthB * sqrt2g * Math.pow(h0, 1.5)

    return {
      q,
      m: mOut.value,
      c: cOut.value,
      epsilon: epsOut.value,
      zetaK: zkOut.value,
      headRatio,
      hsRatio,
      headOverSingleWidth: epsOut.headOverSingleWidthApplied,
    }
  }

  const iterations: DischargeIteration[] = []
  let h0 = operation.headOverCrest
  let current = evaluate(h0)
  let converged = false
  let diverged = false

  /**
   * 发散守卫。
   *
   * 逐次代换（不动点迭代）并非全局收敛：当上游计算断面过小、行近流速过大时，
   * 迭代映射的导数可能超过 1，H₀ 将逐次放大直至溢出。
   * 此处显式拦截，避免 NaN / Infinity 泄漏到结果与诊断中（AGENTS.md §7.1）。
   * 上限取 10H + 1 m —— 任何合理的上游断面都远低于此。
   */
  const h0Ceiling = operation.headOverCrest * 10 + 1

  for (let k = 1; k <= solver.maxIterations; k += 1) {
    const velocity = current.q / area
    const h0Next = operation.headOverCrest + (velocity * velocity) / (2 * GRAVITY)
    const next = evaluate(h0Next)

    if (!Number.isFinite(h0Next) || !Number.isFinite(next.q) || h0Next > h0Ceiling) {
      diverged = true
      break
    }

    const headResidual = Math.abs(h0Next - h0) / Math.max(Math.abs(h0Next), floor)
    const dischargeResidual = Math.abs(next.q - current.q) / Math.max(Math.abs(next.q), floor)

    iterations.push({
      index: k,
      totalHeadH0: h0Next,
      approachVelocity: velocity,
      upstreamArea: area,
      dischargeCoefficientM: next.m,
      upstreamSlopeFactorC: next.c,
      lateralContractionEpsilon: next.epsilon,
      submergenceFactorSigmaS: sigmaS,
      dischargeQ: next.q,
      headResidual,
      dischargeResidual,
    })

    h0 = h0Next
    current = next

    if (headResidual <= tol && dischargeResidual <= tol) {
      converged = true
      break
    }
  }

  const lookupList = [...lookupDiagnostics.values()]
  const last = iterations[iterations.length - 1]

  if (diverged) {
    return {
      ok: false,
      diagnostics: [
        ...lookupList,
        {
          level: 'failure',
          code: 'DISCHARGE_ITERATION_DIVERGED',
          message:
            '行进流速水头迭代发散：上游计算断面过小、行近流速过大，' +
            `H₀ 在第 ${iterations.length + 1} 次迭代超出合理上界 ${h0Ceiling.toFixed(3)} m。` +
            '请检查上游计算断面的尺寸与位置（DEC-017：取堰前 3H 处、面积按实际断面几何计算）。',
          field: 'upstreamSection.shape',
        },
      ],
    }
  }

  if (!converged) {
    return {
      ok: false,
      diagnostics: [
        ...lookupList,
        {
          level: 'failure',
          code: 'DISCHARGE_ITERATION_NOT_CONVERGED',
          message:
            `行进流速水头迭代在 ${solver.maxIterations} 次内未收敛` +
            `（相对残差判据 ${tol}）。最后一步：H₀ 残差 ${last?.headResidual}，` +
            `Q 残差 ${last?.dischargeResidual}`,
          field: 'solver.maxIterations',
          value: solver.maxIterations,
        },
      ],
    }
  }

  const velocity = current.q / area
  const result: DischargeResult = {
    dischargeQ: current.q,
    totalHeadH0: h0,
    approachVelocityHead: h0 - operation.headOverCrest,
    coefficients: {
      m: current.m,
      c: current.c,
      epsilon: current.epsilon,
      sigmaS,
      zetaK: current.zetaK,
      zeta0,
    },
    intermediate: {
      upstreamArea: area,
      approachVelocity: velocity,
      headOverSingleWidth: current.headOverSingleWidth,
      headRatioH0OverHd: current.headRatio,
      pierHeightRatioP1OverHd: p1OverHd,
      submergenceRatioHsOverH0: current.hsRatio,
      downstreamHeightRatioP2OverH0: p2 / h0,
      designHeadHd,
      isHighWeir,
    },
    iterations,
    iterationCount: iterations.length,
    tolerance: tol,
  }

  return { ok: true, value: result, diagnostics: lookupList }
}
