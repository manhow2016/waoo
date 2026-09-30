/**
 * 管理后台读取查询（所有后台列表/详情的唯一 owner）
 *
 * 统一提供：关键词过滤、状态过滤、分页、以及统计口径，
 * 避免各 route 各写一套 where 条件导致后台与前台口径不一致。
 */
import { prisma } from '@/lib/prisma'
import { SUBSCRIPTION_STATUS } from '@/lib/membership'
import {
  toAdminAccountDto,
  toAdminLogDto,
  toAdminOrderDto,
  toAdminPlanDto,
  toAdminProviderDto,
  toAdminUserDto,
  type AdminAccountDto,
  type AdminLogDto,
  type AdminOrderDto,
  type AdminPageDto,
  type AdminPlanDto,
  type AdminProviderDto,
  type AdminUserDetailDto,
  type AdminUserDto,
} from './mappers'

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 200

export interface PageParams {
  page: number
  pageSize: number
}

/** 归一化分页参数：页码从 1 开始，页大小受上限约束（导出场景会用到较大值） */
export function normalizePageParams(input: {
  page?: unknown
  pageSize?: unknown
}): PageParams {
  const rawPage = typeof input.page === 'string' ? Number.parseInt(input.page, 10) : Number(input.page)
  const rawPageSize =
    typeof input.pageSize === 'string' ? Number.parseInt(input.pageSize, 10) : Number(input.pageSize)

  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1
  const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0
    ? Math.min(Math.floor(rawPageSize), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE

  return { page, pageSize }
}

function activeSubscriptionFilter(now: Date) {
  return {
    status: SUBSCRIPTION_STATUS.ACTIVE,
    expireAt: { gt: now },
  }
}

export interface ListUsersInput extends PageParams {
  search?: string
  status?: 'all' | 'active' | 'banned'
  /** 会员维度：全部 / 仅免费 / 仅付费有效 */
  membership?: 'all' | 'free' | 'paid'
}

export async function listUsers(
  input: ListUsersInput,
  now: Date = new Date(),
): Promise<AdminPageDto<AdminUserDto>> {
  const search = (input.search || '').trim()
  const status = input.status || 'all'
  const membership = input.membership || 'all'

  const where = {
    ...(search
      ? {
          OR: [
            { email: { contains: search } },
            { name: { contains: search } },
          ],
        }
      : {}),
    ...(status === 'banned' ? { isBanned: true } : {}),
    ...(status === 'active' ? { isBanned: false } : {}),
    ...(membership === 'paid'
      ? { subscriptions: { some: activeSubscriptionFilter(now) } }
      : {}),
    ...(membership === 'free'
      ? { NOT: { subscriptions: { some: activeSubscriptionFilter(now) } } }
      : {}),
  }

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: {
        subscriptions: {
          where: activeSubscriptionFilter(now),
          orderBy: { expireAt: 'desc' },
          take: 1,
          include: { plan: true },
        },
      },
    }),
  ])

  return {
    items: users.map((user) => toAdminUserDto(user, user.subscriptions[0] ?? null)),
    total,
    page: input.page,
    pageSize: input.pageSize,
  }
}

export async function getUserDetail(
  userId: string,
  now: Date = new Date(),
): Promise<AdminUserDetailDto | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      subscriptions: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { plan: true, user: { select: { email: true } } },
      },
      _count: { select: { projects: true, tasks: true } },
    },
  })
  if (!user) return null

  const active = user.subscriptions.find(
    (subscription) =>
      subscription.status === SUBSCRIPTION_STATUS.ACTIVE
      && subscription.expireAt.getTime() > now.getTime(),
  ) ?? null

  return {
    ...toAdminUserDto(user, active),
    updatedAt: user.updatedAt.toISOString(),
    projectCount: user._count.projects,
    taskCount: user._count.tasks,
    orders: user.subscriptions.map(toAdminOrderDto),
  }
}

export interface ListOrdersInput extends PageParams {
  search?: string
  status?: 'all' | 'pending' | 'active' | 'expired' | 'cancelled'
  planCode?: string
}

export async function listOrders(
  input: ListOrdersInput,
): Promise<AdminPageDto<AdminOrderDto>> {
  const search = (input.search || '').trim()
  const status = input.status || 'all'
  const planCode = (input.planCode || '').trim()

  const where = {
    ...(search
      ? {
          OR: [
            { orderNo: { contains: search } },
            { user: { email: { contains: search } } },
          ],
        }
      : {}),
    ...(status !== 'all' ? { status } : {}),
    ...(planCode ? { plan: { code: planCode } } : {}),
  }

  const [total, orders] = await Promise.all([
    prisma.subscription.count({ where }),
    prisma.subscription.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: { plan: true, user: { select: { email: true } } },
    }),
  ])

  return {
    items: orders.map(toAdminOrderDto),
    total,
    page: input.page,
    pageSize: input.pageSize,
  }
}

export async function listPlans(): Promise<AdminPlanDto[]> {
  const plans = await prisma.plan.findMany({ orderBy: { sortOrder: 'asc' } })
  return plans.map(toAdminPlanDto)
}

export async function listProviders(): Promise<AdminProviderDto[]> {
  const providers = await prisma.provider.findMany({ orderBy: { sortOrder: 'asc' } })
  return providers.map(toAdminProviderDto)
}

export interface ListAdminLogsInput extends PageParams {
  action?: string
  adminId?: string
  targetId?: string
}

export async function listAdminLogs(
  input: ListAdminLogsInput,
): Promise<AdminPageDto<AdminLogDto>> {
  const action = (input.action || '').trim()
  const adminId = (input.adminId || '').trim()
  const targetId = (input.targetId || '').trim()

  const where = {
    ...(action ? { action } : {}),
    ...(adminId ? { adminId } : {}),
    ...(targetId ? { targetId: { contains: targetId } } : {}),
  }

  const [total, logs] = await Promise.all([
    prisma.adminLog.count({ where }),
    prisma.adminLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: { admin: { select: { username: true } } },
    }),
  ])

  return {
    items: logs.map(toAdminLogDto),
    total,
    page: input.page,
    pageSize: input.pageSize,
  }
}

export interface AdminStatsDto {
  users: {
    total: number
    banned: number
    newLast7Days: number
  }
  memberships: {
    active: number
    byLevel: Array<{ level: number; planCode: string; count: number }>
  }
  orders: {
    pending: number
    paid: number
    cancelled: number
    revenueTotal: number
    revenueLast30Days: number
  }
  providers: {
    total: number
    active: number
    defaultCode: string | null
  }
  plans: {
    total: number
    active: number
  }
}

export async function getAdminStats(now: Date = new Date()): Promise<AdminStatsDto> {
  const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const [
    totalUsers,
    bannedUsers,
    newUsers,
    activeMembers,
    activeByPlan,
    pendingOrders,
    paidOrders,
    cancelledOrders,
    revenueTotal,
    revenueLast30Days,
    providers,
    totalPlans,
    activePlans,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isBanned: true } }),
    prisma.user.count({ where: { createdAt: { gte: last7Days } } }),
    prisma.subscription.count({ where: activeSubscriptionFilter(now) }),
    prisma.subscription.groupBy({
      by: ['planId'],
      where: activeSubscriptionFilter(now),
      _count: { _all: true },
    }),
    prisma.subscription.count({ where: { status: SUBSCRIPTION_STATUS.PENDING } }),
    prisma.subscription.count({ where: { paidAt: { not: null }, status: { not: SUBSCRIPTION_STATUS.CANCELLED } } }),
    prisma.subscription.count({ where: { status: SUBSCRIPTION_STATUS.CANCELLED } }),
    // 已退款（cancelled）的订单不计入收入
    prisma.subscription.aggregate({
      _sum: { amount: true },
      where: { paidAt: { not: null }, status: { not: SUBSCRIPTION_STATUS.CANCELLED } },
    }),
    prisma.subscription.aggregate({
      _sum: { amount: true },
      where: {
        paidAt: { not: null, gte: last30Days },
        status: { not: SUBSCRIPTION_STATUS.CANCELLED },
      },
    }),
    prisma.provider.findMany({ select: { isActive: true, isDefault: true, code: true } }),
    prisma.plan.count(),
    prisma.plan.count({ where: { isActive: true } }),
  ])

  const planIds = activeByPlan.map((row) => row.planId)
  const planRows = planIds.length > 0
    ? await prisma.plan.findMany({
        where: { id: { in: planIds } },
        select: { id: true, code: true, level: true },
      })
    : []
  const planById = new Map(planRows.map((plan) => [plan.id, plan]))

  const byLevel = activeByPlan
    .map((row) => {
      const plan = planById.get(row.planId)
      if (!plan) return null
      return { level: plan.level, planCode: plan.code, count: row._count._all }
    })
    .filter((item): item is { level: number; planCode: string; count: number } => item !== null)
    .sort((a, b) => a.level - b.level)

  return {
    users: { total: totalUsers, banned: bannedUsers, newLast7Days: newUsers },
    memberships: { active: activeMembers, byLevel },
    orders: {
      pending: pendingOrders,
      paid: paidOrders,
      cancelled: cancelledOrders,
      revenueTotal: Number(revenueTotal._sum.amount ?? 0),
      revenueLast30Days: Number(revenueLast30Days._sum.amount ?? 0),
    },
    providers: {
      total: providers.length,
      active: providers.filter((provider) => provider.isActive).length,
      defaultCode: providers.find((provider) => provider.isDefault)?.code ?? null,
    },
    plans: { total: totalPlans, active: activePlans },
  }
}

/** 后台筛选下拉用：套餐 code 列表 */
export async function listPlanOptions(): Promise<Array<{ code: string; name: string }>> {
  const plans = await prisma.plan.findMany({
    orderBy: { sortOrder: 'asc' },
    select: { code: true, name: true },
  })
  return plans
}

/** 管理员账号列表（不返回任何密码相关字段） */
export async function listAdminAccounts(): Promise<AdminAccountDto[]> {
  const admins = await prisma.admin.findMany({ orderBy: { createdAt: 'asc' } })
  return admins.map(toAdminAccountDto)
}
