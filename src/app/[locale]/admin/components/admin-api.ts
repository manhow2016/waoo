'use client'

/**
 * 后台接口调用封装
 *
 * 与用户端共用 apiFetch（自动带 locale 头），但错误结构按后台统一解析：
 * 后端返回 { error: { code, message } }，这里转成带 code 的 AdminApiError，
 * 页面据此区分「未登录(401) / 权限不足(403) / 业务错误」。
 */
import { apiFetch } from '@/lib/api-fetch'

export class AdminApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'AdminApiError'
    this.status = status
    this.code = code
  }
}

interface ErrorPayload {
  error?: { code?: unknown; message?: unknown }
}

export async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body !== undefined && init?.body !== null
  const response = await apiFetch(path, {
    ...init,
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers || {}),
    },
  })

  const text = await response.text()
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    const error = (payload as ErrorPayload | null)?.error
    const code = typeof error?.code === 'string' ? error.code : `HTTP_${response.status}`
    const message = typeof error?.message === 'string' ? error.message : `请求失败（HTTP ${response.status}）`
    throw new AdminApiError(response.status, code, message)
  }

  return payload as T
}

export function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}
