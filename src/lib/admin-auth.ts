/**
 * 管理员认证与 RBAC（后台会话的唯一 owner）
 *
 * 与用户端**完全隔离**：
 * - 独立 Cookie 名（waoowaoo_admin_session），不读也不写 NextAuth 的会话 Cookie
 * - 独立签名密钥（ADMIN_SESSION_SECRET），不复用 NEXTAUTH_SECRET / API_ENCRYPTION_KEY
 * - 角色与权限只来自 Admin 表，用户账号无法通过任何方式获得后台权限
 *
 * 会话有效性：Cookie 只承载身份与过期时间，每次鉴权都会重新读库校验
 * `isActive` 与角色，因此停用管理员或调整角色会**立即生效**，无需等待会话过期。
 */
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Admin } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { forbidden, unauthorized } from '@/lib/api-auth'

export const ADMIN_SESSION_COOKIE = 'waoowaoo_admin_session'

export const ADMIN_ROLE = {
  SUPPORT: 'support',
  OPERATION: 'operation',
  SUPER: 'super',
} as const

export type AdminRole = (typeof ADMIN_ROLE)[keyof typeof ADMIN_ROLE]

/** 角色等级：数值越大权限越高 */
export const ADMIN_ROLE_RANK: Record<AdminRole, number> = {
  support: 1,
  operation: 2,
  super: 3,
}

/** 后台会话有效期：12 小时 */
export const ADMIN_SESSION_TTL_SECONDS = 12 * 60 * 60

export interface AdminSessionPayload {
  adminId: string
  username: string
  role: AdminRole
  /** 会话版本：与 Admin.sessionVersion 不一致即视为失效（改密后旧会话立即作废） */
  sv: number
  /** 过期时间（epoch 秒） */
  exp: number
}

/** 管理员密码策略：至少 12 位、包含字母、且不是重复字符（对中文口令友好） */
export const ADMIN_PASSWORD_MIN_LENGTH = 12
export const ADMIN_PASSWORD_MAX_LENGTH = 128

export function validateAdminPassword(password: unknown): { ok: true } | { ok: false; code: string } {
  if (typeof password !== 'string' || password.length === 0) {
    return { ok: false, code: 'PASSWORD_REQUIRED' }
  }
  if (password.length < ADMIN_PASSWORD_MIN_LENGTH) {
    return { ok: false, code: 'PASSWORD_TOO_SHORT' }
  }
  if (password.length > ADMIN_PASSWORD_MAX_LENGTH) {
    return { ok: false, code: 'PASSWORD_TOO_LONG' }
  }

  // 至少包含一个字母（Unicode 字母，中文等非拉丁文字同样计入）。
  // 这里刻意不强制「大小写/数字/符号多类别」：对以中文为主的产品会误伤
  // 「这是一个足够长的中文密码」这类强口令，长度才是主要强度来源。
  if (!/\p{L}/u.test(password)) {
    return { ok: false, code: 'PASSWORD_NEEDS_LETTER' }
  }
  // 排除单字符重复（如 aaaaaaaaaaaa）
  if (new Set(password).size < 3) {
    return { ok: false, code: 'PASSWORD_TOO_WEAK' }
  }

  return { ok: true }
}

export async function hashAdminPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export class AdminSessionConfigError extends Error {
  constructor() {
    super('ADMIN_SESSION_CONFIG_MISSING: 未配置 ADMIN_SESSION_SECRET，后台无法登录')
    this.name = 'AdminSessionConfigError'
  }
}

function getAdminSessionSecret(): string {
  const secret = (process.env.ADMIN_SESSION_SECRET || '').trim()
  if (!secret) throw new AdminSessionConfigError()
  return secret
}

export function isAdminRole(value: unknown): value is AdminRole {
  return value === ADMIN_ROLE.SUPPORT || value === ADMIN_ROLE.OPERATION || value === ADMIN_ROLE.SUPER
}

export function isRoleAtLeast(role: AdminRole, minRole: AdminRole): boolean {
  return ADMIN_ROLE_RANK[role] >= ADMIN_ROLE_RANK[minRole]
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url')
}

function signPayload(encodedPayload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(encodedPayload, 'utf8').digest('base64url')
}

/** 生成签名会话 token（纯函数，便于测试） */
export function signAdminSessionToken(
  payload: AdminSessionPayload,
  secret: string = getAdminSessionSecret(),
): string {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  return `${encodedPayload}.${signPayload(encodedPayload, secret)}`
}

/** 校验会话 token；签名不符、结构非法或已过期一律返回 null */
export function verifyAdminSessionToken(
  token: string | undefined | null,
  now: Date = new Date(),
  secret: string = getAdminSessionSecret(),
): AdminSessionPayload | null {
  if (!token) return null

  const separatorIndex = token.indexOf('.')
  if (separatorIndex <= 0) return null

  const encodedPayload = token.slice(0, separatorIndex)
  const signature = token.slice(separatorIndex + 1)
  if (!encodedPayload || !signature) return null

  const expected = Buffer.from(signPayload(encodedPayload, secret), 'utf8')
  const actual = Buffer.from(signature, 'utf8')
  if (expected.length !== actual.length) return null
  if (!crypto.timingSafeEqual(expected, actual)) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null

  const record = parsed as Record<string, unknown>
  const adminId = typeof record.adminId === 'string' ? record.adminId : ''
  const username = typeof record.username === 'string' ? record.username : ''
  const exp = typeof record.exp === 'number' ? record.exp : 0
  // 老 token 不带 sv，按 0 处理；改密后 DB 版本会大于 0，从而自然失效
  const sv = typeof record.sv === 'number' && Number.isFinite(record.sv) ? record.sv : 0
  if (!adminId || !username || !isAdminRole(record.role)) return null
  if (!Number.isFinite(exp) || exp * 1000 <= now.getTime()) return null

  return { adminId, username, role: record.role, sv, exp }
}

function buildCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: (process.env.NEXTAUTH_URL || '').startsWith('https://'),
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  }
}

/** 登录成功后写入后台会话 Cookie */
export async function createAdminSession(admin: Admin, now: Date = new Date()): Promise<void> {
  const payload: AdminSessionPayload = {
    adminId: admin.id,
    username: admin.username,
    role: isAdminRole(admin.role) ? admin.role : ADMIN_ROLE.SUPPORT,
    sv: admin.sessionVersion,
    exp: Math.floor(now.getTime() / 1000) + ADMIN_SESSION_TTL_SECONDS,
  }

  const cookieStore = await cookies()
  cookieStore.set(ADMIN_SESSION_COOKIE, signAdminSessionToken(payload), buildCookieOptions())
}

export async function clearAdminSession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(ADMIN_SESSION_COOKIE, '', { ...buildCookieOptions(), maxAge: 0 })
}

/**
 * 读取当前管理员。
 * 除了校验 Cookie 签名与有效期，还会重新读库确认账号仍然启用、角色仍然有效，
 * 因此「停用管理员」会立即让已有会话失效。
 */
export async function readAdminSession(): Promise<Admin | null> {
  let payload: AdminSessionPayload | null
  try {
    const cookieStore = await cookies()
    payload = verifyAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)
  } catch {
    // 未配置签名密钥或 Cookie 不可读时，视为未登录
    return null
  }
  if (!payload) return null

  const admin = await prisma.admin.findUnique({ where: { id: payload.adminId } })
  if (!admin || !admin.isActive) return null
  // 会话版本不一致说明密码已被修改（自助改密或管理员重置），旧会话立即失效
  if (admin.sessionVersion !== payload.sv) return null

  return admin
}

export type AdminGuardResult = { admin: Admin } | NextResponse

/** 后台接口鉴权：未登录/已失效 → 401，角色不足 → 403 */
export async function requireAdminRole(minRole: AdminRole): Promise<AdminGuardResult> {
  const admin = await readAdminSession()
  if (!admin) return unauthorized()

  const role = isAdminRole(admin.role) ? admin.role : null
  if (!role || !isRoleAtLeast(role, minRole)) return forbidden()

  return { admin }
}

/** 校验管理员账密；账号不存在、已停用、密码错误一律返回 null */
export async function verifyAdminCredentials(
  username: string,
  password: string,
): Promise<Admin | null> {
  const normalizedUsername = username.trim()
  if (!normalizedUsername || !password) return null

  const admin = await prisma.admin.findUnique({ where: { username: normalizedUsername } })
  if (!admin || !admin.isActive) return null

  const valid = await bcrypt.compare(password, admin.passwordHash)
  return valid ? admin : null
}
