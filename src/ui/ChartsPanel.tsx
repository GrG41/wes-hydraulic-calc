/**
 * 曲线绘图面板：泄槽水面线纵剖面 + 泄流能力曲线 Q–H。
 *
 * 决策来源：`docs/DECISIONS.md` DEC-024（Q9 图表库采用 ECharts）。
 * 数据构建为纯函数（`./charts/options`），已单独单元测试；本文件只负责装配与记忆化。
 */

import { useMemo } from 'react'
import { dischargeCurve } from '../core'
import type { CalculationInput, CalculationOutput } from '../core'
import EChart from './charts/EChart'
import {
  buildWaterProfileChartData,
  curveHeads,
  dischargeCurveOption,
  waterProfileOption,
} from './charts/options'

export interface ChartsPanelProps {
  readonly input: CalculationInput
  readonly output: CalculationOutput
}

export default function ChartsPanel({ input, output }: ChartsPanelProps) {
  const { profileOption, curveOption, note } = useMemo(() => {
    const data = buildWaterProfileChartData(input, output)
    const hasStartBed = input.chute.startBedElevation !== undefined

    // 泄流曲线：水头扫描范围取表 A.2.1-1 的行域 [0.4H_d, 1.3H_d]
    const heads = curveHeads(output.discharge.intermediate.designHeadHd)
    const points = dischargeCurve(input, heads)

    const failed = points.filter((p) => p.discharge === null).length

    return {
      profileOption: waterProfileOption(data, hasStartBed),
      curveOption: dischargeCurveOption(points, output.discharge.intermediate.designHeadHd),
      note:
        failed === 0
          ? `已计算 ${points.length} 个水头点，全部求解成功。`
          : `已计算 ${points.length} 个水头点，其中 ${failed} 个求解失败（未在曲线上绘出）。`,
    }
  }, [input, output])

  return (
    <section className="charts">
      <h3 className="results__sub">图表</h3>

      <div className="chart-card">
        <EChart option={profileOption} height={340} ariaLabel="泄槽水面线纵剖面图" />
        <p className="results__hint">
          蓝色实线为急流分支水面线，棕色虚线为槽底，红色实线为缓流分支（如可起算）。
          纵坐标为高程：水面高程 = 槽底高程 + 水深。
        </p>
      </div>

      <div className="chart-card">
        <EChart option={curveOption} height={340} ariaLabel="泄流能力曲线图" />
        <p className="results__hint">{note}</p>
      </div>
    </section>
  )
}
