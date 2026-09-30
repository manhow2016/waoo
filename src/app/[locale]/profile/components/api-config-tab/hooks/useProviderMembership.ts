'use client'

/**
 * 读取当前用户的平台供应商准入状态（会员权益）
 *
 * 说明：客户端锁定状态只负责「展示与引导」，真正的准入执行在服务端三处校验
 * （保存配置 / 任务入队 / worker 运行时）。因此接口异常时按「不锁定」降级，
 * 避免会员接口抖动导致用户连默认供应商都无法配置。
 */

import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/api-fetch'
import { getProviderKey } from '../../api-config'

const NO_LOCKED_PROVIDERS: ReadonlySet<string> = new Set<string>()

interface ProviderMembershipResponse {
  allowAllProviders?: unknown
  defaultProviderCode?: unknown
  providers?: unknown
}

interface ProviderMembershipState {
  loading: boolean
  allowAllProviders: boolean
  defaultProviderCode: string | null
  lockedProviderCodes: ReadonlySet<string>
}

export interface ProviderMembership extends ProviderMembershipState {
  /** 判断某 providerId（可带实例后缀）是否被会员等级锁定 */
  isProviderLocked: (providerId: string) => boolean
}

function parseLockedCodes(payload: ProviderMembershipResponse): Set<string> {
  const providers = Array.isArray(payload.providers) ? payload.providers : []
  const locked = new Set<string>()
  for (const entry of providers) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as { code?: unknown; locked?: unknown }
    if (record.locked === true && typeof record.code === 'string' && record.code) {
      locked.add(record.code)
    }
  }
  return locked
}

export function useProviderMembership(): ProviderMembership {
  const [state, setState] = useState<ProviderMembershipState>({
    loading: true,
    allowAllProviders: false,
    defaultProviderCode: null,
    lockedProviderCodes: NO_LOCKED_PROVIDERS,
  })

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await apiFetch('/api/membership/providers')
        if (!res.ok) {
          throw new Error(`membership providers load failed: HTTP ${res.status}`)
        }
        const payload = (await res.json()) as ProviderMembershipResponse
        if (cancelled) return
        setState({
          loading: false,
          allowAllProviders: payload.allowAllProviders === true,
          defaultProviderCode:
            typeof payload.defaultProviderCode === 'string'
              ? payload.defaultProviderCode
              : null,
          lockedProviderCodes: parseLockedCodes(payload),
        })
      } catch {
        // 展示层降级：不锁定任何供应商，准入仍由服务端保证
        if (cancelled) return
        setState({
          loading: false,
          allowAllProviders: true,
          defaultProviderCode: null,
          lockedProviderCodes: NO_LOCKED_PROVIDERS,
        })
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const isProviderLocked = useMemo(() => {
    return (providerId: string) => {
      if (state.allowAllProviders) return false
      const providerKey = getProviderKey(providerId)
      if (!providerKey) return false
      return state.lockedProviderCodes.has(providerKey)
    }
  }, [state.allowAllProviders, state.lockedProviderCodes])

  return { ...state, isProviderLocked }
}
