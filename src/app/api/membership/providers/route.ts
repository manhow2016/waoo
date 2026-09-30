/**
 * 当前用户可用供应商列表
 * GET /api/membership/providers
 *
 * 返回全部上架的平台级供应商，并标注 locked：
 * - locked = false：当前会员等级可用
 * - locked = true ：需要升级会员后才能使用（设置中心置灰 + 升级引导）
 *
 * 注意：用户自定义供应商（customProviders）不在平台供应商表内，
 * 其准入由同一个 allowAllProviders 开关控制，不在此接口返回。
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiHandler } from '@/lib/api-errors'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { getProviderAccess, serializeProvider } from '@/lib/provider-access'

export const GET = apiHandler(async () => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const access = await getProviderAccess(session.user.id)
  const providers = await prisma.provider.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  })
  const allowedCodes = new Set(access.allowedProviderCodes)

  return NextResponse.json({
    allowAllProviders: access.allowAllProviders,
    defaultProviderCode: access.defaultProviderCode,
    providers: providers.map((provider) => ({
      ...serializeProvider(provider),
      locked: !allowedCodes.has(provider.code),
    })),
  })
})
