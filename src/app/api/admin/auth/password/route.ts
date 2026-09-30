/**
 * 管理员自助修改密码
 * POST /api/admin/auth/password
 *
 * body: { currentPassword: string, newPassword: string }
 *
 * 修改成功后会自增 sessionVersion，**当前会话同时失效**，
 * 前端据此清理状态并跳回登录页（响应里 alreadySignedOut: true）。
 */
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { ADMIN_ROLE, requireAdminRole } from '@/lib/admin-auth'
import { changeOwnPassword } from '@/lib/admin/commands'
import { getClientIp } from '@/lib/rate-limit'

interface PasswordBody {
  currentPassword?: unknown
  newPassword?: unknown
}

export const POST = apiHandler(async (request: NextRequest) => {
  const guard = await requireAdminRole(ADMIN_ROLE.SUPPORT)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  let body: PasswordBody
  try {
    body = (await request.json()) as PasswordBody
  } catch {
    throw new ApiError('INVALID_PARAMS', { code: 'BODY_PARSE_FAILED', field: 'body' })
  }

  if (typeof body.currentPassword !== 'string' || typeof body.newPassword !== 'string') {
    throw new ApiError('INVALID_PARAMS', { code: 'PASSWORD_FIELDS_REQUIRED' })
  }

  const result = await changeOwnPassword({
    adminId: admin.id,
    currentPassword: body.currentPassword,
    newPassword: body.newPassword,
    ip: getClientIp(request),
  })

  return NextResponse.json({ admin: result, alreadySignedOut: true })
})
