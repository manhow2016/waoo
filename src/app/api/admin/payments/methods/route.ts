/**
 * 启用 / 停用支付渠道
 * PUT /api/admin/payments/methods
 *
 * body: { methods: string[], reason: string }
 * 权限：仅 super
 *
 * 只允许启用「对接代码已实现 + 必填参数齐全」的渠道，且至少要保留一个。
 */
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { ADMIN_ROLE, requireAdminRole } from '@/lib/admin-auth'
import { setEnabledPaymentMethods } from '@/lib/admin/commands'
import { getClientIp } from '@/lib/rate-limit'

export const PUT = apiHandler(async (request: NextRequest) => {
  const guard = await requireAdminRole(ADMIN_ROLE.SUPER)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  let body: { methods?: unknown; reason?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    throw new ApiError('INVALID_PARAMS', { code: 'BODY_PARSE_FAILED', field: 'body' })
  }

  if (!Array.isArray(body.methods)) {
    throw new ApiError('INVALID_PARAMS', { code: 'METHODS_REQUIRED', field: 'methods' })
  }

  const methods = body.methods.filter((item): item is string => typeof item === 'string')

  const result = await setEnabledPaymentMethods({
    adminId: admin.id,
    methods,
    reason: typeof body.reason === 'string' ? body.reason : '',
    ip: getClientIp(request),
  })

  return NextResponse.json(result)
})
