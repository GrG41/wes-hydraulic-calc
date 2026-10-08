/**
 * 计算书导出（Excel）。
 *
 * 决策来源：`docs/DECISIONS.md` DEC-016（Q11：无既定模板，按常规格式自行组织）；
 *          AGENTS.md §4 指定用 SheetJS 导出。
 *
 * ⚠️ 依赖说明：npm 上的 `xlsx` 为 SheetJS 社区版 0.18.5（官方已迁至自有 CDN）。
 * 本程序**只写不读**（不解析外部 xlsx），故其历史安全通告（原型污染 / ReDoS，
 * 均针对**读取**不可信文件）在本用途下不可达。
 *
 * 导出内容严格对应 AGENTS.md §8.1「计算书必须包含」的六项。
 */

import * as XLSX from 'xlsx'
import type { CalcResult, CalculationInput } from '../core'
import type { CalculationOutput } from '../core'
import { GRAVITY, VELOCITY_DISTRIBUTION_COEFFICIENT } from '../core'

type Row = (string | number | null)[]

const DISCLAIMER =
  '本计算结果未经独立数据验证（Validation），正确性无外部证据支撑，使用者应自行安排独立校核。'

function sheetFromRows(rows: Row[], colWidths?: number[]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(rows)
  if (colWidths) ws['!cols'] = colWidths.map((w) => ({ wch: w }))
  return ws
}

/** 输入参数表。 */
function inputRows(input: CalculationInput): Row[] {
  const { weir, piers, upstreamSection, designHead, operation, chute, boundary, solver, submergence } = input
  const shape = upstreamSection.shape
  return [
    ['计算书 —— WES 型实用堰泄流能力与堰流水面线'],
    ['计算依据', 'SL 253-2018《溢洪道设计规范》'],
    ['生成时间', new Date().toLocaleString('zh-CN')],
    ['', ''],
    ['【堰体几何】', '', '', ''],
    ['参数', '数值', '单位', '说明'],
    ['堰顶高程', weir.crestElevation, 'm', ''],
    ['下游河床高程', weir.downstreamBedElevation, 'm', '用于下游堰高 P₂'],
    ['上游堰高 P₁', weir.upstreamHeightP1, 'm', 'P₁/H_d ≥ 1.33 为高堰（标准 A.1.1）'],
    ['上游堰面坡度', weir.upstreamSlope, '—', '标准仅覆盖 3:0 / 3:1 / 3:2 / 3:3（表 A.1.1）'],
    ['上游堰头曲线型式', weir.crestCurveType, '—', ''],
    ['溢流堰总净宽 B', weir.netWidthB, 'm', '各孔净宽之和'],
    ['单孔宽度 b', weir.singleOpeningWidthB, 'm', ''],
    ['闸孔数目 n', weir.openingCount, '孔', '式 A.2.1-2'],
    ['', '', '', ''],
    ['【闸墩布置】', '', '', ''],
    ['中墩墩头形状', piers.pierHeadShape, '—', '表 A.2.1-3'],
    ['墩头伸出距离 Lk', piers.pierHeadExtensionLk, 'm', ''],
    ['尖墩高度 Hs', piers.pierHeadHeightHs, 'm', ''],
    ['边墩形状', piers.abutmentShape, '—', 'ζ₀ 取值'],
    ['', '', '', ''],
    ['【上游计算断面】', '', '', ''],
    ['断面位置', `堰前 ${upstreamSection.distanceOverHeadRatio}H`, '—', '工程师确认 Q19-1'],
    ['断面底高程', upstreamSection.bedElevation, 'm', ''],
    ['断面型式', shape.kind === 'rectangular' ? '矩形' : '对称梯形', '—', ''],
    ['断面底宽', shape.bottomWidth, 'm', ''],
    ['边坡系数 m', shape.kind === 'trapezoidal' ? shape.sideSlope : '—', '—', '水平:垂直'],
    ['', '', '', ''],
    ['【定型设计水头】', '', '', ''],
    ['给定方式', designHead.kind === 'direct' ? '直接给定 H_d' : '由 H_max 推求', '—', '标准 A.1.1'],
    ['H_d', designHead.kind === 'direct' ? designHead.value : null, 'm', ''],
    ['H_max', designHead.kind === 'from-max-head' ? designHead.maxHead : null, 'm', '校核流量下堰上水头'],
    ['', '', '', ''],
    ['【运行工况】', '', '', ''],
    ['堰上水头 H', operation.headOverCrest, 'm', ''],
    ['下游水位', operation.downstreamWaterLevel, 'm', ''],
    ['下游水深 hs（相对堰顶）', operation.downstreamWaterLevel - weir.crestElevation, 'm', 'hs > 0 即可能淹没'],
    ['淹没系数取值方式', submergence.kind === 'manual' ? '人工查图输入' : '自动判定（不淹没取 1.0）', '—', 'DEC-022 路径 A'],
    ['σs（人工输入）', submergence.kind === 'manual' ? submergence.sigmaS : null, '—', '程序不负责人工输入值的准确性'],
    ['', '', '', ''],
    ['【泄槽与水面线】', '', '', ''],
    ['泄槽底宽', chute.width, 'm', ''],
    ['糙率 n', chute.roughness, '—', '表 A.8 总体区间 0.011 ~ 0.045'],
    ['底坡 i', chute.bedSlope, '—', 'i = sinθ（标准 A.3.1）'],
    ['底坡角度 θ', chute.bedAngleDeg, '°', ''],
    ['起点桩号', chute.startStation, 'm', ''],
    ['终点桩号', chute.endStation, 'm', ''],
    ['分段步长', chute.stationStep, 'm', '默认 5 m，可覆盖'],
    ['起点槽底高程', chute.startBedElevation ?? null, 'm', '缓流分支据此换算水深'],
    ['泄槽起始水深', chute.entranceDepth ?? null, 'm', '缺省时按临界水深取值并提示'],
    ['下游控制水位', boundary.downstreamWaterLevel, 'm', '给定时另算缓流分支'],
    ['', '', '', ''],
    ['【求解参数】', '', '', ''],
    ['最大迭代次数', solver.maxIterations, '次', '工程师确认 Q18'],
    ['相对残差判据', solver.relativeTolerance, '—', '对 Q 与 H₀ 分别判定'],
    ['重力加速度 g', GRAVITY, 'm/s²', ''],
    ['流速分布系数 α', VELOCITY_DISTRIBUTION_COEFFICIENT, '—', '标准定值，式 A.3.1-1'],
  ]
}

/** 计算结果表（仅成功时）。 */
function resultRows(output: CalculationOutput): Row[] {
  const d = output.discharge
  const i = d.intermediate
  const p = output.profile
  return [
    ['【主要结果】', '', ''],
    ['项目', '数值', '单位/说明'],
    ['流量 Q', Number(d.dischargeQ.toFixed(6)), 'm³/s'],
    ['堰上总水头 H₀', Number(d.totalHeadH0.toFixed(6)), 'm（式 A.2.1-3）'],
    ['行进流速水头', Number(d.approachVelocityHead.toFixed(6)), 'm'],
    ['迭代次数', d.iterationCount, '次'],
    ['收敛相对残差判据', d.tolerance, '—'],
    ['', '', ''],
    ['【系数取值及来源】', '', ''],
    ['系数', '取值', '来源'],
    ['c（上游堰坡影响修正系数）', d.coefficients.c, 'SL 253-2018 表 A.2.1-2；铅直堰坡取 1.0'],
    ['m（流量系数）', d.coefficients.m, '表 A.2.1-1'],
    ['ε（闸墩侧收缩系数）', d.coefficients.epsilon, '式 A.2.1-2'],
    ['σs（淹没系数）', d.coefficients.sigmaS, d.coefficients.sigmaS === 1 ? '不淹没，程序自动取 1.0' : '人工按图 A.2.1-3 查图输入'],
    ['ζ_k（中墩形状系数）', d.coefficients.zetaK, '表 A.2.1-3'],
    ['ζ₀（边墩形状系数）', d.coefficients.zeta0, '标准 A.2.1 符号定义'],
    ['', '', ''],
    ['【中间变量】', '', ''],
    ['定型设计水头 H_d', i.designHeadHd, 'm'],
    ['高堰/低堰', i.isHighWeir ? '高堰（P₁ ≥ 1.33H_d）' : '低堰（P₁ < 1.33H_d）', '标准 A.1.1'],
    ['H₀/H_d', i.headRatioH0OverHd, '表 A.2.1-1 行坐标'],
    ['P₁/H_d', i.pierHeightRatioP1OverHd, '表 A.2.1-1 列坐标'],
    ['H₀/b', i.headOverSingleWidth, '式 A.2.1-2 变量'],
    ['上游计算断面过水面积 A', i.upstreamArea, 'm²'],
    ['行近流速 v', i.approachVelocity, 'm/s'],
    ['淹没度 hs/H₀', i.submergenceRatioHsOverH0, '图 A.2.1-3 纵轴变量'],
    ['下游堰高比 P₂/H₀', i.downstreamHeightRatioP2OverH0, '图 A.2.1-3 横轴变量'],
    ['幂曲线系数 k', p.k, p.kSource === 'table' ? '表 A.1.1 查表' : p.kSource === 'range-default' ? 'P₁/H_d ≤ 1.0，取区间默认中值 2.1' : 'P₁/H_d ≤ 1.0，使用者覆盖'],
    ['幂曲线指数 n', p.n, '表 A.1.1'],
    ['曲线段终点（切点）', `x = ${p.downstreamEnd.x.toFixed(4)} m, y = ${p.downstreamEnd.y.toFixed(4)} m`, '与下游坡相切'],
    ['', '', ''],
    ['【泄槽水面线概览】', '', ''],
    ['临界水深', output.waterProfile.criticalDepth, 'm'],
    ['临界坡', output.waterProfile.criticalSlope, '—'],
    ['分支数', output.waterProfile.branches.length, '缓流与急流两者都算'],
    ['水跃检出', output.waterProfile.hydraulicJumpDetected ? '是' : '否', 'Q22-2 = C：不支持水跃'],
  ]
}

/** 迭代过程表。 */
function iterationRows(output: CalculationOutput): Row[] {
  const rows: Row[] = [
    ['【行进流速水头迭代过程】式（A.2.1-3）：H₀ = H + v²/(2g)', '', '', '', '', '', '', ''],
    ['序号', 'H₀ (m)', 'v (m/s)', 'm', 'ε', 'Q (m³/s)', 'H₀ 相对残差', 'Q 相对残差'],
  ]
  for (const it of output.discharge.iterations) {
    rows.push([
      it.index,
      Number(it.totalHeadH0.toFixed(9)),
      Number(it.approachVelocity.toFixed(9)),
      Number(it.dischargeCoefficientM.toFixed(6)),
      Number(it.lateralContractionEpsilon.toFixed(9)),
      Number(it.dischargeQ.toFixed(6)),
      it.headResidual,
      it.dischargeResidual,
    ])
  }
  return rows
}

/** 水面线明细表。 */
function waterProfileRows(output: CalculationOutput): Row[] {
  const rows: Row[] = [
    ['【泄槽水面线分段推算】式（A.3.1-1）～（A.3.1-4）', '', '', '', '', '', '', '', ''],
    ['分支', '桩号 (m)', '水深 (m)', '流速 (m/s)', '过水面积 (m²)', '水力半径 (m)', 'Fr', '流态', '摩阻坡降 J'],
  ]
  for (const branch of output.waterProfile.branches) {
    for (const s of branch.stations) {
      rows.push([
        branch.branch === 'supercritical' ? '急流' : '缓流',
        s.station,
        Number(s.depth.toFixed(6)),
        Number(s.velocity.toFixed(6)),
        Number(s.area.toFixed(6)),
        Number(s.hydraulicRadius.toFixed(6)),
        Number(s.froude.toFixed(6)),
        s.regime === 'supercritical' ? '急流' : s.regime === 'subcritical' ? '缓流' : '临界',
        Number(s.frictionSlope.toFixed(9)),
      ])
    }
  }
  return rows
}

/** 适用范围检查表。 */
function diagnosticRows(diagnostics: readonly { level: string; code: string; message: string }[]): Row[] {
  const levelLabel: Record<string, string> = {
    'input-error': '输入错误',
    'out-of-range': '超范围警告',
    failure: '计算失败',
  }
  const rows: Row[] = [
    ['【适用范围检查结论】', '', ''],
    ['级别', '代码', '说明'],
  ]
  if (diagnostics.length === 0) {
    rows.push(['—', '—', '未发现超范围或异常情形'])
  } else {
    for (const d of diagnostics) {
      rows.push([levelLabel[d.level] ?? d.level, d.code, d.message])
    }
  }
  return rows
}

/** 依据与免责表。 */
function referenceRows(): Row[] {
  return [
    ['【计算依据与免责声明】', ''],
    ['', ''],
    ['主依据', 'SL 253-2018《溢洪道设计规范》'],
    ['附录 A.1.1 / 表 A.1.1', '堰面幂曲线 x^n = k·H_d^(n-1)·y；曲线参数'],
    ['附录 A.2.1 / 式 A.2.1-1', 'Q = c·m·ε·σs·B·√(2g)·H₀^(3/2)'],
    ['式 A.2.1-2', 'ε = 1 − 0.2[ζk + (n−1)ζ₀]·H₀/(n·b)'],
    ['式 A.2.1-3', 'H₀ = H + v²/(2g)'],
    ['表 A.2.1-1 / A.2.1-2 / A.2.1-3', '流量系数 m、上游堰坡影响修正系数 c、中墩形状系数 ζk'],
    ['附录 A.3.1 / 式 A.3.1-1', 'Δl = [(h₂cosθ + α₂v₂²/2g) − (h₁cosθ + α₁v₁²/2g)] / (i − J̄)'],
    ['式 A.3.1-2 ~ A.3.1-4', 'J̄ = n²v̄²/R̄^(4/3)，v̄、R̄ 取两断面平均'],
    ['表 A.8', '水力计算常用糙率'],
    ['', ''],
    ['⚠️ 未执行独立数据验证', DISCLAIMER],
    ['⚠️ 淹没系数 σs', '标准图 A.2.1-3 无法从现有扫描件可靠数字化，淹没工况须由使用者人工查图输入；程序不对该值的准确性负责。'],
    ['⚠️ 上游堰头曲线几何', '双圆弧 / 三圆弧 / 椭圆的完整几何构造定义在标准图 A.1.2-1 ~ A.1.2-3 中，本期仅输出表 A.1.1 给出的参数，几何构造未实现。'],
    ['⚠️ 水跃', '本期不支持水跃计算，检出急流→缓流过渡即报错停止。'],
  ]
}

/** 生成计算书工作簿。 */
export function buildCalculationWorkbook(
  input: CalculationInput,
  result: CalcResult<CalculationOutput>,
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(wb, sheetFromRows(inputRows(input), [32, 26, 10, 46]), '输入参数')

  if (result.ok) {
    XLSX.utils.book_append_sheet(wb, sheetFromRows(resultRows(result.value), [32, 30, 46]), '计算结果')
    XLSX.utils.book_append_sheet(wb, sheetFromRows(iterationRows(result.value), [8, 16, 16, 12, 16, 16, 18, 18]), '迭代过程')
    XLSX.utils.book_append_sheet(wb, sheetFromRows(waterProfileRows(result.value), [8, 12, 12, 12, 14, 14, 10, 8, 14]), '水面线')
  } else {
    XLSX.utils.book_append_sheet(
      wb,
      sheetFromRows([['计算未完成，无结果输出。'], ['失败时不提供任何数值结果。']], [60]),
      '计算结果',
    )
  }

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(diagnosticRows(result.ok ? result.value.diagnostics : result.diagnostics), [14, 36, 90]),
    '适用范围检查',
  )
  XLSX.utils.book_append_sheet(wb, sheetFromRows(referenceRows(), [32, 95]), '依据与声明')

  return wb
}

/** 导出计算书为 .xlsx 文件（浏览器下载）。 */
export function exportCalculationExcel(
  input: CalculationInput,
  result: CalcResult<CalculationOutput>,
  filename?: string,
): void {
  const wb = buildCalculationWorkbook(input, result)
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  XLSX.writeFile(wb, filename ?? `WES泄流计算书_${stamp}.xlsx`)
}

/** 导出迭代过程与水面线为 CSV（便于二次处理）。 */
export function exportCsv(rows: Row[], filename: string): void {
  const ws = XLSX.utils.aoa_to_sheet(rows)
  const csv = XLSX.utils.sheet_to_csv(ws)
  downloadText(csv, filename, 'text/csv;charset=utf-8')
}

/** 触发浏览器下载。 */
function downloadText(text: string, filename: string, mime: string): void {
  // 加 BOM 以便 Excel 正确识别 UTF-8 中文
  const blob = new Blob([`\uFEFF${text}`], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
