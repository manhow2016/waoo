'use client'

/**
 * 当前用户会员状态（客户端共享）
 *
 * 数据来源：GET /api/membership/status（服务端唯一真相源是 src/lib/membership.ts）。
 * 仅用于展示与引导；供应商准入由服务端三处校验强制执行。
 */

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-fetch'

export interface MembershipStatusState {
  loading: boolean
  failed: boolean
  /** 0=免费, 1=月付, 2=季付, 3=年付 */
  level: number
  isActive: boolean
  allowAllProviders: boolean
  /** ISO 字符串，免费用户为 null */
  expireAt: string | null
  /** 距离到期还剩几天（服务端向上取整）；免费用户为 null */
  daysRemaining: number | null
  /** 是否进入续费提醒窗口（默认到期前 7 天） */
  expiringSoon: boolean
  /** 续费提醒窗口天数，由服务端下发，避免前端各自硬编码 */
  reminderDays: number
  planCode: string | null
  reload: () => void
}

type MembershipStatusData = Omit<MembershipStatusState, 'reload'>

const INITIAL_STATE: MembershipStatusData = {
  loading: true,
  failed: false,
  level: 0,
  isActive: false,
  allowAllProviders: false,
  expireAt: null,
  daysRemaining: null,
  expiringSoon: false,
  reminderDays: 7,
  planCode: null,
}

interface MembershipStatusResponse {
  level?: unknown
  isActive?: unknown
  allowAllProviders?: unknown
  expireAt?: unknown
  daysRemaining?: unknown
  expiringSoon?: unknown
  reminderDays?: unknown
  plan?: { code?: unknown } | null
}

export interface UseMembershipStatusOptions {
  /** 未登录时不要发请求（默认 true） */
  enabled?: boolean
}

export function useMembershipStatus(
  options: UseMembershipStatusOptions = {},
): MembershipStatusState {
  const enabled = options.enabled !== false
  const [state, setState] = useState(INITIAL_STATE)
  const [reloadToken, setReloadToken] = useState(0)

  const reload = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true, failed: false }))
    setReloadToken((token) => token + 1)
  }, [])

  useEffect(() => {
    if (!enabled) {
      setState((prev) => (prev.loading ? { ...prev, loading: false } : prev))
      return
    }
    let cancelled = false

    async function load() {
      try {
        const res = await apiFetch('/api/membership/status')
        if (!res.ok) {
          throw new Error(`membership status load failed: HTTP ${res.status}`)
        }
        const payload = (await res.json()) as MembershipStatusResponse
        if (cancelled) return
        setState({
          loading: false,
          failed: false,
          level: typeof payload.level === 'number' ? payload.level : 0,
          isActive: payload.isActive === true,
          allowAllProviders: payload.allowAllProviders === true,
          expireAt: typeof payload.expireAt === 'string' ? payload.expireAt : null,
          daysRemaining:
            typeof payload.daysRemaining === 'number' ? payload.daysRemaining : null,
          expiringSoon: payload.expiringSoon === true,
          reminderDays:
            typeof payload.reminderDays === 'number' && payload.reminderDays > 0
              ? payload.reminderDays
              : 7,
          planCode:
            payload.plan && typeof payload.plan.code === 'string'
              ? payload.plan.code
              : null,
        })
      } catch {
        if (cancelled) return
        setState((prev) => ({ ...prev, loading: false, failed: true }))
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [enabled, reloadToken, reload])

  return { ...state, reload }
}
