/**
 * 取消待支付订单
 * POST /api/membership/orders/[orderNo]/cancel
 *
 * 只能取消自己的、且尚未支付的订单；已支付订单需要联系管理员退款。
 */
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { cancelPendingOrder, serializeSubscriptionOrder } from '@/lib/subscription-order'
import { prisma } from '@/lib/prisma'

export const POST = apiHandler(async (
  _request: NextRequest,
  ctx: { params: Promise<{ orderNo: string }> },
) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const { orderNo } = await ctx.params

  const cancelled = await cancelPendingOrder({
    userId: session.user.id,
    orderNo,
  })

  const plan = await prisma.plan.findUnique({ where: { id: cancelled.planId } })
  if (!plan) {
    return NextResponse.json({ orderNo: cancelled.orderNo, status: cancelled.status })
  }

  return NextResponse.json({
    order: serializeSubscriptionOrder({ ...cancelled, plan }),
  })
})
