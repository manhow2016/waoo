import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  userPreference: {
    findUnique: vi.fn(),
  },
  provider: {
    findMany: vi.fn(),
  },
}))

const membershipMock = vi.hoisted(() => ({
  getMembershipStatus: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/membership', () => membershipMock)

import { encryptApiKey } from '@/lib/crypto-utils'
import { findProviderConfig, getProviderConfig } from '@/lib/api-config'

process.env.API_ENCRYPTION_KEY =
  process.env.API_ENCRYPTION_KEY || 'test-encryption-key-for-membership-guard'

const FREE_MEMBERSHIP = {
  level: 0,
  plan: null,
  expireAt: null,
  isActive: false,
  allowAllProviders: false,
}

const PAID_MEMBERSHIP = {
  level: 1,
  plan: null,
  expireAt: null,
  isActive: true,
  allowAllProviders: true,
}

const PROVIDER_ROWS = [
  { code: 'token61', isDefault: true },
  { code: 'bailian', isDefault: false },
]

function installStoredProviders(providers: Array<{ id: string; name: string; apiKey: string }>) {
  prismaMock.userPreference.findUnique.mockResolvedValue({
    customProviders: JSON.stringify(providers),
    customModels: JSON.stringify([]),
  })
}

describe('api-config 供应商准入最终防线', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.provider.findMany.mockResolvedValue(PROVIDER_ROWS)
  })

  it('免费用户解析非默认供应商密钥时被拒绝（防止改库/伪造请求绕过）', async () => {
    membershipMock.getMembershipStatus.mockResolvedValue(FREE_MEMBERSHIP)
    installStoredProviders([
      { id: 'bailian', name: '阿里百炼', apiKey: encryptApiKey('sk-bailian-secret') },
    ])

    await expect(getProviderConfig('user-free', 'bailian')).rejects.toThrow(
      /MEMBERSHIP_REQUIRED/,
    )
  })

  it('免费用户解析默认供应商密钥正常放行', async () => {
    membershipMock.getMembershipStatus.mockResolvedValue(FREE_MEMBERSHIP)
    installStoredProviders([
      { id: 'token61', name: 'Token六一', apiKey: encryptApiKey('sk-token61-secret') },
    ])

    const config = await getProviderConfig('user-free', 'token61')

    expect(config.id).toBe('token61')
    expect(config.apiKey).toBe('sk-token61-secret')
  })

  it('付费用户解析非默认供应商密钥正常放行', async () => {
    membershipMock.getMembershipStatus.mockResolvedValue(PAID_MEMBERSHIP)
    installStoredProviders([
      { id: 'bailian', name: '阿里百炼', apiKey: encryptApiKey('sk-bailian-secret') },
    ])

    const config = await getProviderConfig('user-paid', 'bailian')

    expect(config.apiKey).toBe('sk-bailian-secret')
  })

  it('findProviderConfig 跳过被锁定的供应商，只返回可用项', async () => {
    membershipMock.getMembershipStatus.mockResolvedValue(FREE_MEMBERSHIP)
    installStoredProviders([
      { id: 'bailian', name: '阿里百炼', apiKey: encryptApiKey('sk-bailian-secret') },
      { id: 'token61', name: 'Token六一', apiKey: encryptApiKey('sk-token61-secret') },
    ])

    const config = await findProviderConfig('user-free', ['bailian', 'token61'])

    expect(config?.id).toBe('token61')
  })

  it('findProviderConfig 在只有被锁定供应商时返回 null', async () => {
    membershipMock.getMembershipStatus.mockResolvedValue(FREE_MEMBERSHIP)
    installStoredProviders([
      { id: 'bailian', name: '阿里百炼', apiKey: encryptApiKey('sk-bailian-secret') },
    ])

    const config = await findProviderConfig('user-free', ['bailian'])

    expect(config).toBeNull()
  })
})
