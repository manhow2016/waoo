import { beforeEach, describe, expect, it, vi } from 'vitest'

const txMock = vi.hoisted(() => ({
  subscription: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
}))

const prismaMock = vi.hoisted(() => ({
  subscription: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  },
  plan: {
    findUnique: vi.fn(),
  },
  $transaction: vi.fn(),
}))

const scheduleExpiryMock = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/membership-expiry', () => ({
  scheduleSubscriptionExpiry: scheduleExpiryMock,
}))

import {
  activateSubscriptionOrder,
  addDays,
  cancelPendingOrder,
  cancelSubscriptionOrder,
  createSubscriptionOrder,
  generateOrderNo,
  markSubscriptionPaid,
  resolveRenewalWindow,
} from '@/lib/subscription-order'

const DAY_MS = 24 * 60 * 60 * 1000

function buildPlan(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plan-monthly',
    code: 'monthly',
    name: '月付会员',
    level: 1,
    price: 29,
    durationDay: 30,
    allowAllProviders: true,
    features: null,
    sortOrder: 1,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    userId: 'user-1',
    planId: 'plan-monthly',
    startAt: new Date('2026-02-01T00:00:00Z'),
    expireAt: new Date('2026-02-01T00:00:00Z'),
    status: 'pending',
    orderNo: 'WOO20260201000000ABCD1234',
    paidAt: null,
    amount: 29,
    payMethod: null,
    createdAt: new Date('2026-02-01T00:00:00Z'),
    updatedAt: new Date('2026-02-01T00:00:00Z'),
    plan: buildPlan(),
    ...overrides,
  }
}

describe('subscription-order / 纯函数', () => {
  it('addDays 按天推进且不修改入参', () => {
    const base = new Date('2026-02-01T00:00:00Z')
    const next = addDays(base, 30)

    expect(next.getTime()).toBe(base.getTime() + 30 * DAY_MS)
    expect(base.getTime()).toBe(new Date('2026-02-01T00:00:00Z').getTime())
  })

  it('无有效订阅时从当前时间起算', () => {
    const now = new Date('2026-02-01T00:00:00Z')
    const window = resolveRenewalWindow({ existingExpireAt: null, durationDay: 30, now })

    expect(window.startAt).toBe(now)
    expect(window.expireAt.toISOString()).toBe('2026-03-03T00:00:00.000Z')
  })

  it('已有未过期订阅时从原到期时间顺延（续费叠加）', () => {
    const now = new Date('2026-02-01T00:00:00Z')
    const existingExpireAt = new Date('2026-02-11T00:00:00Z')
    const window = resolveRenewalWindow({ existingExpireAt, durationDay: 30, now })

    expect(window.startAt).toBe(existingExpireAt)
    expect(window.expireAt.toISOString()).toBe('2026-03-13T00:00:00.000Z')
  })

  it('已有订阅但已过期时不顺延', () => {
    const now = new Date('2026-02-01T00:00:00Z')
    const window = resolveRenewalWindow({
      existingExpireAt: new Date('2026-01-01T00:00:00Z'),
      durationDay: 30,
      now,
    })

    expect(window.startAt).toBe(now)
  })

  it('订单号带前缀且不重复', () => {
    const first = generateOrderNo(new Date('2026-02-01T00:00:00Z'))
    const second = generateOrderNo(new Date('2026-02-01T00:00:00Z'))

    expect(first.startsWith('WOO')).toBe(true)
    expect(first).not.toBe(second)
  })
})

describe('subscription-order / createSubscriptionOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.plan.findUnique.mockResolvedValue(buildPlan())
    prismaMock.subscription.findFirst.mockResolvedValue(null)
    prismaMock.subscription.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => buildOrder({ ...data, id: 'sub-new' }),
    )
  })

  it('免费套餐不可下单', async () => {
    prismaMock.plan.findUnique.mockResolvedValue(
      buildPlan({ code: 'free', price: 0, durationDay: 0, level: 0 }),
    )

    await expect(
      createSubscriptionOrder({ userId: 'user-1', planCode: 'free' }),
    ).rejects.toThrow(/INVALID_PARAMS/)
  })

  it('不存在的套餐拒绝下单', async () => {
    prismaMock.plan.findUnique.mockResolvedValue(null)

    await expect(
      createSubscriptionOrder({ userId: 'user-1', planCode: 'ghost' }),
    ).rejects.toThrow(/NOT_FOUND/)
  })

  it('重复点击复用最近待支付订单，不产生重复扣款风险', async () => {
    const pending = buildOrder({ id: 'sub-existing' })
    prismaMock.subscription.findFirst.mockResolvedValue(pending)

    const result = await createSubscriptionOrder({ userId: 'user-1', planCode: 'monthly' })

    expect(result.reused).toBe(true)
    expect(result.subscription.id).toBe('sub-existing')
    expect(prismaMock.subscription.create).not.toHaveBeenCalled()
  })

  it('首次下单创建待支付订单', async () => {
    const result = await createSubscriptionOrder({ userId: 'user-1', planCode: 'monthly' })

    expect(result.reused).toBe(false)
    expect(prismaMock.subscription.create).toHaveBeenCalledTimes(1)
    const createArg = prismaMock.subscription.create.mock.calls[0][0] as {
      data: { status: string; orderNo: string }
    }
    expect(createArg.data.status).toBe('pending')
    expect(createArg.data.orderNo.startsWith('WOO')).toBe(true)
  })
})

describe('subscription-order / markSubscriptionPaid 幂等与顺延', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof txMock) => Promise<unknown>) => await callback(txMock),
    )
    txMock.subscription.findFirst.mockResolvedValue(null)
  })

  it('订单不存在时报错', async () => {
    txMock.subscription.findUnique.mockResolvedValue(null)

    await expect(
      markSubscriptionPaid({ orderNo: 'WOO-x', payMethod: 'manual' }),
    ).rejects.toThrow(/NOT_FOUND/)
  })

  it('重复回调直接返回成功，不重复顺延有效期', async () => {
    const paidOrder = buildOrder({
      status: 'active',
      paidAt: new Date('2026-02-01T10:00:00Z'),
      expireAt: new Date('2026-03-03T00:00:00Z'),
    })
    txMock.subscription.findUnique.mockResolvedValue(paidOrder)

    const result = await markSubscriptionPaid({ orderNo: paidOrder.orderNo, payMethod: 'manual' })

    expect(result.alreadyProcessed).toBe(true)
    expect(result.subscription.expireAt).toEqual(paidOrder.expireAt)
    expect(txMock.subscription.update).not.toHaveBeenCalled()
  })

  it('已取消订单不允许开通', async () => {
    txMock.subscription.findUnique.mockResolvedValue(buildOrder({ status: 'cancelled' }))

    await expect(
      markSubscriptionPaid({ orderNo: 'WOO20260201000000ABCD1234', payMethod: 'manual' }),
    ).rejects.toThrow(/CONFLICT/)
  })

  it('首次开通按套餐时长计算到期时间', async () => {
    const paidAt = new Date('2026-02-01T10:00:00Z')
    txMock.subscription.findUnique.mockResolvedValue(buildOrder())
    txMock.subscription.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => buildOrder({ ...data }),
    )

    const result = await markSubscriptionPaid({
      orderNo: 'WOO20260201000000ABCD1234',
      payMethod: 'manual',
      paidAt,
    })

    expect(result.alreadyProcessed).toBe(false)
    const updateArg = txMock.subscription.update.mock.calls[0][0] as {
      data: { status: string; expireAt: Date; startAt: Date; payMethod: string }
    }
    expect(updateArg.data.status).toBe('active')
    expect(updateArg.data.startAt).toEqual(paidAt)
    expect(updateArg.data.expireAt.getTime()).toBe(paidAt.getTime() + 30 * DAY_MS)
    expect(updateArg.data.payMethod).toBe('manual')
  })

  it('续费时从原到期时间顺延', async () => {
    const paidAt = new Date('2026-02-01T10:00:00Z')
    const existingExpireAt = new Date('2026-02-11T00:00:00Z')
    txMock.subscription.findUnique.mockResolvedValue(buildOrder())
    txMock.subscription.findFirst.mockResolvedValue({ expireAt: existingExpireAt })
    txMock.subscription.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => buildOrder({ ...data }),
    )

    await markSubscriptionPaid({
      orderNo: 'WOO20260201000000ABCD1234',
      payMethod: 'manual',
      paidAt,
    })

    const updateArg = txMock.subscription.update.mock.calls[0][0] as {
      data: { startAt: Date; expireAt: Date }
    }
    expect(updateArg.data.startAt).toEqual(existingExpireAt)
    expect(updateArg.data.expireAt.getTime()).toBe(existingExpireAt.getTime() + 30 * DAY_MS)
  })

  it('实付金额覆盖订单金额', async () => {
    txMock.subscription.findUnique.mockResolvedValue(buildOrder())
    txMock.subscription.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => buildOrder({ ...data }),
    )

    await markSubscriptionPaid({
      orderNo: 'WOO20260201000000ABCD1234',
      payMethod: 'alipay',
      paidAmount: 19.9,
    })

    const updateArg = txMock.subscription.update.mock.calls[0][0] as { data: { amount: number } }
    expect(updateArg.data.amount).toBe(19.9)
  })
})

describe('subscription-order / activateSubscriptionOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof txMock) => Promise<unknown>) => await callback(txMock),
    )
    txMock.subscription.findFirst.mockResolvedValue(null)
  })

  it('首次开通后安排到期降级任务', async () => {
    txMock.subscription.findUnique.mockResolvedValue(buildOrder())
    const expireAt = new Date('2026-03-03T00:00:00Z')
    txMock.subscription.update.mockResolvedValue(
      buildOrder({ status: 'active', paidAt: new Date(), expireAt }),
    )

    await activateSubscriptionOrder({ orderNo: 'WOO20260201000000ABCD1234', payMethod: 'manual' })

    expect(scheduleExpiryMock).toHaveBeenCalledWith('sub-1', expireAt)
  })

  it('重复回调不再安排任务', async () => {
    txMock.subscription.findUnique.mockResolvedValue(
      buildOrder({ status: 'active', paidAt: new Date() }),
    )

    await activateSubscriptionOrder({ orderNo: 'WOO20260201000000ABCD1234', payMethod: 'manual' })

    expect(scheduleExpiryMock).not.toHaveBeenCalled()
  })

  it('入队失败不影响已完成的收款与开通', async () => {
    txMock.subscription.findUnique.mockResolvedValue(buildOrder())
    txMock.subscription.update.mockResolvedValue(buildOrder({ status: 'active', paidAt: new Date() }))
    scheduleExpiryMock.mockRejectedValueOnce(new Error('redis down'))

    const result = await activateSubscriptionOrder({
      orderNo: 'WOO20260201000000ABCD1234',
      payMethod: 'manual',
    })

    expect(result.alreadyProcessed).toBe(false)
  })
})

describe('subscription-order / cancelSubscriptionOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('取消后状态为 cancelled', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(buildOrder({ status: 'active' }))
    prismaMock.subscription.update.mockResolvedValue(buildOrder({ status: 'cancelled' }))

    const result = await cancelSubscriptionOrder({ orderNo: 'WOO20260201000000ABCD1234' })

    expect(result.status).toBe('cancelled')
  })

  it('重复取消是幂等的', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(buildOrder({ status: 'cancelled' }))

    await cancelSubscriptionOrder({ orderNo: 'WOO20260201000000ABCD1234' })

    expect(prismaMock.subscription.update).not.toHaveBeenCalled()
  })

  it('订单不存在时报错', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(null)

    await expect(cancelSubscriptionOrder({ orderNo: 'WOO-x' })).rejects.toThrow(/NOT_FOUND/)
  })
})

describe('subscription-order / 用户取消待支付订单', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('订单不存在或不属于本人时按不存在处理', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(null)

    await expect(
      cancelPendingOrder({ userId: 'user-1', orderNo: 'WOO-x' }),
    ).rejects.toThrow(/NOT_FOUND/)

    prismaMock.subscription.findUnique.mockResolvedValue(buildOrder({ userId: 'someone-else' }))

    await expect(
      cancelPendingOrder({ userId: 'user-1', orderNo: 'WOO20260201000000ABCD1234' }),
    ).rejects.toThrow(/NOT_FOUND/)
  })

  it('已支付或已取消的订单不可取消', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(
      buildOrder({ status: 'active', paidAt: new Date() }),
    )
    await expect(
      cancelPendingOrder({ userId: 'user-1', orderNo: 'WOO20260201000000ABCD1234' }),
    ).rejects.toThrow(/CONFLICT/)

    prismaMock.subscription.findUnique.mockResolvedValue(buildOrder({ status: 'cancelled' }))
    await expect(
      cancelPendingOrder({ userId: 'user-1', orderNo: 'WOO20260201000000ABCD1234' }),
    ).rejects.toThrow(/CONFLICT/)
  })

  it('待支付订单可被本人取消', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(buildOrder({ userId: 'user-1' }))
    prismaMock.subscription.update.mockResolvedValue(buildOrder({ status: 'cancelled' }))

    const result = await cancelPendingOrder({
      userId: 'user-1',
      orderNo: 'WOO20260201000000ABCD1234',
    })

    expect(result.status).toBe('cancelled')
    const updateArg = prismaMock.subscription.update.mock.calls[0][0] as {
      data: { status: string }
    }
    expect(updateArg.data.status).toBe('cancelled')
  })
})
