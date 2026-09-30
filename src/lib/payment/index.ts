/**
 * 支付渠道注册表
 *
 * 新增渠道只需三步，页面与接口都不用改：
 * 1. 实现 PaymentAdapter（createPayment / verifyWebhook / isReady）
 * 2. 在 src/lib/payment/channels.ts 补一份字段规格
 * 3. 在这里注册
 * 之后运营即可在后台「支付渠道」里填参数并启用。
 */
import { getStringArrayConfig, SYSTEM_CONFIG_KEY } from '@/lib/system-config'
import { manualPaymentAdapter } from './manual'
import { hmacWebhookPaymentAdapter } from './hmac-webhook'
import {
  buildPaymentChannelsStatus,
  getEnabledPaymentMethods,
  type PaymentChannelStatusDto,
} from './config'
import { PAYMENT_METHOD, type PaymentAdapter, type PaymentMethod } from './types'

const ADAPTERS: ReadonlyArray<PaymentAdapter> = [
  manualPaymentAdapter,
  hmacWebhookPaymentAdapter,
]

const ADAPTER_BY_METHOD = new Map<string, PaymentAdapter>(
  ADAPTERS.map((adapter) => [adapter.method, adapter]),
)

/** 平台默认可用渠道（未配置 system config 时生效） */
const DEFAULT_ENABLED_METHODS: readonly PaymentMethod[] = [PAYMENT_METHOD.MANUAL]

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === 'string' && ADAPTER_BY_METHOD.has(value)
}

/** 取得渠道适配器；未注册或用不通的渠道返回 null */
export function getPaymentAdapter(method: string): PaymentAdapter | null {
  return ADAPTER_BY_METHOD.get(method) ?? null
}

/** 代码侧已实现的渠道（后台据此区分「可选」与「待接入」） */
export function listImplementedPaymentMethods(): string[] {
  return ADAPTERS.map((adapter) => adapter.method)
}

/**
 * 取得当前已启用的渠道适配器列表。
 * 必须同时满足：在 SystemConfig 中启用 + 已注册 + 自身参数齐全（isReady），
 * 否则会产生永远无法支付的订单。
 */
export async function getEnabledPaymentAdapters(): Promise<PaymentAdapter[]> {
  const configured = await getStringArrayConfig(
    SYSTEM_CONFIG_KEY.PAYMENT_METHODS,
    DEFAULT_ENABLED_METHODS,
  )

  const adapters: PaymentAdapter[] = []
  for (const method of configured) {
    const adapter = getPaymentAdapter(method)
    if (!adapter) continue
    if (!(await adapter.isReady())) continue
    adapters.push(adapter)
  }
  return adapters
}

/** 下单默认使用的渠道：取第一个已启用且就绪的渠道 */
export async function getDefaultPaymentAdapter(): Promise<PaymentAdapter | null> {
  const adapters = await getEnabledPaymentAdapters()
  return adapters[0] ?? null
}

/** 后台「支付渠道」页所需的全部状态 */
export async function listPaymentChannelStatus(): Promise<PaymentChannelStatusDto[]> {
  return buildPaymentChannelsStatus({ implementedMethods: listImplementedPaymentMethods() })
}

export { getEnabledPaymentMethods }
export { PAYMENT_METHOD }
export type { PaymentAdapter, PaymentMethod, PaymentChannelStatusDto }
