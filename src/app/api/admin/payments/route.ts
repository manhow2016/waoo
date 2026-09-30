/**
 * 支付渠道配置
 * GET /api/admin/payments → 渠道状态（含掩码后的参数）+ 启用情况
 * PUT /api/admin/payments → 保存单个渠道的商户参数
 *
 * 权限：仅 super（渠道参数含密钥，属敏感配置）
 * 安全：接口只返回掩码，绝不下发明文密钥。
 */
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { ADMIN_ROLE, requireAdminRole } from '@/lib/admin-auth'
import { savePaymentChannel } from '@/lib/admin/commands'
import { getEnabledPaymentMethods, listImplementedPaymentMethods, listPaymentChannelStatus } from '@/lib/payment'
import { getClientIp } from '@/lib/rate-limit'

function readValues(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const values: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string') values[key] = value
  }
  return values
}

export const GET = apiHandler(async () => {
  const guard = await requireAdminRole(ADMIN_ROLE.SUPER)
  if (guard instanceof NextResponse) return guard

  const [channels, enabledMethods] = await Promise.all([
    listPaymentChannelStatus(),
    getEnabledPaymentMethods(),
  ])

  return NextResponse.json({
    channels,
    enabledMethods,
    implementedMethods: listImplementedPaymentMethods(),
  })
})

export const PUT = apiHandler(async (request: NextRequest) => {
  const guard = await requireAdminRole(ADMIN_ROLE.SUPER)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  let body: { method?: unknown; values?: unknown; clearFields?: unknown; reason?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    throw new ApiError('INVALID_PARAMS', { code: 'BODY_PARSE_FAILED', field: 'body' })
  }

  const method = typeof body.method === 'string' ? body.method.trim() : ''
  if (!method) {
    throw new ApiError('INVALID_PARAMS', { code: 'METHOD_REQUIRED', field: 'method' })
  }

  const clearFields = Array.isArray(body.clearFields)
    ? body.clearFields.filter((item): item is string => typeof item === 'string')
    : []

  const result = await savePaymentChannel({
    adminId: admin.id,
    method,
    values: readValues(body.values),
    clearFields,
    reason: typeof body.reason === 'string' ? body.reason : '',
    ip: getClientIp(request),
  })

  return NextResponse.json(result)
})
