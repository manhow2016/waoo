import bcrypt from 'bcryptjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

import { authOptions } from '@/lib/auth'

/**
 * 封禁状态必须同时满足两件事，缺一不可：
 * 1. jwt 回调每次读库，把 isBanned 写入 token.banned（JWT 策略下无法主动吊销 token）
 * 2. session 回调把 token.banned 透传到 session.user.banned（getAuthSession 据此拒绝）
 *
 * 这里把两个回调串起来断言，避免只改其中一个而静默失效（曾真实发生过）。
 */
describe('user ban / 封禁状态在会话中的传播', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('封禁账号：jwt 写入 banned=true 且 session 透传', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isBanned: true })

    const token = await authOptions.callbacks.jwt({ token: { id: 'user-1' } })

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { isBanned: true },
    })
    expect(token.banned).toBe(true)

    const session = await authOptions.callbacks.session({
      session: { user: { email: 'user@example.com' } },
      token,
    })

    expect(session.user.banned).toBe(true)
    expect(session.user.id).toBe('user-1')
  })

  it('正常账号：banned 显式为 false（不能被 JSON 序列化丢掉）', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isBanned: false })

    const token = await authOptions.callbacks.jwt({ token: { id: 'user-1' } })
    const session = await authOptions.callbacks.session({
      session: { user: { email: 'user@example.com' } },
      token,
    })

    expect(token.banned).toBe(false)
    expect(session.user.banned).toBe(false)
    expect(JSON.parse(JSON.stringify(session)).user.banned).toBe(false)
  })

  it('账号已被删除：会话同样不可用', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)

    const token = await authOptions.callbacks.jwt({ token: { id: 'user-1' } })

    expect(token.banned).toBe(true)
  })

  it('登录时写入 token.id，并同样按库中状态初始化 banned', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isBanned: false })

    const freshToken = await authOptions.callbacks.jwt({ token: {}, user: { id: 'user-2' } })

    expect(freshToken.id).toBe('user-2')
    expect(freshToken.banned).toBe(false)
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-2' },
      select: { isBanned: true },
    })
  })

  it('登录时拒绝已封禁账号', async () => {
    const credentialsProvider = authOptions.providers[0]
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'banned@example.com',
      password: bcrypt.hashSync('secret', 4),
      isBanned: true,
    })

    const result = await credentialsProvider.authorize({
      username: 'banned@example.com',
      password: 'secret',
    })

    expect(result).toBeNull()
  })
})
