/**
 * 订单列表
 * GET /api/admin/orders?search=&status=&planCode=&page=&pageSize=
 *
 * 权限：support 及以上
 */
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { ADMIN_ROLE, requireAdminRole } from '@/lib/admin-auth'
import { listOrders, normalizePageParams } from '@/lib/admin/queries'

const ORDER_STATUSES = new Set(['pending', 'active', 'expired', 'cancelled'])

export const GET = apiHandler(async (request: NextRequest) => {
  const guard = await requireAdminRole(ADMIN_ROLE.SUPPORT)
  if (guard instanceof NextResponse) return guard

  const params = request.nextUrl.searchParams
  const statusParam = params.get('status')
  const page = normalizePageParams({
    page: params.get('page'),
    pageSize: params.get('pageSize'),
  })

  const result = await listOrders({
    ...page,
    search: params.get('search') ?? undefined,
    status: statusParam && ORDER_STATUSES.has(statusParam)
      ? (statusParam as 'pending' | 'active' | 'expired' | 'cancelled')
      : 'all',
    planCode: params.get('planCode') ?? undefined,
  })

  return NextResponse.json(result)
})
