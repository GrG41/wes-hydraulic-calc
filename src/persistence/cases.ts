/**
 * 算例持久化（IndexedDB）。
 *
 * 依据：AGENTS.md §6 阶段 4「算例保存/加载（IndexedDB）」、§2.7「离线优先」。
 *
 * ⚠️ **持久性风险（必须让使用者知道）**
 * IndexedDB 是**可被浏览器清除**的存储：
 *   · 用户清理站点数据、隐私模式、存储配额回收都会导致算例丢失；
 *   · iOS Safari 对**未安装到主屏**的站点，长期不用可能回收其脚本可写存储。
 * 因此本模块在提供 IndexedDB 的同时，**必须同时提供 JSON 导出/导入**，
 * 作为算例的可携带、可备份载体。两者缺一不可。
 */

import type { CalculationInput } from '../core'

/** 存储结构版本。结构变更时递增，并在读取时校验。 */
export const CASE_SCHEMA_VERSION = 1

const DB_NAME = 'wes-hydraulic-calc'
const DB_VERSION = 1
const STORE = 'cases'

/** 一个已保存的算例。 */
export interface SavedCase {
  readonly id: string
  readonly name: string
  /** ISO 8601 */
  readonly createdAt: string
  /** ISO 8601 */
  readonly updatedAt: string
  readonly schemaVersion: number
  readonly input: CalculationInput
}

/** 算例 JSON 包的解析结果。 */
export type CaseParseResult =
  | { readonly ok: true; readonly cases: readonly SavedCase[]; readonly skipped: number }
  | { readonly ok: false; readonly error: string }

// ─────────────────────────────────────────────────────────────────
//  IndexedDB 底层
// ─────────────────────────────────────────────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('updatedAt', 'updatedAt', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('无法打开本地数据库'))
    req.onblocked = () => reject(new Error('本地数据库被其他标签页占用，请关闭其他页面后重试'))
  })
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const req = work(tx.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error ?? new Error('本地数据库操作失败'))
        tx.oncomplete = () => db.close()
        tx.onabort = () => {
          db.close()
          reject(tx.error ?? new Error('本地数据库事务被中止'))
        }
      }),
  )
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `case-${Date.now()}-${Math.floor(Math.random() * 1e9)}`
}

// ─────────────────────────────────────────────────────────────────
//  CRUD
// ─────────────────────────────────────────────────────────────────

/**
 * 保存算例。给定 `id` 时为更新（保留原 `createdAt`），否则新建。
 * 名称重复不阻止保存，但调用方可先自行判重（见 `hasCaseNamed`）。
 */
export async function saveCase(
  name: string,
  input: CalculationInput,
  id?: string,
): Promise<SavedCase> {
  const trimmed = name.trim()
  if (trimmed === '') throw new Error('算例名称不能为空')

  const now = new Date().toISOString()
  const existing = id === undefined ? undefined : await getCase(id)
  const record: SavedCase = {
    id: existing?.id ?? id ?? newId(),
    name: trimmed,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    schemaVersion: CASE_SCHEMA_VERSION,
    input,
  }
  await runTransaction('readwrite', (store) => store.put(record))
  return record
}

/** 列出全部算例，按更新时间倒序。 */
export async function listCases(): Promise<SavedCase[]> {
  const all = await runTransaction<SavedCase[]>('readonly', (store) => store.getAll())
  return [...all].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** 按 id 读取算例。 */
export async function getCase(id: string): Promise<SavedCase | undefined> {
  return runTransaction<SavedCase | undefined>('readonly', (store) => store.get(id))
}

/** 删除算例。 */
export async function deleteCase(id: string): Promise<void> {
  await runTransaction('readwrite', (store) => store.delete(id))
}

/** 清空全部算例。 */
export async function clearAllCases(): Promise<void> {
  await runTransaction('readwrite', (store) => store.clear())
}

/** 是否已存在同名算例。 */
export async function hasCaseNamed(name: string): Promise<boolean> {
  const all = await listCases()
  return all.some((c) => c.name === name.trim())
}

// ─────────────────────────────────────────────────────────────────
//  JSON 导出 / 导入（算例的可携带载体）
// ─────────────────────────────────────────────────────────────────

export interface CaseBundle {
  readonly kind: 'wes-hydraulic-calc/cases'
  readonly schemaVersion: number
  readonly exportedAt: string
  readonly cases: readonly SavedCase[]
}

/** 导出一个或多个算例为 JSON 文本。 */
export function exportCasesJson(cases: readonly SavedCase[], pretty = true): string {
  const bundle: CaseBundle = {
    kind: 'wes-hydraulic-calc/cases',
    schemaVersion: CASE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    cases,
  }
  return pretty ? JSON.stringify(bundle, null, 2) : JSON.stringify(bundle)
}

/**
 * 解析算例 JSON。
 *
 * 单条算例字段不合法时**跳过该条并计数**，而不是让整包失败
 * —— 部分可恢复优于全盘拒绝；但若**全部**不可用或根本不是本程序的包，则报错。
 */
export function parseCasesJson(text: string): CaseParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: '不是合法的 JSON 文本' }
  }

  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'JSON 顶层不是对象' }
  }
  const bundle = raw as Partial<CaseBundle>
  if (bundle.kind !== 'wes-hydraulic-calc/cases') {
    return { ok: false, error: '不是本程序导出的算例文件（缺少 kind 标识）' }
  }
  if (!Array.isArray(bundle.cases)) {
    return { ok: false, error: '算例包中缺少 cases 数组' }
  }

  const valid: SavedCase[] = []
  let skipped = 0
  for (const item of bundle.cases) {
    const c = normalizeCase(item)
    if (c === null) skipped += 1
    else valid.push(c)
  }

  if (valid.length === 0) {
    return { ok: false, error: `算例包中 ${bundle.cases.length} 条记录全部无法识别` }
  }
  return { ok: true, cases: valid, skipped }
}

/** 校验并规范化单条算例；不可识别时返回 null。 */
function normalizeCase(item: unknown): SavedCase | null {
  if (typeof item !== 'object' || item === null) return null
  const c = item as Partial<SavedCase>
  if (typeof c.name !== 'string' || c.name.trim() === '') return null
  if (typeof c.input !== 'object' || c.input === null) return null

  const now = new Date().toISOString()
  return {
    id: typeof c.id === 'string' && c.id !== '' ? c.id : newId(),
    name: c.name.trim(),
    createdAt: typeof c.createdAt === 'string' ? c.createdAt : now,
    updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : now,
    schemaVersion: typeof c.schemaVersion === 'number' ? c.schemaVersion : CASE_SCHEMA_VERSION,
    input: c.input as CalculationInput,
  }
}

/** 批量写入（导入用）。逐条写入，返回成功条数。 */
export async function importCases(cases: readonly SavedCase[]): Promise<number> {
  let n = 0
  for (const c of cases) {
    // 重新分配 id，避免覆盖本机已有算例
    await saveCase(c.name, c.input)
    n += 1
  }
  return n
}
