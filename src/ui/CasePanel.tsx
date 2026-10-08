/**
 * 算例管理面板：保存 / 载入 / 删除 / 导出 / 导入。
 *
 * ⚠️ 必须向使用者明示 IndexedDB 的可清除性（见 `src/persistence/cases.ts` 顶部说明），
 * 并引导用 JSON 导出作为备份与交换载体。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParameterStore } from '../store/parameterStore'
import {
  deleteCase,
  exportCasesJson,
  importCases,
  listCases,
  parseCasesJson,
  saveCase,
} from '../persistence/cases'
import type { SavedCase } from '../persistence/cases'

function downloadText(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function CasePanel() {
  const input = useParameterStore((s) => s.input)
  const replace = useParameterStore((s) => s.replace)

  const [cases, setCases] = useState<readonly SavedCase[]>([])
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const refresh = useCallback(async () => {
    try {
      setCases(await listCases())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleSave = useCallback(async () => {
    setError(null)
    setMessage(null)
    try {
      const saved = await saveCase(name, input, editingId ?? undefined)
      setMessage(editingId === null ? `已保存为「${saved.name}」` : `已更新「${saved.name}」`)
      setName('')
      setEditingId(null)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [name, input, editingId, refresh])

  const handleExport = useCallback(() => {
    setError(null)
    setMessage(null)
    if (cases.length === 0) {
      setError('当前没有可导出的算例')
      return
    }
    const stamp = new Date().toISOString().slice(0, 10)
    downloadText(exportCasesJson(cases), `WES算例_${stamp}.json`)
    setMessage(`已导出 ${cases.length} 个算例`)
  }, [cases])

  const handleImport = useCallback(
    async (file: File) => {
      setError(null)
      setMessage(null)
      try {
        const parsed = parseCasesJson(await file.text())
        if (!parsed.ok) {
          setError(`导入失败：${parsed.error}`)
          return
        }
        const n = await importCases(parsed.cases)
        await refresh()
        setMessage(
          `已导入 ${n} 个算例` + (parsed.skipped > 0 ? `（跳过 ${parsed.skipped} 条无法识别的记录）` : ''),
        )
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [refresh],
  )

  return (
    <section className="cases">
      <h3 className="results__sub">算例</h3>

      <div className="cases__save">
        <input
          className="field__input"
          type="text"
          placeholder="算例名称，例如：初设方案 A"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSave()
          }}
        />
        <button type="button" className="btn btn--primary" onClick={() => void handleSave()}>
          {editingId === null ? '保存当前参数' : '覆盖保存'}
        </button>
        {editingId !== null ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setEditingId(null)
              setName('')
            }}
          >
            取消覆盖
          </button>
        ) : null}
      </div>

      {message !== null ? <p className="results__ok">{message}</p> : null}
      {error !== null ? (
        <ul className="diag">
          <li className="diag__item diag__item--input-error">
            <span className="diag__msg">{error}</span>
          </li>
        </ul>
      ) : null}

      {cases.length === 0 ? (
        <p className="results__note">尚未保存任何算例。</p>
      ) : (
        <table className="tbl tbl--dense">
          <thead>
            <tr>
              <th>名称</th>
              <th>更新时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{new Date(c.updatedAt).toLocaleString('zh-CN')}</td>
                <td className="cases__ops">
                  <button
                    type="button"
                    className="btn btn--mini"
                    onClick={() => {
                      replace(c.input)
                      setMessage(`已载入「${c.name}」，点「计算」重新求解`)
                    }}
                  >
                    载入
                  </button>
                  <button
                    type="button"
                    className="btn btn--mini"
                    onClick={() => {
                      setEditingId(c.id)
                      setName(c.name)
                      setMessage(null)
                    }}
                  >
                    改名/覆盖
                  </button>
                  <button
                    type="button"
                    className="btn btn--mini"
                    onClick={async () => {
                      await deleteCase(c.id)
                      await refresh()
                      setMessage(`已删除「${c.name}」`)
                    }}
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="cases__io">
        <button type="button" className="btn" onClick={handleExport}>
          导出全部算例（JSON）
        </button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          导入算例（JSON）
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f !== undefined) void handleImport(f)
            e.target.value = ''
          }}
        />
      </div>

      <p className="cases__warn">
        <strong>请务必定期导出备份。</strong>
        算例保存在浏览器的本地数据库（IndexedDB）中，属**可被清除**的存储：
        清理站点数据、隐私模式、存储配额回收都会导致算例丢失；iOS Safari 对未安装到主屏的站点，
        长期不用也可能回收。JSON 导出文件才是算例的可携带、可长期保存的载体。
      </p>
    </section>
  )
}
