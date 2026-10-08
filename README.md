# wes-hydraulic-calc

WES 型实用堰泄流能力与堰流水面线计算程序。技术依据：**SL 253-2018《溢洪道设计规范》**
（水利部官方免费公开版，强制性标准）。

**在线演示（供复核）：<https://grg41.github.io/wes-hydraulic-calc/>**

同一站点另有**验收摘要**页：<https://grg41.github.io/wes-hydraulic-calc/verification.html>
——这一版验过什么、哪些**没有**验、以及可以自己执行的复核步骤。部署方式见 [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)。

> ⚠️ **本程序不执行独立数据 Validation**（依 DEC-009）：计算结果的正确性**没有外部证据支撑**，
> 仅完成内部一致性验证（Verification）。用于设计、复核或审查前，请自行安排独立校核。
> 详见 [`docs/VALIDATION.md`](docs/VALIDATION.md) 与 [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md)。

## 当前进度

阶段 6 的自动化部分已完成，结论为**可交付内部试用**；跨浏览器（Firefox / Safari）、
跨平台（Windows / macOS / 移动端）与解析解算例集**尚未完成**：

| 项 | 状态 | 命令 |
|---|---|---|
| 类型检查（含 core 层零 DOM 约束） | ✅ 通过 | `pnpm typecheck` |
| 单元与验证测试 | ✅ 全部通过 | `pnpm test` |
| PWA 静态验收 | ✅ 全部通过 | `pnpm verify:pwa` |
| 浏览器端到端验收（真实 Chromium，含断网） | ✅ 全部通过 | `pnpm acceptance` |
| Firefox / Safari | ❌ **未执行** | — |
| Windows / macOS / Android / iOS | ❌ **未执行** | — |
| 解析解算例集（误差 < 0.02%） | ⏳ **未完成** | — |
| 独立数据 Validation | — **按 DEC-009 不执行** | — |

上表只写"通过／未执行"，**不写手抄的项数**——现取的数字在站点
[验收摘要页](https://grg41.github.io/wes-hydraulic-calc/verification.html)（每次构建实测生成）
与 [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md)（验收当时的记录）里。

## 开发环境

本项目在 NixOS 上开发，工具链由 `flake.nix` 声明式提供：

```bash
nix develop          # 进入 devShell（Node 22 + pnpm）
pnpm install
pnpm dev             # 开发服务器（只服务本机；不对局域网开放）
pnpm build           # 类型检查 + 生成验收摘要页 + 构建（含 PWA）
pnpm test            # 单元测试
pnpm typecheck       # 类型检查（含 core 层零 DOM 校验）
pnpm verify          # 构建 + PWA 静态验收（12 项，不需要服务器）
pnpm acceptance      # 真实浏览器端到端验收**已发布的站点**（需 Chromium 在 PATH 或 CHROMIUM_BIN）
pnpm deploy:pages    # 构建 → 静态验收 → 发布到 GitHub Pages → 线上验收（不过则自动回滚）
```

> **发布与验收都走 GitHub Pages**（2026-10-08 起）。本地不再起对外服务、不开固定端口：
> `pnpm acceptance` 验的是**线上那一份**（地址由 `origin` 推导，也可 `--url=` 指定），
> 本地 `dist/` 由 `pnpm verify` 静态检查。流程与取舍见 [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)。

## 目录结构

```
src/
  core/      纯计算层：零 UI 依赖、零浏览器 API 依赖，可在 Node 环境直接测试
  ui/        界面
  store/     状态管理
  export/    计算书 / Excel 导出
  pwa/       Service Worker / Manifest 相关配置
docs/        公式对照表、验证报告、验收报告、决策记录、问卷、部署说明
tests/       单元 / 算例对比 / E2E 测试
scripts/     构建期的验收脚本与部署脚本
reference/   标准原件与技术文献（版权原因不入库，见 .gitignore）
```

## 文档

| 文件 | 内容 |
|---|---|
| [`AGENTS.md`](AGENTS.md) | 委托方下发的**执行基线原文**（v1.0）。见下方说明 |
| [`docs/FORMULAS.md`](docs/FORMULAS.md) | 公式—条款—算例对照表 |
| [`docs/ALGORITHM.md`](docs/ALGORITHM.md) | 算法设计说明 |
| [`docs/VALIDATION.md`](docs/VALIDATION.md) | 验证报告（含"不执行独立数据 Validation"的声明） |
| [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md) | 验收报告（已验项 / 未验项 / 已知边界） |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | 关键决策记录（工程师确认的取值与范围） |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | 演示站的部署方式与验收流程 |

> **关于 `AGENTS.md`**：本文件是委托方随项目下发的原文（v1.0），恢复自开发期会话转录、
> 未改动一字（其表格为文本下发的空格分隔格式，保持原样）。
> 依 DEC-012 之 Q6 = C，**该文件保持原文不动**；此后经工程师确认的 10 处修订留档于
> [`docs/DECISIONS.md`](docs/DECISIONS.md) 的 DEC-009 附录 A。
> 两者冲突时，**以实现依据「标准原文 + 工程师已确认的取值」为准**（DEC-012）。

## 约束（对开发者的硬性要求）

1. `src/core/` **禁止**引入 UI、状态管理、浏览器 API。
   由两道机制强制：`tsconfig.core.json` 不含 DOM lib（编译期），
   以及 `tests/unit/core-isolation.test.ts`（测试期）。
2. 每条公式必须在代码注释中标注来源（标准编号 + 附录条款号 + 印张页）。
3. 中间计算禁止提前舍入；格式化只允许出现在展示层。
4. 未获工程师确认的系数与适用条件**不得写入代码**。

完整的项目约束见 `AGENTS.md`；已确认的决策见 `docs/DECISIONS.md`。
