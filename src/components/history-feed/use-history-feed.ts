"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export interface HistoryFeedState {
  loaded: boolean
  loading: boolean
  hasMore: boolean
  offset: number
  /** Всего записей в истории (без свежих задач вкладки, запущенных после загрузки) */
  total: number
  error: string | null
}

export interface HistoryFeedPage<T> {
  items: T[]
  hasMore: boolean
  total: number
}

/**
 * Постраничная загрузка ленты истории: первая страница при монтировании,
 * следующие — по `loadMore` (сторож прокрутки или кнопка «Показать ещё»).
 * Повторный вызов во время загрузки игнорируется (сторож может сработать дважды).
 * Полученные записи отдаются в `onPage` — вызывающий сливает их со своими задачами.
 */
export function useHistoryFeed<T>(opts: {
  /** Адрес страницы без offset/limit, например `/api/voice/history` */
  url: string
  pageSize: number
  onPage: (items: T[]) => void
}) {
  const [state, setState] = useState<HistoryFeedState>({
    loaded: false,
    loading: false,
    hasMore: false,
    offset: 0,
    total: 0,
    error: null,
  })
  const stateRef = useRef(state)
  stateRef.current = state
  const loadingRef = useRef(false)
  const onPageRef = useRef(opts.onPage)
  onPageRef.current = opts.onPage
  const mountedRef = useRef(true)

  const load = useCallback(
    async (offset: number) => {
      if (loadingRef.current) return
      loadingRef.current = true
      setState((s) => ({ ...s, loading: true, error: null }))
      try {
        const sep = opts.url.includes("?") ? "&" : "?"
        const res = await fetch(`${opts.url}${sep}offset=${offset}&limit=${opts.pageSize}`)
        const data = (await res.json().catch(() => ({}))) as Partial<HistoryFeedPage<T>> & { error?: string }
        if (!res.ok) throw new Error(data.error || `Ошибка сервера (${res.status})`)
        if (!mountedRef.current) return
        const items = data.items ?? []
        onPageRef.current(items)
        setState({
          loaded: true,
          loading: false,
          hasMore: Boolean(data.hasMore),
          offset: offset + items.length,
          total: data.total ?? offset + items.length,
          error: null,
        })
      } catch (err) {
        if (!mountedRef.current) return
        const msg = err instanceof Error ? err.message : "Не удалось загрузить историю"
        setState((s) => ({ ...s, loaded: true, loading: false, error: msg }))
      } finally {
        loadingRef.current = false
      }
    },
    [opts.url, opts.pageSize],
  )

  useEffect(() => {
    mountedRef.current = true
    void load(0)
    return () => {
      mountedRef.current = false
    }
  }, [load])

  // Стабильная ссылка: сторож прокрутки не пересоздаётся на каждый рендер
  const loadMore = useCallback(() => {
    void load(stateRef.current.offset)
  }, [load])

  return { state, loadMore }
}
