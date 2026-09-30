/**
 * 封禁 / 解封用户
 * POST /api/admin/users/[id]/ban
 *
 * body: { banned: boolean, reason: string }
 * 权限：operation 及以上
 *
 * 封禁后：新登录被拒绝；已签发的 JWT 会话在下次校验时立即失效（auth.ts jwt 回调每次读库）。
 */
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { ADMIN_ROLE, requireAdminRole } from '@/lib/admin-auth'
import { setUserBanned } from '@/lib/admin/commands'
import { getClientIp } from '@/lib/rate-limit'

interface BanBody {
  banned?: unknown
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

  let body: BanBody
  try {
    body = (await request.json()) as BanBody
  } catch {
    throw new ApiError('INVALID_PARAMS', { code: 'BODY_PARSE_FAILED', field: 'body' })
  }

  if (typeof body.banned !== 'boolean') {
    throw new ApiError('INVALID_PARAMS', { code: 'BANNED_FLAG_REQUIRED', field: 'banned' })
  }
  const reason = typeof body.reason === 'string' ? body.reason : ''

  const result = await setUserBanned({
    adminId: admin.id,
    userId: id,
    banned: body.banned,
    reason,
    ip: getClientIp(request),
  })

  return NextResponse.json({ user: result })
})
