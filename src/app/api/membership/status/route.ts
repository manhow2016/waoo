/**
 * 当前用户会员状态
 * GET /api/membership/status
 *
 * 唯一真相源是 src/lib/membership.ts 的 getMembershipStatus：
 * 依赖 Subscription.status + expireAt 双重判断，到期即时回落免费，不依赖定时任务。
 */
import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import {
  RENEWAL_REMINDER_DAYS,
  getMembershipStatus,
  isRenewalReminderDue,
  serializePlan,
} from '@/lib/membership'

export const GET = apiHandler(async () => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const status = await getMembershipStatus(session.user.id)

  return NextResponse.json({
    level: status.level,
    isActive: status.isActive,
    allowAllProviders: status.allowAllProviders,
    expireAt: status.expireAt ? status.expireAt.toISOString() : null,
    // 到期提醒口径由服务端统一给出，前端不再自行计算「还剩几天 / 是否该提醒」
    daysRemaining: status.daysRemaining,
    expiringSoon: status.isActive && isRenewalReminderDue(status.daysRemaining),
    reminderDays: RENEWAL_REMINDER_DAYS,
    plan: status.plan ? serializePlan(status.plan) : null,
  })
})
