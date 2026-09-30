import { describe, expect, it } from 'vitest'
import {
  RENEWAL_REMINDER_DAYS,
  isRenewalReminderDue,
  resolveDaysRemaining,
} from '@/lib/membership'

const DAY = 24 * 60 * 60 * 1000

describe('membership / 到期剩余天数与提醒窗口', () => {
  const now = new Date('2026-02-01T00:00:00Z')

  it('免费用户没有到期时间', () => {
    expect(resolveDaysRemaining(null, now)).toBeNull()
    expect(isRenewalReminderDue(null)).toBe(false)
  })

  it('剩余天数向上取整，不出现负数', () => {
    expect(resolveDaysRemaining(new Date(now.getTime() + 3 * DAY), now)).toBe(3)
    expect(resolveDaysRemaining(new Date(now.getTime() + 3.5 * DAY), now)).toBe(4)
    expect(resolveDaysRemaining(new Date(now.getTime() - DAY), now)).toBe(0)
    expect(resolveDaysRemaining(now, now)).toBe(0)
  })

  it('提醒窗口默认 7 天，边界包含第 7 天', () => {
    expect(RENEWAL_REMINDER_DAYS).toBe(7)
    expect(isRenewalReminderDue(7)).toBe(true)
    expect(isRenewalReminderDue(8)).toBe(false)
    expect(isRenewalReminderDue(0)).toBe(true)
    expect(isRenewalReminderDue(30, 30)).toBe(true)
  })
})
