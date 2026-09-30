/**
 * 用户详情
 * GET /api/admin/users/[id]
 *
 * 权限：support 及以上
 */
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { ADMIN_ROLE, requireAdminRole } from '@/lib/admin-auth'
import { getUserDetail } from '@/lib/admin/queries'

export const GET = apiHandler(async (
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) => {
  const guard = await requireAdminRole(ADMIN_ROLE.SUPPORT)
  if (guard instanceof NextResponse) return guard

  const { id } = await ctx.params
  const detail = await getUserDetail(id)
  if (!detail) {
    throw new ApiError('NOT_FOUND', { code: 'USER_NOT_FOUND' })
  }

  return NextResponse.json({ user: detail })
})
