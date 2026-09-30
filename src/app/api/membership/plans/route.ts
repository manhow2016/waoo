/**
 * 会员套餐列表
 * GET /api/membership/plans
 *
 * 返回上架中的套餐（含价格、时长、权益 key）。
 * 文案与权益描述由前端 messages/<locale>/membership.json 按 plan code 渲染，保证中英文同步。
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiHandler } from '@/lib/api-errors'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { serializePlan } from '@/lib/membership'

export const GET = apiHandler(async () => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  })

  return NextResponse.json({ plans: plans.map(serializePlan) })
})
