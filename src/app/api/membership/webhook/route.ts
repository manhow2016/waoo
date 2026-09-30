/**
 * 支付渠道回调
 * POST /api/membership/webhook?method=<channel>
 *
 * 鉴权方式：渠道签名（adapter.verifyWebhook），不使用用户会话，
 * 因此该路由在 api-route-contract-guard 的 PUBLIC_ROUTE_ALLOWLIST 中显式登记。
 *
 * 幂等：重复回调由 activateSubscriptionOrder 依据 paidAt 判定，直接返回成功，
 * 不会重复开通、也不会重复顺延有效期。
 */
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { getPaymentAdapter } from '@/lib/payment'
import { activateSubscriptionOrder } from '@/lib/subscription-order'

export const POST = apiHandler(async (request: NextRequest) => {
  const method =
    request.nextUrl.searchParams.get('method') ||
    request.headers.get('x-payment-method') ||
    ''

  const adapter = getPaymentAdapter(method)
  if (!adapter) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'PAYMENT_METHOD_UNSUPPORTED',
      field: 'method',
    })
  }

  // 验签必须基于原始请求体
  const rawBody = await request.text()
  const notification = await adapter.verifyWebhook({
    headers: request.headers,
    rawBody,
  })

  if (!notification) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'PAYMENT_WEBHOOK_UNSUPPORTED',
      method: adapter.method,
    })
  }

  const result = await activateSubscriptionOrder({
    orderNo: notification.orderNo,
    paidAmount: notification.paidAmount,
    payMethod: notification.method,
    externalId: notification.externalId ?? null,
    paidAt: notification.paidAt,
  })

  return NextResponse.json({
    ok: true,
    orderNo: result.subscription.orderNo,
    alreadyProcessed: result.alreadyProcessed,
  })
})
