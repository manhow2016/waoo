/**
 * 供应商列表 / 新增供应商
 * GET  /api/admin/providers → 全量平台供应商
 * POST /api/admin/providers → 新增（isDefault=true 时会自动取消旧默认，保证全局唯一）
 *
 * 权限：operation 及以上
 */
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { ADMIN_ROLE, requireAdminRole } from '@/lib/admin-auth'
import { upsertProvider, type ProviderInput } from '@/lib/admin/commands'
import { listProviders } from '@/lib/admin/queries'
import { getClientIp } from '@/lib/rate-limit'

function readProviderInput(raw: unknown): ProviderInput {
  if (!raw || typeof raw !== 'object') {
    throw new ApiError('INVALID_PARAMS', { code: 'PROVIDER_REQUIRED', field: 'provider' })
  }
  const record = raw as Record<string, unknown>
  return {
    code: typeof record.code === 'string' ? record.code : '',
    name: typeof record.name === 'string' ? record.name : '',
    ...(record.isDefault !== undefined ? { isDefault: record.isDefault === true } : {}),
    ...(record.isActive !== undefined ? { isActive: record.isActive === true } : {}),
    ...(typeof record.sortOrder === 'number' ? { sortOrder: record.sortOrder } : {}),
    ...(record.config !== undefined ? { config: record.config as ProviderInput['config'] } : {}),
  }
}

export const GET = apiHandler(async () => {
  const guard = await requireAdminRole(ADMIN_ROLE.OPERATION)
  if (guard instanceof NextResponse) return guard

  return NextResponse.json({ providers: await listProviders() })
})

export const POST = apiHandler(async (request: NextRequest) => {
  const guard = await requireAdminRole(ADMIN_ROLE.OPERATION)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  let body: { provider?: unknown; reason?: unknown }
  try {
    body = (await request.json()) as { provider?: unknown; reason?: unknown }
  } catch {
    throw new ApiError('INVALID_PARAMS', { code: 'BODY_PARSE_FAILED', field: 'body' })
  }

  const provider = await upsertProvider({
    adminId: admin.id,
    provider: readProviderInput(body.provider),
    reason: typeof body.reason === 'string' ? body.reason : '',
    ip: getClientIp(request),
  })

  return NextResponse.json({ provider })
})
