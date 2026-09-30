/**
 * 供应商准入（会员权益的执行层）
 *
 * 业务规则（见会员系统需求 1.2）：
 * - 免费用户：仅可使用平台默认供应商（Provider.isDefault = true）。
 * - 付费且套餐 allowAllProviders = true：解锁全部供应商。
 *
 * 归属边界：
 * - 本模块只回答「谁能用哪个供应商」。
 * - 「某个供应商怎么调用」（协议、模型白名单、baseUrl）由 src/lib/providers/*
 *   与 src/lib/model-gateway/* 负责，本模块不复制这些信息。
 */
import type { Provider } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getProviderKey } from '@/lib/provider-key'
import { parseModelKeyStrict } from '@/lib/model-config-contract'
import { DEFAULT_MODEL_FIELDS, type DefaultModelField } from '@/lib/config-service'
import { getMembershipStatus } from '@/lib/membership'

/** 供应商准入策略（一次查询得到的快照） */
export interface ProviderAccess {
  /** 是否解锁了全部供应商 */
  allowAllProviders: boolean
  /** 平台默认供应商 code；未配置时为 null */
  defaultProviderCode: string | null
  /** 当前用户可用的供应商 code 列表 */
  allowedProviderCodes: string[]
}

/** 平台供应商策略（与用户无关，可跨用户复用） */
export interface ProviderPolicy {
  defaultProviderCode: string | null
  activeProviderCodes: string[]
}

export class ProviderConfigMissingError extends Error {
  constructor() {
    super('MEMBERSHIP_CONFIG_MISSING: 平台未配置默认供应商，请执行 npm run db:seed 初始化')
    this.name = 'ProviderConfigMissingError'
  }
}

/** 供应商对外 DTO（只暴露准入与展示所需字段） */
export interface ProviderDto {
  code: string
  name: string
  isDefault: boolean
  sortOrder: number
}

export function serializeProvider(provider: Provider): ProviderDto {
  return {
    code: provider.code,
    name: provider.name,
    isDefault: provider.isDefault,
    sortOrder: provider.sortOrder,
  }
}

/** 读取平台级供应商策略 */
export async function getProviderPolicy(): Promise<ProviderPolicy> {
  const providers = await prisma.provider.findMany({
    where: { isActive: true },
    select: { code: true, isDefault: true },
    orderBy: { sortOrder: 'asc' },
  })

  const defaultProvider = providers.find((provider) => provider.isDefault)
  return {
    defaultProviderCode: defaultProvider ? defaultProvider.code : null,
    activeProviderCodes: providers.map((provider) => provider.code),
  }
}

/**
 * 判断某 providerId 是否在准入范围内（纯函数，便于测试）。
 * providerId 支持带实例后缀的形式（如 gemini-compatible:uuid）。
 */
export function isProviderIdAllowed(
  access: ProviderAccess,
  providerId: string,
): boolean {
  if (access.allowAllProviders) return true
  if (!providerId) return false
  if (!access.defaultProviderCode) return false
  return getProviderKey(providerId).toLowerCase() === access.defaultProviderCode.toLowerCase()
}

/** 查询当前用户的供应商准入策略 */
export async function getProviderAccess(userId: string): Promise<ProviderAccess> {
  const membership = await getMembershipStatus(userId)
  const allowAllProviders = membership.isActive && membership.allowAllProviders
  const policy = await getProviderPolicy()

  if (allowAllProviders) {
    return {
      allowAllProviders: true,
      defaultProviderCode: policy.defaultProviderCode,
      allowedProviderCodes: policy.activeProviderCodes,
    }
  }

  if (!policy.defaultProviderCode) {
    throw new ProviderConfigMissingError()
  }

  return {
    allowAllProviders: false,
    defaultProviderCode: policy.defaultProviderCode,
    allowedProviderCodes: [policy.defaultProviderCode],
  }
}

/** 当前用户可用的平台供应商列表（用于设置中心与会员权益展示） */
export async function getAvailableProviders(userId: string): Promise<Provider[]> {
  const access = await getProviderAccess(userId)
  return prisma.provider.findMany({
    where: {
      isActive: true,
      code: { in: access.allowedProviderCodes },
    },
    orderBy: { sortOrder: 'asc' },
  })
}

/** 当前用户被锁定的平台供应商列表（用于设置中心置灰展示） */
export async function getLockedProviders(userId: string): Promise<Provider[]> {
  const access = await getProviderAccess(userId)
  if (access.allowAllProviders) return []
  return prisma.provider.findMany({
    where: {
      isActive: true,
      code: { notIn: access.allowedProviderCodes },
    },
    orderBy: { sortOrder: 'asc' },
  })
}

/**
 * 断言用户有权使用某供应商，否则抛出 MEMBERSHIP_REQUIRED。
 *
 * 这是会员权益的最终防线，必须由运行时代码路径调用：
 * 定时任务 / worker 内部不能信任入队时的判断，也不能信任前端提交。
 */
export async function assertProviderAllowed(
  userId: string,
  providerId: string,
): Promise<void> {
  const access = await getProviderAccess(userId)
  if (isProviderIdAllowed(access, providerId)) return
  throw new Error(
    `MEMBERSHIP_REQUIRED: provider "${providerId}" requires a paid membership`,
  )
}

/** 批量断言：任一供应商越权即抛错 */
export async function assertProvidersAllowed(
  userId: string,
  providerIds: Iterable<string>,
): Promise<void> {
  const uniqueProviderIds = Array.from(new Set(providerIds)).filter(Boolean)
  if (uniqueProviderIds.length === 0) return

  const access = await getProviderAccess(userId)
  const blocked = uniqueProviderIds.filter(
    (providerId) => !isProviderIdAllowed(access, providerId),
  )
  if (blocked.length === 0) return
  throw new Error(
    `MEMBERSHIP_REQUIRED: provider(s) ${blocked.join(', ')} require a paid membership`,
  )
}

// ============================================================
// 默认模型选择与会员准入
//
// worker 在运行时解析的是用户配置的「默认模型」（analysisModel / videoModel ...），
// 而不是任务 payload，因此入队前的准入校验也必须基于这组字段：
// - 精准：只拦截真正会被解析到的能力，不会因为账号里残留了不可用供应商的模型就整体封禁；
// - 不重复实现任务→模型的映射逻辑，避免出现第二个真相源。
// ============================================================

/** 会被运行时解析为供应商的用户默认模型字段（声明在 config-service，此处复用） */
export type DefaultModelSelections = Partial<Record<DefaultModelField, string | null>>

/** 从 modelKey（provider::modelId）列表中提取供应商，无法解析的值会被忽略 */
export function collectModelProviders(modelKeys: Iterable<unknown>): string[] {
  const providers = new Set<string>()
  for (const key of modelKeys) {
    if (typeof key !== 'string' || !key.trim()) continue
    const parsed = parseModelKeyStrict(key)
    if (parsed) providers.add(parsed.provider)
  }
  return Array.from(providers)
}

/** 读取账号配置的默认模型所引用的供应商 */
export async function getDefaultModelProviders(userId: string): Promise<string[]> {
  const pref = await prisma.userPreference.findUnique({
    where: { userId },
    select: {
      analysisModel: true,
      characterModel: true,
      locationModel: true,
      storyboardModel: true,
      editModel: true,
      videoModel: true,
      audioModel: true,
      lipSyncModel: true,
      voiceDesignModel: true,
    },
  })
  if (!pref) return []
  return collectModelProviders(Object.values(pref))
}

/**
 * 入队/保存前的准入校验：账号配置的默认模型是否都落在会员准入范围内。
 * 返回越权的供应商列表（空数组表示通过）。
 */
export function findBlockedProviders(
  access: ProviderAccess,
  providerIds: Iterable<string>,
): string[] {
  return Array.from(new Set(providerIds)).filter(
    (providerId) => providerId && !isProviderIdAllowed(access, providerId),
  )
}
