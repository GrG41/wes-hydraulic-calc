/**
 * 输入校验与适用范围检查。
 *
 * 实现 AGENTS.md §8.3 错误模型的前两类：
 *   · `validateInput`      → **输入错误**（input-error）：拒绝计算
 *   · `checkApplicability` → **超范围警告**（out-of-range）：继续计算并显著提示
 * （第三类"计算失败"由各求解模块在求解过程中产生。）
 *
 * 本模块是**输入侧的唯一校验入口**；求解模块内只保留与其求解过程直接相关的检查
 * （设计水头解析、上游断面几何、σs 取值），避免同一规则出现两处实现。
 */

import type { CalculationInput, Diagnostic } from '../types'

/** 表 A.2.1-1 的行域（H₀/H_d）。来源：SL 253-2018 印张页 47。 */
const M_HEAD_RATIO_MIN = 0.4
const M_HEAD_RATIO_MAX = 1.3

/** 表 A.2.1-1 的列域下界（P₁/H_d ≥ 0.2；≥1.33 为标准给定的开口档）。 */
const M_PIER_RATIO_MIN = 0.2

/** 表 A.8 水力计算常用糙率的总体区间（印张页 76–77，混凝土 0.011 ~ 土/岩石 0.045）。 */
const ROUGHNESS_MIN = 0.011
const ROUGHNESS_MAX = 0.045

/** 总净宽与 n·b 的允许相对偏差（标准定义 B 为各孔净宽之和）。 */
const NET_WIDTH_RELATIVE_TOLERANCE = 0.01

function err(
  code: string,
  message: string,
  field: string,
  value?: number,
  limit?: number,
): Diagnostic {
  return {
    level: 'input-error',
    code,
    message,
    field,
    ...(value === undefined ? {} : { value }),
    ...(limit === undefined ? {} : { limit }),
  }
}

function warn(
  code: string,
  message: string,
  field: string,
  value?: number,
  limit?: number,
): Diagnostic {
  return {
    level: 'out-of-range',
    code,
    message,
    field,
    ...(value === undefined ? {} : { value }),
    ...(limit === undefined ? {} : { limit }),
  }
}

/**
 * 输入结构、量级与内部一致性检查。返回**全部**输入错误（不早停），便于界面一次列全。
 * 无错误时返回空数组。
 */
export function validateInput(input: CalculationInput): Diagnostic[] {
  const out: Diagnostic[] = []
  const { weir, operation, chute, solver, submergence, boundary } = input

  // ── 堰体几何 ────────────────────────────────────────────────
  if (!(weir.netWidthB > 0)) {
    out.push(err('NET_WIDTH_INVALID', '溢流堰总净宽 B 必须为正值', 'weir.netWidthB', weir.netWidthB))
  }
  if (!(weir.singleOpeningWidthB > 0)) {
    out.push(
      err('SINGLE_WIDTH_INVALID', '单孔宽度 b 必须为正值', 'weir.singleOpeningWidthB', weir.singleOpeningWidthB),
    )
  }
  if (!Number.isInteger(weir.openingCount) || weir.openingCount < 1) {
    out.push(
      err('OPENING_COUNT_INVALID', '闸孔数目 n 必须为不小于 1 的整数', 'weir.openingCount', weir.openingCount),
    )
  }
  if (weir.singleOpeningWidthB > weir.netWidthB) {
    out.push(
      err(
        'SINGLE_WIDTH_EXCEEDS_NET_WIDTH',
        '单孔宽度 b 不得大于溢流堰总净宽 B',
        'weir.singleOpeningWidthB',
        weir.singleOpeningWidthB,
        weir.netWidthB,
      ),
    )
  }
  if (
    weir.netWidthB > 0 &&
    Number.isInteger(weir.openingCount) &&
    weir.openingCount >= 1 &&
    weir.singleOpeningWidthB > 0
  ) {
    const expected = weir.openingCount * weir.singleOpeningWidthB
    if (Math.abs(weir.netWidthB - expected) / weir.netWidthB > NET_WIDTH_RELATIVE_TOLERANCE) {
      out.push(
        err(
          'NET_WIDTH_INCONSISTENT_WITH_OPENINGS',
          `总净宽 B = ${weir.netWidthB} m 与 n·b = ${expected} m 不一致` +
            `（标准定义 B 为各孔净宽之和，允许偏差 ${NET_WIDTH_RELATIVE_TOLERANCE * 100}%）`,
          'weir.netWidthB',
          weir.netWidthB,
          expected,
        ),
      )
    }
  }
  if (!(weir.upstreamHeightP1 > 0)) {
    out.push(
      err('UPSTREAM_HEIGHT_INVALID', '上游堰高 P₁ 必须为正值', 'weir.upstreamHeightP1', weir.upstreamHeightP1),
    )
  }

  // ── 运行工况 ────────────────────────────────────────────────
  if (!(operation.headOverCrest > 0)) {
    out.push(
      err('HEAD_OVER_CREST_INVALID', '堰上水头 H 必须为正值', 'operation.headOverCrest', operation.headOverCrest),
    )
  }
  if (!Number.isFinite(operation.downstreamWaterLevel)) {
    out.push(
      err('DOWNSTREAM_LEVEL_INVALID', '下游水位必须为有限数值', 'operation.downstreamWaterLevel'),
    )
  }

  // ── 泄槽 ────────────────────────────────────────────────────
  if (!(chute.width > 0)) {
    out.push(err('CHUTE_WIDTH_INVALID', '泄槽底宽必须为正值', 'chute.width', chute.width))
  }
  if (!(chute.roughness > 0)) {
    out.push(err('ROUGHNESS_INVALID', '糙率 n 必须为正值', 'chute.roughness', chute.roughness))
  }
  if (!(chute.stationStep > 0)) {
    out.push(err('STATION_STEP_INVALID', '分段步长必须为正值', 'chute.stationStep', chute.stationStep))
  }
  if (!(chute.endStation > chute.startStation)) {
    out.push(
      err(
        'STATION_RANGE_INVALID',
        '泄槽终点桩号必须大于起点桩号',
        'chute.endStation',
        chute.endStation,
        chute.startStation,
      ),
    )
  }
  if (!(chute.bedSlope >= 0)) {
    out.push(err('BED_SLOPE_INVALID', '泄槽底坡 i 不得为负', 'chute.bedSlope', chute.bedSlope))
  }

  // ── 求解器 ──────────────────────────────────────────────────
  if (!Number.isInteger(solver.maxIterations) || solver.maxIterations < 1) {
    out.push(
      err('MAX_ITERATIONS_INVALID', '最大迭代次数必须为不小于 1 的整数', 'solver.maxIterations', solver.maxIterations),
    )
  }
  if (!(solver.relativeTolerance > 0)) {
    out.push(
      err('TOLERANCE_INVALID', '收敛容差必须为正值', 'solver.relativeTolerance', solver.relativeTolerance),
    )
  }

  // ── 淹没系数（DEC-022 路径 A 的输入侧部分）──────────────────
  if (submergence.kind === 'manual' && (submergence.sigmaS < 0.2 || submergence.sigmaS > 1)) {
    out.push(
      err(
        'SIGMA_S_OUT_OF_RANGE',
        `人工输入的淹没系数 σs = ${submergence.sigmaS} 超出图 A.2.1-3 的曲线范围 [0.20, 1.00]`,
        'submergence.sigmaS',
        submergence.sigmaS,
      ),
    )
  }

  // ── 下游边界 ────────────────────────────────────────────────
  if (!Number.isFinite(boundary.downstreamWaterLevel)) {
    out.push(err('BOUNDARY_LEVEL_INVALID', '下游控制水位必须为有限数值', 'boundary.downstreamWaterLevel'))
  }

  return out
}

/**
 * 适用范围检查（超范围警告）。
 *
 * 检查的是**公式与图表的适用域**，不是输入合法性；命中时仍应继续计算，
 * 但须在结果页与计算书中显著提示（AGENTS.md §2.8、§9.3「不得静默处理超范围输入」）。
 */
export function checkApplicability(input: CalculationInput): Diagnostic[] {
  const out: Diagnostic[] = []
  const { weir, operation, chute, designHead } = input

  // 定型设计水头（按其给定方式取用值；非法值由求解模块报输入错误）
  const hd = designHead.kind === 'direct' ? designHead.value : designHead.maxHead
  if (hd > 0) {
    const headRatio = operation.headOverCrest / hd
    if (headRatio < M_HEAD_RATIO_MIN || headRatio > M_HEAD_RATIO_MAX) {
      out.push(
        warn(
          'HEAD_RATIO_OUTSIDE_TABLE',
          `H/H_d = ${headRatio.toFixed(4)} 超出表 A.2.1-1 的行域 [${M_HEAD_RATIO_MIN}, ${M_HEAD_RATIO_MAX}]，` +
            '流量系数 m 将按边界取值',
          'operation.headOverCrest',
          headRatio,
        ),
      )
    }

    const pierRatio = weir.upstreamHeightP1 / hd
    if (pierRatio < M_PIER_RATIO_MIN) {
      out.push(
        warn(
          'PIER_HEIGHT_RATIO_OUTSIDE_TABLE',
          `P₁/H_d = ${pierRatio.toFixed(4)} 低于表 A.2.1-1 的列域下界 ${M_PIER_RATIO_MIN}，` +
            '流量系数 m 将按边界取值',
          'weir.upstreamHeightP1',
          pierRatio,
        ),
      )
    }
  }

  // 糙率（表 A.8 的总体区间）
  if (chute.roughness > 0 && (chute.roughness < ROUGHNESS_MIN || chute.roughness > ROUGHNESS_MAX)) {
    out.push(
      warn(
        'ROUGHNESS_OUTSIDE_TABLE_A8',
        `糙率 n = ${chute.roughness} 超出表 A.8 的总体区间 [${ROUGHNESS_MIN}, ${ROUGHNESS_MAX}]`,
        'chute.roughness',
        chute.roughness,
      ),
    )
  }

  // 底坡与底坡角度的一致性（标准 A.3.1：i = sinθ）
  const sinTheta = Math.sin((chute.bedAngleDeg * Math.PI) / 180)
  if (Math.abs(chute.bedSlope - sinTheta) > 0.01) {
    out.push(
      warn(
        'BED_SLOPE_ANGLE_INCONSISTENT',
        `底坡 i = ${chute.bedSlope} 与底坡角度 θ = ${chute.bedAngleDeg}° 不一致（i 应等于 sinθ = ${sinTheta.toFixed(6)}）`,
        'chute.bedSlope',
        chute.bedSlope,
        sinTheta,
      ),
    )
  }

  // 下游堰高 P₂（图 A.2.1-3 横轴变量；非正则该图无意义）
  const p2 = weir.crestElevation - weir.downstreamBedElevation
  if (!(p2 > 0)) {
    out.push(
      warn(
        'DOWNSTREAM_HEIGHT_NON_POSITIVE',
        `下游堰高 P₂ = ${p2} m 非正（堰顶高程 ${weir.crestElevation} m，下游河床高程 ${weir.downstreamBedElevation} m）`,
        'weir.downstreamBedElevation',
        p2,
      ),
    )
  }

  return out
}

/** 校验结果汇总。 */
export interface PreflightResult {
  readonly diagnostics: readonly Diagnostic[]
  readonly inputErrors: readonly Diagnostic[]
  readonly warnings: readonly Diagnostic[]
  readonly ok: boolean
}

/** 一次性完成输入校验与适用范围检查。 */
export function preflight(input: CalculationInput): PreflightResult {
  const inputErrors = validateInput(input)
  const warnings = checkApplicability(input)
  return {
    diagnostics: [...inputErrors, ...warnings],
    inputErrors,
    warnings,
    ok: inputErrors.length === 0,
  }
}
