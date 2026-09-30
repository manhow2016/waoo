/**
 * 管理员登出
 * POST /api/admin/auth/logout
 *
 * 幂等：无论是否已登录都返回成功并清除后台 Cookie。
 */
import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { clearAdminSession } from '@/lib/admin-auth'

export const POST = apiHandler(async () => {
  await clearAdminSession()
  return NextResponse.json({ ok: true })
})
