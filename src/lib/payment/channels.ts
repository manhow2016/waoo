/**
 * 支付渠道参数规格（声明式）
 *
 * 这个文件是「后台能配置哪些渠道、每个渠道有哪些字段、哪些字段是敏感信息」的**唯一来源**：
 * 后台页面、加密存储、必填校验、状态展示都由它驱动，
 * 因此新增一个渠道时只需要：实现 PaymentAdapter → 在这里补一份字段规格 → 注册。
 * 页面与接口不需要任何改动。
 */
import { PAYMENT_METHOD, type PaymentMethod } from './types'

export interface PaymentChannelFieldSpec {
  key: string
  /** i18n key：admin.payments.fields.<labelKey> */
  labelKey: string
  /** true 表示加密存储、接口只回显掩码 */
  secret: boolean
  required: boolean
  /** 输入框占位示例（语言无关） */
  placeholder?: string
}

export interface PaymentChannelSpec {
  method: PaymentMethod
  /** 官方控制台/文档地址，便于运营自助获取凭证 */
  docsUrl?: string
  fields: PaymentChannelFieldSpec[]
}

export const PAYMENT_CHANNEL_SPECS: Record<PaymentMethod, PaymentChannelSpec> = {
  [PAYMENT_METHOD.MANUAL]: {
    method: PAYMENT_METHOD.MANUAL,
    // 线下收款：用户下单后把订单号交给运营核销，无需任何商户参数
    fields: [],
  },
  [PAYMENT_METHOD.HMAC_WEBHOOK]: {
    method: PAYMENT_METHOD.HMAC_WEBHOOK,
    fields: [
      {
        key: 'secret',
        labelKey: 'secret',
        secret: true,
        required: true,
        placeholder: 'openssl rand -hex 32',
      },
      {
        key: 'payUrlTemplate',
        labelKey: 'payUrlTemplate',
        secret: false,
        required: false,
        placeholder: 'https://pay.example.com/checkout?order={orderNo}&amount={amount}',
      },
    ],
  },
  [PAYMENT_METHOD.ALIPAY]: {
    method: PAYMENT_METHOD.ALIPAY,
    docsUrl: 'https://open.alipay.com/',
    fields: [
      { key: 'appId', labelKey: 'appId', secret: false, required: true },
      { key: 'privateKey', labelKey: 'privateKey', secret: true, required: true },
      { key: 'alipayPublicKey', labelKey: 'alipayPublicKey', secret: true, required: true },
      {
        key: 'gatewayUrl',
        labelKey: 'gatewayUrl',
        secret: false,
        required: false,
        placeholder: 'https://openapi.alipay.com/gateway.do',
      },
    ],
  },
  [PAYMENT_METHOD.WECHAT]: {
    method: PAYMENT_METHOD.WECHAT,
    docsUrl: 'https://pay.weixin.qq.com/',
    fields: [
      { key: 'appId', labelKey: 'appId', secret: false, required: true },
      { key: 'mchId', labelKey: 'mchId', secret: false, required: true },
      { key: 'apiV3Key', labelKey: 'apiV3Key', secret: true, required: true },
      { key: 'serialNo', labelKey: 'serialNo', secret: false, required: true },
      { key: 'privateKey', labelKey: 'privateKey', secret: true, required: true },
    ],
  },
  [PAYMENT_METHOD.STRIPE]: {
    method: PAYMENT_METHOD.STRIPE,
    docsUrl: 'https://dashboard.stripe.com/apikeys',
    fields: [
      { key: 'secretKey', labelKey: 'secretKey', secret: true, required: true },
      { key: 'webhookSecret', labelKey: 'webhookSecret', secret: true, required: true },
      { key: 'publishableKey', labelKey: 'publishableKey', secret: false, required: false },
    ],
  },
}

export const PAYMENT_CHANNEL_METHODS = Object.keys(PAYMENT_CHANNEL_SPECS) as PaymentMethod[]

export function getPaymentChannelSpec(method: string): PaymentChannelSpec | null {
  return (PAYMENT_CHANNEL_SPECS as Record<string, PaymentChannelSpec>)[method] ?? null
}

/** 必填字段是否都已填写（空值视为未填写） */
export function findMissingRequiredFields(
  method: string,
  values: Record<string, string>,
): string[] {
  const spec = getPaymentChannelSpec(method)
  if (!spec) return []
  return spec.fields
    .filter((field) => field.required)
    .filter((field) => !(values[field.key] || '').trim())
    .map((field) => field.key)
}

export function getSecretFieldKeys(method: string): string[] {
  const spec = getPaymentChannelSpec(method)
  if (!spec) return []
  return spec.fields.filter((field) => field.secret).map((field) => field.key)
}
