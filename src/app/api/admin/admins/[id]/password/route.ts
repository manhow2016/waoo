/**
 * 重置指定管理员的密码
 * POST /api/admin/admins/[id]/password
 *
 * body: { newPassword: string, reason: string }
 * 权限：仅 super
 *
 * 重置后该账号的所有后台会话立即失效（sessionVersion 自增）。
 */
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { ADMIN_ROLE, requireAdminRole } from '@/lib/admin-auth'
import { resetAdminPassword } from '@/lib/admin/commands'
import { getClientIp } from '@/lib/rate-limit'

export const POST = apiHandler(async (
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) => {
  const guard = await requireAdminRole(ADMIN_ROLE.SUPER)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  const { id } = await ctx.params

  let body: { newPassword?: unknown; reason?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    throw new ApiError('INVALID_PARAMS', { code: 'BODY_PARSE_FAILED', field: 'body' })
  }

  if (typeof body.newPassword !== 'string') {
    throw new ApiError('INVALID_PARAMS', { code: 'PASSWORD_REQUIRED', field: 'newPassword' })
  }

  const result = await resetAdminPassword({
    adminId: admin.id,
    targetAdminId: id,
    newPassword: body.newPassword,
    reason: typeof body.reason === 'string' ? body.reason : '',
    ip: getClientIp(request),
  })

  return NextResponse.json({ admin: result })
})
