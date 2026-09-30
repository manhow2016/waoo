/**
 * 系统配置读写（SystemConfig 表的唯一 owner）
 *
 * 用途：运营可在不重新部署的前提下调整支付渠道、站点开关等。
 * 约定：值缺失或结构不符时回退到调用方提供的默认值，避免配置脏数据影响主流程。
 */
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/** 已登记的系统配置键（运营可额外写入自定义键，读取时按需约定结构） */
export const SYSTEM_CONFIG_KEY = {
  /** 已启用的支付渠道：字符串数组，如 ["manual"] */
  PAYMENT_METHODS: 'payment.methods',
} as const

export type SystemConfigKey = string

export function isValidSystemConfigKey(key: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{0,63}$/.test(key)
}

export async function getSystemConfig(
  key: SystemConfigKey,
): Promise<Prisma.JsonValue | null> {
  const row = await prisma.systemConfig.findUnique({ where: { key } })
  return row ? (row.value as Prisma.JsonValue) : null
}

export async function setSystemConfig(
  key: SystemConfigKey,
  value: Prisma.InputJsonValue,
): Promise<void> {
  await prisma.systemConfig.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  })
}

/**
 * 读取字符串数组配置。
 * 值缺失或不是数组时返回默认值；显式配置为空数组表示「关闭全部」，会原样返回。
 */
export async function getStringArrayConfig(
  key: SystemConfigKey,
  fallback: readonly string[],
): Promise<string[]> {
  const raw = await getSystemConfig(key)
  if (!Array.isArray(raw)) return [...fallback]
  return raw.filter((item): item is string => typeof item === 'string')
}
