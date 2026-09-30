import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ROUTE_CATALOG } from '../../../contracts/route-catalog'
import { buildMockRequest } from '../../../helpers/request'

const authState = vi.hoisted(() => ({
  authenticated: false,
  userId: 'user-1',
}))

const prismaMock = vi.hoisted(() => ({
  plan: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  provider: {
    findMany: vi.fn(),
  },
  subscription: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  systemConfig: {
    findUnique: vi.fn(),
  },
  $transaction: vi.fn(),
}))

const paymentMock = vi.hoisted(() => ({
  getPaymentAdapter: vi.fn(),
}))

const scheduleExpiryMock = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('@/lib/api-auth', () => {
  const unauthorized = () => new Response(
    JSON.stringify({ error: { code: 'UNAUTHORIZED' } }),
    { status: 401, headers: { 'content-type': 'application/json' } },
  )

  return {
    isErrorResponse: (value: unknown) => value instanceof Response,
    requireUserAuth: async () => {
      if (!authState.authenticated) return unauthorized()
      return { session: { user: { id: authState.userId } } }
    },
  }
})

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/membership-expiry', () => ({
  scheduleSubscriptionExpiry: scheduleExpiryMock,
}))

// 只替换渠道解析，保留注册表其余实现（默认渠道为 manual）
vi.mock('@/lib/payment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/payment')>()
  return { ...actual, getPaymentAdapter: paymentMock.getPaymentAdapter }
})

const FREE_PLAN = {
  id: 'plan-free',
  code: 'free',
  name: '免费',
  level: 0,
  price: 0,
  durationDay: 0,
  allowAllProviders: false,
  sortOrder: 0,
  features: { featureKeys: ['unlimitedDefaultProvider'] },
  isActive: true,
}

const MONTHLY_PLAN = {
  id: 'plan-monthly',
  code: 'monthly',
  name: '月付会员',
  level: 1,
  price: 29,
  durationDay: 30,
  allowAllProviders: true,
  sortOrder: 1,
  features: { featureKeys: ['unlimitedDefaultProvider', 'allProviders'] },
  isActive: true,
}

const ACTIVE_PLANS = [FREE_PLAN, MONTHLY_PLAN]

const PROVIDER_ROWS = [
  { code: 'token61', name: 'Token六一', isDefault: true, sortOrder: 0 },
  { code: 'bailian', name: '阿里百炼', isDefault: false, sortOrder: 1 },
]

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
    ...overrides,
  }
}

/** 模拟 provider.findMany：按 where.code 的 in / notIn 过滤 */
function installProviderTable(rows: typeof PROVIDER_ROWS = PROVIDER_ROWS) {
  prismaMock.provider.findMany.mockImplementation(
    async (args?: { where?: { code?: { in?: string[]; notIn?: string[] } } }) => {
      const codeFilter = args?.where?.code
      let filtered = rows
      if (codeFilter?.in) {
        filtered = filtered.filter((row) => codeFilter.in?.includes(row.code))
      }
      if (codeFilter?.notIn) {
        filtered = filtered.filter((row) => !codeFilter.notIn?.includes(row.code))
      }
      return filtered
    },
  )
}

function buildSubscription(membership: {
  level: number
  price: number
  allowAllProviders: boolean
  expireAt: Date
}) {
  return {
    id: 'sub-1',
    userId: authState.userId,
    planId: 'plan-1',
    startAt: new Date('2026-01-01T00:00:00Z'),
    expireAt: membership.expireAt,
    status: 'active',
    orderNo: 'ORDER-1',
    paidAt: new Date('2026-01-01T00:00:00Z'),
    amount: membership.price,
    payMethod: 'manual',
    plan: {
      ...MONTHLY_PLAN,
      id: 'plan-1',
      code: membership.level === 1 ? 'monthly' : 'yearly',
      level: membership.level,
      price: membership.price,
      allowAllProviders: membership.allowAllProviders,
    },
  }
}

describe('api contract - membership routes (behavior)', () => {
  const routes = ROUTE_CATALOG.filter((entry) => entry.contractGroup === 'membership-routes')

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    authState.authenticated = false
    authState.userId = 'user-1'
    prismaMock.plan.findMany.mockResolvedValue(ACTIVE_PLANS)
    prismaMock.plan.findUnique.mockResolvedValue(MONTHLY_PLAN)
    prismaMock.subscription.findFirst.mockResolvedValue(null)
    prismaMock.subscription.findMany.mockResolvedValue([])
    prismaMock.subscription.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => buildOrder(data),
    )
    prismaMock.systemConfig.findUnique.mockResolvedValue(null)
    // 事务回调直接使用同一组 mock，便于断言幂等与续费顺延
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => await callback(prismaMock),
    )
    installProviderTable()
  })

  it('membership routes are registered in the contract group', () => {
    expect(routes.map((entry) => entry.routeFile)).toEqual([
      'src/app/api/membership/orders/[orderNo]/cancel/route.ts',
      'src/app/api/membership/orders/route.ts',
      'src/app/api/membership/plans/route.ts',
      'src/app/api/membership/providers/route.ts',
      'src/app/api/membership/status/route.ts',
      'src/app/api/membership/subscribe/route.ts',
      'src/app/api/membership/webhook/route.ts',
    ])
  })

  it('GET /api/membership/plans rejects unauthenticated requests', async () => {
    const mod = await import('@/app/api/membership/plans/route')
    const req = buildMockRequest({ path: '/api/membership/plans', method: 'GET' })

    const res = await mod.GET(req, { params: Promise.resolve({}) })

    expect(res.status).toBe(401)
    expect(prismaMock.plan.findMany).not.toHaveBeenCalled()
  })

  it('GET /api/membership/plans returns active plans with i18n feature keys', async () => {
    authState.authenticated = true
    const mod = await import('@/app/api/membership/plans/route')
    const req = buildMockRequest({ path: '/api/membership/plans', method: 'GET' })

    const res = await mod.GET(req, { params: Promise.resolve({}) })
    const json = await res.json() as {
      plans: Array<{ code: string; price: number; allowAllProviders: boolean; featureKeys: string[] }>
    }

    expect(res.status).toBe(200)
    expect(prismaMock.plan.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    })
    expect(json.plans).toHaveLength(2)
    expect(json.plans[1]).toMatchObject({
      code: 'monthly',
      price: 29,
      allowAllProviders: true,
      featureKeys: ['unlimitedDefaultProvider', 'allProviders'],
    })
  })

  it('GET /api/membership/status falls back to free when no subscription is active', async () => {
    authState.authenticated = true
    const mod = await import('@/app/api/membership/status/route')
    const req = buildMockRequest({ path: '/api/membership/status', method: 'GET' })

    const res = await mod.GET(req, { params: Promise.resolve({}) })
    const json = await res.json() as {
      level: number
      isActive: boolean
      allowAllProviders: boolean
      expireAt: string | null
      plan: unknown
    }

    expect(res.status).toBe(200)
    expect(json).toMatchObject({
      level: 0,
      isActive: false,
      allowAllProviders: false,
      expireAt: null,
      daysRemaining: null,
      expiringSoon: false,
      reminderDays: 7,
      plan: null,
    })
  })

  it('GET /api/membership/status 在临近到期时给出续费提醒口径', async () => {
    authState.authenticated = true
    // 还有 3 天到期 → 落在 7 天提醒窗口内
    const expireAt = new Date(Date.now() + 3 * 86_400_000)
    prismaMock.subscription.findFirst.mockResolvedValue(
      buildSubscription({ level: 1, price: 29, allowAllProviders: true, expireAt }),
    )

    const mod = await import('@/app/api/membership/status/route')
    const res = await mod.GET(
      buildMockRequest({ path: '/api/membership/status', method: 'GET' }),
      { params: Promise.resolve({}) },
    )
    const json = (await res.json()) as {
      daysRemaining: number
      expiringSoon: boolean
      reminderDays: number
    }

    expect(res.status).toBe(200)
    expect(json.daysRemaining).toBe(3)
    expect(json.expiringSoon).toBe(true)
    expect(json.reminderDays).toBe(7)
  })

  it('POST /api/membership/orders/[orderNo]/cancel 拒绝未登录', async () => {
    const mod = await import('@/app/api/membership/orders/[orderNo]/cancel/route')
    const res = await mod.POST(
      buildMockRequest({ path: '/api/membership/orders/WOO-1/cancel', method: 'POST' }),
      { params: Promise.resolve({ orderNo: 'WOO-1' }) },
    )

    expect(res.status).toBe(401)
  })

  it('POST /api/membership/orders/[orderNo]/cancel 只能取消自己的待支付订单', async () => {
    authState.authenticated = true
    // 订单属于别人 → 按不存在处理
    prismaMock.subscription.findUnique.mockResolvedValue(
      buildOrder({ userId: 'someone-else', plan: MONTHLY_PLAN }),
    )

    const mod = await import('@/app/api/membership/orders/[orderNo]/cancel/route')
    const res = await mod.POST(
      buildMockRequest({ path: '/api/membership/orders/WOO-1/cancel', method: 'POST' }),
      { params: Promise.resolve({ orderNo: 'WOO-1' }) },
    )

    expect(res.status).toBe(404)
    expect(prismaMock.subscription.update).not.toHaveBeenCalled()
  })

  it('POST /api/membership/orders/[orderNo]/cancel 已支付订单返回冲突', async () => {
    authState.authenticated = true
    prismaMock.subscription.findUnique.mockResolvedValue(
      buildOrder({ status: 'active', paidAt: new Date(), plan: MONTHLY_PLAN }),
    )

    const mod = await import('@/app/api/membership/orders/[orderNo]/cancel/route')
    const res = await mod.POST(
      buildMockRequest({ path: '/api/membership/orders/WOO-1/cancel', method: 'POST' }),
      { params: Promise.resolve({ orderNo: 'WOO-1' }) },
    )

    expect(res.status).toBe(409)
    expect(prismaMock.subscription.update).not.toHaveBeenCalled()
  })

  it('POST /api/membership/orders/[orderNo]/cancel 成功后返回已取消订单', async () => {
    authState.authenticated = true
    prismaMock.subscription.findUnique.mockResolvedValue(
      buildOrder({ plan: MONTHLY_PLAN }),
    )
    prismaMock.subscription.update.mockResolvedValue(
      buildOrder({ status: 'cancelled', plan: MONTHLY_PLAN }),
    )
    prismaMock.plan.findUnique.mockResolvedValue(MONTHLY_PLAN)

    const mod = await import('@/app/api/membership/orders/[orderNo]/cancel/route')
    const res = await mod.POST(
      buildMockRequest({ path: '/api/membership/orders/WOO-1/cancel', method: 'POST' }),
      { params: Promise.resolve({ orderNo: 'WOO-1' }) },
    )
    const json = (await res.json()) as { order: { status: string } }

    expect(res.status).toBe(200)
    expect(json.order.status).toBe('cancelled')
  })

  it('GET /api/membership/status returns the active subscription window', async () => {
    authState.authenticated = true
    const expireAt = new Date(Date.now() + 86_400_000)
    prismaMock.subscription.findFirst.mockResolvedValue(
      buildSubscription({ level: 1, price: 29, allowAllProviders: true, expireAt }),
    )

    const mod = await import('@/app/api/membership/status/route')
    const req = buildMockRequest({ path: '/api/membership/status', method: 'GET' })

    const res = await mod.GET(req, { params: Promise.resolve({}) })
    const json = await res.json() as {
      level: number
      isActive: boolean
      allowAllProviders: boolean
      expireAt: string
      plan: { code: string; price: number }
    }

    expect(res.status).toBe(200)
    expect(json.level).toBe(1)
    expect(json.isActive).toBe(true)
    expect(json.allowAllProviders).toBe(true)
    expect(json.expireAt).toBe(expireAt.toISOString())
    expect(json.plan).toMatchObject({ code: 'monthly', price: 29 })
  })

  it('GET /api/membership/providers locks non-default providers for free users', async () => {
    authState.authenticated = true
    const mod = await import('@/app/api/membership/providers/route')
    const req = buildMockRequest({ path: '/api/membership/providers', method: 'GET' })

    const res = await mod.GET(req, { params: Promise.resolve({}) })
    const json = await res.json() as {
      allowAllProviders: boolean
      defaultProviderCode: string
      providers: Array<{ code: string; locked: boolean }>
    }

    expect(res.status).toBe(200)
    expect(json.allowAllProviders).toBe(false)
    expect(json.defaultProviderCode).toBe('token61')
    expect(json.providers).toEqual([
      expect.objectContaining({ code: 'token61', locked: false }),
      expect.objectContaining({ code: 'bailian', locked: true }),
    ])
  })

  it('GET /api/membership/providers unlocks every provider for paid users', async () => {
    authState.authenticated = true
    prismaMock.subscription.findFirst.mockResolvedValue(
      buildSubscription({
        level: 3,
        price: 259,
        allowAllProviders: true,
        expireAt: new Date(Date.now() + 86_400_000),
      }),
    )

    const mod = await import('@/app/api/membership/providers/route')
    const req = buildMockRequest({ path: '/api/membership/providers', method: 'GET' })

    const res = await mod.GET(req, { params: Promise.resolve({}) })
    const json = await res.json() as {
      allowAllProviders: boolean
      providers: Array<{ code: string; locked: boolean }>
    }

    expect(res.status).toBe(200)
    expect(json.allowAllProviders).toBe(true)
    expect(json.providers.every((provider) => provider.locked === false)).toBe(true)
  })

  it('GET /api/membership/orders rejects unauthenticated requests', async () => {
    const mod = await import('@/app/api/membership/orders/route')
    const req = buildMockRequest({ path: '/api/membership/orders', method: 'GET' })

    const res = await mod.GET(req, { params: Promise.resolve({}) })

    expect(res.status).toBe(401)
    expect(prismaMock.subscription.findMany).not.toHaveBeenCalled()
  })

  it('GET /api/membership/orders returns serialized orders', async () => {
    authState.authenticated = true
    prismaMock.subscription.findMany.mockResolvedValue([
      buildOrder({ plan: MONTHLY_PLAN }),
    ])

    const mod = await import('@/app/api/membership/orders/route')
    const req = buildMockRequest({ path: '/api/membership/orders', method: 'GET' })

    const res = await mod.GET(req, { params: Promise.resolve({}) })
    const json = await res.json() as {
      orders: Array<{ orderNo: string; status: string; amount: number; planCode: string }>
    }

    expect(res.status).toBe(200)
    expect(json.orders).toHaveLength(1)
    expect(json.orders[0]).toMatchObject({
      orderNo: 'WOO20260201000000ABCD1234',
      status: 'pending',
      amount: 29,
      planCode: 'monthly',
    })
  })

  it('POST /api/membership/subscribe rejects unauthenticated requests', async () => {
    const mod = await import('@/app/api/membership/subscribe/route')
    const req = buildMockRequest({
      path: '/api/membership/subscribe',
      method: 'POST',
      body: { planCode: 'monthly' },
    })

    const res = await mod.POST(req, { params: Promise.resolve({}) })

    expect(res.status).toBe(401)
  })

  it('POST /api/membership/subscribe requires planCode', async () => {
    authState.authenticated = true
    const mod = await import('@/app/api/membership/subscribe/route')
    const req = buildMockRequest({
      path: '/api/membership/subscribe',
      method: 'POST',
      body: {},
    })

    const res = await mod.POST(req, { params: Promise.resolve({}) })

    expect(res.status).toBe(400)
    expect(prismaMock.subscription.create).not.toHaveBeenCalled()
  })

  it('POST /api/membership/subscribe creates a pending order with manual instructions', async () => {
    authState.authenticated = true
    const mod = await import('@/app/api/membership/subscribe/route')
    const req = buildMockRequest({
      path: '/api/membership/subscribe',
      method: 'POST',
      body: { planCode: 'monthly' },
    })

    const res = await mod.POST(req, { params: Promise.resolve({}) })
    const json = await res.json() as {
      order: { orderNo: string; status: string; amount: number }
      payment: { method: string; autoActivate: boolean; instructionsKey: string }
    }

    expect(res.status).toBe(200)
    expect(json.order).toMatchObject({ status: 'pending', amount: 29 })
    expect(json.order.orderNo.startsWith('WOO')).toBe(true)
    expect(json.payment).toMatchObject({
      method: 'manual',
      autoActivate: false,
      instructionsKey: 'paymentManualInstructions',
    })
    // 手动渠道不自动开通，因此不安排到期任务
    expect(scheduleExpiryMock).not.toHaveBeenCalled()
  })

  it('POST /api/membership/subscribe rejects the free plan', async () => {
    authState.authenticated = true
    prismaMock.plan.findUnique.mockResolvedValue(FREE_PLAN)

    const mod = await import('@/app/api/membership/subscribe/route')
    const req = buildMockRequest({
      path: '/api/membership/subscribe',
      method: 'POST',
      body: { planCode: 'free' },
    })

    const res = await mod.POST(req, { params: Promise.resolve({}) })

    expect(res.status).toBe(400)
    expect(prismaMock.subscription.create).not.toHaveBeenCalled()
  })

  it('POST /api/membership/webhook rejects unknown payment channels', async () => {
    paymentMock.getPaymentAdapter.mockReturnValue(null)

    const mod = await import('@/app/api/membership/webhook/route')
    const req = buildMockRequest({
      path: '/api/membership/webhook?method=ghost',
      method: 'POST',
      body: {},
    })

    const res = await mod.POST(req, { params: Promise.resolve({}) })

    expect(res.status).toBe(400)
  })

  it('POST /api/membership/webhook rejects channels without webhook support', async () => {
    paymentMock.getPaymentAdapter.mockReturnValue({
      method: 'manual',
      labelKey: 'paymentMethodManual',
      createPayment: async () => ({ method: 'manual', autoActivate: false, instructionsKey: 'x' }),
      verifyWebhook: async () => null,
    })

    const mod = await import('@/app/api/membership/webhook/route')
    const req = buildMockRequest({
      path: '/api/membership/webhook?method=manual',
      method: 'POST',
      body: {},
    })

    const res = await mod.POST(req, { params: Promise.resolve({}) })

    expect(res.status).toBe(400)
  })

  it('POST /api/membership/webhook activates the order and is idempotent', async () => {
    const paidAt = new Date('2026-02-01T10:00:00Z')
    paymentMock.getPaymentAdapter.mockReturnValue({
      method: 'stub',
      labelKey: 'paymentMethodStub',
      createPayment: async () => ({ method: 'stub', autoActivate: false, instructionsKey: 'x' }),
      verifyWebhook: async () => ({
        orderNo: 'WOO20260201000000ABCD1234',
        paidAmount: 29,
        method: 'manual',
        paidAt,
      }),
    })

    prismaMock.subscription.findUnique.mockResolvedValue(
      buildOrder({ plan: MONTHLY_PLAN }),
    )
    const activated = buildOrder({
      status: 'active',
      paidAt,
      expireAt: new Date('2026-03-03T10:00:00Z'),
      plan: MONTHLY_PLAN,
    })
    prismaMock.subscription.update.mockResolvedValue(activated)

    const mod = await import('@/app/api/membership/webhook/route')

    const first = await mod.POST(
      buildMockRequest({ path: '/api/membership/webhook?method=stub', method: 'POST', body: {} }),
      { params: Promise.resolve({}) },
    )
    const firstJson = await first.json() as { ok: boolean; alreadyProcessed: boolean }

    expect(first.status).toBe(200)
    expect(firstJson).toMatchObject({ ok: true, alreadyProcessed: false })
    // 开通后按到期时间安排降级任务
    expect(scheduleExpiryMock).toHaveBeenCalledWith('sub-1', activated.expireAt)

    // 重复回调：订单已存在 paidAt，直接返回成功且不重复顺延
    prismaMock.subscription.findUnique.mockResolvedValue(activated)
    const second = await mod.POST(
      buildMockRequest({ path: '/api/membership/webhook?method=stub', method: 'POST', body: {} }),
      { params: Promise.resolve({}) },
    )
    const secondJson = await second.json() as { ok: boolean; alreadyProcessed: boolean }

    expect(second.status).toBe(200)
    expect(secondJson).toMatchObject({ ok: true, alreadyProcessed: true })
    expect(prismaMock.subscription.update).toHaveBeenCalledTimes(1)
  })
})
