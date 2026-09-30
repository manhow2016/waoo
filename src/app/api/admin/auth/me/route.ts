/**
 * 当前登录管理员
 * GET /api/admin/auth/me
 *
 * 后台前端据此渲染菜单与做角色隔离；每次都会重新读库校验账号是否仍启用。
 */
import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { ADMIN_ROLE, isAdminRole, requireAdminRole } from '@/lib/admin-auth'

export const GET = apiHandler(async () => {
  const guard = await requireAdminRole(ADMIN_ROLE.SUPPORT)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  return NextResponse.json({
    admin: {
      id: admin.id,
      username: admin.username,
      role: isAdminRole(admin.role) ? admin.role : 'support',
      lastLoginAt: admin.lastLoginAt ? admin.lastLoginAt.toISOString() : null,
    },
  })
})
