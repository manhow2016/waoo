/**
 * 手动调整用户会员
 * POST /api/admin/users/[id]/membership
 *
 * body:
 *   { mode: 'extend', planCode: string, reason: string }   → 按套餐时长顺延开通
 *   { mode: 'set',    expireAt: string, planCode?: string, reason: string } → 直接改写到期时间
 * 权限：operation 及以上
 */
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { ADMIN_ROLE, requireAdminRole } from '@/lib/admin-auth'
import { adjustUserMembership, type AdjustMembershipMode } from '@/lib/admin/commands'
import { getClientIp } from '@/lib/rate-limit'

interface MembershipBody {
  mode?: unknown
  planCode?: unknown
  expireAt?: unknown
  reason?: unknown
}

export const POST = apiHandler(async (
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) => {
  const guard = await requireAdminRole(ADMIN_ROLE.OPERATION)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  const { id } = await ctx.params

  let body: MembershipBody
  try {
    body = (await request.json()) as MembershipBody
  } catch {
    throw new ApiError('INVALID_PARAMS', { code: 'BODY_PARSE_FAILED', field: 'body' })
  }

  const mode = body.mode === 'set' ? 'set' : body.mode === 'extend' ? 'extend' : null
  if (!mode) {
    throw new ApiError('INVALID_PARAMS', { code: 'MODE_REQUIRED', field: 'mode' })
  }

  const result = await adjustUserMembership({
    adminId: admin.id,
    userId: id,
    mode: mode as AdjustMembershipMode,
    planCode: typeof body.planCode === 'string' ? body.planCode : undefined,
    expireAt: typeof body.expireAt === 'string' ? body.expireAt : undefined,
    reason: typeof body.reason === 'string' ? body.reason : '',
    ip: getClientIp(request),
  })

  return NextResponse.json(result)
})
