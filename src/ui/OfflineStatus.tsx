/**
 * 离线状态指示。
 *
 * 依据：AGENTS.md §2.7「离线优先」。
 *
 * 设计要点：**在使用现场，工程师需要一眼看出"这台设备现在能不能断网用"**，
 * 而不是去猜。因此本组件区分三种状态：
 *   · 已缓存（SW 已激活）→ 断网可用，显示为常态提示；
 *   · 尚未缓存 → 需联网打开一次完成缓存；
 *   · 当前已断网且尚未缓存 → 明确告警（这是唯一真正不可用的情形）。
 */

import { useEffect, useState } from 'react'

type CacheState = 'unknown' | 'cached' | 'uncached' | 'unsupported'

export default function OfflineStatus() {
  const [online, setOnline] = useState<boolean>(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  const [cache, setCache] = useState<CacheState>('unknown')

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      setCache('unsupported')
      return undefined
    }
    let alive = true
    // `ready` 在 SW 激活并接管后 resolve；超时则判为尚未缓存（首次访问尚未完成）。
    const timer = window.setTimeout(() => {
      if (alive) setCache((prev) => (prev === 'cached' ? prev : 'uncached'))
    }, 4000)

    navigator.serviceWorker.ready
      .then(() => {
        if (!alive) return
        window.clearTimeout(timer)
        setCache('cached')
      })
      .catch(() => {
        if (alive) setCache('uncached')
      })

    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [])

  const unsupported = cache === 'unsupported'
  const danger = !online && cache !== 'cached'

  const label = (() => {
    if (unsupported) return '当前浏览器不支持离线缓存'
    if (!online) return cache === 'cached' ? '已断网 —— 计算功能可正常使用' : '已断网且尚未缓存，无法使用'
    if (cache === 'cached') return '离线就绪 —— 断网后全部功能仍可使用'
    if (cache === 'uncached') return '正在准备离线缓存……'
    return '正在检查离线状态……'
  })()

  const cls = danger
    ? 'offline offline--danger'
    : cache === 'cached'
      ? 'offline offline--ok'
      : 'offline'

  return (
    <div className={cls} role="status" aria-live="polite">
      <span className="offline__dot" aria-hidden="true" />
      <span className="offline__text">{label}</span>
      <span className="offline__note">
        本程序的全部计算、图表与计算书导出均在本机完成，运行时不访问任何网络。
      </span>
    </div>
  )
}
