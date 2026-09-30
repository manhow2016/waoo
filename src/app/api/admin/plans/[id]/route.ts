/**
 * 编辑 / 下架套餐
 * PUT    /api/admin/plans/[id]  → 编辑（code 不可修改）
 * DELETE /api/admin/plans/[id]?reason=... → 下架（软删除）
 *
 * 权限：operation 及以上
 */
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { ADMIN_ROLE, requireAdminRole } from '@/lib/admin-auth'
import { deactivatePlan, updatePlan, type PlanInput } from '@/lib/admin/commands'
import { getClientIp } from '@/lib/rate-limit'

function readPartialPlanInput(raw: unknown): Partial<PlanInput> {
  if (!raw || typeof raw !== 'object') {
    throw new ApiError('INVALID_PARAMS', { code: 'PLAN_REQUIRED', field: 'plan' })
  }
  const record = raw as Record<string, unknown>
  return {
    ...(typeof record.name === 'string' ? { name: record.name } : {}),
    ...(typeof record.level === 'number' ? { level: record.level } : {}),
    ...(typeof record.price === 'number' ? { price: record.price } : {}),
    ...(typeof record.durationDay === 'number' ? { durationDay: record.durationDay } : {}),
    ...(record.allowAllProviders !== undefined
      ? { allowAllProviders: record.allowAllProviders === true }
      : {}),
    ...(record.features !== undefined ? { features: record.features as PlanInput['features'] } : {}),
    ...(typeof record.sortOrder === 'number' ? { sortOrder: record.sortOrder } : {}),
    ...(record.isActive !== undefined ? { isActive: record.isActive === true } : {}),
  }
}

export const PUT = apiHandler(async (
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) => {
  const guard = await requireAdminRole(ADMIN_ROLE.OPERATION)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  const { id } = await ctx.params

  let body: { plan?: unknown; reason?: unknown }
  try {
    body = (await request.json()) as { plan?: unknown; reason?: unknown }
  } catch {
    throw new ApiError('INVALID_PARAMS', { code: 'BODY_PARSE_FAILED', field: 'body' })
  }

  const plan = await updatePlan({
    adminId: admin.id,
    planId: id,
    plan: readPartialPlanInput(body.plan),
    reason: typeof body.reason === 'string' ? body.reason : '',
    ip: getClientIp(request),
  })

  return NextResponse.json({ plan })
})

export const DELETE = apiHandler(async (
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) => {
  const guard = await requireAdminRole(ADMIN_ROLE.OPERATION)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  const { id } = await ctx.params

  const plan = await deactivatePlan({
    adminId: admin.id,
    planId: id,
    reason: request.nextUrl.searchParams.get('reason') ?? '',
    ip: getClientIp(request),
  })

  return NextResponse.json({ plan })
})
