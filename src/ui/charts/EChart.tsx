/**
 * ECharts 轻量封装（按需引入，控制 PWA 预缓存体积）。
 *
 * 决策来源：`docs/DECISIONS.md` DEC-024（Q9 图表库采用 ECharts）。
 * 只注册实际用到的图表与组件，避免整包引入。
 */

import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsCoreOption } from 'echarts/core'

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  DataZoomComponent,
  MarkLineComponent,
  CanvasRenderer,
])

export interface EChartProps {
  readonly option: EChartsCoreOption
  /** 画布高度，px */
  readonly height?: number
  readonly ariaLabel?: string
}

/**
 * 图表容器。
 *
 * 监听窗口尺寸变化自动重绘；组件卸载时销毁实例，避免内存泄漏
 * （AGENTS.md §7.1：无未捕获异常、无资源泄漏）。
 */
export default function EChart({ option, height = 320, ariaLabel }: EChartProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (host === null) return undefined

    const chart = echarts.init(host, undefined, { renderer: 'canvas' })
    chartRef.current = chart

    const onResize = () => chart.resize()
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true })
  }, [option])

  return (
    <div
      ref={hostRef}
      className="chart"
      style={{ height: `${height}px` }}
      role="img"
      aria-label={ariaLabel ?? '计算结果图'}
    />
  )
}
