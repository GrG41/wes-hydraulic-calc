/**
 * 应用外壳 —— 参数输入 + 一键试算 + 计算过程与结果展示 + 曲线绘图 + 计算书导出。
 *
 * 计算全部在客户端完成，**运行时不访问任何网络**（AGENTS.md §2.7）。
 * 算例保存/加载为后续增量。
 */

import { lazy, Suspense, useCallback, useState } from 'react'
import { calculate } from '../core'
import type { CalcResult, CalculationOutput } from '../core'
import { useParameterStore } from '../store/parameterStore'
import ParameterForm from './ParameterForm'
import ResultPanel from './ResultPanel'

/**
 * 图表与计算书导出按需加载。
 *
 * ECharts 与 SheetJS 体积较大（合计约 900 kB 未压缩），不必进入首屏包；
 * 二者仍会被 PWA 预缓存，故**断网后功能依然完整**（AGENTS.md §2.7）。
 */
const ChartsPanel = lazy(() => import('./ChartsPanel'))

export default function App() {
  const input = useParameterStore((s) => s.input)
  const reset = useParameterStore((s) => s.reset)
  const [result, setResult] = useState<CalcResult<CalculationOutput> | null>(null)

  /** 一键试算。参数保留在 store 中，改完可直接再次计算。 */
  const run = useCallback(() => {
    setResult(calculate(input))
  }, [input])

  return (
    <main className="shell">
      <header className="shell__header">
        <p className="shell__eyebrow">SL 253-2018《溢洪道设计规范》</p>
        <h1 className="shell__title">WES 型实用堰泄流能力与堰流水面线计算程序</h1>
        <p className="shell__badge">阶段 4 · 参数输入 / 计算过程 / 曲线 / 计算书导出</p>
      </header>

      <div className="toolbar">
        <button type="button" className="btn btn--primary" onClick={run}>
          计算
        </button>
        <button
          type="button"
          className="btn"
          disabled={result === null}
          onClick={() => {
            if (result === null) return
            const snapshot = result
            void import('../export/excel').then(({ exportCalculationExcel }) =>
              exportCalculationExcel(input, snapshot),
            )
          }}
        >
          导出计算书（Excel）
        </button>
        <button
          type="button"
          className="btn"
          disabled={result === null}
          onClick={() => {
            if (result === null || !result.ok) return
            const output = result.value
            void import('../export/excel').then(({ exportCsv }) =>
              exportCsv(
                [
                  ['桩号 (m)', '水深 (m)', '流速 (m/s)', '水力半径 (m)', 'Fr', '流态'],
                  ...output.waterProfile.branches.flatMap((b) =>
                    b.stations.map((s) => [
                      s.station,
                      s.depth,
                      s.velocity,
                      s.hydraulicRadius,
                      s.froude,
                      s.regime,
                    ]),
                  ),
                ],
                'WES水面线.csv',
              ),
            )
          }}
        >
          导出水面线（CSV）
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            reset()
            setResult(null)
          }}
        >
          恢复示例参数
        </button>
        <span className="toolbar__note">
          参数保留在页面中，可直接修改后再次计算（一键试算）
        </span>
      </div>

      <div className="layout">
        <div className="layout__form">
          <ParameterForm />
        </div>
        <div className="layout__result">
          {result === null ? (
            <section className="results">
              <h2 className="results__title">尚未计算</h2>
              <p className="results__note">
                左侧为参数表，每个字段均标注单位；凡标准给定适用范围的字段附有范围提示。
                填好后点击「计算」。
              </p>
              <p className="results__note">
                <strong>注意</strong>：淹没工况下 σs 需按标准图 A.2.1-3 人工查图输入；
                程序不自动取该值，也不对其准确性负责。
              </p>
            </section>
          ) : (
            <>
              <ResultPanel result={result} />
              {result.ok ? (
                <Suspense
                  fallback={
                    <section className="charts">
                      <p className="results__note">正在加载图表组件…</p>
                    </section>
                  }
                >
                  <ChartsPanel input={input} output={result.value} />
                </Suspense>
              ) : null}
            </>
          )}
        </div>
      </div>

      <footer className="shell__footer">
        <p>
          计算全部在本地完成，不联网。公式与取值来源见 <code>docs/FORMULAS.md</code>，
          决策记录见 <code>docs/DECISIONS.md</code>。
        </p>
        <p className="shell__warn">
          本版本<strong>未经独立数据验证（Validation）</strong>，结果正确性无外部证据支撑，
          使用者应自行安排独立校核。详见 <code>docs/VALIDATION.md</code>。
        </p>
      </footer>
    </main>
  )
}
