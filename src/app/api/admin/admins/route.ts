/**
 * 管理员账号列表 / 新增
 * GET  /api/admin/admins → 全部管理员账号（不含任何密码字段）
 * POST /api/admin/admins → 新增管理员
 *
 * 权限：仅 super
 */
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { ADMIN_ROLE, requireAdminRole } from '@/lib/admin-auth'
import { createAdminAccount } from '@/lib/admin/commands'
import { listAdminAccounts } from '@/lib/admin/queries'
import { getClientIp } from '@/lib/rate-limit'

export const GET = apiHandler(async () => {
  const guard = await requireAdminRole(ADMIN_ROLE.SUPER)
  if (guard instanceof NextResponse) return guard

  return NextResponse.json({ admins: await listAdminAccounts() })
})

export const POST = apiHandler(async (request: NextRequest) => {
  const guard = await requireAdminRole(ADMIN_ROLE.SUPER)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  let body: { username?: unknown; password?: unknown; role?: unknown; reason?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    throw new ApiError('INVALID_PARAMS', { code: 'BODY_PARSE_FAILED', field: 'body' })
  }

  if (typeof body.username !== 'string' || typeof body.password !== 'string' || typeof body.role !== 'string') {
    throw new ApiError('INVALID_PARAMS', { code: 'ADMIN_FIELDS_REQUIRED' })
  }

  const created = await createAdminAccount({
    adminId: admin.id,
    username: body.username,
    password: body.password,
    role: body.role,
    reason: typeof body.reason === 'string' ? body.reason : '',
    ip: getClientIp(request),
  })

  return NextResponse.json({ admin: created })
})
