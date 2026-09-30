/**
 * 编辑 / 启停 / 设默认 供应商
 * PUT /api/admin/providers/[id]
 *
 * body: { provider: {...}, reason: string }
 * 权限：operation 及以上
 *
 * 设默认时在事务内取消旧默认，保证平台默认供应商全局唯一。
 */
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { ADMIN_ROLE, requireAdminRole } from '@/lib/admin-auth'
import { upsertProvider, type ProviderInput } from '@/lib/admin/commands'
import { getClientIp } from '@/lib/rate-limit'

export const PUT = apiHandler(async (
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) => {
  const guard = await requireAdminRole(ADMIN_ROLE.OPERATION)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  const { id } = await ctx.params

  let body: { provider?: unknown; reason?: unknown }
  try {
    body = (await request.json()) as { provider?: unknown; reason?: unknown }
  } catch {
    throw new ApiError('INVALID_PARAMS', { code: 'BODY_PARSE_FAILED', field: 'body' })
  }

  const record = (body.provider ?? {}) as Record<string, unknown>
  const providerInput: ProviderInput = {
    // code 不可修改，更新时以库中现有值为准
    code: typeof record.code === 'string' ? record.code : '',
    name: typeof record.name === 'string' ? record.name : '',
    ...(record.isDefault !== undefined ? { isDefault: record.isDefault === true } : {}),
    ...(record.isActive !== undefined ? { isActive: record.isActive === true } : {}),
    ...(typeof record.sortOrder === 'number' ? { sortOrder: record.sortOrder } : {}),
    ...(record.config !== undefined ? { config: record.config as ProviderInput['config'] } : {}),
  }

  const provider = await upsertProvider({
    adminId: admin.id,
    providerId: id,
    provider: providerInput,
    reason: typeof body.reason === 'string' ? body.reason : '',
    ip: getClientIp(request),
  })

  return NextResponse.json({ provider })
})
