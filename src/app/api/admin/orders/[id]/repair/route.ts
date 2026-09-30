/**
 * 订单补单
 * POST /api/admin/orders/[id]/repair
 *
 * body: { reason: string }
 * 权限：support 及以上
 *
 * 用于「渠道已收款但系统未开通」的场景。已开通的订单直接返回 alreadyProcessed=true，
 * 不会重复顺延有效期。
 */
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { ADMIN_ROLE, requireAdminRole } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import { repairOrder } from '@/lib/admin/commands'
import { getClientIp } from '@/lib/rate-limit'

interface RepairBody {
  reason?: unknown
}

export const POST = apiHandler(async (
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) => {
  const guard = await requireAdminRole(ADMIN_ROLE.SUPPORT)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  const { id } = await ctx.params

  let body: RepairBody
  try {
    body = (await request.json()) as RepairBody
  } catch {
    throw new ApiError('INVALID_PARAMS', { code: 'BODY_PARSE_FAILED', field: 'body' })
  }

  // 后台列表以订阅 id 作为行标识，这里统一按 id 解析出订单号
  const subscription = await prisma.subscription.findUnique({
    where: { id },
    select: { orderNo: true },
  })
  if (!subscription) {
    throw new ApiError('NOT_FOUND', { code: 'ORDER_NOT_FOUND' })
  }

  const result = await repairOrder({
    adminId: admin.id,
    orderNo: subscription.orderNo,
    reason: typeof body.reason === 'string' ? body.reason : '',
    ip: getClientIp(request),
  })

  return NextResponse.json(result)
})
