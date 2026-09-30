import { beforeEach, describe, expect, it, vi } from 'vitest'

const cookieMock = vi.hoisted(() => ({ value: undefined as string | undefined }))

const prismaMock = vi.hoisted(() => ({
  admin: {
    findUnique: vi.fn(),
  },
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieMock.value ? { name, value: cookieMock.value } : undefined,
    set: () => undefined,
  }),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

import {
  ADMIN_ROLE,
  ADMIN_SESSION_COOKIE,
  AdminSessionConfigError,
  hashAdminPassword,
  isAdminRole,
  isRoleAtLeast,
  readAdminSession,
  requireAdminRole,
  signAdminSessionToken,
  validateAdminPassword,
  verifyAdminSessionToken,
  type AdminSessionPayload,
} from '@/lib/admin-auth'

const SECRET = 'unit-test-admin-session-secret'

function buildPayload(overrides: Partial<AdminSessionPayload> = {}): AdminSessionPayload {
  return {
    adminId: 'admin-1',
    username: 'admin',
    role: ADMIN_ROLE.SUPER,
    sv: 0,
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  }
}

function buildAdmin(overrides: Record<string, unknown> = {}) {
  return {
    id: 'admin-1',
    username: 'admin',
    passwordHash: 'hash',
    role: 'super',
    isActive: true,
    lastLoginAt: null,
    sessionVersion: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

describe('admin-auth / 会话签名', () => {
  it('同一密钥签发的 token 可被验证通过', () => {
    const token = signAdminSessionToken(buildPayload(), SECRET)

    expect(verifyAdminSessionToken(token, new Date(), SECRET)).toMatchObject({
      adminId: 'admin-1',
      username: 'admin',
      role: 'super',
    })
  })

  it('密钥不同则验签失败（体现独立签名密钥的隔离性）', () => {
    const token = signAdminSessionToken(buildPayload(), SECRET)

    expect(verifyAdminSessionToken(token, new Date(), 'another-secret')).toBeNull()
  })

  it('payload 被篡改则验签失败', () => {
    const token = signAdminSessionToken(buildPayload(), SECRET)
    const [encodedPayload, signature] = token.split('.')
    const tampered = Buffer.from(
      JSON.stringify(buildPayload({ role: ADMIN_ROLE.SUPER, adminId: 'admin-2' })),
      'utf8',
    ).toString('base64url')

    expect(encodedPayload).not.toBe(tampered)
    expect(verifyAdminSessionToken(`${tampered}.${signature}`, new Date(), SECRET)).toBeNull()
  })

  it('过期 token 不被接受', () => {
    const expired = buildPayload({ exp: Math.floor(Date.now() / 1000) - 10 })
    const token = signAdminSessionToken(expired, SECRET)

    expect(verifyAdminSessionToken(token, new Date(), SECRET)).toBeNull()
  })

  it('结构非法或角色未知的 token 一律拒绝', () => {
    expect(verifyAdminSessionToken(undefined, new Date(), SECRET)).toBeNull()
    expect(verifyAdminSessionToken('', new Date(), SECRET)).toBeNull()
    expect(verifyAdminSessionToken('no-dot-here', new Date(), SECRET)).toBeNull()
    expect(verifyAdminSessionToken('.signature-only', new Date(), SECRET)).toBeNull()

    const unknownRole = signAdminSessionToken(
      { ...buildPayload(), role: 'root' as unknown as AdminSessionPayload['role'] },
      SECRET,
    )
    expect(verifyAdminSessionToken(unknownRole, new Date(), SECRET)).toBeNull()
  })

  it('未配置 ADMIN_SESSION_SECRET 时显式报错，而不是静默复用其他密钥', () => {
    const original = process.env.ADMIN_SESSION_SECRET
    delete process.env.ADMIN_SESSION_SECRET

    try {
      expect(() => signAdminSessionToken(buildPayload())).toThrow(AdminSessionConfigError)
    } finally {
      process.env.ADMIN_SESSION_SECRET = original
    }
  })
})

describe('admin-auth / RBAC', () => {
  it('角色识别与等级比较', () => {
    expect(isAdminRole('super')).toBe(true)
    expect(isAdminRole('operation')).toBe(true)
    expect(isAdminRole('support')).toBe(true)
    expect(isAdminRole('user')).toBe(false)
    expect(isAdminRole(null)).toBe(false)

    expect(isRoleAtLeast('super', 'operation')).toBe(true)
    expect(isRoleAtLeast('operation', 'operation')).toBe(true)
    expect(isRoleAtLeast('support', 'operation')).toBe(false)
    expect(isRoleAtLeast('support', 'support')).toBe(true)
  })
})

describe('admin-auth / 会话读取与接口守卫', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cookieMock.value = undefined
    process.env.ADMIN_SESSION_SECRET = SECRET
  })

  it('没有 Cookie 时视为未登录', async () => {
    await expect(readAdminSession()).resolves.toBeNull()
  })

  it('Cookie 有效但管理员已停用时立即失效', async () => {
    cookieMock.value = signAdminSessionToken(buildPayload(), SECRET)
    prismaMock.admin.findUnique.mockResolvedValue(buildAdmin({ isActive: false }))

    await expect(readAdminSession()).resolves.toBeNull()
  })

  it('Cookie 有效且管理员启用时返回管理员', async () => {
    cookieMock.value = signAdminSessionToken(buildPayload(), SECRET)
    prismaMock.admin.findUnique.mockResolvedValue(buildAdmin())

    await expect(readAdminSession()).resolves.toMatchObject({ id: 'admin-1' })
    expect(prismaMock.admin.findUnique).toHaveBeenCalledWith({ where: { id: 'admin-1' } })
  })

  it('requireAdminRole 在未登录时返回 401', async () => {
    const guard = await requireAdminRole(ADMIN_ROLE.SUPPORT)

    expect(guard instanceof Response).toBe(true)
    expect((guard as Response).status).toBe(401)
  })

  it('requireAdminRole 在角色不足时返回 403', async () => {
    cookieMock.value = signAdminSessionToken(buildPayload({ role: ADMIN_ROLE.SUPPORT }), SECRET)
    prismaMock.admin.findUnique.mockResolvedValue(buildAdmin({ role: 'support' }))

    const guard = await requireAdminRole(ADMIN_ROLE.SUPER)

    expect(guard instanceof Response).toBe(true)
    expect((guard as Response).status).toBe(403)
  })

  it('requireAdminRole 在角色足够时返回管理员', async () => {
    cookieMock.value = signAdminSessionToken(buildPayload({ role: ADMIN_ROLE.OPERATION }), SECRET)
    prismaMock.admin.findUnique.mockResolvedValue(buildAdmin({ role: 'operation' }))

    const guard = await requireAdminRole(ADMIN_ROLE.SUPPORT)

    expect(guard instanceof Response).toBe(false)
    expect((guard as { admin: { id: string } }).admin.id).toBe('admin-1')
  })

  it('会话版本不一致时旧会话立即失效（改密后踢下线）', async () => {
    cookieMock.value = signAdminSessionToken(buildPayload({ sv: 0 }), SECRET)
    prismaMock.admin.findUnique.mockResolvedValue(buildAdmin({ sessionVersion: 1 }))

    await expect(readAdminSession()).resolves.toBeNull()
  })

  it('会话版本一致时正常通过', async () => {
    cookieMock.value = signAdminSessionToken(buildPayload({ sv: 3 }), SECRET)
    prismaMock.admin.findUnique.mockResolvedValue(buildAdmin({ sessionVersion: 3 }))

    await expect(readAdminSession()).resolves.toMatchObject({ id: 'admin-1' })
  })

  it('后台 Cookie 名与用户端会话完全隔离', () => {
    expect(ADMIN_SESSION_COOKIE).toBe('waoowaoo_admin_session')
    expect(ADMIN_SESSION_COOKIE).not.toContain('next-auth')
  })
})

describe('admin-auth / 密码策略', () => {
  it('长度不足、缺少字母或重复字符时拒绝', () => {
    expect(validateAdminPassword('short1')).toMatchObject({ ok: false, code: 'PASSWORD_TOO_SHORT' })
    expect(validateAdminPassword('123456789012')).toMatchObject({ ok: false, code: 'PASSWORD_NEEDS_LETTER' })
    expect(validateAdminPassword('aaaaaaaaaaaaaa')).toMatchObject({ ok: false, code: 'PASSWORD_TOO_WEAK' })
    expect(validateAdminPassword('')).toMatchObject({ ok: false, code: 'PASSWORD_REQUIRED' })
    expect(validateAdminPassword(undefined)).toMatchObject({ ok: false, code: 'PASSWORD_REQUIRED' })
    expect(validateAdminPassword('a'.repeat(200))).toMatchObject({ ok: false, code: 'PASSWORD_TOO_LONG' })
  })

  it('拉丁与中文长口令都可通过，并可被 bcrypt 校验', async () => {
    expect(validateAdminPassword('AdminPassw0rd')).toEqual({ ok: true })
    // 中文口令不能因为「只有一类字符」被误判为弱口令
    expect(validateAdminPassword('这是一个足够长的中文密码')).toEqual({ ok: true })
    expect(validateAdminPassword('correct horse battery staple')).toEqual({ ok: true })

    const hash = await hashAdminPassword('AdminPassw0rd')
    expect(hash.startsWith('$2')).toBe(true)
    expect(hash).not.toContain('AdminPassw0rd')
  })
})
