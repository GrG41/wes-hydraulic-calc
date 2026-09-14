# wes-hydraulic-calc

WES 型实用堰泄流能力与堰流水面线计算程序。技术依据：**SL 253-2018《溢洪道设计规范》**
（水利部官方免费公开版，强制性标准）。

> **当前进度：阶段 0（工程骨架）。**
> `src/core/` 内**尚无任何公式实现** —— 阶段 2 才编写计算逻辑，且须在阶段 1 通过 Gate 之后。

## 开发环境

本项目在 NixOS 上开发，工具链由 `flake.nix` 声明式提供：

```bash
nix develop          # 进入 devShell（Node 22 + pnpm）
pnpm install
pnpm dev             # 开发服务器
pnpm build           # 类型检查 + 构建（含 PWA）
pnpm preview         # 预览构建产物
pnpm test            # 单元测试
pnpm typecheck       # 类型检查（含 core 层零 DOM 校验）
```

## 目录结构

```
src/
  core/      纯计算层：零 UI 依赖、零浏览器 API 依赖，可在 Node 环境直接测试
  ui/        界面
  store/     状态管理
  export/    计算书 / Excel 导出
  pwa/       Service Worker / Manifest 相关配置
docs/        公式对照表、验证报告、决策记录、问卷
tests/       单元 / 算例对比 / E2E 测试
reference/   标准原件与技术文献（版权原因不入库，见 .gitignore）
```

## 约束（对开发者的硬性要求）

1. `src/core/` **禁止**引入 UI、状态管理、浏览器 API。
   由两道机制强制：`tsconfig.core.json` 不含 DOM lib（编译期），
   以及 `tests/unit/core-isolation.test.ts`（测试期）。
2. 每条公式必须在代码注释中标注来源（标准编号 + 附录条款号 + 印张页）。
3. 中间计算禁止提前舍入；格式化只允许出现在展示层。
4. 未获工程师确认的系数与适用条件**不得写入代码**。

完整的项目约束见 `AGENTS.md`；已确认的决策见 `docs/DECISIONS.md`。
