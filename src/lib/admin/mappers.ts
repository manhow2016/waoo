/**
 * 管理后台 DTO 映射（后台接口唯一的出参格式 owner）
 *
 * 后台所有列表/详情都经过这里，保证：
 * - 金额（Prisma Decimal）统一转 number
 * - 时间统一转 ISO 字符串
 * - 不向前端泄露密码哈希、加密后的 API Key 等敏感字段
 */
import type {
  Admin,
  AdminLog,
  Plan,
  Provider,
  Subscription,
  User,
} from '@prisma/client'

export interface AdminUserMembershipDto {
  level: number
  planCode: string | null
  planName: string | null
  expireAt: string | null
  isActive: boolean
  allowAllProviders: boolean
}

export interface AdminUserDto {
  id: string
  email: string
  name: string | null
  createdAt: string
  isBanned: boolean
  bannedReason: string | null
  bannedAt: string | null
  membership: AdminUserMembershipDto
}

export interface AdminUserDetailDto extends AdminUserDto {
  updatedAt: string
  projectCount: number
  taskCount: number
  orders: AdminOrderDto[]
}

export interface AdminOrderDto {
  id: string
  orderNo: string
  status: string
  planCode: string
  planName: string
  level: number
  amount: number
  payMethod: string | null
  startAt: string
  expireAt: string
  paidAt: string | null
  createdAt: string
  userId: string
  userEmail: string | null
}

export interface AdminPlanDto {
  id: string
  code: string
  name: string
  level: number
  price: number
  durationDay: number
  allowAllProviders: boolean
  features: unknown
  sortOrder: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface AdminProviderDto {
  id: string
  code: string
  name: string
  isDefault: boolean
  isActive: boolean
  sortOrder: number
  config: unknown
  createdAt: string
  updatedAt: string
}

export interface AdminLogDto {
  id: string
  adminId: string
  adminUsername: string | null
  action: string
  targetType: string | null
  targetId: string | null
  before: unknown
  after: unknown
  reason: string | null
  ip: string | null
  createdAt: string
}

/** 管理员账号 DTO（绝不包含 passwordHash） */
export interface AdminAccountDto {
  id: string
  username: string
  role: string
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
}

export function toAdminAccountDto(admin: Admin): AdminAccountDto {
  return {
    id: admin.id,
    username: admin.username,
    role: admin.role,
    isActive: admin.isActive,
    lastLoginAt: toIso(admin.lastLoginAt),
    createdAt: admin.createdAt.toISOString(),
  }
}

export interface AdminPageDto<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

/** 由「当前有效订阅」推导出的会员状态（与 src/lib/membership.ts 口径一致） */
export function resolveMembershipDto(
  subscription: (Subscription & { plan: Plan }) | null,
): AdminUserMembershipDto {
  if (!subscription) {
    return {
      level: 0,
      planCode: null,
      planName: null,
      expireAt: null,
      isActive: false,
      allowAllProviders: false,
    }
  }

  return {
    level: subscription.plan.level,
    planCode: subscription.plan.code,
    planName: subscription.plan.name,
    expireAt: toIso(subscription.expireAt),
    isActive: true,
    allowAllProviders: subscription.plan.allowAllProviders,
  }
}

export function toAdminUserDto(
  user: User,
  membership: (Subscription & { plan: Plan }) | null,
): AdminUserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
    isBanned: user.isBanned,
    bannedReason: user.bannedReason,
    bannedAt: toIso(user.bannedAt),
    membership: resolveMembershipDto(membership),
  }
}

export function toAdminOrderDto(
  subscription: Subscription & { plan: Plan; user?: { email: string | null } | null },
): AdminOrderDto {
  return {
    id: subscription.id,
    orderNo: subscription.orderNo,
    status: subscription.status,
    planCode: subscription.plan.code,
    planName: subscription.plan.name,
    level: subscription.plan.level,
    amount: Number(subscription.amount),
    payMethod: subscription.payMethod,
    startAt: subscription.startAt.toISOString(),
    expireAt: subscription.expireAt.toISOString(),
    paidAt: toIso(subscription.paidAt),
    createdAt: subscription.createdAt.toISOString(),
    userId: subscription.userId,
    userEmail: subscription.user?.email ?? null,
  }
}

export function toAdminPlanDto(plan: Plan): AdminPlanDto {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    level: plan.level,
    price: Number(plan.price),
    durationDay: plan.durationDay,
    allowAllProviders: plan.allowAllProviders,
    features: plan.features,
    sortOrder: plan.sortOrder,
    isActive: plan.isActive,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  }
}

export function toAdminProviderDto(provider: Provider): AdminProviderDto {
  return {
    id: provider.id,
    code: provider.code,
    name: provider.name,
    isDefault: provider.isDefault,
    isActive: provider.isActive,
    sortOrder: provider.sortOrder,
    config: provider.config,
    createdAt: provider.createdAt.toISOString(),
    updatedAt: provider.updatedAt.toISOString(),
  }
}

export function toAdminLogDto(
  log: AdminLog & { admin?: { username: string } | null },
): AdminLogDto {
  return {
    id: log.id,
    adminId: log.adminId,
    adminUsername: log.admin?.username ?? null,
    action: log.action,
    targetType: log.targetType,
    targetId: log.targetId,
    before: log.before,
    after: log.after,
    reason: log.reason,
    ip: log.ip,
    createdAt: log.createdAt.toISOString(),
  }
}
