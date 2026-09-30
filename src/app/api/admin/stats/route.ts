/**
 * 数据统计概览
 * GET /api/admin/stats
 *
 * 权限：operation 及以上
 */
import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { ADMIN_ROLE, requireAdminRole } from '@/lib/admin-auth'
import { getAdminStats, listPlanOptions } from '@/lib/admin/queries'

export const GET = apiHandler(async () => {
  const guard = await requireAdminRole(ADMIN_ROLE.OPERATION)
  if (guard instanceof NextResponse) return guard

  const [stats, planOptions] = await Promise.all([getAdminStats(), listPlanOptions()])

  return NextResponse.json({ stats, planOptions })
})
