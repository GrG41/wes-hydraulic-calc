/**
 * 应用外壳 —— 参数输入 + 一键试算 + 计算过程与结果展示 + 曲线绘图 + 计算书导出 + 算例管理。
 *
 * 计算全部在客户端完成，**运行时不访问任何网络**（AGENTS.md §2.7）。
 *
 * ⚠️ **结果时效性**：结果与其计算所用的参数**成对保存**。参数一经修改，
 * 已显示的结果即被标记为「已过期」——避免工程师用改后的参数去读改前的结果
 * （对工程计算工具而言，这是必须堵住的误用路径）。
 */

import { lazy, Suspense, useCallback, useState } from 'react'
import { calculate } from '../core'
import type { CalcResult, CalculationInput, CalculationOutput } from '../core'
import { useParameterStore } from '../store/parameterStore'
import ParameterForm from './ParameterForm'
import ResultPanel from './ResultPanel'
import CasePanel from './CasePanel'
import OfflineStatus from './OfflineStatus'

/**
 * 图表按需加载。
 *
 * ECharts 体积较大（约 570 kB 未压缩），不必进入首屏包；
 * 它仍会被 PWA 预缓存，故**断网后功能依然完整**（AGENTS.md §2.7）。
 */
const ChartsPanel = lazy(() => import('./ChartsPanel'))

/** 结果与其计算所用参数的快照，二者必须成对使用。 */
interface Computed {
  readonly input: CalculationInput
  readonly result: CalcResult<CalculationOutput>
}

export default function App() {
  const input = useParameterStore((s) => s.input)
  const reset = useParameterStore((s) => s.reset)
  const [computed, setComputed] = useState<Computed | null>(null)

  /** 参数被修改后，已有结果即过期（store 每次 patch 都产生新对象，引用比较即可判定）。 */
  const stale = computed !== null && computed.input !== input

  /** 一键试算。参数保留在 store 中，改完可直接再次计算。 */
  const run = useCallback(() => {
    setComputed({ input, result: calculate(input) })
  }, [input])

  const result = computed?.result ?? null

  return (
    <main className="shell">
      <header className="shell__header">
        <p className="shell__eyebrow">SL 253-2018《溢洪道设计规范》</p>
        <h1 className="shell__title">WES 型实用堰泄流能力与堰流水面线计算程序</h1>
        <p className="shell__badge">阶段 4 · 参数输入 / 计算过程 / 曲线 / 计算书 / 算例</p>
      </header>

      <div className="toolbar">
        <button
          type="button"
          className={stale ? 'btn btn--primary btn--alert' : 'btn btn--primary'}
          onClick={run}
        >
          {stale ? '参数已改，重新计算' : '计算'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={computed === null}
          onClick={() => {
            if (computed === null) return
            const snapshot = computed
            void import('../export/excel').then(({ exportCalculationExcel }) =>
              exportCalculationExcel(snapshot.input, snapshot.result),
            )
          }}
        >
          导出计算书（Excel）
        </button>
        <button
          type="button"
          className="btn"
          disabled={result === null || !result.ok}
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
            setComputed(null)
          }}
        >
          恢复示例参数
        </button>
      </div>

      <div className="layout">
        <div className="layout__form">
          <ParameterForm />
          <CasePanel />
        </div>
        <div className="layout__result">
          {computed === null || result === null ? (
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
              {stale ? (
                <div className="stale-banner" role="alert">
                  <strong>⚠️ 参数已修改，以下结果对应的是修改前的参数，已经过期。</strong>
                  <span>
                    请点「参数已改，重新计算」后再读取结果或导出计算书。过期的结果不得用于设计。
                  </span>
                </div>
              ) : null}
              <div className={stale ? 'result-veil' : undefined}>
                <ResultPanel result={result} />
                {result.ok ? (
                  <Suspense
                    fallback={
                      <section className="charts">
                        <p className="results__note">正在加载图表组件…</p>
                      </section>
                    }
                  >
                    <ChartsPanel input={computed.input} output={result.value} />
                  </Suspense>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>

      <footer className="shell__footer">
        <OfflineStatus />
        <p>
          <a href={`${import.meta.env.BASE_URL}verification.html`}>验收摘要</a>
          ：这一版验过什么、哪些没有验、以及可以自己执行的复核步骤。
        </p>
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
