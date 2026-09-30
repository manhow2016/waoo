import { Worker, type Job } from 'bullmq'
import { queueRedis } from '@/lib/redis'
import { logInfo as _ulogInfo, logWarn as _ulogWarn } from '@/lib/logging/core'
import {
  MEMBERSHIP_JOB,
  MEMBERSHIP_QUEUE_NAME,
  expireSubscriptionIfDue,
  type MembershipExpireJobData,
} from '@/lib/membership-expiry'

async function processMembershipJob(job: Job<MembershipExpireJobData>) {
  switch (job.name) {
    case MEMBERSHIP_JOB.EXPIRE_SUBSCRIPTION: {
      const expired = await expireSubscriptionIfDue(job.data.subscriptionId)
      if (expired) {
        _ulogInfo('[Membership] subscription expired', {
          subscriptionId: job.data.subscriptionId,
        })
      } else {
        // 正常情况：用户已续费，旧任务到点后无需处理
        _ulogWarn('[Membership] expiry skipped (renewed or already handled)', {
          subscriptionId: job.data.subscriptionId,
        })
      }
      return { expired }
    }
    default:
      throw new Error(`Unsupported membership job: ${job.name}`)
  }
}

export function createMembershipWorker() {
  return new Worker<MembershipExpireJobData>(
    MEMBERSHIP_QUEUE_NAME,
    processMembershipJob,
    {
      connection: queueRedis,
      concurrency: 2,
    },
  )
}
