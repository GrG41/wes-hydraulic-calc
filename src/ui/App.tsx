/**
 * 应用外壳（阶段 0）。
 *
 * 本文件不包含任何计算逻辑。泄流能力与水面线计算模块将在**阶段 2** 实现，
 * 且须在**阶段 1** 的算法设计与类型定义通过工程师书面确认（Gate）之后。
 */

const CONFIRMED = [
  'SL 253-2018 官方原件已取得并通过完整性校验（195 页）',
  '附录 A 全部公式、系数表与适用范围已逐页核对，并经工程师逐条确认',
  '技术依据：仅 SL 253-2018（方案③）；补充依据改用 NB/T 10867—2021',
  '水面线方程按标准 A.3.1 实现（i − J̄，α = 1.05，不设独立局部损失项）',
]

const PENDING = [
  '阶段 1：FORMULAS.md 完整版、算法设计说明、输入输出类型定义',
  '阶段 2：src/core 公式实现、迭代求解器、输入校验',
  '阶段 3～5：数值精度专项验证、UI 与计算书、确认测试',
]

export default function App() {
  return (
    <main className="shell">
      <header className="shell__header">
        <p className="shell__eyebrow">SL 253-2018《溢洪道设计规范》</p>
        <h1 className="shell__title">
          WES 型实用堰泄流能力与堰流水面线计算程序
        </h1>
        <p className="shell__badge">阶段 0 · 工程骨架</p>
      </header>

      <section className="notice notice--warn" role="status">
        <strong>当前版本不提供任何计算功能。</strong>
        计算模块尚未编写 —— 按项目约定，计算逻辑须在阶段 1 通过 Gate 后于阶段 2 实现。
      </section>

      <div className="columns">
        <section className="card">
          <h2>已完成</h2>
          <ul>
            {CONFIRMED.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2>待办</h2>
          <ul>
            {PENDING.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>

      <footer className="shell__footer">
        <p>
          本程序为完全离线计算工具，运行时不访问任何网络。
          技术依据与取值来源见 <code>docs/FORMULAS.md</code>，决策记录见{' '}
          <code>docs/DECISIONS.md</code>。
        </p>
      </footer>
    </main>
  )
}
