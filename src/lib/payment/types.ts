/**
 * 支付渠道适配器契约
 *
 * 平台当前没有任何真实支付渠道凭证，因此内置适配器只有「手动开通」。
 * 拿到商户凭证后，只需新增一个实现 PaymentAdapter 的文件并在 registry 注册，
 * 无需改动订单、订阅、权益或后台代码。
 */

/** 支付渠道标识。与 Subscription.payMethod 的取值保持一致 */
export const PAYMENT_METHOD = {
  MANUAL: 'manual',
  /** 通用签名回调渠道：适用于自建收银台或聚合支付，密钥由后台配置 */
  HMAC_WEBHOOK: 'hmac-webhook',
  ALIPAY: 'alipay',
  WECHAT: 'wechat',
  STRIPE: 'stripe',
} as const

export type PaymentMethod = (typeof PAYMENT_METHOD)[keyof typeof PAYMENT_METHOD]

/** 创建支付单的输入（由订单服务提供，适配器不得改写） */
export interface PaymentOrderInput {
  orderNo: string
  /** 应付金额（元） */
  amount: number
  planCode: string
  userId: string
  createdAt: Date
}

/**
 * 创建支付单的结果。
 * - autoActivate = true：无需外部支付，调用方应立即开通（如零元订单、手动开通）
 * - instructionsKey：前端 i18n 文案 key，用于告诉用户下一步怎么做
 */
export interface PaymentIntent {
  method: PaymentMethod
  autoActivate: boolean
  instructionsKey: string
  /** 收银台跳转地址 */
  payUrl?: string
  /** 扫码支付内容 */
  qrCode?: string
}

/** 渠道回调归一化后的支付结果 */
export interface PaymentNotification {
  orderNo: string
  /** 实付金额（元） */
  paidAmount: number
  method: PaymentMethod
  externalId?: string
  paidAt: Date
}

export interface PaymentWebhookInput {
  headers: Headers
  /** 原始请求体，验签必须基于原始字节 */
  rawBody: string
}

export interface PaymentAdapter {
  method: PaymentMethod
  /** 前端展示用的文案 key */
  labelKey: string
  /**
   * 该渠道是否已具备可运行条件（密钥等必要配置齐全）。
   * 未就绪的渠道不会被用于下单，避免产生永远无法支付的订单。
   */
  isReady(): Promise<boolean>
  createPayment(input: PaymentOrderInput): Promise<PaymentIntent>
  /**
   * 校验回调签名并归一化。
   * 验签失败应抛出错误（由路由层转为 4xx）；
   * 渠道不支持回调时返回 null。
   */
  verifyWebhook(input: PaymentWebhookInput): Promise<PaymentNotification | null>
}

/** 支付渠道错误：调用方可据此返回 4xx 而不是 500 */
export class PaymentError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(`${code}: ${message}`)
    this.name = 'PaymentError'
    this.code = code
  }
}
