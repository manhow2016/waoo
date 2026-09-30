'use client'

/**
 * 后台资源读取 Hook（列表 / 详情通用）
 *
 * 统一处理 loading / error / 重新加载三态，让页面只关心渲染与筛选条件。
 * 401 通过 AdminShell 统一跳登录，这里只负责把错误暴露出去。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { AdminApiError, adminRequest } from './admin-api'

export interface AdminResourceState<T> {
  data: T | null
  loading: boolean
  error: AdminApiError | null
  reload: () => void
}

/** key 变化即重新请求；传入 null 表示暂不请求 */
export function useAdminResource<T>(path: string | null): AdminResourceState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(path !== null)
  const [error, setError] = useState<AdminApiError | null>(null)
  const [nonce, setNonce] = useState(0)
  const requestIdRef = useRef(0)

  const reload = useCallback(() => {
    setNonce((value) => value + 1)
  }, [])

  useEffect(() => {
    if (path === null) {
      setData(null)
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setLoading(true)
    setError(null)

    async function load() {
      try {
        const payload = await adminRequest<T>(path as string)
        if (cancelled || requestIdRef.current !== requestId) return
        setData(payload)
        setLoading(false)
      } catch (caught) {
        if (cancelled || requestIdRef.current !== requestId) return
        setError(
          caught instanceof AdminApiError
            ? caught
            : new AdminApiError(0, 'UNKNOWN', caught instanceof Error ? caught.message : '未知错误'),
        )
        setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [path, nonce])

  return { data, loading, error, reload }
}
