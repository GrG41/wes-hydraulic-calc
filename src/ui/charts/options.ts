/**
 * 图表配置构建（**纯函数**，可单元测试）。
 *
 * 与 React 解耦：本文件不引入任何 UI 依赖，便于在 Node 环境下直接断言数据与坐标。
 */

import type { EChartsCoreOption } from 'echarts/core'
import type { CalculationInput } from '../../core'
import type { CalculationOutput } from '../../core'

/**
 * 图表调色板：**从 CSS 变量现取**，与界面同源。
 *
 * 为什么不在本文件里写死颜色：写死就会出现两份调色板，改了一处、另一处照旧
 * （图表的坐标轴还停在浅色主题上，而页面已经是暗的）。
 * 为什么带 fallback：本文件承诺"可在 Node 环境直接测试"，测试环境没有 `document`，
 * 因此用 `typeof document` 探测后退化到这里的常量——**不 import 任何 UI 模块**。
 */
const FALLBACK_PALETTE = {
  ink: '#e6ebf2',
  inkSoft: '#a7b4c4',
  inkFaint: '#7d8b9c',
  line: '#303a46',
  surface2: '#212a35',
  brandText: '#7cb3ff',
  danger: '#ff8f8f',
  bed: '#d0a35e',
} as const

type PaletteKey = keyof typeof FALLBACK_PALETTE

function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v === '' ? fallback : v
}

function palette(): Record<PaletteKey, string> {
  const map: Record<PaletteKey, string> = {
    ink: '--ink',
    inkSoft: '--ink-soft',
    inkFaint: '--ink-faint',
    line: '--line',
    surface2: '--surface-2',
    brandText: '--brand-text',
    danger: '--err-line',
    bed: '--bed',
  }
  const out = {} as Record<PaletteKey, string>
  for (const key of Object.keys(map) as PaletteKey[]) {
    out[key] = cssVar(map[key], FALLBACK_PALETTE[key])
  }
  return out
}

/** 深色底上的通用坐标轴/标题样式。 */
function darkAxis(p: Record<PaletteKey, string>) {
  return {
    axisLine: { lineStyle: { color: p.line } },
    axisLabel: { fontSize: 11, color: p.inkSoft },
    splitLine: { lineStyle: { color: p.line } },
    nameTextStyle: { color: p.inkSoft },
  }
}

/** 槽底高程：桩号按沿槽量取，沿程下降 Δs·i（标准 A.3.1：i = sinθ）。 */
export function bedElevation(
  station: number,
  startStation: number,
  startBedElevation: number,
  bedSlope: number,
): number {
  return startBedElevation - (station - startStation) * bedSlope
}

export interface ProfileSeriesPoint {
  readonly station: number
  readonly waterLevel: number
  readonly bedLevel: number
  readonly depth: number
}

export interface WaterProfileChartData {
  readonly supercritical: readonly ProfileSeriesPoint[]
  readonly subcritical: readonly ProfileSeriesPoint[]
  readonly criticalDepth: number
  readonly startBedElevation: number
}

/**
 * 由计算结果整理出水面线绘图数据（高程坐标）。
 *
 * 水面高程 = 槽底高程 + 水深；槽底线由起点槽底高程与底坡推得。
 * 未给出起点槽底高程时退化为**相对高程**（以 0 为基准），并在图上注明。
 */
export function buildWaterProfileChartData(
  input: CalculationInput,
  output: CalculationOutput,
): WaterProfileChartData {
  const startBed = input.chute.startBedElevation ?? 0
  const toPoints = (stations: CalculationOutput['waterProfile']['branches'][number]['stations']) =>
    stations.map((s) => {
      const bed = bedElevation(s.station, input.chute.startStation, startBed, input.chute.bedSlope)
      return {
        station: s.station,
        depth: s.depth,
        bedLevel: bed,
        waterLevel: bed + s.depth,
      }
    })

  const branches = output.waterProfile.branches
  return {
    supercritical: toPoints(branches.find((b) => b.branch === 'supercritical')?.stations ?? []),
    subcritical: toPoints(branches.find((b) => b.branch === 'subcritical')?.stations ?? []),
    criticalDepth: output.waterProfile.criticalDepth,
    startBedElevation: startBed,
  }
}

/** 水面线纵剖面图的 ECharts 配置。 */
export function waterProfileOption(data: WaterProfileChartData, hasStartBed: boolean): EChartsCoreOption {
  const p = palette()
  const series: unknown[] = []

  if (data.supercritical.length > 0) {
    series.push({
      name: '急流分支（水面线）',
      type: 'line',
      showSymbol: true,
      symbolSize: 5,
      data: data.supercritical.map((pt) => [pt.station, Number(pt.waterLevel.toFixed(4))]),
      lineStyle: { width: 2, color: p.brandText },
      itemStyle: { color: p.brandText },
    })
    series.push({
      name: '槽底',
      type: 'line',
      showSymbol: false,
      data: data.supercritical.map((pt) => [pt.station, Number(pt.bedLevel.toFixed(4))]),
      lineStyle: { width: 1.5, type: 'dashed', color: p.bed },
      itemStyle: { color: p.bed },
    })
  }

  if (data.subcritical.length > 0) {
    series.push({
      name: '缓流分支（水面线）',
      type: 'line',
      showSymbol: true,
      symbolSize: 5,
      data: data.subcritical.map((pt) => [pt.station, Number(pt.waterLevel.toFixed(4))]),
      lineStyle: { width: 2, color: p.danger },
      itemStyle: { color: p.danger },
    })
  }

  return {
    backgroundColor: 'transparent',
    title: {
      text: '泄槽水面线纵剖面',
      subtext: hasStartBed ? '高程基准：绝对高程 (m)' : '未给定起点槽底高程，纵坐标为相对高程 (m)',
      left: 'center',
      textStyle: { fontSize: 14, color: p.ink },
      subtextStyle: { fontSize: 11, color: p.inkFaint },
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: p.surface2,
      borderColor: p.line,
      textStyle: { color: p.ink, fontSize: 12 },
    },
    legend: { bottom: 0, textStyle: { fontSize: 11, color: p.inkSoft } },
    grid: { left: 64, right: 24, top: 64, bottom: 48 },
    xAxis: {
      type: 'value',
      name: '桩号 (m)',
      nameLocation: 'middle',
      nameGap: 28,
      ...darkAxis(p),
    },
    yAxis: {
      type: 'value',
      name: '高程 (m)',
      nameLocation: 'middle',
      nameGap: 46,
      scale: true,
      ...darkAxis(p),
    },
    series,
  }
}

/** 泄流曲线图的 ECharts 配置。 */
export function dischargeCurveOption(
  points: readonly { readonly head: number; readonly discharge: number | null }[],
  designHeadHd: number,
): EChartsCoreOption {
  const p = palette()
  const valid = points.filter((pt) => pt.discharge !== null)

  return {
    backgroundColor: 'transparent',
    title: {
      text: '泄流能力曲线 Q–H',
      subtext: `定型设计水头 H_d = ${designHeadHd.toFixed(3)} m；虚线为当前工况点`,
      left: 'center',
      textStyle: { fontSize: 14, color: p.ink },
      subtextStyle: { fontSize: 11, color: p.inkFaint },
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: p.surface2,
      borderColor: p.line,
      textStyle: { color: p.ink, fontSize: 12 },
    },
    grid: { left: 72, right: 28, top: 64, bottom: 48 },
    xAxis: {
      type: 'value',
      name: '堰上水头 H (m)',
      nameLocation: 'middle',
      nameGap: 28,
      ...darkAxis(p),
    },
    yAxis: {
      type: 'value',
      name: '流量 Q (m³/s)',
      nameLocation: 'middle',
      nameGap: 56,
      ...darkAxis(p),
    },
    series: [
      {
        name: 'Q–H',
        type: 'line',
        smooth: true,
        showSymbol: true,
        symbolSize: 6,
        data: valid.map((pt) => [pt.head, Number((pt.discharge as number).toFixed(3))]),
        lineStyle: { width: 2, color: p.brandText },
        itemStyle: { color: p.brandText },
        areaStyle: { color: 'rgba(124, 179, 255, 0.14)' },
      },
    ],
  }
}

/** 生成绘图用的水头序列（自 H_d 的 0.4 倍到 1.3 倍，即表 A.2.1-1 的行域）。 */
export function curveHeads(designHeadHd: number, samples = 25): number[] {
  const lo = designHeadHd * 0.4
  const hi = designHeadHd * 1.3
  return Array.from({ length: samples }, (_, i) => Number((lo + ((hi - lo) * i) / (samples - 1)).toFixed(4)))
}
