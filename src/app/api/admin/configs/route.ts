/**
 * 系统配置
 * GET /api/admin/configs → 全部配置项
 * PUT /api/admin/configs → 批量写入（body: { entries: [{key,value}], reason })
 *
 * 权限：仅 super
 */
import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { ADMIN_ROLE, requireAdminRole } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import { updateSystemConfigs } from '@/lib/admin/commands'
import { getClientIp } from '@/lib/rate-limit'

export const GET = apiHandler(async () => {
  const guard = await requireAdminRole(ADMIN_ROLE.SUPER)
  if (guard instanceof NextResponse) return guard

  const rows = await prisma.systemConfig.findMany({ orderBy: { key: 'asc' } })
  return NextResponse.json({
    configs: rows.map((row) => ({
      key: row.key,
      value: row.value,
      updatedAt: row.updatedAt.toISOString(),
    })),
  })
})

export const PUT = apiHandler(async (request: NextRequest) => {
  const guard = await requireAdminRole(ADMIN_ROLE.SUPER)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  let body: { entries?: unknown; reason?: unknown }
  try {
    body = (await request.json()) as { entries?: unknown; reason?: unknown }
  } catch {
    throw new ApiError('INVALID_PARAMS', { code: 'BODY_PARSE_FAILED', field: 'body' })
  }

  if (!Array.isArray(body.entries) || body.entries.length === 0) {
    throw new ApiError('INVALID_PARAMS', { code: 'ENTRIES_REQUIRED', field: 'entries' })
  }

  const entries = body.entries.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new ApiError('INVALID_PARAMS', { code: 'ENTRY_INVALID', field: `entries[${index}]` })
    }
    const record = item as Record<string, unknown>
    if (typeof record.key !== 'string' || !record.key.trim()) {
      throw new ApiError('INVALID_PARAMS', { code: 'ENTRY_KEY_REQUIRED', field: `entries[${index}].key` })
    }
    if (record.value === undefined) {
      throw new ApiError('INVALID_PARAMS', { code: 'ENTRY_VALUE_REQUIRED', field: `entries[${index}].value` })
    }
    return {
      key: record.key.trim(),
      value: record.value as Prisma.InputJsonValue,
    }
  })

  const result = await updateSystemConfigs({
    adminId: admin.id,
    entries,
    reason: typeof body.reason === 'string' ? body.reason : '',
    ip: getClientIp(request),
  })

  return NextResponse.json(result)
})
