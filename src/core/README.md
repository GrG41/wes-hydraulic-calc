# src/core —— 纯计算层

**本目录是本项目唯一承载工程计算的地方，也是最严格的一层。**

## 硬性约束

1. **零 UI 依赖、零浏览器 API 依赖**，必须可在 Node 环境下直接运行测试。
2. 每条公式必须在代码注释中标注：`标准编号 + 附录条款号 + 印张页`。
3. 中间计算**禁止提前舍入**；格式化只允许出现在展示层。
4. 未获工程师确认的系数与适用条件**不得写入代码**。

## 约束如何被强制执行

| 约束 | 强制手段 |
|---|---|
| 零浏览器 API | `tsconfig.core.json` 的 `lib` 只含 `ES2022`（无 DOM），`types` 为空。出现 `document`/`window`/`fetch` 等即导致 `pnpm typecheck` 失败 |
| 不依赖 UI / 状态层 | `tests/unit/core-isolation.test.ts` 扫描本目录，禁止 import `react`、`ui/`、`store/` 等 |
| 公式可追溯 | 代码评审 + `docs/FORMULAS.md` 三列对照表 |
| 不写未确认取值 | `docs/DECISIONS.md` 为准；未闭环项一律不实现 |

## 规划结构（阶段 2 创建，当前为空）

```
core/
  constants.ts              物理常数与已确认系数（含来源注释）
  types.ts                  输入 / 输出类型定义
  formulas/
    discharge.ts            泄流能力        SL 253-2018 附录 A.2.1
    coefficient.ts          流量系数 m / 侧收缩 ε / 淹没系数 σs
    weirProfile.ts          WES 堰面曲线    SL 253-2018 附录 A.1
    waterProfile.ts         泄槽水面线      SL 253-2018 附录 A.3
  solver/                   迭代求解器（行进流速水头、水面线分段）
  validation/               输入校验与适用范围检查
```

> 阶段 0 交付时本目录**只有本说明与一个占位入口**，没有任何公式实现。
