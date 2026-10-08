/**
 * 参数输入表单。
 *
 * 要求（AGENTS.md §6 阶段 4）：**含单位提示、默认值、范围提示**。
 * 每个字段都标注单位；凡标准给定适用范围的字段，给出范围提示文字。
 */

import type { JSX } from 'react'
import { OPTIONS, useParameterStore } from '../store/parameterStore'

interface FieldProps {
  readonly label: string
  readonly unit?: string
  readonly hint?: string
  readonly children: JSX.Element
}

function Field({ label, unit, hint, children }: FieldProps) {
  return (
    <label className="field">
      <span className="field__label">
        {label}
        {unit ? <em className="field__unit">{unit}</em> : null}
      </span>
      {children}
      {hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  )
}

function Num(props: {
  value: number | undefined
  onChange: (v: number) => void
  step?: string
  min?: string
}) {
  return (
    <input
      type="number"
      className="field__input"
      value={props.value ?? ''}
      step={props.step ?? 'any'}
      min={props.min}
      onChange={(e) => props.onChange(Number(e.target.value))}
    />
  )
}

export default function ParameterForm() {
  const input = useParameterStore((s) => s.input)
  const patchWeir = useParameterStore((s) => s.patchWeir)
  const patchPiers = useParameterStore((s) => s.patchPiers)
  const patchUpstream = useParameterStore((s) => s.patchUpstreamSection)
  const patchDesignHead = useParameterStore((s) => s.patchDesignHead)
  const patchOperation = useParameterStore((s) => s.patchOperation)
  const patchChute = useParameterStore((s) => s.patchChute)
  const patchBoundary = useParameterStore((s) => s.patchBoundary)
  const setSubmergence = useParameterStore((s) => s.setSubmergence)

  const hs = input.operation.downstreamWaterLevel - input.weir.crestElevation

  return (
    <form className="form" onSubmit={(e) => e.preventDefault()}>
      <fieldset>
        <legend>堰体几何</legend>
        <div className="grid">
          <Field label="堰顶高程" unit="m">
            <Num value={input.weir.crestElevation} onChange={(v) => patchWeir({ crestElevation: v })} />
          </Field>
          <Field label="下游河床高程" unit="m" hint="用于下游堰高 P₂（图 A.2.1-3 横轴）">
            <Num
              value={input.weir.downstreamBedElevation}
              onChange={(v) => patchWeir({ downstreamBedElevation: v })}
            />
          </Field>
          <Field label="上游堰高 P₁" unit="m" hint="P₁/H_d ≥ 1.33 为高堰">
            <Num value={input.weir.upstreamHeightP1} onChange={(v) => patchWeir({ upstreamHeightP1: v })} />
          </Field>
          <Field label="上游堰面坡度" hint="标准仅覆盖这 4 种（表 A.1.1）">
            <select
              className="field__input"
              value={input.weir.upstreamSlope}
              onChange={(e) => patchWeir({ upstreamSlope: e.target.value as typeof input.weir.upstreamSlope })}
            >
              {OPTIONS.upstreamSlope.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="上游堰头曲线型式" hint="三圆弧几何待图纸转录">
            <select
              className="field__input"
              value={input.weir.crestCurveType}
              onChange={(e) => patchWeir({ crestCurveType: e.target.value as typeof input.weir.crestCurveType })}
            >
              {OPTIONS.crestCurveType.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="溢流堰总净宽 B" unit="m" hint="多孔时为各孔净宽之和">
            <Num value={input.weir.netWidthB} onChange={(v) => patchWeir({ netWidthB: v })} />
          </Field>
          <Field label="单孔宽度 b" unit="m">
            <Num value={input.weir.singleOpeningWidthB} onChange={(v) => patchWeir({ singleOpeningWidthB: v })} />
          </Field>
          <Field label="闸孔数目 n" hint="整数，≥ 1">
            <Num value={input.weir.openingCount} step="1" min="1" onChange={(v) => patchWeir({ openingCount: v })} />
          </Field>
        </div>
      </fieldset>

      <fieldset>
        <legend>闸墩布置（侧收缩系数 ε）</legend>
        <div className="grid">
          <Field label="中墩墩头形状" hint="表 A.2.1-3">
            <select
              className="field__input"
              value={input.piers.pierHeadShape}
              onChange={(e) => patchPiers({ pierHeadShape: e.target.value as typeof input.piers.pierHeadShape })}
            >
              {OPTIONS.pierHeadShape.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="墩头伸出距离 Lk" unit="m">
            <Num value={input.piers.pierHeadExtensionLk} onChange={(v) => patchPiers({ pierHeadExtensionLk: v })} />
          </Field>
          <Field label="尖墩高度 Hs" unit="m" hint="表 A.2.1-3 两档的基准">
            <Num value={input.piers.pierHeadHeightHs} onChange={(v) => patchPiers({ pierHeadHeightHs: v })} />
          </Field>
          <Field label="边墩形状（ζ₀）">
            <select
              className="field__input"
              value={input.piers.abutmentShape}
              onChange={(e) => patchPiers({ abutmentShape: e.target.value as typeof input.piers.abutmentShape })}
            >
              {OPTIONS.abutmentShape.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </fieldset>

      <fieldset>
        <legend>上游计算断面（行进流速水头，取堰前 3H 处）</legend>
        <div className="grid">
          <Field label="断面底高程" unit="m">
            <Num
              value={input.upstreamSection.bedElevation}
              onChange={(v) => patchUpstream({ bedElevation: v })}
            />
          </Field>
          <Field label="断面型式" hint="复式断面不在本期范围">
            <select
              className="field__input"
              value={input.upstreamSection.shape.kind}
              onChange={(e) => {
                const kind = e.target.value
                patchUpstream({
                  shape:
                    kind === 'rectangular'
                      ? { kind: 'rectangular', bottomWidth: 1000 }
                      : { kind: 'trapezoidal', bottomWidth: 1000, sideSlope: 1.5 },
                })
              }}
            >
              {OPTIONS.upstreamSectionShape.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="断面底宽" unit="m">
            <Num
              value={input.upstreamSection.shape.bottomWidth}
              onChange={(v) =>
                patchUpstream({ shape: { ...input.upstreamSection.shape, bottomWidth: v } })
              }
            />
          </Field>
          {input.upstreamSection.shape.kind === 'trapezoidal' ? (
            <Field label="边坡系数 m" hint="水平:垂直">
              <Num
                value={input.upstreamSection.shape.sideSlope}
                onChange={(v) =>
                  patchUpstream({
                    shape: {
                      kind: 'trapezoidal',
                      bottomWidth: input.upstreamSection.shape.bottomWidth,
                      sideSlope: v,
                    },
                  })
                }
              />
            </Field>
          ) : null}
        </div>
      </fieldset>

      <fieldset>
        <legend>定型设计水头 H_d（标准 A.1.1）</legend>
        <div className="grid">
          <Field label="给定方式">
            <select
              className="field__input"
              value={input.designHead.kind}
              onChange={(e) => {
                const kind = e.target.value
                patchDesignHead(
                  kind === 'direct'
                    ? ({ kind: 'direct', value: 5 } as never)
                    : ({ kind: 'from-max-head', maxHead: 5 } as never),
                )
              }}
            >
              {OPTIONS.designHeadKind.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          {input.designHead.kind === 'direct' ? (
            <Field label="H_d" unit="m">
              <Num
                value={input.designHead.value}
                onChange={(v) => patchDesignHead({ value: v } as never)}
              />
            </Field>
          ) : (
            <Field label="H_max（校核流量下堰上水头）" unit="m" hint="区间系数默认取中值 0.85 / 0.75">
              <Num
                value={input.designHead.maxHead}
                onChange={(v) => patchDesignHead({ maxHead: v } as never)}
              />
            </Field>
          )}
        </div>
      </fieldset>

      <fieldset>
        <legend>运行工况</legend>
        <div className="grid">
          <Field label="堰上水头 H" unit="m" hint="表 A.2.1-1 行域 H/H_d ∈ [0.4, 1.3]">
            <Num value={input.operation.headOverCrest} onChange={(v) => patchOperation({ headOverCrest: v })} />
          </Field>
          <Field label="下游水位" unit="m" hint={`当前 hs = ${hs.toFixed(3)} m（> 0 即可能淹没）`}>
            <Num
              value={input.operation.downstreamWaterLevel}
              onChange={(v) => patchOperation({ downstreamWaterLevel: v })}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset>
        <legend>
          淹没系数 σs
          <span className="legend__warn">图 A.2.1-3 无法自动数字化，淹没工况须人工查图输入</span>
        </legend>
        <div className="grid">
          <Field label="取值方式">
            <select
              className="field__input"
              value={input.submergence.kind}
              onChange={(e) => {
                const kind = e.target.value
                setSubmergence(
                  kind === 'manual'
                    ? { kind: 'manual', sigmaS: 0.9 }
                    : { kind: 'auto-free-flow' },
                )
              }}
            >
              {OPTIONS.submergenceKind.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          {input.submergence.kind === 'manual' ? (
            <Field label="σs" hint="图 A.2.1-3，范围 0.20 ~ 1.00">
              <Num
                value={input.submergence.sigmaS}
                onChange={(v) => setSubmergence({ kind: 'manual', sigmaS: v })}
              />
            </Field>
          ) : null}
        </div>
      </fieldset>

      <fieldset>
        <legend>泄槽与水面线</legend>
        <div className="grid">
          <Field label="泄槽底宽" unit="m">
            <Num value={input.chute.width} onChange={(v) => patchChute({ width: v })} />
          </Field>
          <Field label="糙率 n" hint="表 A.8 总体区间 0.011 ~ 0.045">
            <Num value={input.chute.roughness} onChange={(v) => patchChute({ roughness: v })} />
          </Field>
          <Field label="底坡 i" hint="i = sinθ">
            <Num value={input.chute.bedSlope} onChange={(v) => patchChute({ bedSlope: v })} />
          </Field>
          <Field label="底坡角度 θ" unit="°">
            <Num value={input.chute.bedAngleDeg} onChange={(v) => patchChute({ bedAngleDeg: v })} />
          </Field>
          <Field label="起点桩号" unit="m">
            <Num value={input.chute.startStation} onChange={(v) => patchChute({ startStation: v })} />
          </Field>
          <Field label="终点桩号" unit="m">
            <Num value={input.chute.endStation} onChange={(v) => patchChute({ endStation: v })} />
          </Field>
          <Field label="分段步长" unit="m" hint="默认 5 m，可覆盖">
            <Num value={input.chute.stationStep} onChange={(v) => patchChute({ stationStep: v })} />
          </Field>
          <Field label="起点槽底高程" unit="m" hint="缓流分支据此换算水深">
            <Num
              value={input.chute.startBedElevation}
              onChange={(v) => patchChute({ startBedElevation: v })}
            />
          </Field>
          <Field label="泄槽起始水深" unit="m" hint="留空则按临界水深缺省并提示">
            <Num value={input.chute.entranceDepth} onChange={(v) => patchChute({ entranceDepth: v })} />
          </Field>
          <Field label="下游控制水位" unit="m" hint="给定时另算缓流分支">
            <Num
              value={input.boundary.downstreamWaterLevel}
              onChange={(v) => patchBoundary({ downstreamWaterLevel: v })}
            />
          </Field>
        </div>
      </fieldset>
    </form>
  )
}
