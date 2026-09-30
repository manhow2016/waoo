/**
 * 会员到期降级（BullMQ 延迟任务 + 兜底扫描）
 *
 * 设计要点：
 * 1. 支付成功后按 expireAt 入队延迟任务；任务到点后重新读库再决定是否降级。
 * 2. 用户续费后 expireAt 会后移：旧任务因为 jobId 含旧到期时间而不会覆盖新任务，
 *    且执行时会因 `expireAt <= now` 不成立而自动跳过，因此旧任务残留无害。
 * 3. 双保险：即使任务全部丢失，src/lib/membership.ts 的 getMembershipStatus
 *    也通过 `expireAt > now` 判定，到期即时回落免费。sweepSubscriptions 用于兜底修正数据状态。
 */
import { Queue, type JobsOptions } from 'bullmq'
import { queueRedis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { SUBSCRIPTION_STATUS } from '@/lib/membership'

export const MEMBERSHIP_QUEUE_NAME = 'waoowaoo-membership'

export const MEMBERSHIP_JOB = {
  EXPIRE_SUBSCRIPTION: 'membership.expire',
} as const

export interface MembershipExpireJobData {
  subscriptionId: string
}

/** 未支付订单保留时长：超时后由兜底扫描关闭，避免用户侧堆积大量无效订单 */
export const PENDING_ORDER_TTL_MS = 24 * 60 * 60 * 1000

const defaultJobOptions: JobsOptions = {
  removeOnComplete: true,
  removeOnFail: 200,
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 5_000,
  },
}

export const membershipQueue = new Queue<MembershipExpireJobData>(
  MEMBERSHIP_QUEUE_NAME,
  {
    connection: queueRedis,
    defaultJobOptions,
  },
)

/**
 * 安排订阅到期降级任务。
 * jobId 含到期时间戳：续费后新旧任务共存，旧任务执行时会被有效期判断自然跳过。
 */
export async function scheduleSubscriptionExpiry(
  subscriptionId: string,
  expireAt: Date,
  now: Date = new Date(),
): Promise<void> {
  const delay = Math.max(0, expireAt.getTime() - now.getTime())
  await membershipQueue.add(
    MEMBERSHIP_JOB.EXPIRE_SUBSCRIPTION,
    { subscriptionId },
    {
      jobId: `membership-expire-${subscriptionId}-${expireAt.getTime()}`,
      delay,
    },
  )
}

/**
 * 到点降级单个订阅。
 * 只有「仍为 active 且确实已到期」才会被改写，因此续费后的旧任务是无害的空操作。
 */
export async function expireSubscriptionIfDue(
  subscriptionId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const result = await prisma.subscription.updateMany({
    where: {
      id: subscriptionId,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      expireAt: { lte: now },
    },
    data: { status: SUBSCRIPTION_STATUS.EXPIRED },
  })
  return result.count > 0
}

/**
 * 兜底扫描：补偿丢失的延迟任务，并关闭长期未支付的订单。
 * 可安全重复执行，也可由运维手动触发（scripts/membership-admin.ts sweep）。
 */
export async function sweepSubscriptions(
  input: { now?: Date; pendingTtlMs?: number } = {},
): Promise<{ expired: number; stalePending: number }> {
  const now = input.now ?? new Date()
  const pendingCutoff = new Date(
    now.getTime() - (input.pendingTtlMs ?? PENDING_ORDER_TTL_MS),
  )

  const expired = await prisma.subscription.updateMany({
    where: {
      status: SUBSCRIPTION_STATUS.ACTIVE,
      expireAt: { lte: now },
    },
    data: { status: SUBSCRIPTION_STATUS.EXPIRED },
  })

  const stalePending = await prisma.subscription.updateMany({
    where: {
      status: SUBSCRIPTION_STATUS.PENDING,
      paidAt: null,
      createdAt: { lt: pendingCutoff },
    },
    data: { status: SUBSCRIPTION_STATUS.EXPIRED },
  })

  return { expired: expired.count, stalePending: stalePending.count }
}
