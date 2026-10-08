/**
 * 输入校验与适用范围检查 —— 测试先行（AGENTS.md §7.4）。
 *
 * 被测模块：`src/core/validation/input.ts`
 * 目标：实现 AGENTS.md §8.3 的三类区分中的前两类 ——
 *   · 输入错误（input-error）：缺参数、量纲/量级错误、内部不一致 → 拒绝计算
 *   · 超范围警告（out-of-range）：参数超出公式或图表的适用范围 → 继续计算并告警
 */

import { describe, expect, it } from 'vitest'
import { checkApplicability, validateInput } from '../../src/core/validation/input'
import type { CalculationInput } from '../../src/core/types'

function makeInput(): CalculationInput {
  return {
    weir: {
      crestElevation: 100,
      downstreamBedElevation: 95,
      upstreamHeightP1: 5,
      upstreamSlope: '3:0',
      crestCurveType: 'double-arc',
      netWidthB: 100,
      singleOpeningWidthB: 100,
      openingCount: 1,
    },
    piers: {
      pierHeadShape: 'rectangular',
      pierHeadExtensionLk: 1,
      pierHeadHeightHs: 1,
      abutmentShape: 'rectangular',
    },
    upstreamSection: {
      distanceOverHeadRatio: 3,
      bedElevation: 100,
      shape: { kind: 'rectangular', bottomWidth: 1000 },
    },
    designHead: { kind: 'direct', value: 5 },
    operation: { headOverCrest: 4, downstreamWaterLevel: 99 },
    chute: {
      bedSlope: 0.2,
      bedAngleDeg: 11.537,
      roughness: 0.014,
      width: 40,
      startStation: 0,
      endStation: 100,
      segmentation: 'station',
      stationStep: 5,
    },
    boundary: {
      upstream: 'weir-profile-end',
      upstreamDepth: 'from-weir-profile',
      downstreamControl: 'both-by-regime',
      downstreamWaterLevel: 90,
      outputBothBranches: true,
    },
    solver: { maxIterations: 50, relativeTolerance: 1e-6, epsilonFloor: 1e-12, onNonConvergence: 'fail' },
    submergence: { kind: 'auto-free-flow' },
  }
}

const codes = (list: readonly { code: string }[]) => list.map((d) => d.code)

describe('validateInput —— 输入错误', () => {
  it('合法输入应无任何输入错误', () => {
    expect(validateInput(makeInput())).toEqual([])
  })

  it('堰顶净宽非正应报错', () => {
    const i = makeInput()
    const r = validateInput({ ...i, weir: { ...i.weir, netWidthB: 0 } })
    expect(codes(r)).toContain('NET_WIDTH_INVALID')
    expect(r.every((d) => d.level === 'input-error')).toBe(true)
  })

  it('单孔宽度非正应报错', () => {
    const i = makeInput()
    expect(codes(validateInput({ ...i, weir: { ...i.weir, singleOpeningWidthB: 0 } }))).toContain(
      'SINGLE_WIDTH_INVALID',
    )
  })

  it('闸孔数目非整数或小于 1 应报错', () => {
    const i = makeInput()
    expect(codes(validateInput({ ...i, weir: { ...i.weir, openingCount: 0 } }))).toContain(
      'OPENING_COUNT_INVALID',
    )
    expect(codes(validateInput({ ...i, weir: { ...i.weir, openingCount: 1.5 } }))).toContain(
      'OPENING_COUNT_INVALID',
    )
  })

  it('单孔宽度大于总净宽应报错', () => {
    const i = makeInput()
    expect(
      codes(validateInput({ ...i, weir: { ...i.weir, singleOpeningWidthB: 200 } })),
    ).toContain('SINGLE_WIDTH_EXCEEDS_NET_WIDTH')
  })

  it('总净宽与 n·b 不一致（>1%）应报错 —— 标准定义 B 为各孔净宽之和', () => {
    const i = makeInput()
    const r = validateInput({
      ...i,
      weir: { ...i.weir, openingCount: 3, singleOpeningWidthB: 20, netWidthB: 100 },
    })
    expect(codes(r)).toContain('NET_WIDTH_INCONSISTENT_WITH_OPENINGS')
  })

  it('总净宽与 n·b 在 1% 内应视为一致（允许舍入）', () => {
    const i = makeInput()
    const r = validateInput({
      ...i,
      weir: { ...i.weir, openingCount: 3, singleOpeningWidthB: 20, netWidthB: 60.3 },
    })
    expect(codes(r)).not.toContain('NET_WIDTH_INCONSISTENT_WITH_OPENINGS')
  })

  it('上游堰高非正应报错', () => {
    const i = makeInput()
    expect(codes(validateInput({ ...i, weir: { ...i.weir, upstreamHeightP1: 0 } }))).toContain(
      'UPSTREAM_HEIGHT_INVALID',
    )
  })

  it('堰上水头非正应报错', () => {
    const i = makeInput()
    const r = validateInput({ ...i, operation: { ...i.operation, headOverCrest: 0 } })
    expect(codes(r)).toContain('HEAD_OVER_CREST_INVALID')
  })

  it('泄槽底宽 / 糙率 / 步长非正应报错', () => {
    const i = makeInput()
    expect(codes(validateInput({ ...i, chute: { ...i.chute, width: 0 } }))).toContain(
      'CHUTE_WIDTH_INVALID',
    )
    expect(codes(validateInput({ ...i, chute: { ...i.chute, roughness: 0 } }))).toContain(
      'ROUGHNESS_INVALID',
    )
    expect(codes(validateInput({ ...i, chute: { ...i.chute, stationStep: 0 } }))).toContain(
      'STATION_STEP_INVALID',
    )
  })

  it('终点桩号不大于起点应报错', () => {
    const i = makeInput()
    const r = validateInput({ ...i, chute: { ...i.chute, endStation: 0 } })
    expect(codes(r)).toContain('STATION_RANGE_INVALID')
  })

  it('迭代参数非正应报错', () => {
    const i = makeInput()
    expect(
      codes(validateInput({ ...i, solver: { ...i.solver, maxIterations: 0 } })),
    ).toContain('MAX_ITERATIONS_INVALID')
    expect(
      codes(validateInput({ ...i, solver: { ...i.solver, relativeTolerance: 0 } })),
    ).toContain('TOLERANCE_INVALID')
  })

  it('σs 人工输入超出 [0.20, 1.00] 应报错', () => {
    const i = makeInput()
    const r = validateInput({
      ...i,
      operation: { ...i.operation, downstreamWaterLevel: 101 },
      submergence: { kind: 'manual', sigmaS: 0.05 },
    })
    expect(codes(r)).toContain('SIGMA_S_OUT_OF_RANGE')
  })
})

describe('checkApplicability —— 适用范围警告', () => {
  it('合法输入应无超范围警告', () => {
    expect(checkApplicability(makeInput())).toEqual([])
  })

  it('H/H_d 超出表 A.2.1-1 行域 [0.4, 1.3] 应告警', () => {
    const i = makeInput()
    const r = checkApplicability({
      ...i,
      operation: { ...i.operation, headOverCrest: 10 }, // 10/5 = 2.0
    })
    expect(codes(r)).toContain('HEAD_RATIO_OUTSIDE_TABLE')
    expect(r.every((d) => d.level === 'out-of-range')).toBe(true)
  })

  it('P₁/H_d 低于 0.2 应告警', () => {
    const i = makeInput()
    const r = checkApplicability({ ...i, weir: { ...i.weir, upstreamHeightP1: 0.5 } }) // 0.1
    expect(codes(r)).toContain('PIER_HEIGHT_RATIO_OUTSIDE_TABLE')
  })

  it('P₁/H_d ≥ 1.33 属高堰，不应因表域告警', () => {
    const i = makeInput()
    const r = checkApplicability({ ...i, weir: { ...i.weir, upstreamHeightP1: 8 } })
    expect(codes(r)).not.toContain('PIER_HEIGHT_RATIO_OUTSIDE_TABLE')
  })

  it('糙率超出表 A.8 总体区间 [0.011, 0.045] 应告警', () => {
    const i = makeInput()
    expect(
      codes(checkApplicability({ ...i, chute: { ...i.chute, roughness: 0.008 } })),
    ).toContain('ROUGHNESS_OUTSIDE_TABLE_A8')
    expect(
      codes(checkApplicability({ ...i, chute: { ...i.chute, roughness: 0.06 } })),
    ).toContain('ROUGHNESS_OUTSIDE_TABLE_A8')
  })

  it('底坡与底坡角度不一致应告警（i 应等于 sinθ）', () => {
    const i = makeInput()
    const r = checkApplicability({ ...i, chute: { ...i.chute, bedSlope: 0.5 } })
    expect(codes(r)).toContain('BED_SLOPE_ANGLE_INCONSISTENT')
  })

  it('下游河床高程高于堰顶应告警（P₂ 为非正）', () => {
    const i = makeInput()
    const r = checkApplicability({
      ...i,
      weir: { ...i.weir, downstreamBedElevation: 102 },
    })
    expect(codes(r)).toContain('DOWNSTREAM_HEIGHT_NON_POSITIVE')
  })
})
