/**
 * 支付渠道配置的读取层（读模型）
 *
 * 存储位置：SystemConfig
 * - payment.methods            → 已启用的渠道列表（字符串数组）
 * - payment.channel.<method>   → 该渠道的参数字典；secret 字段以 AES-256-GCM 加密后存储
 *
 * 安全约定：
 * - 解密只发生在服务端（适配器调用渠道时）；后台接口一律只返回掩码
 * - 加密复用 src/lib/crypto-utils.ts（平台唯一的密钥加密实现），不另写一套
 */
import { encryptApiKey, decryptApiKey } from '@/lib/crypto-utils'
import { getStringArrayConfig, getSystemConfig, SYSTEM_CONFIG_KEY } from '@/lib/system-config'
import {
  PAYMENT_CHANNEL_METHODS,
  getPaymentChannelSpec,
  getSecretFieldKeys,
  findMissingRequiredFields,
} from './channels'
import { PAYMENT_METHOD, type PaymentMethod } from './types'

export const PAYMENT_CONFIG_KEY = {
  /** 已启用的渠道 */
  METHODS: SYSTEM_CONFIG_KEY.PAYMENT_METHODS,
  /** 单个渠道的参数字典 */
  CHANNEL_PREFIX: 'payment.channel.',
} as const

export const PAYMENT_CHANNEL_CONFIG_KEY_PREFIX = PAYMENT_CONFIG_KEY.CHANNEL_PREFIX

export function getPaymentChannelConfigKey(method: string): string {
  return `${PAYMENT_CONFIG_KEY.CHANNEL_PREFIX}${method}`
}

/** 读取渠道参数的原始存储值（secret 字段是密文） */
export async function readStoredChannelValues(
  method: string,
): Promise<Record<string, string>> {
  const raw = await getSystemConfig(getPaymentChannelConfigKey(method))
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}

  const values: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' && value) values[key] = value
  }
  return values
}

/**
 * 读取渠道参数的明文（仅服务端调用，例如适配器签名/验签）。
 * 未配置的字段不会出现在返回值里；解密失败按未配置处理，避免坏数据阻断支付链路。
 */
export async function readChannelValues(method: string): Promise<Record<string, string>> {
  const stored = await readStoredChannelValues(method)
  const secretKeys = new Set(getSecretFieldKeys(method))

  const values: Record<string, string> = {}
  for (const [key, value] of Object.entries(stored)) {
    if (!secretKeys.has(key)) {
      values[key] = value
      continue
    }
    try {
      values[key] = decryptApiKey(value)
    } catch {
      // 解密失败通常是密钥轮换导致，视为未配置
    }
  }
  return values
}

/** 加密需要落库的字段；空值表示「不修改」（由调用方负责合并） */
export function encryptChannelValues(
  method: string,
  values: Record<string, string>,
): Record<string, string> {
  const secretKeys = new Set(getSecretFieldKeys(method))
  const stored: Record<string, string> = {}

  for (const [key, value] of Object.entries(values)) {
    const trimmed = (value || '').trim()
    if (!trimmed) continue
    stored[key] = secretKeys.has(key) ? encryptApiKey(trimmed) : trimmed
  }
  return stored
}

/** 掩码展示：保留末 4 位便于运营确认存的是哪把密钥 */
export function maskChannelSecret(value: string): string {
  const trimmed = (value || '').trim()
  if (!trimmed) return ''
  if (trimmed.length <= 4) return '****'
  return `****${trimmed.slice(-4)}`
}

export interface PaymentChannelFieldDto {
  key: string
  labelKey: string
  secret: boolean
  required: boolean
  placeholder: string | null
}

export interface PaymentChannelStatusDto {
  method: PaymentMethod
  /** 字段规格由服务端下发，前端不需要再引一份 schema */
  fields: PaymentChannelFieldDto[]
  /** 代码侧是否已实现适配器 */
  implemented: boolean
  /** SystemConfig 中是否已勾选启用 */
  enabledInConfig: boolean
  /** 必填参数是否齐全 */
  configured: boolean
  /** 真正生效：已启用 && 已实现 && 参数齐全 */
  effective: boolean
  /** 缺失的必填字段 key */
  missingFields: string[]
  /** 字段值：普通字段明文，敏感字段掩码，未配置为空字符串 */
  values: Record<string, string>
  docsUrl: string | null
}

/**
 * 汇总全部渠道状态（供后台页面渲染）。
 * implementedMethods 由调用方从适配器注册表传入，避免 reading layer 反向依赖注册表。
 */
export async function buildPaymentChannelsStatus(input: {
  implementedMethods: readonly string[]
}): Promise<PaymentChannelStatusDto[]> {
  const implemented = new Set(input.implementedMethods)
  const enabledMethods = await getEnabledPaymentMethods()

  const statuses: PaymentChannelStatusDto[] = []
  for (const method of PAYMENT_CHANNEL_METHODS) {
    const spec = getPaymentChannelSpec(method)
    if (!spec) continue

    const stored = await readStoredChannelValues(method)
    let plain: Record<string, string> = {}
    try {
      plain = await readChannelValues(method)
    } catch {
      plain = {}
    }

    const missingFields = findMissingRequiredFields(method, plain)
    const isImplemented = implemented.has(method)

    const values: Record<string, string> = {}
    for (const field of spec.fields) {
      const storedValue = stored[field.key] || ''
      if (!storedValue) {
        values[field.key] = ''
        continue
      }
      values[field.key] = field.secret
        ? maskChannelSecret(plain[field.key] || '')
        : storedValue
    }

    statuses.push({
      method,
      fields: spec.fields.map((field) => ({
        key: field.key,
        labelKey: field.labelKey,
        secret: field.secret,
        required: field.required,
        placeholder: field.placeholder ?? null,
      })),
      implemented: isImplemented,
      enabledInConfig: enabledMethods.includes(method),
      configured: missingFields.length === 0,
      effective: isImplemented && missingFields.length === 0 && enabledMethods.includes(method),
      missingFields,
      values,
      docsUrl: spec.docsUrl ?? null,
    })
  }

  return statuses
}

/** 当前已启用的渠道列表 */
export async function getEnabledPaymentMethods(): Promise<PaymentMethod[]> {
  const configured = await getStringArrayConfig(SYSTEM_CONFIG_KEY.PAYMENT_METHODS, [
    PAYMENT_METHOD.MANUAL,
  ])
  return configured as PaymentMethod[]
}

export { findMissingRequiredFields }
