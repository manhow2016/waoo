/**
 * 当前用户的会员订单列表
 * GET /api/membership/orders
 *
 * 用于会员中心展示待支付订单与历史订单。
 */
import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import {
  listUserSubscriptions,
  serializeSubscriptionOrder,
} from '@/lib/subscription-order'

export const GET = apiHandler(async () => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const orders = await listUserSubscriptions({ userId: session.user.id })

  return NextResponse.json({ orders: orders.map(serializeSubscriptionOrder) })
})
