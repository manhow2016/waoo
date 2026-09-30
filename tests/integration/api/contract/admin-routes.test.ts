import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { encryptApiKey } from '@/lib/crypto-utils'
import type { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ROUTE_CATALOG } from '../../../contracts/route-catalog'
import { buildMockRequest } from '../../../helpers/request'

const cookieMock = vi.hoisted(() => ({ value: undefined as string | undefined }))

const prismaMock = vi.hoisted(() => ({
  admin: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  user: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  subscription: {
    count: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    groupBy: vi.fn(),
    aggregate: vi.fn(),
    update: vi.fn(),
  },
  plan: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
  provider: { findMany: vi.fn() },
  adminLog: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
  systemConfig: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: () => (cookieMock.value ? { name: 'waoowaoo_admin_session', value: cookieMock.value } : undefined),
    set: () => undefined,
  }),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

// 登录限流依赖 Redis，这里固定为「未限流」，让契约测试保持快速且可确定
vi.mock('@/lib/rate-limit', () => ({
  AUTH_LOGIN_LIMIT: { windowSeconds: 60, maxRequests: 5 },
  checkRateLimit: async () => ({ limited: false, remaining: 5, retryAfterSeconds: 0 }),
  getClientIp: () => '127.0.0.1',
}))

const ADMIN_SECRET = 'admin-routes-contract-secret'
process.env.ADMIN_SESSION_SECRET = ADMIN_SECRET
// 支付渠道密钥加解密依赖该环境变量
process.env.API_ENCRYPTION_KEY =
  process.env.API_ENCRYPTION_KEY || 'test-encryption-key-for-admin-routes'

const ADMIN_ROW = {
  id: 'admin-1',
  username: 'admin',
  passwordHash: 'hash',
  role: 'super',
  isActive: true,
  lastLoginAt: null,
  sessionVersion: 0,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
}

type RouteHandler = (
  request: NextRequest,
  ctx: { params: Promise<Record<string, string>> },
) => Promise<Response>

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

/** 后台受保护路由（登录/登出在公开白名单中，单独测试） */
const PROTECTED_ROUTES: Array<{ key: string; routeFile: string; methods: HttpMethod[] }> = [
  { key: 'me', routeFile: 'src/app/api/admin/auth/me/route.ts', methods: ['GET'] },
  { key: 'auth/password', routeFile: 'src/app/api/admin/auth/password/route.ts', methods: ['POST'] },
  { key: 'payments', routeFile: 'src/app/api/admin/payments/route.ts', methods: ['GET', 'PUT'] },
  { key: 'payments/methods', routeFile: 'src/app/api/admin/payments/methods/route.ts', methods: ['PUT'] },
  { key: 'admins', routeFile: 'src/app/api/admin/admins/route.ts', methods: ['GET', 'POST'] },
  { key: 'admins/[id]', routeFile: 'src/app/api/admin/admins/[id]/route.ts', methods: ['PUT'] },
  { key: 'admins/[id]/password', routeFile: 'src/app/api/admin/admins/[id]/password/route.ts', methods: ['POST'] },
  { key: 'users', routeFile: 'src/app/api/admin/users/route.ts', methods: ['GET'] },
  { key: 'users/[id]', routeFile: 'src/app/api/admin/users/[id]/route.ts', methods: ['GET'] },
  { key: 'users/[id]/ban', routeFile: 'src/app/api/admin/users/[id]/ban/route.ts', methods: ['POST'] },
  { key: 'users/[id]/membership', routeFile: 'src/app/api/admin/users/[id]/membership/route.ts', methods: ['POST'] },
  { key: 'orders', routeFile: 'src/app/api/admin/orders/route.ts', methods: ['GET'] },
  { key: 'orders/[id]/refund', routeFile: 'src/app/api/admin/orders/[id]/refund/route.ts', methods: ['POST'] },
  { key: 'orders/[id]/repair', routeFile: 'src/app/api/admin/orders/[id]/repair/route.ts', methods: ['POST'] },
  { key: 'plans', routeFile: 'src/app/api/admin/plans/route.ts', methods: ['GET', 'POST'] },
  { key: 'plans/[id]', routeFile: 'src/app/api/admin/plans/[id]/route.ts', methods: ['PUT', 'DELETE'] },
  { key: 'providers', routeFile: 'src/app/api/admin/providers/route.ts', methods: ['GET', 'POST'] },
  { key: 'providers/[id]', routeFile: 'src/app/api/admin/providers/[id]/route.ts', methods: ['PUT'] },
  { key: 'configs', routeFile: 'src/app/api/admin/configs/route.ts', methods: ['GET', 'PUT'] },
  { key: 'stats', routeFile: 'src/app/api/admin/stats/route.ts', methods: ['GET'] },
  { key: 'logs', routeFile: 'src/app/api/admin/logs/route.ts', methods: ['GET'] },
]

const MODULE_LOADERS: Record<string, () => Promise<Record<string, unknown>>> = {
  me: () => import('@/app/api/admin/auth/me/route'),
  'auth/password': () => import('@/app/api/admin/auth/password/route'),
  payments: () => import('@/app/api/admin/payments/route'),
  'payments/methods': () => import('@/app/api/admin/payments/methods/route'),
  admins: () => import('@/app/api/admin/admins/route'),
  'admins/[id]': () => import('@/app/api/admin/admins/[id]/route'),
  'admins/[id]/password': () => import('@/app/api/admin/admins/[id]/password/route'),
  users: () => import('@/app/api/admin/users/route'),
  'users/[id]': () => import('@/app/api/admin/users/[id]/route'),
  'users/[id]/ban': () => import('@/app/api/admin/users/[id]/ban/route'),
  'users/[id]/membership': () => import('@/app/api/admin/users/[id]/membership/route'),
  orders: () => import('@/app/api/admin/orders/route'),
  'orders/[id]/refund': () => import('@/app/api/admin/orders/[id]/refund/route'),
  'orders/[id]/repair': () => import('@/app/api/admin/orders/[id]/repair/route'),
  plans: () => import('@/app/api/admin/plans/route'),
  'plans/[id]': () => import('@/app/api/admin/plans/[id]/route'),
  providers: () => import('@/app/api/admin/providers/route'),
  'providers/[id]': () => import('@/app/api/admin/providers/[id]/route'),
  configs: () => import('@/app/api/admin/configs/route'),
  stats: () => import('@/app/api/admin/stats/route'),
  logs: () => import('@/app/api/admin/logs/route'),
}

async function callProtected(
  routeKey: string,
  method: HttpMethod,
  body?: unknown,
): Promise<Response> {
  const mod = await MODULE_LOADERS[routeKey]()
  const handler = mod[method] as unknown as RouteHandler | undefined
  if (!handler) throw new Error(`${routeKey} does not export ${method}`)

  const request = buildMockRequest({
    path: `/api/admin/${routeKey}`,
    method,
    // GET/HEAD 请求不允许携带 body
    ...(body !== undefined && method !== 'GET' ? { body } : {}),
  })

  return await handler(request, { params: Promise.resolve({ id: 'target-1', orderNo: 'WOO-1' }) })
}

/** 复用实现层的签名算法生成会话 Cookie，避免测试与实现漂移 */
function signAs(role: 'support' | 'operation' | 'super'): string {
  const payload = {
    adminId: 'admin-1',
    username: 'admin',
    role,
    sv: 0,
    exp: Math.floor(Date.now() / 1000) + 3600,
  }
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const signature = crypto
    .createHmac('sha256', ADMIN_SECRET)
    .update(encoded, 'utf8')
    .digest('base64url')
  return `${encoded}.${signature}`
}

function signInAs(role: 'support' | 'operation' | 'super'): void {
  cookieMock.value = signAs(role)
  prismaMock.admin.findUnique.mockResolvedValue({ ...ADMIN_ROW, role })
}

describe('api contract - admin routes (behavior)', () => {
  const routes = ROUTE_CATALOG.filter((entry) => entry.contractGroup === 'admin-routes')

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    cookieMock.value = undefined
    prismaMock.admin.findUnique.mockResolvedValue(ADMIN_ROW)
    prismaMock.admin.findMany.mockResolvedValue([])
    prismaMock.admin.count.mockResolvedValue(2)
    prismaMock.user.count.mockResolvedValue(0)
    prismaMock.user.findMany.mockResolvedValue([])
    prismaMock.subscription.count.mockResolvedValue(0)
    prismaMock.subscription.findMany.mockResolvedValue([])
    prismaMock.subscription.groupBy.mockResolvedValue([])
    prismaMock.subscription.aggregate.mockResolvedValue({ _sum: { amount: 0 } })
    prismaMock.plan.findMany.mockResolvedValue([])
    prismaMock.plan.count.mockResolvedValue(0)
    prismaMock.provider.findMany.mockResolvedValue([])
    prismaMock.adminLog.findMany.mockResolvedValue([])
    prismaMock.adminLog.count.mockResolvedValue(0)
    prismaMock.systemConfig.findMany.mockResolvedValue([])
  })

  it('后台路由已登记在契约分组中（含登录/登出）', () => {
    expect(routes.map((entry) => entry.routeFile).sort()).toEqual(
      [
        ...PROTECTED_ROUTES.map((route) => route.routeFile),
        'src/app/api/admin/auth/login/route.ts',
        'src/app/api/admin/auth/logout/route.ts',
      ].sort(),
    )
  })

  it('每个受保护的后台路由在未登录时都返回 401', async () => {
    for (const route of PROTECTED_ROUTES) {
      for (const method of route.methods) {
        const response = await callProtected(route.key, method, {})
        expect(response.status, `${route.routeFile}#${method} must reject unauthenticated requests`).toBe(401)
      }
    }
  })

  it('POST /api/admin/auth/login 在缺少字段时返回 400', async () => {
    const mod = await import('@/app/api/admin/auth/login/route')
    const response = await mod.POST(
      buildMockRequest({ path: '/api/admin/auth/login', method: 'POST', body: {} }),
      { params: Promise.resolve({}) },
    )

    expect(response.status).toBe(400)
  })

  it('POST /api/admin/auth/login 在账密错误时返回 401', async () => {
    prismaMock.admin.findUnique.mockResolvedValue(null)
    const mod = await import('@/app/api/admin/auth/login/route')
    const response = await mod.POST(
      buildMockRequest({
        path: '/api/admin/auth/login',
        method: 'POST',
        body: { username: 'admin', password: 'wrong' },
      }),
      { params: Promise.resolve({}) },
    )

    expect(response.status).toBe(401)
  })

  it('POST /api/admin/auth/logout 幂等返回成功', async () => {
    const mod = await import('@/app/api/admin/auth/logout/route')
    const response = await mod.POST(
      buildMockRequest({ path: '/api/admin/auth/logout', method: 'POST' }),
      { params: Promise.resolve({}) },
    )

    expect(response.status).toBe(200)
  })

  it('GET /api/admin/auth/me 返回当前管理员与角色', async () => {
    signInAs('super')

    const response = await callProtected('me', 'GET')
    const json = (await response.json()) as { admin: { username: string; role: string } }

    expect(response.status).toBe(200)
    expect(json.admin).toMatchObject({ username: 'admin', role: 'super' })
    // 会话校验必须回库读取管理员（停用后立即失效依赖这一点）
    expect(prismaMock.admin.findUnique).toHaveBeenCalledWith({ where: { id: 'admin-1' } })
  })

  it('GET /api/admin/users 支持分页', async () => {
    signInAs('support')

    const response = await callProtected('users', 'GET')
    const json = (await response.json()) as { items: unknown[]; page: number; pageSize: number }

    expect(response.status).toBe(200)
    expect(json).toMatchObject({ page: 1, pageSize: 20 })
  })

  it('客服可用用户/订单/套餐目录，但系统配置与日志返回 403', async () => {
    signInAs('support')

    const users = await callProtected('users', 'GET')
    const orders = await callProtected('orders', 'GET')
    const plans = await callProtected('plans', 'GET')
    const configs = await callProtected('configs', 'GET')
    const logs = await callProtected('logs', 'GET')

    expect(users.status).toBe(200)
    expect(orders.status).toBe(200)
    expect(plans.status).toBe(200)
    expect(configs.status).toBe(403)
    expect(logs.status).toBe(403)
  })

  it('运营可访问仪表盘统计，但系统配置返回 403', async () => {
    signInAs('operation')

    const stats = await callProtected('stats', 'GET')
    const configs = await callProtected('configs', 'GET')

    expect(stats.status).toBe(200)
    expect(configs.status).toBe(403)
  })

  it('超级管理员可访问系统配置与日志', async () => {
    signInAs('super')

    const configs = await callProtected('configs', 'GET')
    const logs = await callProtected('logs', 'GET')

    expect(configs.status).toBe(200)
    expect(logs.status).toBe(200)
  })

  it('支付渠道配置仅超级管理员可用（运营/客服 403）', async () => {
    signInAs('operation')
    prismaMock.admin.findUnique.mockResolvedValue({ ...ADMIN_ROW, role: 'operation' })

    const read = await callProtected('payments', 'GET')
    const save = await callProtected('payments', 'PUT', {
      method: 'hmac-webhook',
      values: { secret: 'abc' },
      reason: 'x',
    })

    expect(read.status).toBe(403)
    expect(save.status).toBe(403)
  })

  it('超级管理员读取支付渠道状态：只返回掩码，不发明文密钥', async () => {
    signInAs('super')
    // payment.channel.hmac-webhook 已配置密钥（密文）
    prismaMock.systemConfig.findUnique.mockResolvedValue({
      key: 'payment.channel.hmac-webhook',
      value: { secret: encryptApiKey('super-secret-value') },
      updatedAt: new Date(),
    })

    const response = await callProtected('payments', 'GET')
    const text = await response.text()

    expect(response.status).toBe(200)
    expect(text).not.toContain('super-secret-value')
    expect(text).toContain('****alue')
  })

  it('保存支付渠道参数缺少 reason 时返回 400', async () => {
    signInAs('super')
    prismaMock.systemConfig.findUnique.mockResolvedValue(null)

    const response = await callProtected('payments', 'PUT', {
      method: 'hmac-webhook',
      values: { secret: 'abc' },
      reason: '  ',
    })

    expect(response.status).toBe(400)
    expect(prismaMock.systemConfig.upsert).not.toHaveBeenCalled()
  })

  it('管理员账号管理仅超级管理员可用（运营/客服 403）', async () => {
    signInAs('operation')
    prismaMock.admin.findUnique.mockResolvedValue({ ...ADMIN_ROW, role: 'operation' })

    const list = await callProtected('admins', 'GET')
    const create = await callProtected('admins', 'POST', {
      username: 'newadmin',
      password: 'AdminPassw0rd',
      role: 'support',
      reason: 'x',
    })

    expect(list.status).toBe(403)
    expect(create.status).toBe(403)
    expect(prismaMock.admin.create).not.toHaveBeenCalled()
  })

  it('超级管理员可查看管理员列表，且响应不含密码字段', async () => {
    signInAs('super')
    prismaMock.admin.findMany.mockResolvedValue([ADMIN_ROW])

    const response = await callProtected('admins', 'GET')
    const json = (await response.json()) as { admins: Array<Record<string, unknown>> }

    expect(response.status).toBe(200)
    expect(json.admins).toHaveLength(1)
    expect(json.admins[0]).toMatchObject({ username: 'admin', role: 'super' })
    expect(JSON.stringify(json)).not.toContain('passwordHash')
  })

  it('新增管理员缺少 reason 时返回 400', async () => {
    signInAs('super')

    const response = await callProtected('admins', 'POST', {
      username: 'newadmin',
      password: 'AdminPassw0rd',
      role: 'support',
      reason: '   ',
    })

    expect(response.status).toBe(400)
    expect(prismaMock.admin.create).not.toHaveBeenCalled()
  })

  it('自助改密缺少字段时返回 400', async () => {
    signInAs('support')

    const response = await callProtected('auth/password', 'POST', {})

    expect(response.status).toBe(400)
  })

  it('自助改密当前密码错误时返回 400，且不改库', async () => {
    signInAs('support')
    prismaMock.admin.findUnique.mockResolvedValue({
      ...ADMIN_ROW,
      role: 'support',
      passwordHash: await bcrypt.hash('CorrectPassw0rd', 4),
    })

    const response = await callProtected('auth/password', 'POST', {
      currentPassword: 'WrongPassw0rd',
      newPassword: 'BrandNewPassw0rd',
    })

    expect(response.status).toBe(400)
    expect(prismaMock.admin.update).not.toHaveBeenCalled()
  })

  it('封禁接口缺少 reason 时返回 400，且不修改用户', async () => {
    signInAs('operation')
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'target-1',
      isBanned: false,
      bannedReason: null,
      bannedAt: null,
    })

    const response = await callProtected('users/[id]/ban', 'POST', { banned: true, reason: '   ' })

    expect(response.status).toBe(400)
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })
})
