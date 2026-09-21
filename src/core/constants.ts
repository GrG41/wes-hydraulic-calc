/**
 * 物理常数与标准给定常数。
 *
 * 每一项都必须标注来源；**不得出现无来源的数值**。
 * 来源格式：标准编号 + 附录条款/表号 + 印张页，或决策编号。
 */

/**
 * 重力加速度 g，m/s²。
 *
 * SL 253-2018 中 g 仅作为符号出现，**未给出数值**。
 * 取值 9.81 由工程师确认（`DECISIONS.md` DEC-016，问卷 WES-Q-003 Q12）。
 */
export const GRAVITY = 9.81

/**
 * 流速分布不均匀系数 α₁ = α₂。
 *
 * 来源：SL 253-2018 附录 A.3.1，印张页 53 —— 标准明文"取 1.05"（定值，非自由参数）。
 */
export const VELOCITY_DISTRIBUTION_COEFFICIENT = 1.05

/**
 * 上游计算断面至堰顶上游面的距离与堰上水头之比（取"堰前 3H 处"）。
 *
 * 来源：工程师确认（`DECISIONS.md` DEC-017，问卷 WES-Q-003 Q19-1）。
 * 标准 A.2.1-3 只给出 H₀ = H + v²/(2g)，未规定 v 的量取断面。
 */
export const UPSTREAM_SECTION_DISTANCE_RATIO = 3

/**
 * 幂曲线系数 k 在 `P₁/H_d ≤ 1.0` 时的默认值。
 *
 * 来源：SL 253-2018 附录 A.1.1，印张页 41 —— 标准给出**区间 2.0~2.2** 而未给定值；
 * 取区间中值由 `DECISIONS.md` DEC-019 A-6 决定。
 * ⚠️ 这是本设计中**唯一取自标准给定区间的系数取值**，界面允许覆盖。
 */
export const POWER_CURVE_K_LOW_WEIR_DEFAULT = 2.1

/** `P₁/H_d ≤ 1.0` 时 k 的允许下界（标准 A.1.1 印张页 41）。 */
export const POWER_CURVE_K_LOW_WEIR_MIN = 2.0

/** `P₁/H_d ≤ 1.0` 时 k 的允许上界（标准 A.1.1 印张页 41）。 */
export const POWER_CURVE_K_LOW_WEIR_MAX = 2.2

/**
 * 侧收缩系数公式中 `H₀/b` 的钳制上限。
 *
 * 来源：SL 253-2018 附录 A.2.1，印张页 46 —— 标准明文"公式（A.2.1-2）适用于
 * H₀/b ≤ 1.0，当 H₀/b > 1.0 时，H₀/b 仍取值 1.0"。
 * 这是**标准规定的处理**，故钳制时不产生告警，但实际采用的比值须记入中间量。
 */
export const HEAD_OVER_SINGLE_WIDTH_LIMIT = 1.0

/**
 * 求解器默认参数。
 *
 * 来源：工程师确认（`DECISIONS.md` DEC-017 / DEC-019 A-3）
 *  - maxIterations 50：问卷 WES-Q-003 Q18-2
 *  - relativeTolerance 1e-6 相对残差，对 Q 与 H₀ 分别判定：Q5 = A
 *  - epsilonFloor 1e-12：防止除零（DEC-019 A-3）
 */
export const SOLVER_DEFAULTS = {
  maxIterations: 50,
  relativeTolerance: 1e-6,
  epsilonFloor: 1e-12,
} as const

/**
 * 泄槽分段默认步长，m。
 *
 * 来源：工程师确认（`DECISIONS.md` DEC-017，问卷 WES-Q-003 Q20-2），允许界面覆盖。
 */
export const CHUTE_DEFAULT_STATION_STEP = 5
