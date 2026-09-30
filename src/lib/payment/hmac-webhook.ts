/**
 * 通用签名回调渠道（hmac-webhook）
 *
 * 适用场景：自建收银台、聚合支付、或任何能按约定 POST 签名回调的收款方。
 * 密钥与收银台地址都在后台「支付渠道」里配置，因此**无需改代码或重新部署**即可启用。
 *
 * 约定：
 * - 请求头 `x-payment-signature`：hex(HMAC-SHA256(secret, 原始请求体))，兼容 `sha256=` 前缀
 * - 请求体 JSON：{ "orderNo": string, "amount": number, "externalId"?: string, "paidAt"?: string }
 * - 金额单位为元；务必使用**原始请求体**参与验签
 */
import { normalizeSignatureHeader, verifyHmacSignature } from './signature'
import { readChannelValues } from './config'
import {
  PAYMENT_METHOD,
  PaymentError,
  type PaymentAdapter,
  type PaymentIntent,
  type PaymentNotification,
  type PaymentOrderInput,
  type PaymentWebhookInput,
} from './types'

export const HMAC_WEBHOOK_SIGNATURE_HEADER = 'x-payment-signature'

/** 用订单信息填充收银台地址模板；未知占位符原样保留 */
export function applyPayUrlTemplate(
  template: string,
  input: Pick<PaymentOrderInput, 'orderNo' | 'amount'>,
): string {
  return template
    .replace(/\{orderNo\}/g, encodeURIComponent(input.orderNo))
    .replace(/\{amount\}/g, encodeURIComponent(String(input.amount)))
}

interface HmacWebhookPayload {
  orderNo?: unknown
  amount?: unknown
  externalId?: unknown
  paidAt?: unknown
}

export const hmacWebhookPaymentAdapter: PaymentAdapter = {
  method: PAYMENT_METHOD.HMAC_WEBHOOK,
  labelKey: 'paymentMethodHmacWebhook',

  async isReady() {
    const values = await readChannelValues(PAYMENT_METHOD.HMAC_WEBHOOK)
    return Boolean((values.secret || '').trim())
  },

  async createPayment(input: PaymentOrderInput): Promise<PaymentIntent> {
    const values = await readChannelValues(PAYMENT_METHOD.HMAC_WEBHOOK)
    const template = (values.payUrlTemplate || '').trim()

    return {
      method: PAYMENT_METHOD.HMAC_WEBHOOK,
      // 需要外部确认收款，不能自动开通
      autoActivate: false,
      instructionsKey: 'paymentHmacWebhookInstructions',
      ...(template ? { payUrl: applyPayUrlTemplate(template, input) } : {}),
    }
  },

  async verifyWebhook(input: PaymentWebhookInput): Promise<PaymentNotification | null> {
    const values = await readChannelValues(PAYMENT_METHOD.HMAC_WEBHOOK)
    const secret = (values.secret || '').trim()
    if (!secret) {
      throw new PaymentError('MISSING_CONFIG', '支付渠道 hmac-webhook 未配置签名密钥')
    }

    const signature = normalizeSignatureHeader(
      input.headers.get(HMAC_WEBHOOK_SIGNATURE_HEADER),
    )
    if (!verifyHmacSignature({ rawBody: input.rawBody, signature, secret })) {
      throw new PaymentError('PAYMENT_SIGNATURE_INVALID', '回调签名校验失败')
    }

    let payload: HmacWebhookPayload
    try {
      payload = JSON.parse(input.rawBody) as HmacWebhookPayload
    } catch {
      throw new PaymentError('PAYMENT_PAYLOAD_INVALID', '回调请求体不是合法 JSON')
    }

    const orderNo = typeof payload.orderNo === 'string' ? payload.orderNo.trim() : ''
    if (!orderNo) {
      throw new PaymentError('PAYMENT_PAYLOAD_INVALID', '回调缺少 orderNo')
    }

    const amount = typeof payload.amount === 'number' ? payload.amount : Number(payload.amount)
    if (!Number.isFinite(amount) || amount < 0) {
      throw new PaymentError('PAYMENT_PAYLOAD_INVALID', '回调 amount 非法')
    }

    const paidAt =
      typeof payload.paidAt === 'string' && !Number.isNaN(Date.parse(payload.paidAt))
        ? new Date(payload.paidAt)
        : new Date()

    return {
      orderNo,
      paidAmount: amount,
      method: PAYMENT_METHOD.HMAC_WEBHOOK,
      ...(typeof payload.externalId === 'string' && payload.externalId
        ? { externalId: payload.externalId }
        : {}),
      paidAt,
    }
  },
}
