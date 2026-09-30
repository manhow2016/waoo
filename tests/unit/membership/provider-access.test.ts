import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  provider: {
    findMany: vi.fn(),
  },
}))

const membershipMock = vi.hoisted(() => ({
  getMembershipStatus: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/membership', () => membershipMock)

import {
  ProviderConfigMissingError,
  assertProviderAllowed,
  assertProvidersAllowed,
  getAvailableProviders,
  getLockedProviders,
  getProviderAccess,
  isProviderIdAllowed,
} from '@/lib/provider-access'

/** 免费用户：无有效订阅 */
const FREE_MEMBERSHIP = {
  level: 0,
  plan: null,
  expireAt: null,
  isActive: false,
  allowAllProviders: false,
}

/** 付费用户：已解锁全部供应商 */
const PAID_MEMBERSHIP = {
  level: 1,
  plan: null,
  expireAt: null,
  isActive: true,
  allowAllProviders: true,
}

interface ProviderRow {
  code: string
  isDefault: boolean
}

const PROVIDER_ROWS: ProviderRow[] = [
  { code: 'token61', isDefault: true },
  { code: 'bailian', isDefault: false },
]

/** 模拟 prisma.provider.findMany：按 where.code 的 in / notIn 过滤 */
function installProviderTable(rows: ProviderRow[] = PROVIDER_ROWS) {
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

describe('provider-access / isProviderIdAllowed', () => {
  it('付费用户（allowAllProviders）放行任意供应商', () => {
    const access = {
      allowAllProviders: true,
      defaultProviderCode: 'token61',
      allowedProviderCodes: ['token61', 'bailian'],
    }

    expect(isProviderIdAllowed(access, 'bailian')).toBe(true)
    expect(isProviderIdAllowed(access, 'token61')).toBe(true)
    expect(isProviderIdAllowed(access, 'gemini-compatible:abc')).toBe(true)
  })

  it('免费用户只放行默认供应商，且支持带实例后缀的 providerId', () => {
    const access = {
      allowAllProviders: false,
      defaultProviderCode: 'token61',
      allowedProviderCodes: ['token61'],
    }

    expect(isProviderIdAllowed(access, 'token61')).toBe(true)
    expect(isProviderIdAllowed(access, 'TOKEN61')).toBe(true)
    expect(isProviderIdAllowed(access, 'token61:instance-1')).toBe(true)

    expect(isProviderIdAllowed(access, 'bailian')).toBe(false)
    expect(isProviderIdAllowed(access, 'gemini-compatible:abc')).toBe(false)
    expect(isProviderIdAllowed(access, 'openai-compatible:abc')).toBe(false)
    expect(isProviderIdAllowed(access, '')).toBe(false)
  })

  it('未配置默认供应商时免费用户不放行任何供应商', () => {
    const access = {
      allowAllProviders: false,
      defaultProviderCode: null,
      allowedProviderCodes: [],
    }

    expect(isProviderIdAllowed(access, 'token61')).toBe(false)
  })
})

describe('provider-access / getProviderAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    installProviderTable()
  })

  it('免费用户只得到默认供应商', async () => {
    membershipMock.getMembershipStatus.mockResolvedValue(FREE_MEMBERSHIP)

    const access = await getProviderAccess('user-free')

    expect(access.allowAllProviders).toBe(false)
    expect(access.defaultProviderCode).toBe('token61')
    expect(access.allowedProviderCodes).toEqual(['token61'])
  })

  it('付费用户得到全部上架供应商', async () => {
    membershipMock.getMembershipStatus.mockResolvedValue(PAID_MEMBERSHIP)

    const access = await getProviderAccess('user-paid')

    expect(access.allowAllProviders).toBe(true)
    expect(access.allowedProviderCodes).toEqual(['token61', 'bailian'])
  })

  it('平台未配置默认供应商时，免费用户读取策略会显式报错而不是静默放行', async () => {
    membershipMock.getMembershipStatus.mockResolvedValue(FREE_MEMBERSHIP)
    installProviderTable([{ code: 'bailian', isDefault: false }])

    await expect(getProviderAccess('user-free')).rejects.toBeInstanceOf(
      ProviderConfigMissingError,
    )
  })

  it('平台未配置默认供应商时，付费用户不受影响', async () => {
    membershipMock.getMembershipStatus.mockResolvedValue(PAID_MEMBERSHIP)
    installProviderTable([{ code: 'bailian', isDefault: false }])

    const access = await getProviderAccess('user-paid')

    expect(access.allowAllProviders).toBe(true)
    expect(access.allowedProviderCodes).toEqual(['bailian'])
  })

  it('可用/锁定供应商列表互补', async () => {
    membershipMock.getMembershipStatus.mockResolvedValue(FREE_MEMBERSHIP)

    const available = await getAvailableProviders('user-free')
    const locked = await getLockedProviders('user-free')

    expect(available.map((provider) => provider.code)).toEqual(['token61'])
    expect(locked.map((provider) => provider.code)).toEqual(['bailian'])
  })
})

describe('provider-access / 准入断言', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    installProviderTable()
  })

  it('免费用户使用非默认供应商被拒绝，错误码可被统一错误层识别', async () => {
    membershipMock.getMembershipStatus.mockResolvedValue(FREE_MEMBERSHIP)

    await expect(assertProviderAllowed('user-free', 'bailian')).rejects.toThrow(
      /MEMBERSHIP_REQUIRED/,
    )
  })

  it('免费用户使用默认供应商通过', async () => {
    membershipMock.getMembershipStatus.mockResolvedValue(FREE_MEMBERSHIP)

    await expect(assertProviderAllowed('user-free', 'token61')).resolves.toBeUndefined()
  })

  it('付费用户使用非默认供应商通过', async () => {
    membershipMock.getMembershipStatus.mockResolvedValue(PAID_MEMBERSHIP)

    await expect(assertProviderAllowed('user-paid', 'bailian')).resolves.toBeUndefined()
  })

  it('批量断言会一次性列出所有越权供应商', async () => {
    membershipMock.getMembershipStatus.mockResolvedValue(FREE_MEMBERSHIP)

    await expect(
      assertProvidersAllowed('user-free', ['token61', 'bailian', 'gemini-compatible:x']),
    ).rejects.toThrow(/bailian/)
  })

  it('空集合不做任何查询', async () => {
    membershipMock.getMembershipStatus.mockResolvedValue(FREE_MEMBERSHIP)

    await expect(assertProvidersAllowed('user-free', [])).resolves.toBeUndefined()
    expect(membershipMock.getMembershipStatus).not.toHaveBeenCalled()
  })
})
