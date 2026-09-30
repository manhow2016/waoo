/**
 * 会员状态查询（会员系统的唯一真相源）
 *
 * 设计要点：
 * 1. 「是否付费有效」完全由 Subscription.status + expireAt 共同决定。
 * 2. 双保险降级：到期降级的定时任务即使失败，只要 expireAt 已过期，
 *    本查询也会自动回落为免费等级。
 * 3. 不做冗余字段、不做进程内缓存，保证任何时刻读到的都是数据库真实状态；
 *    性能不足时再按 userId 增加带失效通知的缓存层。
 */
import type { Plan, Subscription } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export const SUBSCRIPTION_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
} as const

export type SubscriptionStatus =
  (typeof SUBSCRIPTION_STATUS)[keyof typeof SUBSCRIPTION_STATUS]

/** 免费等级，没有有效订阅时的默认等级 */
export const FREE_LEVEL = 0

/** 到期前多少天开始提醒续费（文档 §5.3）。前端与服务端共用这一口径 */
export const RENEWAL_REMINDER_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 剩余天数（向上取整）。
 * 到期时间为 null 时返回 null；已过期返回 0，不会出现负数。
 */
export function resolveDaysRemaining(
  expireAt: Date | null,
  now: Date = new Date(),
): number | null {
  if (!expireAt) return null
  const remainingMs = expireAt.getTime() - now.getTime()
  if (remainingMs <= 0) return 0
  return Math.ceil(remainingMs / DAY_MS)
}

export function isRenewalReminderDue(
  daysRemaining: number | null,
  reminderDays: number = RENEWAL_REMINDER_DAYS,
): boolean {
  return daysRemaining !== null && daysRemaining <= reminderDays
}

export interface MembershipStatus {
  /** 0=免费, 1=月付, 2=季付, 3=年付 */
  level: number
  /** 当前生效的套餐；免费用户为 null */
  plan: Plan | null
  /** 当前套餐到期时间；免费用户为 null */
  expireAt: Date | null
  /** 距离到期还剩几天（向上取整）；免费用户为 null */
  daysRemaining: number | null
  /** 是否处于付费有效期内 */
  isActive: boolean
  /** 是否允许使用默认供应商之外的供应商 */
  allowAllProviders: boolean
}

const FREE_STATUS: MembershipStatus = {
  level: FREE_LEVEL,
  plan: null,
  expireAt: null,
  daysRemaining: null,
  isActive: false,
  allowAllProviders: false,
}

/**
 * 查询当前生效的订阅（未过期且状态为 active）。
 * 同一用户可能存在多条历史订阅，取到期时间最晚的一条。
 */
export async function getActiveSubscription(
  userId: string,
): Promise<(Subscription & { plan: Plan }) | null> {
  return prisma.subscription.findFirst({
    where: {
      userId,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      expireAt: { gt: new Date() },
    },
    include: { plan: true },
    orderBy: { expireAt: 'desc' },
  })
}

/** 查询用户会员状态 */
export async function getMembershipStatus(
  userId: string,
  now: Date = new Date(),
): Promise<MembershipStatus> {
  const sub = await getActiveSubscription(userId)
  if (!sub) return FREE_STATUS

  return {
    level: sub.plan.level,
    plan: sub.plan,
    expireAt: sub.expireAt,
    daysRemaining: resolveDaysRemaining(sub.expireAt, now),
    isActive: true,
    allowAllProviders: sub.plan.allowAllProviders,
  }
}

/** 是否允许使用默认供应商之外的供应商 */
export async function canUseAllProviders(userId: string): Promise<boolean> {
  const status = await getMembershipStatus(userId)
  return status.isActive && status.allowAllProviders
}

/**
 * 套餐对外 DTO。
 * name 仅作为兜底展示名，前端优先使用 messages/<locale>/membership.json 中
 * 以 plan code 为键的文案；featureKeys 同样是 i18n key。
 */
export interface PlanDto {
  code: string
  name: string
  level: number
  price: number
  durationDay: number
  allowAllProviders: boolean
  sortOrder: number
  featureKeys: string[]
}

export function serializePlan(plan: Plan): PlanDto {
  const features = plan.features
  const featureKeys =
    features && typeof features === 'object' && Array.isArray((features as { featureKeys?: unknown }).featureKeys)
      ? ((features as { featureKeys: unknown[] }).featureKeys.filter(
          (key): key is string => typeof key === 'string',
        ))
      : []

  return {
    code: plan.code,
    name: plan.name,
    level: plan.level,
    price: Number(plan.price),
    durationDay: plan.durationDay,
    allowAllProviders: plan.allowAllProviders,
    sortOrder: plan.sortOrder,
    featureKeys,
  }
}
