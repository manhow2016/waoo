/**
 * 修改管理员角色 / 启停
 * PUT /api/admin/admins/[id]
 *
 * body: { role?: string, isActive?: boolean, reason: string }
 * 权限：仅 super
 *
 * 服务端会拒绝「停用自己」与「停用/降级最后一个超级管理员」。
 */
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { ADMIN_ROLE, requireAdminRole } from '@/lib/admin-auth'
import { updateAdminAccount } from '@/lib/admin/commands'
import { getClientIp } from '@/lib/rate-limit'

export const PUT = apiHandler(async (
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) => {
  const guard = await requireAdminRole(ADMIN_ROLE.SUPER)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  const { id } = await ctx.params

  let body: { role?: unknown; isActive?: unknown; reason?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    throw new ApiError('INVALID_PARAMS', { code: 'BODY_PARSE_FAILED', field: 'body' })
  }

  if (body.role === undefined && body.isActive === undefined) {
    throw new ApiError('INVALID_PARAMS', { code: 'NOTHING_TO_UPDATE' })
  }

  const updated = await updateAdminAccount({
    adminId: admin.id,
    targetAdminId: id,
    role: typeof body.role === 'string' ? body.role : undefined,
    isActive: typeof body.isActive === 'boolean' ? body.isActive : undefined,
    reason: typeof body.reason === 'string' ? body.reason : '',
    ip: getClientIp(request),
  })

  return NextResponse.json({ admin: updated })
})
