/**
 * 参数状态（Zustand）。
 *
 * 决策来源：`docs/DECISIONS.md` DEC-024 —— 状态管理采用 Zustand。
 * 职责：持有**一份完整的计算输入**，供表单绑定与求解调用；
 * 提供分组更新、整体替换与一键再次试算所需的参数保留。
 */

import { create } from 'zustand'
import type { CalculationInput } from '../core'
import { GRAVITY, VELOCITY_DISTRIBUTION_COEFFICIENT } from '../core'

/**
 * 默认输入 —— 一组可直接求解的**示例参数**（非工程推荐值）。
 *
 * ⚠️ 这里的数值仅用于让界面开箱可算，**不是任何工程建议**；
 * 使用者必须按实际工程填写。凡标准给定的区间，其取值来源见各字段注释。
 */
export function createDefaultInput(): CalculationInput {
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
      bedSlope: 0.1,
      bedAngleDeg: 5.7392,
      roughness: 0.014,
      width: 40,
      startStation: 0,
      endStation: 50,
      segmentation: 'station',
      stationStep: 5,
      startBedElevation: 94,
      entranceDepth: 1.5,
    },
    boundary: {
      upstream: 'weir-profile-end',
      upstreamDepth: 'from-weir-profile',
      downstreamControl: 'both-by-regime',
      downstreamWaterLevel: 90,
      outputBothBranches: true,
    },
    solver: {
      maxIterations: 50,
      relativeTolerance: 1e-6,
      epsilonFloor: 1e-12,
      onNonConvergence: 'fail',
    },
    submergence: { kind: 'auto-free-flow' },
  }
}

/** 供界面选择项使用的枚举标签（与核心层的类型一一对应）。 */
export const OPTIONS = {
  upstreamSlope: [
    { value: '3:0', label: '3:0（铅直）' },
    { value: '3:1', label: '3:1' },
    { value: '3:2', label: '3:2' },
    { value: '3:3', label: '3:3' },
  ],
  crestCurveType: [
    { value: 'double-arc', label: '双圆弧' },
    { value: 'triple-arc', label: '三圆弧（上游堰面铅直）' },
    { value: 'ellipse', label: '椭圆' },
  ],
  pierHeadShape: [
    { value: 'rectangular', label: '矩形' },
    { value: 'wedge-or-semicircular', label: '楔形或半圆形' },
    { value: 'pointed', label: '尖圆形' },
  ],
  abutmentShape: [
    { value: 'rectangular', label: '直角矩形（ζ₀ = 1.0）' },
    { value: 'broken-line-or-circular', label: '折线或圆形（ζ₀ = 0.7）' },
    { value: 'streamlined', label: '流线形（ζ₀ = 0.4）' },
  ],
  upstreamSectionShape: [
    { value: 'rectangular', label: '矩形' },
    { value: 'trapezoidal', label: '对称梯形' },
  ],
  designHeadKind: [
    { value: 'direct', label: '直接给定 H_d' },
    { value: 'from-max-head', label: '由 H_max 推求' },
  ],
  submergenceKind: [
    { value: 'auto-free-flow', label: '自动判定（不淹没时取 σs = 1.0）' },
    { value: 'manual', label: '人工查图输入 σs' },
  ],
} as const

export interface ParameterStore {
  readonly input: CalculationInput
  /** 按顶层分组打补丁（表单绑定用） */
  patchWeir: (patch: Partial<CalculationInput['weir']>) => void
  patchPiers: (patch: Partial<CalculationInput['piers']>) => void
  patchUpstreamSection: (patch: Partial<CalculationInput['upstreamSection']>) => void
  patchDesignHead: (patch: Partial<CalculationInput['designHead']>) => void
  patchOperation: (patch: Partial<CalculationInput['operation']>) => void
  patchChute: (patch: Partial<CalculationInput['chute']>) => void
  patchBoundary: (patch: Partial<CalculationInput['boundary']>) => void
  patchSolver: (patch: Partial<CalculationInput['solver']>) => void
  setSubmergence: (spec: CalculationInput['submergence']) => void
  /** 整体替换（算例加载用） */
  replace: (input: CalculationInput) => void
  /** 恢复默认示例参数 */
  reset: () => void
}

export const useParameterStore = create<ParameterStore>((set) => ({
  input: createDefaultInput(),

  patchWeir: (patch) => set((s) => ({ input: { ...s.input, weir: { ...s.input.weir, ...patch } } })),
  patchPiers: (patch) => set((s) => ({ input: { ...s.input, piers: { ...s.input.piers, ...patch } } })),
  patchUpstreamSection: (patch) =>
    set((s) => ({ input: { ...s.input, upstreamSection: { ...s.input.upstreamSection, ...patch } } })),
  patchDesignHead: (patch) =>
    set((s) => ({ input: { ...s.input, designHead: { ...s.input.designHead, ...patch } as CalculationInput['designHead'] } })),
  patchOperation: (patch) =>
    set((s) => ({ input: { ...s.input, operation: { ...s.input.operation, ...patch } } })),
  patchChute: (patch) => set((s) => ({ input: { ...s.input, chute: { ...s.input.chute, ...patch } } })),
  patchBoundary: (patch) =>
    set((s) => ({ input: { ...s.input, boundary: { ...s.input.boundary, ...patch } } })),
  patchSolver: (patch) => set((s) => ({ input: { ...s.input, solver: { ...s.input.solver, ...patch } } })),
  setSubmergence: (spec) => set((s) => ({ input: { ...s.input, submergence: spec } })),

  replace: (input) => set({ input }),
  reset: () => set({ input: createDefaultInput() }),
}))

/** 展示用：常量回显（供界面标注公式中的常数来源）。 */
export const CONSTANT_ECHO = {
  gravity: GRAVITY,
  alpha: VELOCITY_DISTRIBUTION_COEFFICIENT,
} as const
