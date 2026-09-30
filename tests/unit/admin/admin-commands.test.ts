import bcrypt from 'bcryptjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  subscription: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  },
  provider: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  plan: {
    findUnique: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  adminLog: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  admin: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  systemConfig: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  $transaction: vi.fn(),
}))

const activateMock = vi.hoisted(() => vi.fn())
const createOrderMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/admin-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/admin-auth')>()
  return {
    ADMIN_ROLE: actual.ADMIN_ROLE,
    // 复用真实实现，避免测试里再复制一份角色与密码策略
    isAdminRole: actual.isAdminRole,
    validateAdminPassword: actual.validateAdminPassword,
    // 测试用低成本哈希，避免每个用例几十毫秒的 bcrypt 开销
    hashAdminPassword: async (password: string) => bcrypt.hash(password, 4),
  }
})
vi.mock('@/lib/subscription-order', () => ({
  activateSubscriptionOrder: activateMock,
  createSubscriptionOrder: createOrderMock,
  addDays: (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000),
}))

// 支付渠道密钥加密依赖该环境变量
process.env.API_ENCRYPTION_KEY =
  process.env.API_ENCRYPTION_KEY || 'test-encryption-key-for-admin-commands'

import {
  adjustUserMembership,
  changeOwnPassword,
  createAdminAccount,
  savePaymentChannel,
  setEnabledPaymentMethods,
  refundOrder,
  repairOrder,
  resetAdminPassword,
  setUserBanned,
  updateAdminAccount,
  upsertProvider,
  updateSystemConfigs,
} from '@/lib/admin/commands'

const ADMIN_CTX = { adminId: 'admin-1', reason: '单元测试', ip: '127.0.0.1' }

function buildSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    userId: 'user-1',
    planId: 'plan-1',
    startAt: new Date('2026-02-01T00:00:00Z'),
    expireAt: new Date('2026-03-03T00:00:00Z'),
    status: 'active',
    orderNo: 'WOO-1',
    paidAt: new Date('2026-02-01T00:00:00Z'),
    amount: 29,
    payMethod: 'manual',
    createdAt: new Date('2026-02-01T00:00:00Z'),
    updatedAt: new Date('2026-02-01T00:00:00Z'),
    plan: { id: 'plan-1', code: 'monthly', name: '月付会员', level: 1, price: 29, durationDay: 30 },
    ...overrides,
  }
}

describe('admin commands / 审计原因必填', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof prismaMock) => Promise<unknown>) => await callback(prismaMock),
    )
  })

  it('退款缺少原因时直接拒绝，不触达数据库', async () => {
    await expect(
      refundOrder({ adminId: 'admin-1', subscriptionId: 'sub-1', reason: '   ' }),
    ).rejects.toThrow(/INVALID_PARAMS/)

    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })
})

describe('admin commands / refundOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof prismaMock) => Promise<unknown>) => await callback(prismaMock),
    )
    prismaMock.adminLog.create.mockResolvedValue({})
  })

  it('未支付订单不允许退款', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(buildSubscription({ paidAt: null }))

    await expect(
      refundOrder({ ...ADMIN_CTX, subscriptionId: 'sub-1' }),
    ).rejects.toThrow(/INVALID_PARAMS/)
  })

  it('退款会取消订阅并写入审计日志', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(buildSubscription())
    prismaMock.subscription.update.mockResolvedValue(
      buildSubscription({ status: 'cancelled' }),
    )

    const result = await refundOrder({ ...ADMIN_CTX, subscriptionId: 'sub-1' })

    expect(result).toMatchObject({ orderNo: 'WOO-1', status: 'cancelled', alreadyRefunded: false })
    expect(prismaMock.adminLog.create).toHaveBeenCalledTimes(1)
    const logArg = prismaMock.adminLog.create.mock.calls[0][0] as {
      data: { action: string; targetId: string; before: unknown; after: unknown }
    }
    expect(logArg.data.action).toBe('refund_order')
    expect(logArg.data.targetId).toBe('WOO-1')
    expect(logArg.data.before).toBeTruthy()
    expect(logArg.data.after).toBeTruthy()
  })

  it('重复退款是幂等的，不重复写日志', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(
      buildSubscription({ status: 'cancelled' }),
    )

    const result = await refundOrder({ ...ADMIN_CTX, subscriptionId: 'sub-1' })

    expect(result.alreadyRefunded).toBe(true)
    expect(prismaMock.subscription.update).not.toHaveBeenCalled()
    expect(prismaMock.adminLog.create).not.toHaveBeenCalled()
  })
})

describe('admin commands / repairOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.adminLog.create.mockResolvedValue({})
  })

  it('已开通订单不会重复开通，也不写日志', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(buildSubscription())

    const result = await repairOrder({ ...ADMIN_CTX, orderNo: 'WOO-1' })

    expect(result).toMatchObject({ alreadyProcessed: true, status: 'active' })
    expect(activateMock).not.toHaveBeenCalled()
    expect(prismaMock.adminLog.create).not.toHaveBeenCalled()
  })

  it('待支付订单会被补开通并写审计日志', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(
      buildSubscription({ status: 'pending', paidAt: null, payMethod: null }),
    )
    activateMock.mockResolvedValue({
      alreadyProcessed: false,
      plan: buildSubscription().plan,
      subscription: buildSubscription({ status: 'active', paidAt: new Date() }),
    })

    const result = await repairOrder({ ...ADMIN_CTX, orderNo: 'WOO-1' })

    expect(result).toMatchObject({ alreadyProcessed: false, status: 'active' })
    expect(activateMock).toHaveBeenCalledWith({ orderNo: 'WOO-1', payMethod: 'manual' })
    expect(prismaMock.adminLog.create).toHaveBeenCalledTimes(1)
    // 补单使用独立的审计动作，便于与普通开通区分
    const logArg = prismaMock.adminLog.create.mock.calls[0][0] as { data: { action: string } }
    expect(logArg.data.action).toBe('repair_order')
  })

  it('已退款订单不允许补单', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(
      buildSubscription({ status: 'cancelled' }),
    )

    await expect(repairOrder({ ...ADMIN_CTX, orderNo: 'WOO-1' })).rejects.toThrow(/CONFLICT/)
  })
})

describe('admin commands / 封禁用户', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.adminLog.create.mockResolvedValue({})
  })

  it('状态未变化时不写库也不写日志', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      isBanned: true,
      bannedReason: 'spam',
      bannedAt: new Date('2026-02-01T00:00:00Z'),
    })

    const result = await setUserBanned({ ...ADMIN_CTX, userId: 'user-1', banned: true })

    expect(result.isBanned).toBe(true)
    expect(prismaMock.user.update).not.toHaveBeenCalled()
    expect(prismaMock.adminLog.create).not.toHaveBeenCalled()
  })

  it('封禁会记录原因与时间并写审计日志', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      isBanned: false,
      bannedReason: null,
      bannedAt: null,
    })
    prismaMock.user.update.mockResolvedValue({
      id: 'user-1',
      isBanned: true,
      bannedReason: 'unit',
      bannedAt: new Date('2026-02-02T00:00:00Z'),
    })

    await setUserBanned({ ...ADMIN_CTX, userId: 'user-1', banned: true })

    const updateArg = prismaMock.user.update.mock.calls[0][0] as {
      data: { isBanned: boolean; bannedReason: string }
    }
    expect(updateArg.data.isBanned).toBe(true)
    expect(updateArg.data.bannedReason).toBe('单元测试')
    expect(prismaMock.adminLog.create).toHaveBeenCalledTimes(1)
  })
})

describe('admin commands / 供应商默认唯一', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.adminLog.create.mockResolvedValue({})
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof prismaMock) => Promise<unknown>) => await callback(prismaMock),
    )
  })

  it('设为默认时在同一事务内取消其他默认标记', async () => {
    prismaMock.provider.findUnique.mockResolvedValue(null)
    prismaMock.provider.create.mockResolvedValue({
      id: 'provider-2',
      code: 'bailian',
      name: '阿里百炼',
      isDefault: true,
      isActive: true,
      sortOrder: 1,
      config: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    })

    await upsertProvider({
      ...ADMIN_CTX,
      provider: { code: 'bailian', name: '阿里百炼', isDefault: true },
    })

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    const unsetArg = prismaMock.provider.updateMany.mock.calls[0][0] as {
      where: { isDefault: boolean }
      data: { isDefault: boolean }
    }
    expect(unsetArg.where.isDefault).toBe(true)
    expect(unsetArg.data.isDefault).toBe(false)
  })

  it('未标记默认时不触碰其他供应商', async () => {
    prismaMock.provider.findUnique.mockResolvedValue(null)
    prismaMock.provider.create.mockResolvedValue({
      id: 'provider-3',
      code: 'siliconflow',
      name: 'SiliconFlow',
      isDefault: false,
      isActive: true,
      sortOrder: 2,
      config: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    })

    await upsertProvider({
      ...ADMIN_CTX,
      provider: { code: 'siliconflow', name: 'SiliconFlow' },
    })

    expect(prismaMock.provider.updateMany).not.toHaveBeenCalled()
  })
})

describe('admin commands / 调整会员', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.adminLog.create.mockResolvedValue({})
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof prismaMock) => Promise<unknown>) => await callback(prismaMock),
    )
  })

  it('mode=extend 会按套餐新建订单并开通', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'u@example.com' })
    createOrderMock.mockResolvedValue({
      subscription: buildSubscription({ status: 'pending', paidAt: null }),
      plan: buildSubscription().plan,
      reused: false,
    })
    activateMock.mockResolvedValue({
      alreadyProcessed: false,
      plan: buildSubscription().plan,
      subscription: buildSubscription(),
    })

    const result = await adjustUserMembership({
      ...ADMIN_CTX,
      userId: 'user-1',
      mode: 'extend',
      planCode: 'monthly',
    })

    expect(result.mode).toBe('extend')
    expect(activateMock).toHaveBeenCalledTimes(1)
    expect(prismaMock.adminLog.create).toHaveBeenCalledTimes(1)
  })

  it('mode=set 在没有有效订阅时给出可操作的错误', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'u@example.com' })
    prismaMock.subscription.findFirst.mockResolvedValue(null)

    await expect(
      adjustUserMembership({
        ...ADMIN_CTX,
        userId: 'user-1',
        mode: 'set',
        expireAt: '2026-12-31T00:00:00.000Z',
      }),
    ).rejects.toThrow(/INVALID_PARAMS/)
  })

  it('mode=set 会改写到期时间并写审计日志', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'u@example.com' })
    prismaMock.subscription.findFirst.mockResolvedValue(buildSubscription())
    prismaMock.subscription.update.mockResolvedValue(
      buildSubscription({ expireAt: new Date('2026-12-31T00:00:00Z') }),
    )

    const result = await adjustUserMembership({
      ...ADMIN_CTX,
      userId: 'user-1',
      mode: 'set',
      expireAt: '2026-12-31T00:00:00.000Z',
    })

    expect(result.expireAt).toBe('2026-12-31T00:00:00.000Z')
    expect(prismaMock.adminLog.create).toHaveBeenCalledTimes(1)
  })
})

describe('admin commands / 系统配置', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.adminLog.create.mockResolvedValue({})
    prismaMock.systemConfig.findMany.mockResolvedValue([])
    prismaMock.systemConfig.upsert.mockResolvedValue({})
  })

  it('非法配置键会被拒绝', async () => {
    await expect(
      updateSystemConfigs({ ...ADMIN_CTX, entries: [{ key: 'Bad Key!', value: 1 }] }),
    ).rejects.toThrow(/INVALID_PARAMS/)
  })

  it('合法配置键会写入并记录前后值', async () => {
    const result = await updateSystemConfigs({
      ...ADMIN_CTX,
      entries: [{ key: 'payment.methods', value: ['manual'] }],
    })

    expect(result.updatedKeys).toEqual(['payment.methods'])
    expect(prismaMock.systemConfig.upsert).toHaveBeenCalledTimes(1)
    expect(prismaMock.adminLog.create).toHaveBeenCalledTimes(1)
  })
})

describe('admin commands / 管理员账号', () => {
  const ADMIN_ROW = {
    id: 'admin-2',
    username: 'operator',
    passwordHash: 'hash',
    role: 'operation',
    isActive: true,
    lastLoginAt: null,
    sessionVersion: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.adminLog.create.mockResolvedValue({})
    prismaMock.admin.findUnique.mockResolvedValue(ADMIN_ROW)
    prismaMock.admin.count.mockResolvedValue(1)
  })

  it('新增管理员必须填写原因', async () => {
    await expect(
      createAdminAccount({
        adminId: 'admin-1',
        username: 'newbie',
        password: 'AdminPassw0rd',
        role: 'support',
        reason: '  ',
      }),
    ).rejects.toThrow(/INVALID_PARAMS/)
    expect(prismaMock.admin.create).not.toHaveBeenCalled()
  })

  it('新增管理员校验用户名格式与密码强度', async () => {
    prismaMock.admin.findUnique.mockResolvedValue(null)

    await expect(
      createAdminAccount({
        adminId: 'admin-1',
        username: 'a',
        password: 'AdminPassw0rd',
        role: 'support',
        reason: 'x',
      }),
    ).rejects.toThrow(/INVALID_PARAMS/)

    await expect(
      createAdminAccount({
        adminId: 'admin-1',
        username: 'newbie',
        password: '123456789012',
        role: 'support',
        reason: 'x',
      }),
    ).rejects.toThrow(/INVALID_PARAMS/)
  })

  it('用户名重复时拒绝', async () => {
    prismaMock.admin.findUnique.mockResolvedValue(ADMIN_ROW)

    await expect(
      createAdminAccount({
        adminId: 'admin-1',
        username: 'operator',
        password: 'AdminPassw0rd',
        role: 'support',
        reason: 'x',
      }),
    ).rejects.toThrow(/CONFLICT/)
  })

  it('新增成功会写入审计日志且不回传密码哈希', async () => {
    prismaMock.admin.findUnique.mockResolvedValue(null)
    prismaMock.admin.create.mockResolvedValue({ ...ADMIN_ROW, username: 'newbie', role: 'support' })

    const result = await createAdminAccount({
      adminId: 'admin-1',
      username: 'newbie',
      password: 'AdminPassw0rd',
      role: 'support',
      reason: '新同事入职',
    })

    expect(JSON.stringify(result)).not.toContain('passwordHash')
    expect(prismaMock.adminLog.create).toHaveBeenCalledTimes(1)
    const logArg = prismaMock.adminLog.create.mock.calls[0][0] as { data: { action: string } }
    expect(logArg.data.action).toBe('create_admin')
  })

  it('不能停用自己', async () => {
    prismaMock.admin.findUnique.mockResolvedValue({ ...ADMIN_ROW, id: 'admin-1', role: 'super' })

    await expect(
      updateAdminAccount({
        adminId: 'admin-1',
        targetAdminId: 'admin-1',
        isActive: false,
        reason: 'x',
      }),
    ).rejects.toThrow(/INVALID_PARAMS/)
  })

  it('不能停用或降级最后一个启用中的超级管理员', async () => {
    prismaMock.admin.findUnique.mockResolvedValue({ ...ADMIN_ROW, role: 'super' })
    // 没有其他超级管理员
    prismaMock.admin.count.mockResolvedValue(0)

    await expect(
      updateAdminAccount({
        adminId: 'admin-1',
        targetAdminId: 'admin-2',
        isActive: false,
        reason: 'x',
      }),
    ).rejects.toThrow(/CONFLICT/)

    await expect(
      updateAdminAccount({
        adminId: 'admin-1',
        targetAdminId: 'admin-2',
        role: 'support',
        reason: 'x',
      }),
    ).rejects.toThrow(/CONFLICT/)
  })

  it('存在其他超级管理员时可以降级', async () => {
    prismaMock.admin.findUnique.mockResolvedValue({ ...ADMIN_ROW, role: 'super' })
    prismaMock.admin.count.mockResolvedValue(1)
    prismaMock.admin.update.mockResolvedValue({ ...ADMIN_ROW, role: 'support' })

    const result = await updateAdminAccount({
      adminId: 'admin-1',
      targetAdminId: 'admin-2',
      role: 'support',
      reason: '转岗',
    })

    expect(result.role).toBe('support')
    expect(prismaMock.adminLog.create).toHaveBeenCalledTimes(1)
  })

  it('停用账号会自增会话版本，使其会话立即失效', async () => {
    prismaMock.admin.update.mockResolvedValue({ ...ADMIN_ROW, isActive: false, sessionVersion: 1 })

    await updateAdminAccount({
      adminId: 'admin-1',
      targetAdminId: 'admin-2',
      isActive: false,
      reason: '离职',
    })

    const updateArg = prismaMock.admin.update.mock.calls[0][0] as {
      data: { sessionVersion?: { increment: number } }
    }
    expect(updateArg.data.sessionVersion).toEqual({ increment: 1 })
  })

  it('无变化时不写库也不写日志', async () => {
    await updateAdminAccount({
      adminId: 'admin-1',
      targetAdminId: 'admin-2',
      role: 'operation',
      isActive: true,
      reason: 'x',
    })

    expect(prismaMock.admin.update).not.toHaveBeenCalled()
    expect(prismaMock.adminLog.create).not.toHaveBeenCalled()
  })

  it('重置密码会自增会话版本并写审计', async () => {
    prismaMock.admin.update.mockResolvedValue({ ...ADMIN_ROW, sessionVersion: 1 })

    const result = await resetAdminPassword({
      adminId: 'admin-1',
      targetAdminId: 'admin-2',
      newPassword: 'BrandNewPassw0rd',
      reason: '疑似泄露',
    })

    expect(result.username).toBe('operator')
    const updateArg = prismaMock.admin.update.mock.calls[0][0] as {
      data: { passwordHash: string; sessionVersion: { increment: number } }
    }
    expect(updateArg.data.passwordHash).not.toBe('hash')
    expect(updateArg.data.sessionVersion).toEqual({ increment: 1 })
    expect(prismaMock.adminLog.create).toHaveBeenCalledTimes(1)
  })

  it('自助改密：当前密码错误时拒绝', async () => {
    prismaMock.admin.findUnique.mockResolvedValue({
      ...ADMIN_ROW,
      passwordHash: await bcrypt.hash('CurrentPassw0rd', 4),
    })

    await expect(
      changeOwnPassword({
        adminId: 'admin-2',
        currentPassword: 'WrongPassw0rd',
        newPassword: 'BrandNewPassw0rd',
      }),
    ).rejects.toThrow(/INVALID_PARAMS/)
    expect(prismaMock.admin.update).not.toHaveBeenCalled()
  })

  it('自助改密：新密码不能与当前密码相同', async () => {
    prismaMock.admin.findUnique.mockResolvedValue({
      ...ADMIN_ROW,
      passwordHash: await bcrypt.hash('CurrentPassw0rd', 4),
    })

    await expect(
      changeOwnPassword({
        adminId: 'admin-2',
        currentPassword: 'CurrentPassw0rd',
        newPassword: 'CurrentPassw0rd',
      }),
    ).rejects.toThrow(/INVALID_PARAMS/)
  })

  it('自助改密成功：换哈希、加会话版本、写审计（无 reason）', async () => {
    prismaMock.admin.findUnique.mockResolvedValue({
      ...ADMIN_ROW,
      passwordHash: await bcrypt.hash('CurrentPassw0rd', 4),
    })
    prismaMock.admin.update.mockResolvedValue({ ...ADMIN_ROW, sessionVersion: 1 })

    await changeOwnPassword({
      adminId: 'admin-2',
      currentPassword: 'CurrentPassw0rd',
      newPassword: 'BrandNewPassw0rd',
    })

    const updateArg = prismaMock.admin.update.mock.calls[0][0] as {
      data: { sessionVersion: { increment: number } }
    }
    expect(updateArg.data.sessionVersion).toEqual({ increment: 1 })

    const logArg = prismaMock.adminLog.create.mock.calls[0][0] as {
      data: { action: string; reason: string | null; targetType: string }
    }
    expect(logArg.data.action).toBe('change_password')
    expect(logArg.data.targetType).toBe('admin')
    expect(logArg.data.reason).toBeNull()
  })
})

describe('admin commands / 支付渠道配置', () => {
  const HMAC_KEY = 'payment.channel.hmac-webhook'
  const METHODS_KEY = 'payment.methods'

  // 用内存态 mock 模拟真实读写，避免「写进去但读出来还是旧值」的假象
  const store = new Map<string, unknown>()

  beforeEach(() => {
    vi.clearAllMocks()
    store.clear()
    prismaMock.adminLog.create.mockResolvedValue({})
    prismaMock.systemConfig.findMany.mockResolvedValue([])
    prismaMock.systemConfig.findUnique.mockImplementation(
      async ({ where }: { where: { key: string } }) =>
        store.has(where.key)
          ? { key: where.key, value: store.get(where.key), updatedAt: new Date() }
          : null,
    )
    prismaMock.systemConfig.upsert.mockImplementation(
      async ({ where, create }: { where: { key: string }; create: { value: unknown } }) => {
        store.set(where.key, create.value)
        return { key: where.key, value: create.value, updatedAt: new Date() }
      },
    )
  })

  async function seedSecret(cipher: string) {
    store.set(HMAC_KEY, { secret: cipher })
  }

  it('保存参数必须填写原因', async () => {
    await expect(
      savePaymentChannel({
        adminId: 'admin-1',
        method: 'hmac-webhook',
        values: { secret: 'abc' },
        reason: '  ',
      }),
    ).rejects.toThrow(/INVALID_PARAMS/)
    expect(prismaMock.systemConfig.upsert).not.toHaveBeenCalled()
  })

  it('未知渠道直接拒绝', async () => {
    await expect(
      savePaymentChannel({
        adminId: 'admin-1',
        method: 'ghost',
        values: {},
        reason: 'x',
      }),
    ).rejects.toThrow(/INVALID_PARAMS/)
  })

  it('敏感字段加密落库，审计日志不含明文密钥', async () => {
    await savePaymentChannel({
      adminId: 'admin-1',
      method: 'hmac-webhook',
      values: { secret: 'super-secret-value' },
      reason: '接入签名回调',
    })

    const stored = store.get(HMAC_KEY) as Record<string, string>
    expect(stored.secret).toBeTruthy()
    expect(stored.secret).not.toContain('super-secret-value')

    const logArg = prismaMock.adminLog.create.mock.calls[0][0] as { data: { after: unknown } }
    expect(JSON.stringify(logArg.data.after)).not.toContain('super-secret-value')
  })

  it('敏感字段留空表示保持原值不变', async () => {
    const { encryptApiKey } = await import('@/lib/crypto-utils')
    const original = encryptApiKey('original-secret')
    await seedSecret(original)

    await savePaymentChannel({
      adminId: 'admin-1',
      method: 'hmac-webhook',
      values: { secret: '   ' },
      reason: 'x',
    })

    const stored = store.get(HMAC_KEY) as Record<string, string>
    expect(stored.secret).toBe(original)
  })

  it('把掩码提交回来也只当作未修改', async () => {
    const { encryptApiKey, decryptApiKey } = await import('@/lib/crypto-utils')
    await seedSecret(encryptApiKey('original-secret'))

    const result = await savePaymentChannel({
      adminId: 'admin-1',
      method: 'hmac-webhook',
      values: { secret: '****cret' },
      reason: 'x',
    })

    // 返回的是原密钥的掩码，说明提交回来的掩码没有被当成新密钥
    expect(result.values.secret).toBe('****cret')
    const stored = store.get(HMAC_KEY) as Record<string, string>
    expect(decryptApiKey(stored.secret)).toBe('original-secret')
  })

  it('clearFields 可以显式清除已配置的密钥', async () => {
    const { encryptApiKey } = await import('@/lib/crypto-utils')
    await seedSecret(encryptApiKey('s'))

    const result = await savePaymentChannel({
      adminId: 'admin-1',
      method: 'hmac-webhook',
      values: {},
      clearFields: ['secret'],
      reason: '更换收款方',
    })

    expect(result.values.secret).toBe('')
    const stored = store.get(HMAC_KEY) as Record<string, string>
    expect(stored.secret).toBeUndefined()
  })

  it('普通字段的空值表示清除', async () => {
    const { encryptApiKey } = await import('@/lib/crypto-utils')
    const cipher = encryptApiKey('s')
    store.set(HMAC_KEY, { secret: cipher, payUrlTemplate: 'https://old.example.com' })

    await savePaymentChannel({
      adminId: 'admin-1',
      method: 'hmac-webhook',
      values: { payUrlTemplate: '' },
      reason: 'x',
    })

    const stored = store.get(HMAC_KEY) as Record<string, string>
    expect(stored.payUrlTemplate).toBeUndefined()
    expect(stored.secret).toBe(cipher)
  })

  it('启用渠道：至少要保留一个', async () => {
    await expect(
      setEnabledPaymentMethods({ adminId: 'admin-1', methods: [], reason: 'x' }),
    ).rejects.toThrow(/INVALID_PARAMS/)
  })

  it('启用渠道：未实现的渠道不允许启用', async () => {
    await expect(
      setEnabledPaymentMethods({ adminId: 'admin-1', methods: ['alipay'], reason: 'x' }),
    ).rejects.toThrow(/INVALID_PARAMS/)
    expect(prismaMock.systemConfig.upsert).not.toHaveBeenCalled()
  })

  it('启用渠道：必填参数未配置时拒绝', async () => {
    await expect(
      setEnabledPaymentMethods({ adminId: 'admin-1', methods: ['hmac-webhook'], reason: 'x' }),
    ).rejects.toThrow(/INVALID_PARAMS/)
  })

  it('启用渠道：参数齐全时写入并审计', async () => {
    const { encryptApiKey } = await import('@/lib/crypto-utils')
    await seedSecret(encryptApiKey('s3cret'))
    store.set(METHODS_KEY, ['manual'])

    const result = await setEnabledPaymentMethods({
      adminId: 'admin-1',
      methods: ['manual', 'hmac-webhook'],
      reason: '接入签名回调',
    })

    expect(result.methods).toEqual(['manual', 'hmac-webhook'])
    expect(store.get(METHODS_KEY)).toEqual(['manual', 'hmac-webhook'])
    expect(prismaMock.adminLog.create).toHaveBeenCalledTimes(1)
  })
})
