'use client'

/**
 * 管理后台会话的唯一所有者。
 *
 * 背景（真实缺陷）：AdminShell 原先自己请求 /api/admin/auth/me，而 admin 段没有 layout，
 * 于是每次切换菜单项都会卸载重建 shell 并重新拉取会话；期间 loading 为真，
 * AdminShell 会用全屏骨架替换整个视口 —— 实测会话接口多 400ms 时，
 * 全屏骨架会持续 415ms（逐帧采样），用户感知就是「整页刷新」。
 *
 * 现在把会话所有权放到 admin/layout.tsx：会话的生命周期等于「控制台会话」，
 * 不随页面切换重建。AdminShell 只消费，不再自己请求。
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { AdminApiError, adminRequest } from './admin-api'
import type { AdminIdentity } from './AdminShell'

interface AdminMeResponse {
  admin: AdminIdentity
}

type AdminSessionStatus = 'idle' | 'loading' | 'ready' | 'error'

interface AdminSessionState {
  status: AdminSessionStatus
  admin: AdminIdentity | null
  error: AdminApiError | null
}

export interface AdminSessionResource {
  data: AdminMeResponse | null
  loading: boolean
  error: AdminApiError | null
  /** 强制重新拉取（错误页的「重试」用） */
  reload: () => void
}

interface AdminSessionContextValue extends AdminSessionResource {
  /** 幂等：已就绪或请求进行中时什么都不做，避免每次挂载都打接口 */
  ensureLoaded: () => void
  /** 退出登录时清空，避免下一位管理员看到上一位的身份 */
  reset: () => void
}

const AdminSessionStateContext = createContext<AdminSessionContextValue | null>(null)

function toAdminError(caught: unknown): AdminApiError {
  if (caught instanceof AdminApiError) return caught
  return new AdminApiError(
    0,
    'UNKNOWN',
    caught instanceof Error ? caught.message : '未知错误',
  )
}

interface AdminSessionProviderProps {
  /**
   * 注入已知会话（服务端下发 / 渲染测试）。
   * 传入时直接进入 ready，避免落入加载态。
   */
  initialAdmin?: AdminIdentity | null
}

export function AdminSessionProvider({
  children,
  initialAdmin = null,
}: PropsWithChildren<AdminSessionProviderProps>) {
  const [state, setState] = useState<AdminSessionState>(
    initialAdmin
      ? { status: 'ready', admin: initialAdmin, error: null }
      : { status: 'idle', admin: null, error: null },
  )

  const inFlightRef = useRef(false)
  const stateRef = useRef(state)
  stateRef.current = state

  const load = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setState((prev) => ({ ...prev, status: 'loading', error: null }))
    try {
      const payload = await adminRequest<AdminMeResponse>('/api/admin/auth/me')
      setState({ status: 'ready', admin: payload.admin, error: null })
    } catch (caught) {
      setState({ status: 'error', admin: null, error: toAdminError(caught) })
    } finally {
      inFlightRef.current = false
    }
  }, [])

  // 懒加载：只有真正挂载了 AdminShell 的控制台页面才会触发；
  // 登录页没有消费者，因此不会在未登录状态下白白打一次 401。
  const ensureLoaded = useCallback(() => {
    const { status } = stateRef.current
    if (status === 'loading' || status === 'ready') return
    void load()
  }, [load])

  const reload = useCallback(() => {
    void load()
  }, [load])

  const reset = useCallback(() => {
    inFlightRef.current = false
    setState({ status: 'idle', admin: null, error: null })
  }, [])

  const value = useMemo<AdminSessionContextValue>(
    () => ({
      data: state.admin ? { admin: state.admin } : null,
      // idle 表示尚未发起请求，对界面而言等价于加载中
      loading: state.status === 'idle' || state.status === 'loading',
      error: state.error,
      ensureLoaded,
      reload,
      reset,
    }),
    [state, ensureLoaded, reload, reset],
  )

  return (
    <AdminSessionStateContext.Provider value={value}>{children}</AdminSessionStateContext.Provider>
  )
}

/** 供 AdminShell 使用：读取会话并触发懒加载 */
export function useAdminSessionResource(): AdminSessionContextValue {
  const value = useContext(AdminSessionStateContext)
  if (!value) {
    throw new Error('useAdminSessionResource must be used inside AdminSessionProvider')
  }
  return value
}
