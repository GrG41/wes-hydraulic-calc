/**
 * src/core 公共入口。
 *
 * 上层（UI / 导出 / 测试）**只应通过本文件**使用核心层；
 * 内部各模块的相对路径不属公共接口，可自由重构。
 */

// ── 类型 ────────────────────────────────────────────────────────
export type {
  AbutmentShape,
  CalcResult,
  CalculationInput,
  ChuteConfig,
  CrestCurveType,
  DesignHeadSpec,
  Diagnostic,
  DiagnosticLevel,
  DischargeIteration,
  DischargeResult,
  FlowRegime,
  OperationCase,
  PierArrangement,
  PierHeadShape,
  SolverOptions,
  SubmergenceSpec,
  UpstreamSection,
  UpstreamSlope,
  WaterProfileBoundary,
  WeirGeometry,
} from './types'

// ── 常数 ────────────────────────────────────────────────────────
export {
  CHUTE_DEFAULT_STATION_STEP,
  GRAVITY,
  HEAD_OVER_SINGLE_WIDTH_LIMIT,
  POWER_CURVE_K_LOW_WEIR_DEFAULT,
  POWER_CURVE_K_LOW_WEIR_MAX,
  POWER_CURVE_K_LOW_WEIR_MIN,
  SOLVER_DEFAULTS,
  UPSTREAM_SECTION_DISTANCE_RATIO,
  VELOCITY_DISTRIBUTION_COEFFICIENT,
} from './constants'

// ── 统一入口 ────────────────────────────────────────────────────
export { calculate, dischargeCurve } from './calculate'
export type { CalculationOutput } from './calculate'

// ── 校验 ────────────────────────────────────────────────────────
export { checkApplicability, preflight, validateInput } from './validation/input'
export type { PreflightResult } from './validation/input'

// ── 泄流能力 ────────────────────────────────────────────────────
export { resolveDesignHead, solveDischarge } from './formulas/discharge'

// ── 系数 ────────────────────────────────────────────────────────
export {
  abutmentShapeFactorZeta0,
  contractionCoefficient,
  dischargeCoefficientM,
  pierShapeFactorZetaK,
  upstreamSlopeFactorC,
} from './formulas/coefficient'
export type { LookupOutcome } from './formulas/coefficient'

// ── 堰面曲线 ────────────────────────────────────────────────────
export {
  buildWeirProfile,
  powerCurveTangentX,
  powerCurveX,
  powerCurveY,
  resolvePowerCurve,
  tableA11Params,
} from './formulas/weirProfile'
export type {
  PowerCurve,
  PowerCurveGeometry,
  TableA11Row,
  WeirProfileGeometryResult,
  WeirProfileSpec,
} from './formulas/weirProfile'

// ── 水面线 ──────────────────────────────────────────────────────
export {
  criticalDepth,
  criticalSlope,
  frictionSlope,
  sectionProperties,
  solveAdjacentDepth,
  solveWaterProfile,
} from './formulas/waterProfile'
export type {
  SectionProperties,
  WaterProfileGeometryResult,
  WaterProfileSpec,
  WaterProfileStationResult,
} from './formulas/waterProfile'
