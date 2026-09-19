/**
 * src/core/types.ts —— 全部输入 / 输出类型定义
 *
 * 阶段 1 交付物。依据：
 *   · docs/FORMULAS.md   公式、系数表与适用范围
 *   · docs/ALGORITHM.md  算法设计与待 Gate 确认项
 *   · docs/DECISIONS.md  工程师已确认的决策（DEC-012 ~ DEC-018）
 *
 * 约定：
 *   1. 所有物理量在类型注释中标注单位；内部计算统一采用 SI（m、s、m³/s）。
 *   2. 本文件**不含任何计算逻辑**，仅为类型声明。
 *   3. 计算失败不抛异常，统一以 CalcResult 表达（AGENTS.md §2.8）。
 */

// ═══════════════════════════════════════════════════════════════════
//  枚举
// ═══════════════════════════════════════════════════════════════════

/**
 * 上游堰面坡度 Δy/Δx。
 * 工程师确认（Q4）：仅支持标准表 A.1.1 与表 A.2.1-2 覆盖的 4 种。
 */
export type UpstreamSlope = '3:0' | '3:1' | '3:2' | '3:3'

/** 上游堰头曲线型式（SL 253-2018 附录 A.1.2）。 */
export type CrestCurveType = 'double-arc' | 'triple-arc' | 'ellipse'

/** 中墩墩头形状（表 A.2.1-3）。 */
export type PierHeadShape = 'rectangular' | 'wedge-or-semicircular' | 'pointed'

/** 边墩形状（标准 A.2.1）：决定边墩形状系数 ζ₀。 */
export type AbutmentShape =
  | 'rectangular' // ζ₀ = 1.0
  | 'broken-line-or-circular' // ζ₀ = 0.7
  | 'streamlined' // ζ₀ = 0.4

/** 流态（按弗劳德数判别）。 */
export type FlowRegime = 'subcritical' | 'critical' | 'supercritical'

/** 诊断级别：严格区分输入错误 / 超范围警告 / 计算失败（AGENTS.md §8.3）。 */
export type DiagnosticLevel =
  /** 输入错误：缺参数、单位或格式错误 —— 拒绝计算 */
  | 'input-error'
  /** 超范围警告：参数超出公式或图表适用范围 —— 继续计算并显著提示 */
  | 'out-of-range'
  /** 计算失败：迭代不收敛、推进中断、遇水跃 —— 停止且不输出不可靠结果 */
  | 'failure'

/** 诊断信息。 */
export interface Diagnostic {
  readonly level: DiagnosticLevel
  /** 稳定的机器可读码，便于测试断言与界面分支（如 'SIGMA_S_OUT_OF_RANGE'）。 */
  readonly code: string
  /** 面向工程师的中文说明。 */
  readonly message: string
  /** 涉及的字段路径（如 'weir.p1OverHd'）。 */
  readonly field?: string
  /** 相关数值，供计算书展示。 */
  readonly value?: number
  /** 判定所依据的限值。 */
  readonly limit?: number
}

/**
 * 计算结果。成功携带数值与诊断；失败仅携带诊断。
 * 核心层不得抛出未捕获异常。
 */
export type CalcResult<T> =
  | { readonly ok: true; readonly value: T; readonly diagnostics: readonly Diagnostic[] }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] }

// ═══════════════════════════════════════════════════════════════════
//  输入
// ═══════════════════════════════════════════════════════════════════

/** 堰体几何与墩体布置。 */
export interface WeirGeometry {
  /** 堰顶高程，m */
  readonly crestElevation: number
  /** 上游堰高 P₁（堰顶高程 − 上游堰底高程），m。用于 P₁/H_d 与高低堰判定 */
  readonly upstreamHeightP1: number
  /** 上游堰面坡度 Δy/Δx */
  readonly upstreamSlope: UpstreamSlope
  /**
   * 幂曲线系数 k 在 [2.0, 2.2] 区间内的覆盖值。
   *
   * 仅当 P₁/H_d ≤ 1.0 时生效（标准 A.1.1 给出区间而非定值）。
   * 未提供时取中值 **2.1**（DEC-019 A-6）。取值须在 [2.0, 2.2] 内，否则报输入错误。
   * ⚠️ 这是本设计中唯一取自标准给定区间的系数取值，计算书须标注实际取值与出处。
   */
  readonly powerCurveKOverride?: number
  /** 上游堰头曲线型式 */
  readonly crestCurveType: CrestCurveType
  /** 溢流堰总净宽 B，m（多孔时为各孔净宽之和，标准 A.2.1 符号定义） */
  readonly netWidthB: number
  /** 单孔宽度 b，m */
  readonly singleOpeningWidthB: number
  /** 闸孔数目 n */
  readonly openingCount: number
}

/** 闸墩布置（用于侧收缩系数 ε）。 */
export interface PierArrangement {
  /** 中墩墩头形状 */
  readonly pierHeadShape: PierHeadShape
  /** 闸墩头伸出上游堰面距离 Lk，m（表 A.2.1-3 用） */
  readonly pierHeadExtensionLk: number
  /** 尖墩高度 Hs，m（表 A.2.1-3 中 Lk = Hs、Lk = 0.5Hs 两档的基准） */
  readonly pierHeadHeightHs: number
  /** 边墩形状 */
  readonly abutmentShape: AbutmentShape
}

/**
 * 上游计算断面（行进流速水头的量取断面）。
 * 工程师确认（Q19-1 = A，DEC-017）：取堰前 3H 处，面积按实际几何计算，不计墩体占位。
 */
export interface UpstreamSection {
  /** 计算断面至堰顶上游面的距离与堰上水头之比，默认 3（= 3H） */
  readonly distanceOverHeadRatio: number
  /** 断面底高程，m */
  readonly bedElevation: number
  /**
   * 断面形状。'rectangular' 用宽度；'trapezoidal' 用底宽 + 边坡系数。
   * 面积算法（DEC-019 A-4）：矩形 `A = b·h`；对称梯形 `A = (b + m·h)·h`。
   * **复式断面不在本期范围**，界面提示使用者按等效梯形输入。
   */
  readonly shape:
    | { readonly kind: 'rectangular'; readonly bottomWidth: number }
    | {
        readonly kind: 'trapezoidal'
        readonly bottomWidth: number
        /** 边坡系数 m（水平:垂直），两侧相同 */
        readonly sideSlope: number
      }
}

/** 定型设计水头 H_d 的给定方式（标准 A.1.1）。 */
export type DesignHeadSpec =
  /** 直接给 H_d，m */
  | { readonly kind: 'direct'; readonly value: number }
  /** 由校核流量下的堰上水头 H_max 按高/低堰规则推求，m */
  | { readonly kind: 'from-max-head'; readonly maxHead: number }

/** 运行水位工况。 */
export interface OperationCase {
  /** 堰上水头 H（堰顶以上水深），m。主公式中 H₀ = H + v²/(2g) */
  readonly headOverCrest: number
  /** 下游水位，m。用于淹没度 hs/H₀ */
  readonly downstreamWaterLevel: number
}

/** 泄槽几何与水力参数（附录 A.3）。 */
export interface ChuteConfig {
  /** 泄槽底坡 i（= sinθ）；θ 较小时 i ≈ tanθ */
  readonly bedSlope: number
  /** 泄槽底坡角度 θ，(°) —— 用于公式 F-5 的 cosθ 项 */
  readonly bedAngleDeg: number
  /**
   * 槽身糙率 n（表 A.8）。
   * 表 A.8 给出的是**区间**，故由使用者输入具体值，界面以该区间作提示与校验范围（DEC-019 A-8）。
   */
  readonly roughness: number
  /** 泄槽断面宽度，m */
  readonly width: number
  /** 起点桩号，m */
  readonly startStation: number
  /** 终点桩号，m */
  readonly endStation: number
  /** 是否使用自适应分段（当前固定为按桩号分段，Q20-1 = A） */
  readonly segmentation: 'station'
  /** 分段步长，m。默认 5 m，允许界面覆盖（Q20-2） */
  readonly stationStep: number
  /** 若给定具体桩号序列则优先使用；否则按 stationStep 等间距生成 */
  readonly explicitStations?: readonly number[]
}

/** 水面线上下游边界（工程师确认 Q21，DEC-017）。 */
export interface WaterProfileBoundary {
  /** 上游端断面取堰面曲线终点（Q21-1 = A） */
  readonly upstream: 'weir-profile-end'
  /** 上游端起始水深由上游堰面曲线推求（Q21-2 = B） */
  readonly upstreamDepth: 'from-weir-profile'
  /**
   * 下游端控制（Q21-3 = C）：缓流与急流两者都算，按流态自动判断。
   * 缓流分支自下游向上游推进，需要下游控制水位。
   */
  readonly downstreamControl: 'both-by-regime'
  /** 缓流分支的下游控制水位，m（待 Gate 确认输入方式，ALGORITHM.md §9 A-9） */
  readonly downstreamWaterLevel: number
  /** 是否同时输出缓流与急流两条水面线（Q21-4 = 需要） */
  readonly outputBothBranches: true
}

/** 求解器控制参数（工程师确认 Q18、Q5，DEC-017）。 */
export interface SolverOptions {
  /** 最大迭代次数，默认 50（Q18-2） */
  readonly maxIterations: number
  /** 相对残差收敛容差，默认 1e-6（Q5 = A：相对残差，对 Q 与 H₀ 分别判定） */
  readonly relativeTolerance: number
  /** 防止除零的极小正数（待 Gate 确认，ALGORITHM.md §9 A-3） */
  readonly epsilonFloor: number
  /** 不收敛时的行为：报错停止（Q18-3 = A） */
  readonly onNonConvergence: 'fail'
}

/** 计算总输入。 */
export interface CalculationInput {
  readonly weir: WeirGeometry
  readonly piers: PierArrangement
  readonly upstreamSection: UpstreamSection
  readonly designHead: DesignHeadSpec
  readonly operation: OperationCase
  readonly chute: ChuteConfig
  readonly boundary: WaterProfileBoundary
  readonly solver: SolverOptions
}

// ═══════════════════════════════════════════════════════════════════
//  中间过程（供计算书与错误检查，AGENTS.md §2.5）
// ═══════════════════════════════════════════════════════════════════

/** 一次迭代的完整中间量记录。 */
export interface DischargeIteration {
  /** 迭代序号，从 1 开始 */
  readonly index: number
  /** 堰上总水头 H₀，m */
  readonly totalHeadH0: number
  /** 行近流速 v，m/s */
  readonly approachVelocity: number
  /** 上游计算断面过水面积 A，m² */
  readonly upstreamArea: number
  /** 流量系数 m（表 A.2.1-1） */
  readonly dischargeCoefficientM: number
  /** 上游堰坡影响修正系数 c（铅直为 1.0，倾斜查表 A.2.1-2） */
  readonly upstreamSlopeFactorC: number
  /** 闸墩侧收缩系数 ε */
  readonly lateralContractionEpsilon: number
  /** 淹没系数 σs（数字化图 A.2.1-3） */
  readonly submergenceFactorSigmaS: number
  /** 本次迭代求得的流量 Q，m³/s */
  readonly dischargeQ: number
  /** H₀ 的相对残差 */
  readonly headResidual: number
  /** Q 的相对残差 */
  readonly dischargeResidual: number
}

/** 泄流能力计算结果与过程。 */
export interface DischargeResult {
  /** 流量 Q，m³/s */
  readonly dischargeQ: number
  /** 堰上总水头 H₀，m */
  readonly totalHeadH0: number
  /** 行近流速水头 v²/(2g)，m */
  readonly approachVelocityHead: number
  /** 各系数终值 */
  readonly coefficients: {
    readonly m: number
    readonly c: number
    readonly epsilon: number
    readonly sigmaS: number
    readonly zetaK: number
    readonly zeta0: number
  }
  /** 中间量 */
  readonly intermediate: {
    /** 上游计算断面过水面积 A，m² */
    readonly upstreamArea: number
    /** 行近流速 v，m/s */
    readonly approachVelocity: number
    /** H₀/b（已按标准钳制到 ≤ 1.0） */
    readonly headOverSingleWidth: number
    /** H₀/H_d，表 A.2.1-1 行变量 */
    readonly headRatioH0OverHd: number
    /** P₁/H_d，表 A.2.1-1 列变量 */
    readonly pierHeightRatioP1OverHd: number
    /** 淹没度 hs/H₀，图 A.2.1-3 纵轴变量 */
    readonly submergenceRatioHsOverH0: number
    /** 定型设计水头 H_d，m */
    readonly designHeadHd: number
    /** 是否按高堰规则确定 H_d */
    readonly isHighWeir: boolean
  }
  /** 迭代全过程（每一步的中间值与残差） */
  readonly iterations: readonly DischargeIteration[]
  /** 迭代次数 */
  readonly iterationCount: number
  /** 收敛容差（回显，供计算书） */
  readonly tolerance: number
}

// ═══════════════════════════════════════════════════════════════════
//  堰面曲线
// ═══════════════════════════════════════════════════════════════════

/** 堰面曲线上的一个点。 */
export interface ProfilePoint {
  /** 以堰顶为原点的水平坐标 x，m */
  readonly x: number
  /** 以堰顶为原点的竖向坐标 y，m（向下为正） */
  readonly y: number
  /** 所属分段 */
  readonly segment: 'crest-upstream' | 'power-curve' | 'straight' | 'reverse-arc'
}

/** 堰面曲线几何结果。 */
export interface WeirProfileResult {
  /** 定型设计水头 H_d，m */
  readonly designHeadHd: number
  /**
   * 幂曲线参数 k。
   * `P₁/H_d > 1.0` 时查表 A.1.1；`P₁/H_d ≤ 1.0` 时取 2.0~2.2，默认中值 2.1（DEC-019 A-6）。
   */
  readonly k: number
  /** 幂曲线指数 n（表 A.1.1） */
  readonly n: number
  /** 上游堰头曲线参数 R₁、R₂、R₃、a、b（表 A.1.1），m */
  readonly crestParams: {
    readonly r1?: number
    readonly r2?: number
    readonly r3?: number
    readonly a?: number
    readonly b?: number
  }
  /** 离散点（供绘图与水面线起算） */
  readonly points: readonly ProfilePoint[]
  /** 下游堰面终点（与泄槽衔接处）—— 水面线上游端起始断面 */
  readonly downstreamEnd: ProfilePoint
}

// ═══════════════════════════════════════════════════════════════════
//  水面线
// ═══════════════════════════════════════════════════════════════════

/** 水面线一个断面的结果。 */
export interface WaterProfileStation {
  /** 桩号，m */
  readonly station: number
  /** 水深 h，m */
  readonly depth: number
  /** 断面平均流速 v，m/s */
  readonly velocity: number
  /** 过水面积 A_s，m² */
  readonly area: number
  /** 水力半径 R，m */
  readonly hydraulicRadius: number
  /** 弗劳德数 Fr */
  readonly froude: number
  /** 流态 */
  readonly regime: FlowRegime
  /** 该分段平均摩阻坡降 J̄（公式 F-6） */
  readonly frictionSlope?: number
  /** 该分段长度 Δl（公式 F-5） */
  readonly segmentLength?: number
}

/** 一条水面线分支。 */
export interface WaterProfileBranch {
  /** 分支类型 */
  readonly branch: 'supercritical' | 'subcritical'
  /** 推进方向 */
  readonly direction: 'downstream' | 'upstream'
  /** 各断面结果（按桩号排序） */
  readonly stations: readonly WaterProfileStation[]
}

/** 水面线推算结果。 */
export interface WaterProfileResult {
  /** 同时输出两条分支（Q21-4 = 需要） */
  readonly branches: readonly WaterProfileBranch[]
  /** 临界水深，m（按各断面水深-流量关系求得的代表值或沿程序列） */
  readonly criticalDepth: number
  /** 临界坡 */
  readonly criticalSlope: number
  /** 两分支交会位置（桩号，m）；无交会则为 null */
  readonly crossingStation: number | null
  /** 是否检测到急流→缓流过渡（水跃），Q22-2 = C：不支持，报错提示 */
  readonly hydraulicJumpDetected: boolean
}

// ═══════════════════════════════════════════════════════════════════
//  总输出
// ═══════════════════════════════════════════════════════════════════

/** 完整计算结果（成功时）。 */
export interface CalculationOutput {
  readonly discharge: DischargeResult
  readonly profile: WeirProfileResult
  readonly waterProfile: WaterProfileResult
  /** 输入回显（含单位），供计算书输出 */
  readonly inputEcho: CalculationInput
  /** 全部诊断（输入错误 / 超范围警告 / 计算失败） */
  readonly diagnostics: readonly Diagnostic[]
}
