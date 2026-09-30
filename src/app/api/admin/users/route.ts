/**
 * 用户列表
 * GET /api/admin/users?search=&status=&membership=&page=&pageSize=
 *
 * 权限：support 及以上
 */
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { ADMIN_ROLE, requireAdminRole } from '@/lib/admin-auth'
import { listUsers, normalizePageParams } from '@/lib/admin/queries'

function normalizeStatus(value: string | null): 'all' | 'active' | 'banned' {
  return value === 'active' || value === 'banned' ? value : 'all'
}

function normalizeMembership(value: string | null): 'all' | 'free' | 'paid' {
  return value === 'free' || value === 'paid' ? value : 'all'
}

export const GET = apiHandler(async (request: NextRequest) => {
  const guard = await requireAdminRole(ADMIN_ROLE.SUPPORT)
  if (guard instanceof NextResponse) return guard

  const params = request.nextUrl.searchParams
  const page = normalizePageParams({
    page: params.get('page'),
    pageSize: params.get('pageSize'),
  })

  const result = await listUsers({
    ...page,
    search: params.get('search') ?? undefined,
    status: normalizeStatus(params.get('status')),
    membership: normalizeMembership(params.get('membership')),
  })

  return NextResponse.json(result)
})
