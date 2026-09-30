/**
 * 管理员登录
 * POST /api/admin/auth/login
 *
 * 与用户端完全隔离：签发独立 Cookie（waoowaoo_admin_session）+ 独立签名密钥。
 * 该接口本身不需要任何用户会话，因此登记在 PUBLIC_ROUTE_ALLOWLIST 中。
 */
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { AUTH_LOGIN_LIMIT, checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { createAdminSession, isAdminRole, verifyAdminCredentials } from '@/lib/admin-auth'

interface LoginBody {
  username?: unknown
  password?: unknown
}

export const POST = apiHandler(async (request: NextRequest) => {
  const ip = getClientIp(request)
  const rateLimit = await checkRateLimit('admin:auth:login', ip, AUTH_LOGIN_LIMIT)
  if (rateLimit.limited) {
    throw new ApiError('RATE_LIMIT', { retryAfter: rateLimit.retryAfterSeconds })
  }

  let body: LoginBody
  try {
    body = (await request.json()) as LoginBody
  } catch {
    throw new ApiError('INVALID_PARAMS', { code: 'BODY_PARSE_FAILED', field: 'body' })
  }

  const username = typeof body.username === 'string' ? body.username.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!username || !password) {
    throw new ApiError('INVALID_PARAMS', { code: 'CREDENTIALS_REQUIRED' })
  }

  const admin = await verifyAdminCredentials(username, password)
  if (!admin) {
    // 不区分「账号不存在」与「密码错误」，避免账号枚举
    throw new ApiError('UNAUTHORIZED', { code: 'INVALID_CREDENTIALS' })
  }

  await createAdminSession(admin)
  await prisma.admin.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  })

  return NextResponse.json({
    admin: {
      id: admin.id,
      username: admin.username,
      role: isAdminRole(admin.role) ? admin.role : 'support',
    },
  })
})
