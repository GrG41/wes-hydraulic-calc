/**
 * 计算结果展示。
 *
 * 要求（AGENTS.md §6 阶段 4、§8.1）：
 *   · 结果数值
 *   · **计算过程**：系数取值及来源、中间变量、**迭代过程（每次的中间值与残差）**
 *   · 适用范围检查结论（诊断三分类）
 */

import type { CalcResult } from '../core'
import type { CalculationOutput } from '../core'

/** 展示层格式化 —— 位数由工程师确认（DEC-016 Q14）。 */
const fmt = (v: number | undefined, digits: number): string =>
  v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(digits)

const pct = (v: number | undefined): string =>
  v === undefined || !Number.isFinite(v) ? '—' : `${(v * 100).toExponential(3)} %`

const LEVEL_LABEL: Record<string, string> = {
  'input-error': '输入错误',
  'out-of-range': '超范围警告',
  failure: '计算失败',
}

export default function ResultPanel({ result }: { readonly result: CalcResult<CalculationOutput> }) {
  if (!result.ok) {
    return (
      <section className="results">
        <h2 className="results__title results__title--fail">未能完成计算</h2>
        <ul className="diag">
          {result.diagnostics.map((d, i) => (
            <li key={`${d.code}-${i}`} className={`diag__item diag__item--${d.level}`}>
              <span className="diag__level">{LEVEL_LABEL[d.level] ?? d.level}</span>
              <code className="diag__code">{d.code}</code>
              <span className="diag__msg">{d.message}</span>
            </li>
          ))}
        </ul>
        <p className="results__note">
          计算失败时不输出任何数值结果 —— 不给出不可靠的中间值。
        </p>
      </section>
    )
  }

  const v = result.value
  const d = v.discharge
  const last = d.iterations[d.iterations.length - 1]
  const branch = v.waterProfile.branches[0]

  return (
    <section className="results">
      {/* ── 主结果 ─────────────────────────────────────────── */}
      <h2 className="results__title">泄流能力</h2>
      <div className="kpis">
        <div className="kpi kpi--primary">
          <span className="kpi__label">流量 Q</span>
          <span className="kpi__value">{fmt(d.dischargeQ, 2)}</span>
          <span className="kpi__unit">m³/s</span>
        </div>
        <div className="kpi">
          <span className="kpi__label">堰上总水头 H₀</span>
          <span className="kpi__value">{fmt(d.totalHeadH0, 3)}</span>
          <span className="kpi__unit">m</span>
        </div>
        <div className="kpi">
          <span className="kpi__label">行进流速水头</span>
          <span className="kpi__value">{fmt(d.approachVelocityHead, 4)}</span>
          <span className="kpi__unit">m</span>
        </div>
        <div className="kpi">
          <span className="kpi__label">迭代次数</span>
          <span className="kpi__value">{d.iterationCount}</span>
          <span className="kpi__unit">次</span>
        </div>
      </div>

      {/* ── 系数取值与来源 ─────────────────────────────────── */}
      <h3 className="results__sub">系数取值</h3>
      <table className="tbl">
        <thead>
          <tr>
            <th>符号</th>
            <th>取值</th>
            <th>来源</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>c（上游堰坡影响修正系数）</td>
            <td>{fmt(d.coefficients.c, 4)}</td>
            <td>SL 253-2018 表 A.2.1-2；铅直时 1.0</td>
          </tr>
          <tr>
            <td>m（流量系数）</td>
            <td>{fmt(d.coefficients.m, 4)}</td>
            <td>表 A.2.1-1（H₀/H_d = {fmt(d.intermediate.headRatioH0OverHd, 4)}，P₁/H_d = {fmt(d.intermediate.pierHeightRatioP1OverHd, 4)}）</td>
          </tr>
          <tr>
            <td>ε（闸墩侧收缩系数）</td>
            <td>{fmt(d.coefficients.epsilon, 4)}</td>
            <td>式 A.2.1-2；H₀/b 采用 {fmt(d.intermediate.headOverSingleWidth, 4)}</td>
          </tr>
          <tr>
            <td>σs（淹没系数）</td>
            <td>{fmt(d.coefficients.sigmaS, 4)}</td>
            <td>
              {d.coefficients.sigmaS === 1
                ? '不淹没，程序自动取 1.0（DEC-022 路径 A）'
                : '人工按图 A.2.1-3 查图输入（程序不负责其准确性）'}
            </td>
          </tr>
          <tr>
            <td>ζ_k（中墩形状系数）</td>
            <td>{fmt(d.coefficients.zetaK, 4)}</td>
            <td>表 A.2.1-3</td>
          </tr>
          <tr>
            <td>ζ₀（边墩形状系数）</td>
            <td>{fmt(d.coefficients.zeta0, 4)}</td>
            <td>标准 A.2.1 符号定义</td>
          </tr>
        </tbody>
      </table>

      {/* ── 中间变量 ───────────────────────────────────────── */}
      <h3 className="results__sub">中间变量</h3>
      <table className="tbl">
        <tbody>
          <tr>
            <td>定型设计水头 H_d</td>
            <td>{fmt(d.intermediate.designHeadHd, 3)} m</td>
            <td>{d.intermediate.isHighWeir ? '高堰（P₁ ≥ 1.33H_d）' : '低堰（P₁ < 1.33H_d）'}</td>
          </tr>
          <tr>
            <td>上游计算断面过水面积 A</td>
            <td>{fmt(d.intermediate.upstreamArea, 2)} m²</td>
            <td>堰前 3H 处，按实际几何（不计墩体占位）</td>
          </tr>
          <tr>
            <td>行近流速 v</td>
            <td>{fmt(d.intermediate.approachVelocity, 4)} m/s</td>
            <td>v = Q / A</td>
          </tr>
          <tr>
            <td>淹没度 hs/H₀</td>
            <td>{fmt(d.intermediate.submergenceRatioHsOverH0, 4)}</td>
            <td>图 A.2.1-3 纵轴变量</td>
          </tr>
          <tr>
            <td>下游堰高比 P₂/H₀</td>
            <td>{fmt(d.intermediate.downstreamHeightRatioP2OverH0, 4)}</td>
            <td>图 A.2.1-3 横轴变量</td>
          </tr>
          <tr>
            <td>幂曲线系数 k / 指数 n</td>
            <td>{fmt(v.profile.k, 3)} / {fmt(v.profile.n, 3)}</td>
            <td>
              表 A.1.1
              {v.profile.kSource === 'table'
                ? '（查表）'
                : v.profile.kSource === 'range-default'
                  ? '（P₁/H_d ≤ 1.0，取区间默认中值 2.1）'
                  : '（P₁/H_d ≤ 1.0，使用者覆盖）'}
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── 迭代过程 ───────────────────────────────────────── */}
      <h3 className="results__sub">迭代过程（行进流速水头）</h3>
      <p className="results__hint">
        收敛判据：相对残差 ≤ {d.tolerance.toExponential(0)}，对 Q 与 H₀ <strong>分别判定且同时满足</strong>。
      </p>
      <table className="tbl tbl--dense">
        <thead>
          <tr>
            <th>#</th>
            <th>H₀ (m)</th>
            <th>v (m/s)</th>
            <th>m</th>
            <th>ε</th>
            <th>Q (m³/s)</th>
            <th>H₀ 残差</th>
            <th>Q 残差</th>
          </tr>
        </thead>
        <tbody>
          {d.iterations.map((it) => (
            <tr key={it.index}>
              <td>{it.index}</td>
              <td>{fmt(it.totalHeadH0, 6)}</td>
              <td>{fmt(it.approachVelocity, 5)}</td>
              <td>{fmt(it.dischargeCoefficientM, 5)}</td>
              <td>{fmt(it.lateralContractionEpsilon, 6)}</td>
              <td>{fmt(it.dischargeQ, 4)}</td>
              <td>{pct(it.headResidual)}</td>
              <td>{pct(it.dischargeResidual)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {last ? (
        <p className="results__hint">
          末次：H₀ 残差 {last.headResidual.toExponential(3)}，Q 残差 {last.dischargeResidual.toExponential(3)}
        </p>
      ) : null}

      {/* ── 水面线 ─────────────────────────────────────────── */}
      <h3 className="results__sub">泄槽水面线</h3>
      <p className="results__hint">
        临界水深 {fmt(v.waterProfile.criticalDepth, 3)} m；临界坡 {fmt(v.waterProfile.criticalSlope, 5)}；
        分支 {v.waterProfile.branches.length} 条（缓流与急流两者都算，按流态判断）；
        水跃检出：{v.waterProfile.hydraulicJumpDetected ? '是' : '否'}
      </p>
      {branch ? (
        <table className="tbl tbl--dense">
          <thead>
            <tr>
              <th>分支</th>
              <th>桩号 (m)</th>
              <th>水深 (m)</th>
              <th>流速 (m/s)</th>
              <th>R (m)</th>
              <th>Fr</th>
              <th>流态</th>
              <th>J</th>
            </tr>
          </thead>
          <tbody>
            {branch.stations.map((s) => (
              <tr key={`${branch.branch}-${s.station}`}>
                <td>{branch.branch === 'supercritical' ? '急流' : '缓流'}</td>
                <td>{fmt(s.station, 1)}</td>
                <td>{fmt(s.depth, 4)}</td>
                <td>{fmt(s.velocity, 3)}</td>
                <td>{fmt(s.hydraulicRadius, 4)}</td>
                <td>{fmt(s.froude, 3)}</td>
                <td>{s.regime === 'supercritical' ? '急流' : s.regime === 'subcritical' ? '缓流' : '临界'}</td>
                <td>{fmt(s.frictionSlope, 6)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {/* ── 诊断 ───────────────────────────────────────────── */}
      <h3 className="results__sub">适用范围检查结论</h3>
      {v.diagnostics.length === 0 ? (
        <p className="results__ok">未发现超范围或异常情形。</p>
      ) : (
        <ul className="diag">
          {v.diagnostics.map((dd, i) => (
            <li key={`${dd.code}-${i}`} className={`diag__item diag__item--${dd.level}`}>
              <span className="diag__level">{LEVEL_LABEL[dd.level] ?? dd.level}</span>
              <code className="diag__code">{dd.code}</code>
              <span className="diag__msg">{dd.message}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
