/**
 * 订单退款
 * POST /api/admin/orders/[id]/refund
 *
 * body: { reason: string }
 * 权限：operation 及以上
 *
 * 事务内取消订阅并写审计日志；重复调用幂等，不产生第二次退款副作用。
 */
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { ADMIN_ROLE, requireAdminRole } from '@/lib/admin-auth'
import { refundOrder } from '@/lib/admin/commands'
import { getClientIp } from '@/lib/rate-limit'

interface RefundBody {
  reason?: unknown
}

export const POST = apiHandler(async (
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) => {
  const guard = await requireAdminRole(ADMIN_ROLE.OPERATION)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  const { id } = await ctx.params

  let body: RefundBody
  try {
    body = (await request.json()) as RefundBody
  } catch {
    throw new ApiError('INVALID_PARAMS', { code: 'BODY_PARSE_FAILED', field: 'body' })
  }

  const result = await refundOrder({
    adminId: admin.id,
    subscriptionId: id,
    reason: typeof body.reason === 'string' ? body.reason : '',
    ip: getClientIp(request),
  })

  return NextResponse.json(result)
})
