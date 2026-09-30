/**
 * 套餐列表 / 新增套餐
 * GET  /api/admin/plans  → 全量套餐（含已下架）
 * POST /api/admin/plans  → 新增套餐
 *
 * 权限：GET 为 support 及以上（客服需要按套餐筛选订单，套餐目录不属于敏感数据）；
 *      写操作 operation 及以上。
 */
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { ADMIN_ROLE, requireAdminRole } from '@/lib/admin-auth'
import { createPlan, type PlanInput } from '@/lib/admin/commands'
import { listPlans } from '@/lib/admin/queries'
import { getClientIp } from '@/lib/rate-limit'

export const GET = apiHandler(async () => {
  const guard = await requireAdminRole(ADMIN_ROLE.SUPPORT)
  if (guard instanceof NextResponse) return guard

  return NextResponse.json({ plans: await listPlans() })
})

function readPlanInput(raw: unknown): PlanInput {
  if (!raw || typeof raw !== 'object') {
    throw new ApiError('INVALID_PARAMS', { code: 'PLAN_REQUIRED', field: 'plan' })
  }
  const record = raw as Record<string, unknown>
  return {
    code: typeof record.code === 'string' ? record.code : '',
    name: typeof record.name === 'string' ? record.name : '',
    level: typeof record.level === 'number' ? record.level : Number.NaN,
    price: typeof record.price === 'number' ? record.price : Number.NaN,
    durationDay: typeof record.durationDay === 'number' ? record.durationDay : Number.NaN,
    allowAllProviders: record.allowAllProviders === true,
    features: (record.features ?? null) as PlanInput['features'],
    sortOrder: typeof record.sortOrder === 'number' ? record.sortOrder : 0,
    isActive: record.isActive === undefined ? true : record.isActive === true,
  }
}

export const POST = apiHandler(async (request: NextRequest) => {
  const guard = await requireAdminRole(ADMIN_ROLE.OPERATION)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  let body: { plan?: unknown; reason?: unknown }
  try {
    body = (await request.json()) as { plan?: unknown; reason?: unknown }
  } catch {
    throw new ApiError('INVALID_PARAMS', { code: 'BODY_PARSE_FAILED', field: 'body' })
  }

  const plan = await createPlan({
    adminId: admin.id,
    plan: readPlanInput(body.plan),
    reason: typeof body.reason === 'string' ? body.reason : '',
    ip: getClientIp(request),
  })

  return NextResponse.json({ plan })
})
