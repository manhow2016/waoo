/**
 * 操作日志查询
 * GET /api/admin/logs?action=&adminId=&targetId=&page=&pageSize=
 *
 * 权限：仅 super
 */
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { ADMIN_ROLE, requireAdminRole } from '@/lib/admin-auth'
import { listAdminLogs, normalizePageParams } from '@/lib/admin/queries'

export const GET = apiHandler(async (request: NextRequest) => {
  const guard = await requireAdminRole(ADMIN_ROLE.SUPER)
  if (guard instanceof NextResponse) return guard

  const params = request.nextUrl.searchParams
  const page = normalizePageParams({
    page: params.get('page'),
    pageSize: params.get('pageSize'),
  })

  const result = await listAdminLogs({
    ...page,
    action: params.get('action') ?? undefined,
    adminId: params.get('adminId') ?? undefined,
    targetId: params.get('targetId') ?? undefined,
  })

  return NextResponse.json(result)
})
