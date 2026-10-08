/**
 * 水面线模块 —— 泄槽水面线分段推算（能量方程 · 分段求和法）。
 *
 * 来源：**SL 253-2018《溢洪道设计规范》附录 A.3.1，印张页 53**
 * 对照：`docs/FORMULAS.md` §3；`docs/ALGORITHM.md` §6
 *
 *   Δl₁₋₂ = [(h₂cosθ + α₂v₂²/2g) − (h₁cosθ + α₁v₁²/2g)] / ( i − J̄ )   (A.3.1-1)
 *   J̄     = n² · v̄² / R̄^(4/3)                                        (A.3.1-2)
 *   v̄     = (v₁ + v₂) / 2                                             (A.3.1-3)
 *   R̄     = (R₁ + R₂) / 2                                             (A.3.1-4)
 *
 * **标准公式中没有独立的局部损失项**（AGENTS.md §5.4 的 `hf + hj` 结构与其不符，
 * 工程师已确认按标准实现，DEC-012 Q2 = A）。
 *
 * 本期断面形式：**矩形**（底宽 width）。分段按桩号、默认步长 5 m（DEC-017 Q20）。
 * 水跃不支持：检出急流→缓流过渡即报计算失败（Q22-2 = C）。
 */

import { GRAVITY, VELOCITY_DISTRIBUTION_COEFFICIENT } from '../constants'
import type { CalcResult, Diagnostic } from '../types'

// ─────────────────────────────────────────────────────────────────
//  断面水力要素（矩形）
// ─────────────────────────────────────────────────────────────────

export interface SectionProperties {
  /** 断面面积 A_s，m² */
  readonly area: number
  /** 湿周，m */
  readonly wettedPerimeter: number
  /** 水力半径 R = A_s / 湿周，m */
  readonly hydraulicRadius: number
  /** 水面宽 B_s，m */
  readonly topWidth: number
  /** 断面平均水深 h̄ = A_s / B_s，m（DEC-019 A-7） */
  readonly meanDepth: number
  /** 断面平均流速 v，m/s */
  readonly velocity: number
  /** 弗劳德数 Fr = v / √(g·h̄) */
  readonly froude: number
}

/** 矩形断面的水力要素。`h` 为水深（m），`width` 为底宽（m），`discharge` 为流量（m³/s）。 */
export function sectionProperties(h: number, width: number, discharge: number): SectionProperties {
  const area = width * h
  const wettedPerimeter = width + 2 * h
  const hydraulicRadius = area / wettedPerimeter
  const velocity = discharge / area
  const meanDepth = area / width
  return {
    area,
    wettedPerimeter,
    hydraulicRadius,
    topWidth: width,
    meanDepth,
    velocity,
    froude: velocity / Math.sqrt(GRAVITY * meanDepth),
  }
}

/**
 * 矩形断面的临界水深：`h_c = (q²/g)^(1/3)`，`q = Q/b` 为单宽流量。
 * 由 Fr = 1 定义直接推得。
 */
export function criticalDepth(discharge: number, width: number): number {
  const q = discharge / width
  return Math.cbrt((q * q) / GRAVITY)
}

/** 摩阻坡降 J = n²·v²/R^(4/3)（式 A.3.1-2）。 */
export function frictionSlope(roughness: number, velocity: number, hydraulicRadius: number): number {
  return (roughness * roughness * velocity * velocity) / Math.pow(hydraulicRadius, 4 / 3)
}

/**
 * 矩形断面的临界坡：由 `i = J` 且水深为临界水深反求。
 * 即 `i_c = n²·v_c² / R_c^(4/3)`。
 */
export function criticalSlope(discharge: number, width: number, roughness: number): number {
  const hc = criticalDepth(discharge, width)
  const s = sectionProperties(hc, width, discharge)
  return frictionSlope(roughness, s.velocity, s.hydraulicRadius)
}

// ─────────────────────────────────────────────────────────────────
//  相邻断面水深求解
// ─────────────────────────────────────────────────────────────────

export interface AdjacentDepthInput {
  readonly discharge: number
  readonly width: number
  readonly roughness: number
  /** 底坡 i（= sinθ） */
  readonly bedSlope: number
  /** 底坡角度 θ，(°) —— 用于公式中的 cosθ */
  readonly bedAngleDeg: number
  /** 分段长度 Δl，m（正值） */
  readonly deltaLength: number
  /** 已知一侧的水深，m */
  readonly knownDepth: number
  /** 未知断面相对已知断面的位置 */
  readonly direction: 'downstream' | 'upstream'
  readonly alpha?: number
  readonly tolerance?: number
}

/** 比能 E = h·cosθ + α·v²/(2g)（式中"分段始/末断面的能量"项）。 */
function specificEnergy(h: number, s: SectionProperties, cosTheta: number, alpha: number): number {
  return h * cosTheta + (alpha * s.velocity * s.velocity) / (2 * GRAVITY)
}

/**
 * 由已知断面水深反解相邻断面水深（式 A.3.1-1）。
 *
 * 方程：`(E_未知 − E_已知) = Δl · (i − J̄)`，其中 `J̄` 取两断面的平均摩阻坡降
 * （式 A.3.1-2 与 A.3.1-4 的组合）。采用扫描定位 + 二分求根；
 * **无实数解时报计算失败，不返回猜测值**。
 */
export function solveAdjacentDepth(input: AdjacentDepthInput): CalcResult<number> {
  const alpha = input.alpha ?? VELOCITY_DISTRIBUTION_COEFFICIENT
  const tolerance = input.tolerance ?? 1e-10
  const cosTheta = Math.cos((input.bedAngleDeg * Math.PI) / 180)

  if (!(input.deltaLength > 0)) {
    return {
      ok: false,
      diagnostics: [
        {
          level: 'input-error',
          code: 'DELTA_LENGTH_INVALID',
          message: '分段长度 Δl 必须为正值',
          field: 'deltaLength',
          value: input.deltaLength,
        },
      ],
    }
  }
  if (!(input.knownDepth > 0)) {
    return {
      ok: false,
      diagnostics: [
        {
          level: 'input-error',
          code: 'KNOWN_DEPTH_INVALID',
          message: '已知断面水深必须为正值',
          field: 'knownDepth',
          value: input.knownDepth,
        },
      ],
    }
  }

  const known = sectionProperties(input.knownDepth, input.width, input.discharge)
  const eKnown = specificEnergy(input.knownDepth, known, cosTheta, alpha)
  const jKnown = frictionSlope(input.roughness, known.velocity, known.hydraulicRadius)

  /**
   * 有符号分段长度。
   *
   * 能量方程在两断面间的形式为 `E_下游 − E_上游 = Δl · (i − J̄)`。
   *   · 下游推进：未知量在下游 → `E(h) − E_已知 = +Δl·(i − J̄)`
   *   · 上游推进：未知量在上游 → `E(h) − E_已知 = −Δl·(i − J̄)`
   * 故上游方向须取负号，否则会解到另一分支的错误根上（此缺陷由单元测试发现）。
   */
  const signedLength = input.direction === 'downstream' ? input.deltaLength : -input.deltaLength

  /** F(h) = (E_h − E_已知) − s·Δl·(i − J̄)；求根即得未知水深。 */
  const residual = (h: number): number => {
    const s = sectionProperties(h, input.width, input.discharge)
    const jBar = (jKnown + frictionSlope(input.roughness, s.velocity, s.hydraulicRadius)) / 2
    return specificEnergy(h, s, cosTheta, alpha) - eKnown - signedLength * (input.bedSlope - jBar)
  }

  // 定位变号区间。
  //
  // ⚠️ 关键：比能 E(h) 是**双值**的 —— 同一比能对应一个急流解与一个缓流解，
  // 故式（A.3.1-1）通常有**两个根**。水面线是连续的，相邻断面水深必然邻近已知水深，
  // 因此必须**从已知水深向外就近找根**；若从最小水深向上扫描，可能落到另一分支的错误根上。
  const ladder: number[] = []
  for (let k = 1; k <= 240; k += 1) {
    const factor = Math.pow(1.015, k)
    ladder.push(factor, 1 / factor)
  }
  const candidates = ladder
    .map((factor) => input.knownDepth * factor)
    .filter((h) => h > 1e-6 && h < 1e4)
    .sort(
      (x, y) =>
        Math.abs(Math.log(x / input.knownDepth)) - Math.abs(Math.log(y / input.knownDepth)),
    )

  let lo = Number.NaN
  let hi = Number.NaN
  let prevH = input.knownDepth
  let prevF = residual(prevH)
  for (const h of candidates) {
    const f = residual(h)
    if (Number.isFinite(prevF) && Number.isFinite(f) && prevF * f <= 0) {
      lo = Math.min(prevH, h)
      hi = Math.max(prevH, h)
      break
    }
    prevH = h
    prevF = f
  }

  if (!Number.isFinite(lo)) {
    const d: Diagnostic = {
      level: 'failure',
      code: 'WATER_PROFILE_NO_SOLUTION',
      message:
        `在 ${input.direction === 'downstream' ? '下游' : '上游'}方向、Δl = ${input.deltaLength} m 处` +
        '式（A.3.1-1）无实数解。请检查底坡、糙率与分段步长。',
      field: 'deltaLength',
      value: input.deltaLength,
    }
    return { ok: false, diagnostics: [d] }
  }

  // 二分
  let fLo = residual(lo)
  for (let i = 0; i < 200 && hi - lo > tolerance; i += 1) {
    const mid = 0.5 * (lo + hi)
    const fMid = residual(mid)
    if (!Number.isFinite(fMid)) break
    if (fLo * fMid <= 0) {
      hi = mid
    } else {
      lo = mid
      fLo = fMid
    }
  }

  return { ok: true, value: 0.5 * (lo + hi), diagnostics: [] }
}

// ─────────────────────────────────────────────────────────────────
//  分段推算
// ─────────────────────────────────────────────────────────────────

export interface WaterProfileSpec {
  readonly discharge: number
  /** 泄槽底宽，m */
  readonly width: number
  /** 槽身糙率 n（表 A.8，由使用者输入具体值，DEC-019 A-8） */
  readonly roughness: number
  /** 底坡 i（= sinθ） */
  readonly bedSlope: number
  /** 底坡角度 θ，(°) */
  readonly bedAngleDeg: number
  readonly startStation: number
  readonly endStation: number
  /** 分段步长，m（默认 5，可覆盖） */
  readonly stationStep: number
  /** 上游端起始水深，m（由上游堰面曲线推求，Q21-2 = B） */
  readonly upstreamDepth: number
  /**
   * 起点桩号处的槽底高程，m。
   * 桩号按沿槽量取，槽底高程沿程下降 `Δs · i`（标准 A.3.1：i = sinθ）。
   * 缓流分支需据此把下游控制水位换算为水深；缺省则只推算急流分支。
   */
  readonly startBedElevation?: number
  /**
   * 下游控制水位，m（高程）。给定后程序**另算缓流分支**（自下游端向上游推算），
   * 两个分支都输出，由使用者按流态判断（Q21-3 = C、Q21-4 = 需要）。
   */
  readonly downstreamWaterLevel?: number
  readonly alpha?: number
  readonly tolerance?: number
}

export interface WaterProfileStationResult {
  readonly station: number
  readonly depth: number
  readonly velocity: number
  readonly area: number
  readonly hydraulicRadius: number
  readonly froude: number
  readonly regime: 'subcritical' | 'critical' | 'supercritical'
  readonly frictionSlope: number
  readonly segmentLength: number
}

export interface WaterProfileGeometryResult {
  readonly branches: readonly {
    readonly branch: 'supercritical' | 'subcritical'
    readonly direction: 'downstream' | 'upstream'
    readonly stations: readonly WaterProfileStationResult[]
  }[]
  readonly criticalDepth: number
  readonly criticalSlope: number
  readonly crossingStation: number | null
  readonly hydraulicJumpDetected: boolean
}

/** 按弗劳德数判别流态（Q22-1 = A）。 */
function regimeOf(froude: number): 'subcritical' | 'critical' | 'supercritical' {
  if (Math.abs(froude - 1) < 1e-6) return 'critical'
  return froude > 1 ? 'supercritical' : 'subcritical'
}

function toStation(
  station: number,
  depth: number,
  spec: WaterProfileSpec,
  segmentLength: number,
): WaterProfileStationResult {
  const s = sectionProperties(depth, spec.width, spec.discharge)
  return {
    station,
    depth,
    velocity: s.velocity,
    area: s.area,
    hydraulicRadius: s.hydraulicRadius,
    froude: s.froude,
    regime: regimeOf(s.froude),
    frictionSlope: frictionSlope(spec.roughness, s.velocity, s.hydraulicRadius),
    segmentLength,
  }
}

/**
 * 分段推算泄槽水面线（能量方程 · 分段求和法）。
 *
 * **本期实现下游推进（急流）分支**：自上游端起始水深逐段向下游推算。
 * `Q21-3 = C` 要求缓流与急流两者都算并输出两条水面线；**缓流分支（自下游端向上游推算）
 * 待下一步实现**——本函数当前只返回急流分支，并在检出流态由急流转为缓流时
 * 按 `Q22-2 = C` 判为水跃、报计算失败。
 */
export function solveWaterProfile(spec: WaterProfileSpec): CalcResult<WaterProfileGeometryResult> {
  const diagnostics: Diagnostic[] = []

  if (!(spec.discharge > 0)) {
    diagnostics.push({
      level: 'input-error',
      code: 'DISCHARGE_INVALID',
      message: '流量 Q 必须为正值',
      field: 'discharge',
      value: spec.discharge,
    })
  }
  if (!(spec.width > 0)) {
    diagnostics.push({
      level: 'input-error',
      code: 'CHUTE_WIDTH_INVALID',
      message: '泄槽底宽必须为正值',
      field: 'width',
      value: spec.width,
    })
  }
  if (!(spec.roughness > 0)) {
    diagnostics.push({
      level: 'input-error',
      code: 'ROUGHNESS_INVALID',
      message: '糙率 n 必须为正值',
      field: 'roughness',
      value: spec.roughness,
    })
  }
  if (!(spec.stationStep > 0)) {
    diagnostics.push({
      level: 'input-error',
      code: 'STATION_STEP_INVALID',
      message: '分段步长必须为正值',
      field: 'stationStep',
      value: spec.stationStep,
    })
  }
  if (!(spec.upstreamDepth > 0)) {
    diagnostics.push({
      level: 'input-error',
      code: 'UPSTREAM_DEPTH_INVALID',
      message: '上游端起始水深必须为正值',
      field: 'upstreamDepth',
      value: spec.upstreamDepth,
    })
  }
  if (!(spec.endStation > spec.startStation)) {
    diagnostics.push({
      level: 'input-error',
      code: 'STATION_RANGE_INVALID',
      message: '终点桩号必须大于起点桩号',
      field: 'endStation',
      value: spec.endStation,
      limit: spec.startStation,
    })
  }
  if (diagnostics.length > 0) return { ok: false, diagnostics }

  const stations: WaterProfileStationResult[] = [toStation(spec.startStation, spec.upstreamDepth, spec, 0)]
  let hydraulicJumpDetected = false
  let crossingStation: number | null = null

  const count = Math.ceil((spec.endStation - spec.startStation) / spec.stationStep)
  for (let k = 1; k <= count; k += 1) {
    const prev = stations[stations.length - 1]!
    const target = Math.min(spec.startStation + k * spec.stationStep, spec.endStation)
    const deltaLength = target - prev.station

    const solved = solveAdjacentDepth({
      discharge: spec.discharge,
      width: spec.width,
      roughness: spec.roughness,
      bedSlope: spec.bedSlope,
      bedAngleDeg: spec.bedAngleDeg,
      deltaLength,
      knownDepth: prev.depth,
      direction: 'downstream',
      ...(spec.alpha === undefined ? {} : { alpha: spec.alpha }),
      ...(spec.tolerance === undefined ? {} : { tolerance: spec.tolerance }),
    })

    if (!solved.ok) {
      return { ok: false, diagnostics: [...solved.diagnostics] }
    }

    const next = toStation(target, solved.value, spec, deltaLength)

    // 水跃不支持：急流分支上出现缓流即判为过渡
    if (next.regime === 'subcritical' && prev.regime === 'supercritical') {
      hydraulicJumpDetected = true
      crossingStation = target
      return {
        ok: false,
        diagnostics: [
          {
            level: 'failure',
            code: 'HYDRAULIC_JUMP_DETECTED',
            message:
              `桩号 ${target} m 处检出急流→缓流过渡（水跃）：` +
              `弗劳德数由 ${prev.froude.toFixed(3)} 降至 ${next.froude.toFixed(3)}。` +
              '本期不支持水跃计算（Q22-2 = C），请调整下游控制条件或分段。',
            field: 'station',
            value: target,
          },
        ],
      }
    }

    stations.push(next)
  }

  // ── 缓流分支（自下游端向上游推算，Q21-3 = C）─────────────────
  const warnings: Diagnostic[] = []
  let subcritical: WaterProfileStationResult[] | null = null
  if (spec.downstreamWaterLevel !== undefined && spec.startBedElevation !== undefined) {
    const bedAtEnd = spec.startBedElevation - (spec.endStation - spec.startStation) * spec.bedSlope
    const endDepth = spec.downstreamWaterLevel - bedAtEnd
    if (!(endDepth > 0)) {
      warnings.push({
        level: 'out-of-range',
        code: 'DOWNSTREAM_DEPTH_NON_POSITIVE',
        message:
          `下游控制水位 ${spec.downstreamWaterLevel} m 低于终点槽底高程 ${bedAtEnd.toFixed(3)} m，` +
          '缓流分支无法起算，仅输出急流分支。',
        field: 'downstreamWaterLevel',
        value: spec.downstreamWaterLevel,
        limit: bedAtEnd,
      })
    } else if (endDepth <= criticalDepth(spec.discharge, spec.width)) {
      // 缓流分支必须由缓流边界起算。下游水深低于临界水深时下游本身是急流，
      // 不存在缓流分支 —— 不得凭此造出一条假分支。
      const hcHere = criticalDepth(spec.discharge, spec.width)
      warnings.push({
        level: 'out-of-range',
        code: 'DOWNSTREAM_DEPTH_NOT_SUBCRITICAL',
        message:
          `终点水深 ${endDepth.toFixed(3)} m 不大于临界水深 ${hcHere.toFixed(3)} m，下游为急流，` +
          '不存在缓流分支，仅输出急流分支。若确需缓流分支，请提高下游控制水位。',
        field: 'downstreamWaterLevel',
        value: endDepth,
        limit: hcHere,
      })
    } else {
      const reverse: WaterProfileStationResult[] = [
        toStation(spec.endStation, endDepth, spec, 0),
      ]
      let failed = false
      for (let k = 1; k <= count; k += 1) {
        const prev = reverse[reverse.length - 1]!
        const target = Math.max(spec.startStation, spec.endStation - k * spec.stationStep)
        const deltaLength = prev.station - target
        if (!(deltaLength > 0)) break
        const solved = solveAdjacentDepth({
          discharge: spec.discharge,
          width: spec.width,
          roughness: spec.roughness,
          bedSlope: spec.bedSlope,
          bedAngleDeg: spec.bedAngleDeg,
          deltaLength,
          knownDepth: prev.depth,
          direction: 'upstream',
          ...(spec.alpha === undefined ? {} : { alpha: spec.alpha }),
          ...(spec.tolerance === undefined ? {} : { tolerance: spec.tolerance }),
        })
        if (!solved.ok) {
          failed = true
          break
        }
        reverse.push(toStation(target, solved.value, spec, deltaLength))
      }
      if (failed) {
        warnings.push({
          level: 'out-of-range',
          code: 'SUBCRITICAL_BRANCH_UNSOLVED',
          message: '缓流分支在向上游推算时无解，仅输出急流分支。请检查下游控制水位与分段步长。',
          field: 'downstreamWaterLevel',
          value: spec.downstreamWaterLevel,
        })
      } else {
        subcritical = reverse.reverse() // 转为桩号升序
      }
    }
  }

  // ── 两分支交叉 → 水跃（Q22-2 = C：不支持，报错提示）─────────
  if (subcritical) {
    const subByStation = new Map(subcritical.map((s) => [s.station, s.depth]))
    for (const s of stations) {
      const d = subByStation.get(s.station)
      if (d !== undefined && s.depth >= d) {
        return {
          ok: false,
          diagnostics: [
            ...warnings,
            {
              level: 'failure',
              code: 'HYDRAULIC_JUMP_DETECTED',
              message:
                `桩号 ${s.station} m 处急流分支水深 ${s.depth.toFixed(3)} m 已达到缓流分支水深 ${d.toFixed(3)} m，` +
                '两分支在此交会，存在急流→缓流过渡（水跃）。本期不支持水跃计算（Q22-2 = C），' +
                '请调整下游控制水位或分段。',
              field: 'station',
              value: s.station,
            },
          ],
        }
      }
    }
  }

  return {
    ok: true,
    value: {
      branches: [
        { branch: 'supercritical', direction: 'downstream', stations },
        ...(subcritical
          ? [{ branch: 'subcritical' as const, direction: 'upstream' as const, stations: subcritical }]
          : []),
      ],
      criticalDepth: criticalDepth(spec.discharge, spec.width),
      criticalSlope: criticalSlope(spec.discharge, spec.width, spec.roughness),
      crossingStation,
      hydraulicJumpDetected,
    },
    diagnostics: warnings,
  }
}
