/**
 * src/core —— 纯计算层入口。
 *
 * 阶段 0 时本文件为占位，**不包含任何计算逻辑**。
 *
 * 硬性约束（见 AGENTS.md 与 tsconfig.core.json）：
 *   · 零 UI 依赖、零浏览器 API 依赖，可在 Node 环境直接运行测试；
 *   · 每条公式实现必须标注来源（标准编号 + 附录条款号 + 印张页）；
 *   · 中间计算禁止提前舍入，格式化只允许出现在展示层。
 *
 * 计划结构（阶段 2 建立，此处仅作规划，尚未创建）：
 *   formulas/discharge.ts     泄流能力      SL 253-2018 附录 A.2.1
 *   formulas/coefficient.ts   流量系数 m、侧收缩 ε、淹没系数 σs
 *   formulas/weirProfile.ts   WES 堰面曲线  SL 253-2018 附录 A.1
 *   formulas/waterProfile.ts  泄槽水面线    SL 253-2018 附录 A.3
 *   solver/                   迭代求解器（行进流速水头、水面线分段）
 *   validation/               输入校验与适用范围检查
 *   constants.ts              物理常数与已确认系数（含来源注释）
 *   types.ts                  输入 / 输出类型定义
 */

export {}
