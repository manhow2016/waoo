/**
 * 订阅订单与订阅生命周期（订单状态的唯一 owner）
 *
 * 状态机：
 *   pending --(支付成功/运营开通)--> active --(到期)--> expired
 *   pending --(超时未支付/用户取消)--> expired
 *   active  --(退款/撤销)--> cancelled
 *
 * 关键规则：
 * 1. 幂等：以 paidAt 是否存在判定，重复回调直接返回成功，不重复开通。
 * 2. 续费顺延：已有未过期订阅时，新周期从原 expireAt 起算，而不是从当天起算。
 * 3. 到期时间在「开通时」才计算，因此用户可以先下单、后付款。
 */
import crypto from 'crypto'
import type { Plan, Subscription } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { logError as _ulogError } from '@/lib/logging/core'
import { SUBSCRIPTION_STATUS } from '@/lib/membership'
import { scheduleSubscriptionExpiry } from '@/lib/membership-expiry'

/** 订单号前缀 */
const ORDER_NO_PREFIX = 'WOO'

/** 同一用户在同一套餐下复用待支付订单的时间窗，避免重复点击产生重复扣款 */
const REUSABLE_PENDING_ORDER_MS = 30 * 60 * 1000

const DAY_MS = 24 * 60 * 60 * 1000

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS)
}

/** 生成订单号：前缀 + UTC 时间戳 + 随机段 */
export function generateOrderNo(now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  const random = crypto.randomBytes(4).toString('hex').toUpperCase()
  return `${ORDER_NO_PREFIX}${stamp}${random}`
}

export interface RenewalWindow {
  /** 本次订阅覆盖区间的起点（续费时为原到期时间） */
  startAt: Date
  /** 本次订阅覆盖区间的终点 */
  expireAt: Date
}

/**
 * 计算续费窗口（纯函数，便于测试）。
 * 已有未过期订阅时从原到期时间顺延，否则从当前时间起算。
 */
export function resolveRenewalWindow(input: {
  existingExpireAt: Date | null
  durationDay: number
  now: Date
}): RenewalWindow {
  const base =
    input.existingExpireAt && input.existingExpireAt.getTime() > input.now.getTime()
      ? input.existingExpireAt
      : input.now

  return { startAt: base, expireAt: addDays(base, input.durationDay) }
}

export interface SubscriptionOrderResult {
  subscription: Subscription
  plan: Plan
}

/**
 * 创建待支付订单。
 * - 免费套餐（时长 0 或价格 0）不可下单
 * - 短时间内重复下单会复用同一条待支付订单
 */
export async function createSubscriptionOrder(input: {
  userId: string
  planCode: string
  now?: Date
}): Promise<SubscriptionOrderResult & { reused: boolean }> {
  const now = input.now ?? new Date()

  const plan = await prisma.plan.findUnique({ where: { code: input.planCode } })
  if (!plan || !plan.isActive) {
    throw new Error(`NOT_FOUND: plan "${input.planCode}" is not available`)
  }
  if (plan.durationDay <= 0 || Number(plan.price) <= 0) {
    throw new Error(`INVALID_PARAMS: plan "${input.planCode}" is not purchasable`)
  }

  const reusableSince = new Date(now.getTime() - REUSABLE_PENDING_ORDER_MS)
  const reusable = await prisma.subscription.findFirst({
    where: {
      userId: input.userId,
      planId: plan.id,
      status: SUBSCRIPTION_STATUS.PENDING,
      paidAt: null,
      createdAt: { gte: reusableSince },
    },
    orderBy: { createdAt: 'desc' },
  })
  if (reusable) return { subscription: reusable, plan, reused: true }

  const subscription = await prisma.subscription.create({
    data: {
      userId: input.userId,
      planId: plan.id,
      orderNo: generateOrderNo(now),
      status: SUBSCRIPTION_STATUS.PENDING,
      // 待支付订单的起止时间是占位值，开通时按续费规则重算
      startAt: now,
      expireAt: now,
      amount: plan.price,
      payMethod: null,
    },
  })

  return { subscription, plan, reused: false }
}

export interface ActivateSubscriptionInput {
  orderNo: string
  /** 实付金额（元）；缺省沿用订单金额 */
  paidAmount?: number
  payMethod: string
  externalId?: string | null
  paidAt?: Date
}

export interface ActivateSubscriptionResult {
  subscription: Subscription
  plan: Plan
  /** true 表示该订单此前已开通过，本次为重复回调 */
  alreadyProcessed: boolean
}

/**
 * 开通订单（幂等）。
 *
 * 幂等判定：订单已存在 paidAt 时直接返回，不重复顺延有效期。
 * 续费顺延在同一事务内完成，避免并发回调把有效期算错。
 */
export async function markSubscriptionPaid(
  input: ActivateSubscriptionInput,
): Promise<ActivateSubscriptionResult> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.subscription.findUnique({
      where: { orderNo: input.orderNo },
      include: { plan: true },
    })
    if (!order) {
      throw new Error(`NOT_FOUND: subscription order "${input.orderNo}"`)
    }
    if (order.paidAt) {
      return { subscription: order, plan: order.plan, alreadyProcessed: true }
    }
    if (order.status === SUBSCRIPTION_STATUS.CANCELLED) {
      throw new Error(`CONFLICT: subscription order "${input.orderNo}" is cancelled`)
    }

    const paidAt = input.paidAt ?? new Date()

    // 续费顺延基准：该用户当前仍在有效期内、最晚的到期时间（排除本单）
    const currentActive = await tx.subscription.findFirst({
      where: {
        userId: order.userId,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        expireAt: { gt: paidAt },
        id: { not: order.id },
      },
      orderBy: { expireAt: 'desc' },
      select: { expireAt: true },
    })

    const window = resolveRenewalWindow({
      existingExpireAt: currentActive?.expireAt ?? null,
      durationDay: order.plan.durationDay,
      now: paidAt,
    })

    const subscription = await tx.subscription.update({
      where: { id: order.id },
      data: {
        status: SUBSCRIPTION_STATUS.ACTIVE,
        paidAt,
        startAt: window.startAt,
        expireAt: window.expireAt,
        amount: input.paidAmount ?? order.amount,
        payMethod: input.payMethod,
      },
    })

    return { subscription, plan: order.plan, alreadyProcessed: false }
  })
}

/**
 * 开通订单并安排到期降级任务。
 * 入队失败不应让已完成的收款/开通回滚，因此这里只记录错误继续返回。
 */
export async function activateSubscriptionOrder(
  input: ActivateSubscriptionInput,
): Promise<ActivateSubscriptionResult> {
  const result = await markSubscriptionPaid(input)

  if (!result.alreadyProcessed) {
    try {
      await scheduleSubscriptionExpiry(result.subscription.id, result.subscription.expireAt)
    } catch (error) {
      // 双保险：即使队列不可用，getMembershipStatus 仍按 expireAt 判定，且 sweep 可兜底
      _ulogError('[membership] scheduleSubscriptionExpiry failed', error)
    }
  }

  return result
}

/** 取消订单/撤销订阅（退款后调用） */
export async function cancelSubscriptionOrder(input: {
  orderNo: string
}): Promise<Subscription> {
  const order = await prisma.subscription.findUnique({
    where: { orderNo: input.orderNo },
  })
  if (!order) {
    throw new Error(`NOT_FOUND: subscription order "${input.orderNo}"`)
  }
  if (order.status === SUBSCRIPTION_STATUS.CANCELLED) {
    return order
  }

  return prisma.subscription.update({
    where: { id: order.id },
    data: { status: SUBSCRIPTION_STATUS.CANCELLED },
  })
}

/**
 * 用户自行取消待支付订单。
 *
 * 只能取消自己的、且尚未支付的订单：
 * - 查不到或不属于本人，一律返回 NOT_FOUND（不泄露订单是否存在）
 * - 已支付/已取消的订单返回 CONFLICT
 */
export async function cancelPendingOrder(input: {
  userId: string
  orderNo: string
}): Promise<Subscription> {
  const order = await prisma.subscription.findUnique({
    where: { orderNo: input.orderNo },
  })
  if (!order || order.userId !== input.userId) {
    throw new Error(`NOT_FOUND: subscription order "${input.orderNo}"`)
  }
  if (order.paidAt || order.status !== SUBSCRIPTION_STATUS.PENDING) {
    throw new Error(`CONFLICT: order "${input.orderNo}" is not cancellable`)
  }

  return prisma.subscription.update({
    where: { id: order.id },
    data: { status: SUBSCRIPTION_STATUS.CANCELLED },
  })
}

/** 查询用户订单（按创建时间倒序） */
export async function listUserSubscriptions(input: {
  userId: string
  limit?: number
}): Promise<Array<Subscription & { plan: Plan }>> {
  return prisma.subscription.findMany({
    where: { userId: input.userId },
    include: { plan: true },
    orderBy: { createdAt: 'desc' },
    take: input.limit ?? 20,
  })
}

/** 订单对外 DTO（金额与时间统一序列化为前端可直接消费的形式） */
export interface SubscriptionOrderDto {
  orderNo: string
  status: string
  planCode: string
  planName: string
  level: number
  amount: number
  payMethod: string | null
  startAt: string
  expireAt: string
  paidAt: string | null
  createdAt: string
}

export function serializeSubscriptionOrder(
  subscription: Subscription & { plan: Plan },
): SubscriptionOrderDto {
  return {
    orderNo: subscription.orderNo,
    status: subscription.status,
    planCode: subscription.plan.code,
    planName: subscription.plan.name,
    level: subscription.plan.level,
    amount: Number(subscription.amount),
    payMethod: subscription.payMethod ?? null,
    startAt: subscription.startAt.toISOString(),
    expireAt: subscription.expireAt.toISOString(),
    paidAt: subscription.paidAt ? subscription.paidAt.toISOString() : null,
    createdAt: subscription.createdAt.toISOString(),
  }
}

/** 按邮箱查询用户信息，供运营工具与后台使用 */
export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } })
}
