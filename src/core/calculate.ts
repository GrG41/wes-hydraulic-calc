/**
 * 核心层统一入口 —— 把各公式模块串成一次完整计算。
 *
 * 依据：`docs/ALGORITHM.md` §2（数据流）
 *
 *   输入 → ① 输入校验与范围检查
 *         → ② 泄流能力求解（迭代）
 *         → ③ 堰面曲线几何
 *         → ④ 泄槽水面线推算（双分支）
 *         → ⑤ 组装结果（数值 + 中间过程 + 诊断）
 *
 * 失败时不抛异常，返回 `{ ok: false, diagnostics }`；三类诊断严格区分（AGENTS.md §8.3）。
 */

import type {
  CalcResult,
  CalculationInput,
  Diagnostic,
} from './types'
import { preflight } from './validation/input'
import { resolveDesignHead, solveDischarge } from './formulas/discharge'
import type { DischargeResult } from './types'
import { buildWeirProfile, powerCurveTangentX } from './formulas/weirProfile'
import type { WeirProfileGeometryResult } from './formulas/weirProfile'
import { criticalDepth, solveWaterProfile } from './formulas/waterProfile'
import type { WaterProfileGeometryResult } from './formulas/waterProfile'

/** 完整计算结果。 */
export interface CalculationOutput {
  /** 泄流能力与迭代过程 */
  readonly discharge: DischargeResult
  /** 堰面曲线几何（幂曲线段） */
  readonly profile: WeirProfileGeometryResult
  /** 泄槽水面线（急流分支，及可选缓流分支） */
  readonly waterProfile: WaterProfileGeometryResult
  /** 输入回显（含单位），供计算书输出 */
  readonly inputEcho: CalculationInput
  /** 全部诊断（输入错误 / 超范围警告 / 计算失败） */
  readonly diagnostics: readonly Diagnostic[]
}

/**
 * 执行一次完整计算。
 *
 * **关于泄槽起始水深**：工程师确认"由上游堰面曲线推求"（Q21-2 = B），
 * 但未指定具体推求方法。本实现按以下次序取值：
 *   1. 若输入给出 `chute.entranceDepth`，直接采用（推荐，由使用者按体型设计确定）；
 *   2. 否则取该断面的**临界水深**作为缺省，并输出 `out-of-range` 级提示，
 *      说明该值为缺省推定、应由使用者复核。
 * 之所以不静默取值：泄槽起始水深直接影响整条水面线（AGENTS.md §9.3）。
 */
export function calculate(input: CalculationInput): CalcResult<CalculationOutput> {
  // ── ① 输入校验 ──────────────────────────────────────────────
  const checks = preflight(input)
  if (!checks.ok) {
    return { ok: false, diagnostics: checks.inputErrors }
  }

  // ── ② 泄流能力 ──────────────────────────────────────────────
  const discharge = solveDischarge(input)
  if (!discharge.ok) return { ok: false, diagnostics: discharge.diagnostics }

  // ── ③ 堰面曲线 ──────────────────────────────────────────────
  const designHead = resolveDesignHead(input)
  if (designHead.error) return { ok: false, diagnostics: [designHead.error] }

  const profile = buildWeirProfile({
    upstreamSlope: input.weir.upstreamSlope,
    upstreamHeightP1: input.weir.upstreamHeightP1,
    designHeadHd: designHead.designHeadHd,
    downstreamSlope: input.chute.bedSlope,
    crestCurveType: input.weir.crestCurveType,
    ...(input.weir.powerCurveKOverride === undefined
      ? {}
      : { kOverride: input.weir.powerCurveKOverride }),
  })
  if (!profile.ok) return { ok: false, diagnostics: profile.diagnostics }

  // ── ④ 水面线 ────────────────────────────────────────────────
  const extraWarnings: Diagnostic[] = []
  let entranceDepth = input.chute.entranceDepth
  if (entranceDepth === undefined) {
    entranceDepth = criticalDepth(discharge.value.dischargeQ, input.chute.width)
    extraWarnings.push({
      level: 'out-of-range',
      code: 'CHUTE_ENTRANCE_DEPTH_DEFAULTED',
      message:
        `泄槽起始水深未给定，已按该断面临界水深 ${entranceDepth.toFixed(4)} m 缺省取值。` +
        '工程师确认起始水深"由上游堰面曲线推求"（Q21-2 = B），但未指定推求方法，' +
        '请按体型设计复核该值后填入。',
      field: 'chute.entranceDepth',
      value: entranceDepth,
    })
  }

  const waterProfile = solveWaterProfile({
    discharge: discharge.value.dischargeQ,
    width: input.chute.width,
    roughness: input.chute.roughness,
    bedSlope: input.chute.bedSlope,
    bedAngleDeg: input.chute.bedAngleDeg,
    startStation: input.chute.startStation,
    endStation: input.chute.endStation,
    stationStep: input.chute.stationStep,
    upstreamDepth: entranceDepth,
    startBedElevation: input.chute.startBedElevation,
    downstreamWaterLevel: input.boundary.downstreamWaterLevel,
  })
  if (!waterProfile.ok) {
    return {
      ok: false,
      diagnostics: [...extraWarnings, ...discharge.diagnostics, ...waterProfile.diagnostics],
    }
  }

  // ── ⑤ 组装 ──────────────────────────────────────────────────
  const diagnostics: Diagnostic[] = [
    ...checks.warnings,
    ...discharge.diagnostics,
    ...profile.diagnostics,
    ...extraWarnings,
    ...waterProfile.diagnostics,
  ]

  return {
    ok: true,
    value: {
      discharge: discharge.value,
      profile: profile.value,
      waterProfile: waterProfile.value,
      inputEcho: input,
      diagnostics,
    },
    diagnostics,
  }
}

/**
 * 泄流曲线：给定一系列堰上水头，逐个求解流量。
 * 用于结果页的 Q–H 曲线绘制。
 *
 * 各行独立求解；个别水头求解失败时该点记为 `null`，不使整条曲线失败。
 */
export function dischargeCurve(
  input: CalculationInput,
  heads: readonly number[],
): readonly { readonly head: number; readonly discharge: number | null; readonly reason?: string }[] {
  return heads.map((head) => {
    const r = solveDischarge({ ...input, operation: { ...input.operation, headOverCrest: head } })
    if (r.ok) return { head, discharge: r.value.dischargeQ }
    const first = r.diagnostics[0]
    return {
      head,
      discharge: null,
      ...(first === undefined ? {} : { reason: `${first.code}: ${first.message}` }),
    }
  })
}

/** 导出给上层使用的幂曲线切点工具（绘图时标注曲线段终点）。 */
export { powerCurveTangentX }
