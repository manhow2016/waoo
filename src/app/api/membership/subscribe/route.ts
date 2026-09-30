/**
 * 创建会员订单并发起支付
 * POST /api/membership/subscribe
 *
 * body: { planCode: string, payMethod?: string }
 *
 * 返回订单号与支付指引。当前平台无真实支付渠道，默认走「手动开通」：
 * 订单保持 pending，用户把订单号发给运营，运营确认收款后开通。
 */
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { serializePlan } from '@/lib/membership'
import {
  activateSubscriptionOrder,
  createSubscriptionOrder,
  serializeSubscriptionOrder,
} from '@/lib/subscription-order'
import { getDefaultPaymentAdapter, getEnabledPaymentAdapters } from '@/lib/payment'

interface SubscribeBody {
  planCode?: unknown
  payMethod?: unknown
}

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  let body: SubscribeBody
  try {
    body = (await request.json()) as SubscribeBody
  } catch {
    throw new ApiError('INVALID_PARAMS', {
      code: 'BODY_PARSE_FAILED',
      field: 'body',
    })
  }

  const planCode = typeof body.planCode === 'string' ? body.planCode.trim() : ''
  if (!planCode) {
    throw new ApiError('INVALID_PARAMS', { code: 'PLAN_CODE_REQUIRED', field: 'planCode' })
  }

  const enabledAdapters = await getEnabledPaymentAdapters()
  if (enabledAdapters.length === 0) {
    throw new ApiError('INVALID_PARAMS', { code: 'NO_PAYMENT_METHOD_ENABLED' })
  }

  const requestedMethod = typeof body.payMethod === 'string' ? body.payMethod.trim() : ''
  const adapter = requestedMethod
    ? (enabledAdapters.find((candidate) => candidate.method === requestedMethod) ?? null)
    : await getDefaultPaymentAdapter()

  if (!adapter) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'PAYMENT_METHOD_UNAVAILABLE',
      field: 'payMethod',
      enabledMethods: enabledAdapters.map((candidate) => candidate.method),
    })
  }

  const { subscription, plan, reused } = await createSubscriptionOrder({
    userId: session.user.id,
    planCode,
  })

  const intent = await adapter.createPayment({
    orderNo: subscription.orderNo,
    amount: Number(subscription.amount),
    planCode: plan.code,
    userId: session.user.id,
    createdAt: subscription.createdAt,
  })

  // 渠道声明无需外部支付时（零元订单/自动开通渠道），立即开通
  if (intent.autoActivate) {
    const activated = await activateSubscriptionOrder({
      orderNo: subscription.orderNo,
      payMethod: adapter.method,
    })
    return NextResponse.json({
      order: serializeSubscriptionOrder({ ...activated.subscription, plan }),
      payment: intent,
      plan: serializePlan(plan),
      reused,
    })
  }

  return NextResponse.json({
    order: serializeSubscriptionOrder({ ...subscription, plan }),
    payment: intent,
    plan: serializePlan(plan),
    reused,
  })
})
