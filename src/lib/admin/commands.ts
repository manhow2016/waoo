/**
 * 管理后台写操作（后台所有写命令的唯一 owner）
 *
 * 约定：
 * 1. 每个命令都必须带 adminId 与 reason，并写入 AdminLog（含操作前后值）——审计不可省略。
 * 2. 涉及多张表的操作必须走事务（退款、设默认供应商、调整会员）。
 * 3. 幂等优先：退款/补单重复调用不产生第二次副作用。
 */
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ADMIN_ACTION, ADMIN_TARGET_TYPE, writeAdminLog } from '@/lib/admin-audit'
import { setSystemConfig, getSystemConfig, isValidSystemConfigKey } from '@/lib/system-config'
import {
  getPaymentChannelSpec,
  findMissingRequiredFields,
  PAYMENT_CHANNEL_METHODS,
} from '@/lib/payment/channels'
import {
  encryptChannelValues,
  getEnabledPaymentMethods,
  getPaymentChannelConfigKey,
  readChannelValues,
  readStoredChannelValues,
} from '@/lib/payment/config'
import { listImplementedPaymentMethods, PAYMENT_METHOD } from '@/lib/payment'
import {
  activateSubscriptionOrder,
  createSubscriptionOrder,
} from '@/lib/subscription-order'
import { SUBSCRIPTION_STATUS } from '@/lib/membership'
import {
  isAdminRole,
  validateAdminPassword,
  hashAdminPassword,
  ADMIN_ROLE,
} from '@/lib/admin-auth'
import {
  toAdminAccountDto,
  toAdminOrderDto,
  toAdminPlanDto,
  toAdminProviderDto,
  type AdminAccountDto,
  type AdminOrderDto,
  type AdminPlanDto,
  type AdminProviderDto,
} from './mappers'
import bcrypt from 'bcryptjs'

export interface AdminCommandContext {
  adminId: string
  reason: string
  ip?: string | null
}

function requireReason(reason: string | undefined | null): string {
  const normalized = (reason || '').trim()
  if (!normalized) {
    throw new Error('INVALID_PARAMS: 该操作必须填写原因（reason）')
  }
  return normalized
}

// ============================================================
// 用户封禁
// ============================================================

export async function setUserBanned(input: AdminCommandContext & {
  userId: string
  banned: boolean
}): Promise<{ userId: string; isBanned: boolean }> {
  const reason = requireReason(input.reason)

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, isBanned: true, bannedReason: true, bannedAt: true },
  })
  if (!user) throw new Error(`NOT_FOUND: user "${input.userId}"`)

  if (user.isBanned === input.banned) {
    return { userId: user.id, isBanned: user.isBanned }
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: input.banned
      ? { isBanned: true, bannedReason: reason, bannedAt: new Date() }
      : { isBanned: false, bannedReason: null, bannedAt: null },
  })

  await writeAdminLog({
    adminId: input.adminId,
    action: input.banned ? ADMIN_ACTION.BAN_USER : ADMIN_ACTION.UNBAN_USER,
    targetType: ADMIN_TARGET_TYPE.USER,
    targetId: user.id,
    before: { isBanned: user.isBanned, bannedReason: user.bannedReason, bannedAt: user.bannedAt?.toISOString() ?? null },
    after: { isBanned: updated.isBanned, bannedReason: updated.bannedReason, bannedAt: updated.bannedAt?.toISOString() ?? null },
    reason,
    ip: input.ip ?? null,
  })

  return { userId: updated.id, isBanned: updated.isBanned }
}

// ============================================================
// 手动调整会员
// ============================================================

export type AdjustMembershipMode = 'extend' | 'set'

/**
 * extend：按套餐时长新建订单并开通（从原到期时间顺延）
 * set：直接改写当前有效订阅的到期时间（可同时切换套餐），用于客服纠错
 */
export async function adjustUserMembership(input: AdminCommandContext & {
  userId: string
  mode: AdjustMembershipMode
  planCode?: string
  expireAt?: string
}): Promise<{ mode: AdjustMembershipMode; order?: AdminOrderDto; expireAt?: string }> {
  const reason = requireReason(input.reason)

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true },
  })
  if (!user) throw new Error(`NOT_FOUND: user "${input.userId}"`)

  if (input.mode === 'extend') {
    const planCode = (input.planCode || '').trim()
    if (!planCode) throw new Error('INVALID_PARAMS: mode=extend 需要提供 planCode')

    const created = await createSubscriptionOrder({ userId: user.id, planCode })
    const activated = await activateSubscriptionOrder({
      orderNo: created.subscription.orderNo,
      payMethod: 'manual',
    })

    await writeAdminLog({
      adminId: input.adminId,
      action: ADMIN_ACTION.GRANT_MEMBERSHIP,
      targetType: ADMIN_TARGET_TYPE.ORDER,
      targetId: activated.subscription.orderNo,
      before: {
        orderNo: created.subscription.orderNo,
        status: created.subscription.status,
        expireAt: created.subscription.expireAt.toISOString(),
      },
      after: {
        status: activated.subscription.status,
        expireAt: activated.subscription.expireAt.toISOString(),
        planCode,
      },
      reason,
      ip: input.ip ?? null,
    })

    return {
      mode: input.mode,
      order: toAdminOrderDto({ ...activated.subscription, plan: activated.plan, user: { email: user.email } }),
    }
  }

  const expireAtRaw = (input.expireAt || '').trim()
  if (!expireAtRaw) throw new Error('INVALID_PARAMS: mode=set 需要提供 expireAt')
  const expireAt = new Date(expireAtRaw)
  if (Number.isNaN(expireAt.getTime())) {
    throw new Error('INVALID_PARAMS: expireAt 不是合法时间')
  }

  const current = await prisma.subscription.findFirst({
    where: {
      userId: user.id,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      expireAt: { gt: new Date() },
    },
    orderBy: { expireAt: 'desc' },
    include: { plan: true },
  })
  if (!current) {
    throw new Error('INVALID_PARAMS: 该账号当前没有有效订阅，请先用 extend 模式开通')
  }

  const nextPlan = input.planCode
    ? await prisma.plan.findUnique({ where: { code: input.planCode } })
    : null
  if (input.planCode && !nextPlan) {
    throw new Error(`NOT_FOUND: plan "${input.planCode}"`)
  }

  const updated = await prisma.$transaction(async (tx) => {
    const subscription = await tx.subscription.update({
      where: { id: current.id },
      data: {
        expireAt,
        ...(nextPlan ? { planId: nextPlan.id } : {}),
      },
      include: { plan: true },
    })
    return subscription
  })

  await writeAdminLog({
    adminId: input.adminId,
    action: ADMIN_ACTION.GRANT_MEMBERSHIP,
    targetType: ADMIN_TARGET_TYPE.ORDER,
    targetId: updated.orderNo,
    before: { expireAt: current.expireAt.toISOString(), planCode: current.plan.code },
    after: { expireAt: updated.expireAt.toISOString(), planCode: updated.plan.code },
    reason,
    ip: input.ip ?? null,
  })

  return { mode: input.mode, expireAt: updated.expireAt.toISOString() }
}

// ============================================================
// 订单退款 / 补单
// ============================================================

/** 退款：事务内取消订阅并写审计；重复调用幂等 */
export async function refundOrder(input: AdminCommandContext & {
  subscriptionId: string
}): Promise<{ orderNo: string; status: string; alreadyRefunded: boolean }> {
  const reason = requireReason(input.reason)

  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.subscription.findUnique({
      where: { id: input.subscriptionId },
      include: { plan: true },
    })
    if (!order) throw new Error(`NOT_FOUND: subscription "${input.subscriptionId}"`)
    if (!order.paidAt) {
      throw new Error('INVALID_PARAMS: 该订单尚未支付，无法退款')
    }
    if (order.status === SUBSCRIPTION_STATUS.CANCELLED) {
      return { order, alreadyRefunded: true }
    }

    const updated = await tx.subscription.update({
      where: { id: order.id },
      data: { status: SUBSCRIPTION_STATUS.CANCELLED },
      include: { plan: true },
    })
    return { order: updated, alreadyRefunded: false }
  })

  if (!result.alreadyRefunded) {
    await writeAdminLog({
      adminId: input.adminId,
      action: ADMIN_ACTION.REFUND_ORDER,
      targetType: ADMIN_TARGET_TYPE.ORDER,
      targetId: result.order.orderNo,
      before: { status: SUBSCRIPTION_STATUS.ACTIVE, expireAt: result.order.expireAt.toISOString() },
      after: { status: result.order.status, expireAt: result.order.expireAt.toISOString() },
      reason,
      ip: input.ip ?? null,
    })
  }

  return {
    orderNo: result.order.orderNo,
    status: result.order.status,
    alreadyRefunded: result.alreadyRefunded,
  }
}

/** 补单：为「渠道已收款但系统未开通」的订单补开通；已开通的订单不会重复开通 */
export async function repairOrder(input: AdminCommandContext & {
  orderNo: string
}): Promise<{ orderNo: string; status: string; alreadyProcessed: boolean }> {
  const reason = requireReason(input.reason)

  const order = await prisma.subscription.findUnique({
    where: { orderNo: input.orderNo },
    include: { plan: true },
  })
  if (!order) throw new Error(`NOT_FOUND: subscription order "${input.orderNo}"`)
  if (order.status === SUBSCRIPTION_STATUS.CANCELLED) {
    throw new Error('CONFLICT: 已退款的订单不能补单，请新建订单')
  }

  if (order.paidAt) {
    return { orderNo: order.orderNo, status: order.status, alreadyProcessed: true }
  }

  const activated = await activateSubscriptionOrder({
    orderNo: order.orderNo,
    payMethod: order.payMethod || 'manual',
  })

  await writeAdminLog({
    adminId: input.adminId,
    // 补单与普通开通区分开，便于审计追溯
    action: ADMIN_ACTION.REPAIR_ORDER,
    targetType: ADMIN_TARGET_TYPE.ORDER,
    targetId: order.orderNo,
    before: { status: order.status, paidAt: null, expireAt: order.expireAt.toISOString() },
    after: {
      status: activated.subscription.status,
      paidAt: activated.subscription.paidAt?.toISOString() ?? null,
      expireAt: activated.subscription.expireAt.toISOString(),
    },
    reason,
    ip: input.ip ?? null,
  })

  return {
    orderNo: order.orderNo,
    status: activated.subscription.status,
    alreadyProcessed: activated.alreadyProcessed,
  }
}

// ============================================================
// 套餐管理
// ============================================================

export interface PlanInput {
  code: string
  name: string
  level: number
  price: number
  durationDay: number
  allowAllProviders: boolean
  features?: Prisma.InputJsonValue | null
  sortOrder?: number
  isActive?: boolean
}

function validatePlanInput(input: PlanInput) {
  if (!input.code.trim()) throw new Error('INVALID_PARAMS: code 不能为空')
  if (!input.name.trim()) throw new Error('INVALID_PARAMS: name 不能为空')
  if (!Number.isInteger(input.level) || input.level < 0) {
    throw new Error('INVALID_PARAMS: level 必须是不小于 0 的整数')
  }
  if (!Number.isFinite(input.price) || input.price < 0) {
    throw new Error('INVALID_PARAMS: price 必须是非负数')
  }
  if (!Number.isInteger(input.durationDay) || input.durationDay < 0) {
    throw new Error('INVALID_PARAMS: durationDay 必须是不小于 0 的整数')
  }
}

export async function createPlan(input: AdminCommandContext & {
  plan: PlanInput
}): Promise<AdminPlanDto> {
  const reason = requireReason(input.reason)
  validatePlanInput(input.plan)

  const existing = await prisma.plan.findUnique({ where: { code: input.plan.code } })
  if (existing) throw new Error(`CONFLICT: plan code "${input.plan.code}" 已存在`)

  const created = await prisma.plan.create({
    data: {
      code: input.plan.code.trim(),
      name: input.plan.name.trim(),
      level: input.plan.level,
      price: input.plan.price,
      durationDay: input.plan.durationDay,
      allowAllProviders: input.plan.allowAllProviders,
      features: input.plan.features ?? undefined,
      sortOrder: input.plan.sortOrder ?? 0,
      isActive: input.plan.isActive ?? true,
    },
  })

  await writeAdminLog({
    adminId: input.adminId,
    action: ADMIN_ACTION.UPDATE_PLAN,
    targetType: ADMIN_TARGET_TYPE.PLAN,
    targetId: created.id,
    before: null,
    after: toAdminPlanDto(created) as unknown as Prisma.InputJsonValue,
    reason,
    ip: input.ip ?? null,
  })

  return toAdminPlanDto(created)
}

/** 更新套餐；code 不可修改（订单与订阅都按 code 关联展示口径） */
export async function updatePlan(input: AdminCommandContext & {
  planId: string
  plan: Partial<PlanInput>
}): Promise<AdminPlanDto> {
  const reason = requireReason(input.reason)

  const before = await prisma.plan.findUnique({ where: { id: input.planId } })
  if (!before) throw new Error(`NOT_FOUND: plan "${input.planId}"`)

  const updated = await prisma.plan.update({
    where: { id: before.id },
    data: {
      ...(input.plan.name !== undefined ? { name: input.plan.name.trim() } : {}),
      ...(input.plan.level !== undefined ? { level: input.plan.level } : {}),
      ...(input.plan.price !== undefined ? { price: input.plan.price } : {}),
      ...(input.plan.durationDay !== undefined ? { durationDay: input.plan.durationDay } : {}),
      ...(input.plan.allowAllProviders !== undefined
        ? { allowAllProviders: input.plan.allowAllProviders }
        : {}),
      ...(input.plan.features !== undefined ? { features: input.plan.features ?? undefined } : {}),
      ...(input.plan.sortOrder !== undefined ? { sortOrder: input.plan.sortOrder } : {}),
      ...(input.plan.isActive !== undefined ? { isActive: input.plan.isActive } : {}),
    },
  })

  await writeAdminLog({
    adminId: input.adminId,
    action: ADMIN_ACTION.UPDATE_PLAN,
    targetType: ADMIN_TARGET_TYPE.PLAN,
    targetId: updated.id,
    before: toAdminPlanDto(before) as unknown as Prisma.InputJsonValue,
    after: toAdminPlanDto(updated) as unknown as Prisma.InputJsonValue,
    reason,
    ip: input.ip ?? null,
  })

  return toAdminPlanDto(updated)
}

/** 下架套餐（软删除）：仍有效的订阅不受影响，只是不再出现在售卖列表 */
export async function deactivatePlan(input: AdminCommandContext & {
  planId: string
}): Promise<AdminPlanDto> {
  return updatePlan({
    adminId: input.adminId,
    reason: input.reason,
    ip: input.ip,
    planId: input.planId,
    plan: { isActive: false },
  })
}

// ============================================================
// 供应商管理
// ============================================================

export interface ProviderInput {
  code: string
  name: string
  isDefault?: boolean
  isActive?: boolean
  sortOrder?: number
  config?: Prisma.InputJsonValue | null
}

/**
 * 新增/更新平台供应商。
 * 设为默认时在同一事务内取消其他供应商的默认标记，保证「全局唯一默认」。
 */
export async function upsertProvider(input: AdminCommandContext & {
  providerId?: string
  provider: ProviderInput
}): Promise<AdminProviderDto> {
  const reason = requireReason(input.reason)
  const code = input.provider.code.trim()
  if (!code) throw new Error('INVALID_PARAMS: code 不能为空')

  const providerId = input.providerId?.trim()
  const before = providerId
    ? await prisma.provider.findUnique({ where: { id: providerId } })
    : null
  if (providerId && !before) throw new Error(`NOT_FOUND: provider "${providerId}"`)

  if (!before) {
    const duplicated = await prisma.provider.findUnique({ where: { code } })
    if (duplicated) throw new Error(`CONFLICT: provider code "${code}" 已存在`)
  }

  const saved = await prisma.$transaction(async (tx) => {
    const wantsDefault = input.provider.isDefault === true
    const currentId = before?.id

    if (wantsDefault) {
      await tx.provider.updateMany({
        where: { isDefault: true, ...(currentId ? { id: { not: currentId } } : {}) },
        data: { isDefault: false },
      })
    }

    if (before) {
      return tx.provider.update({
        where: { id: before.id },
        data: {
          name: input.provider.name.trim(),
          ...(input.provider.isDefault !== undefined ? { isDefault: input.provider.isDefault } : {}),
          ...(input.provider.isActive !== undefined ? { isActive: input.provider.isActive } : {}),
          ...(input.provider.sortOrder !== undefined ? { sortOrder: input.provider.sortOrder } : {}),
          ...(input.provider.config !== undefined
            ? { config: input.provider.config ?? undefined }
            : {}),
        },
      })
    }

    return tx.provider.create({
      data: {
        code,
        name: input.provider.name.trim(),
        isDefault: input.provider.isDefault ?? false,
        isActive: input.provider.isActive ?? true,
        sortOrder: input.provider.sortOrder ?? 0,
        config: input.provider.config ?? undefined,
      },
    })
  })

  await writeAdminLog({
    adminId: input.adminId,
    action: ADMIN_ACTION.UPDATE_PROVIDER,
    targetType: ADMIN_TARGET_TYPE.PROVIDER,
    targetId: saved.id,
    before: before ? (toAdminProviderDto(before) as unknown as Prisma.InputJsonValue) : null,
    after: toAdminProviderDto(saved) as unknown as Prisma.InputJsonValue,
    reason,
    ip: input.ip ?? null,
  })

  return toAdminProviderDto(saved)
}

// ============================================================
// 系统配置
// ============================================================

export async function updateSystemConfigs(input: AdminCommandContext & {
  entries: Array<{ key: string; value: Prisma.InputJsonValue }>
}): Promise<{ updatedKeys: string[] }> {
  const reason = requireReason(input.reason)
  if (input.entries.length === 0) {
    throw new Error('INVALID_PARAMS: entries 不能为空')
  }

  const beforeRows = await prisma.systemConfig.findMany({
    where: { key: { in: input.entries.map((entry) => entry.key) } },
  })
  const beforeByKey = new Map(beforeRows.map((row) => [row.key, row.value]))

  const invalidKeys = input.entries
    .map((entry) => entry.key)
    .filter((key) => !isValidSystemConfigKey(key))
  if (invalidKeys.length > 0) {
    throw new Error(`INVALID_PARAMS: 非法配置键 ${invalidKeys.join(', ')}`)
  }

  const updatedKeys: string[] = []
  for (const entry of input.entries) {
    await setSystemConfig(entry.key, entry.value)
    updatedKeys.push(entry.key)

    await writeAdminLog({
      adminId: input.adminId,
      action: ADMIN_ACTION.UPDATE_CONFIG,
      targetType: ADMIN_TARGET_TYPE.CONFIG,
      targetId: entry.key,
      before: { value: (beforeByKey.get(entry.key) ?? null) as Prisma.InputJsonValue },
      after: { value: entry.value },
      reason,
      ip: input.ip ?? null,
    })
  }

  return { updatedKeys }
}

/** 供 route 层校验角色字符串 */
export function normalizeAdminRoleOrNull(role: string | null | undefined) {
  return isAdminRole(role) ? role : null
}

// ============================================================
// 管理员账号
//
// 关键约束（防止把系统锁死）：
// 1. 不能停用自己；
// 2. 不能让「最后一个启用中的超级管理员」被停用或被降级；
// 3. 改密/重置密码都会自增 sessionVersion，使旧的后台会话立即失效。
// ============================================================

const ADMIN_USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,32}$/

function normalizeAdminUsername(value: unknown): string {
  const username = typeof value === 'string' ? value.trim() : ''
  if (!ADMIN_USERNAME_PATTERN.test(username)) {
    throw new Error('INVALID_PARAMS: 用户名需为 3-32 位字母、数字、点、下划线或连字符')
  }
  return username
}

function assertPasswordAcceptable(password: unknown): string {
  const result = validateAdminPassword(password)
  if (!result.ok) {
    throw new Error(`INVALID_PARAMS: ${result.code}`)
  }
  return password as string
}

/** 目标是否是「唯一仍在启用的超级管理员」 */
async function isLastActiveSuper(adminId: string): Promise<boolean> {
  const admin = await prisma.admin.findUnique({
    where: { id: adminId },
    select: { role: true, isActive: true },
  })
  if (!admin || admin.role !== ADMIN_ROLE.SUPER || !admin.isActive) return false

  const others = await prisma.admin.count({
    where: { role: ADMIN_ROLE.SUPER, isActive: true, id: { not: adminId } },
  })
  return others === 0
}

export async function createAdminAccount(input: AdminCommandContext & {
  username: string
  password: string
  role: string
}): Promise<AdminAccountDto> {
  const reason = requireReason(input.reason)
  const username = normalizeAdminUsername(input.username)
  const password = assertPasswordAcceptable(input.password)
  if (!isAdminRole(input.role)) {
    throw new Error('INVALID_PARAMS: role 必须是 support / operation / super')
  }

  const existing = await prisma.admin.findUnique({ where: { username } })
  if (existing) throw new Error(`CONFLICT: 管理员 ${username} 已存在`)

  const created = await prisma.admin.create({
    data: {
      username,
      passwordHash: await hashAdminPassword(password),
      role: input.role,
      isActive: true,
    },
  })

  await writeAdminLog({
    adminId: input.adminId,
    action: ADMIN_ACTION.CREATE_ADMIN,
    targetType: ADMIN_TARGET_TYPE.ADMIN,
    targetId: created.id,
    before: null,
    after: { username: created.username, role: created.role, isActive: created.isActive },
    reason,
    ip: input.ip ?? null,
  })

  return toAdminAccountDto(created)
}

/** 修改他人角色 / 启停 */
export async function updateAdminAccount(input: AdminCommandContext & {
  targetAdminId: string
  role?: string
  isActive?: boolean
}): Promise<AdminAccountDto> {
  const reason = requireReason(input.reason)

  const before = await prisma.admin.findUnique({ where: { id: input.targetAdminId } })
  if (!before) throw new Error(`NOT_FOUND: admin "${input.targetAdminId}"`)

  const nextRole = input.role === undefined ? before.role : input.role
  if (!isAdminRole(nextRole)) {
    throw new Error('INVALID_PARAMS: role 必须是 support / operation / super')
  }
  const nextActive = input.isActive === undefined ? before.isActive : input.isActive

  if (before.id === input.adminId && nextActive === false) {
    throw new Error('INVALID_PARAMS: 不能停用当前登录的管理员账号')
  }

  const losingSuper =
    before.role === ADMIN_ROLE.SUPER
    && before.isActive
    && (nextRole !== ADMIN_ROLE.SUPER || nextActive === false)
  if (losingSuper && (await isLastActiveSuper(before.id))) {
    throw new Error('CONFLICT: 不能停用或降级最后一个超级管理员，请先新增另一个超级管理员')
  }

  const unchanged = nextRole === before.role && nextActive === before.isActive
  if (unchanged) return toAdminAccountDto(before)

  const updated = await prisma.admin.update({
    where: { id: before.id },
    data: {
      role: nextRole,
      isActive: nextActive,
      // 停用时自增会话版本，确保其已有后台会话立即失效
      ...(nextActive === false ? { sessionVersion: { increment: 1 } } : {}),
    },
  })

  await writeAdminLog({
    adminId: input.adminId,
    action: ADMIN_ACTION.UPDATE_ADMIN,
    targetType: ADMIN_TARGET_TYPE.ADMIN,
    targetId: updated.id,
    before: { username: before.username, role: before.role, isActive: before.isActive },
    after: { username: updated.username, role: updated.role, isActive: updated.isActive },
    reason,
    ip: input.ip ?? null,
  })

  return toAdminAccountDto(updated)
}

/** 超级管理员重置他人密码（会立即踢掉该账号的所有后台会话） */
export async function resetAdminPassword(input: AdminCommandContext & {
  targetAdminId: string
  newPassword: string
}): Promise<{ id: string; username: string }> {
  const reason = requireReason(input.reason)
  const password = assertPasswordAcceptable(input.newPassword)

  const target = await prisma.admin.findUnique({ where: { id: input.targetAdminId } })
  if (!target) throw new Error(`NOT_FOUND: admin "${input.targetAdminId}"`)

  const updated = await prisma.admin.update({
    where: { id: target.id },
    data: {
      passwordHash: await hashAdminPassword(password),
      sessionVersion: { increment: 1 },
    },
  })

  await writeAdminLog({
    adminId: input.adminId,
    action: ADMIN_ACTION.RESET_ADMIN_PASSWORD,
    targetType: ADMIN_TARGET_TYPE.ADMIN,
    targetId: updated.id,
    before: { username: target.username, sessionVersion: target.sessionVersion },
    after: { username: updated.username, sessionVersion: updated.sessionVersion },
    reason,
    ip: input.ip ?? null,
  })

  return { id: updated.id, username: updated.username }
}

/**
 * 管理员自助修改密码。
 * 修改成功后当前会话也会失效（sessionVersion 自增），前端应引导重新登录。
 */
export async function changeOwnPassword(input: {
  adminId: string
  currentPassword: string
  newPassword: string
  ip?: string | null
}): Promise<{ id: string; username: string }> {
  const admin = await prisma.admin.findUnique({ where: { id: input.adminId } })
  if (!admin) throw new Error(`NOT_FOUND: admin "${input.adminId}"`)

  if (typeof input.currentPassword !== 'string' || !input.currentPassword) {
    throw new Error('INVALID_PARAMS: 请输入当前密码')
  }
  const valid = await bcrypt.compare(input.currentPassword, admin.passwordHash)
  if (!valid) {
    throw new Error('INVALID_PARAMS: 当前密码不正确')
  }

  const password = assertPasswordAcceptable(input.newPassword)
  if (await bcrypt.compare(password, admin.passwordHash)) {
    throw new Error('INVALID_PARAMS: 新密码不能与当前密码相同')
  }

  const updated = await prisma.admin.update({
    where: { id: admin.id },
    data: {
      passwordHash: await hashAdminPassword(password),
      sessionVersion: { increment: 1 },
    },
  })

  await writeAdminLog({
    adminId: admin.id,
    action: ADMIN_ACTION.CHANGE_PASSWORD,
    targetType: ADMIN_TARGET_TYPE.ADMIN,
    targetId: admin.id,
    before: { sessionVersion: admin.sessionVersion },
    after: { sessionVersion: updated.sessionVersion },
    reason: null,
    ip: input.ip ?? null,
  })

  return { id: updated.id, username: updated.username }
}

export { ADMIN_ROLE }

// ============================================================
// 支付渠道配置
//
// 存储约定（见 src/lib/payment/config.ts）：
// - 普通字段：提交值即最终值，空字符串表示清除
// - 敏感字段：空值/缺省表示「保持原值不变」，仅在提交了非空新值时覆盖
// 因此前端可以把已配置的敏感字段留空，不会把掩码写回数据库。
// ============================================================

const SYSTEM_CONFIG_KEY_PAYMENT_METHODS = 'payment.methods'

const MASK_PREFIX = '****'

export async function savePaymentChannel(input: AdminCommandContext & {
  method: string
  values: Record<string, string>
  /** 显式清除某些已配置的敏感字段 */
  clearFields?: string[]
}): Promise<{ method: string; values: Record<string, string> }> {
  const reason = requireReason(input.reason)

  const spec = getPaymentChannelSpec(input.method)
  if (!spec) {
    throw new Error(`INVALID_PARAMS: 未知的支付渠道 "${input.method}"`)
  }

  const stored = await readStoredChannelValues(input.method)
  const clearFields = new Set(input.clearFields ?? [])
  const next: Record<string, string> = {}

  for (const field of spec.fields) {
    if (clearFields.has(field.key)) continue

    const submitted = (input.values[field.key] ?? '').trim()

    if (!field.secret) {
      // 普通字段：提交值即最终值
      if (submitted) next[field.key] = submitted
      continue
    }

    if (!submitted) {
      // 未提交新值 → 保持原值
      if (stored[field.key]) next[field.key] = stored[field.key]
      continue
    }

    // 防御：即使前端误把掩码提交回来，也只当作「未修改」
    if (submitted.startsWith(MASK_PREFIX)) {
      if (stored[field.key]) next[field.key] = stored[field.key]
      continue
    }

    next[field.key] = encryptChannelValues(input.method, { [field.key]: submitted })[field.key]
  }

  const before = Object.keys(stored).length > 0 ? { configuredFields: Object.keys(stored) } : null

  await setSystemConfig(getPaymentChannelConfigKey(input.method), next)

  await writeAdminLog({
    adminId: input.adminId,
    action: ADMIN_ACTION.UPDATE_CONFIG,
    targetType: ADMIN_TARGET_TYPE.CONFIG,
    targetId: getPaymentChannelConfigKey(input.method),
    before: before as Prisma.InputJsonValue,
    // 只记录「配置了哪些字段」，绝不把密钥写进审计日志
    after: { configuredFields: Object.keys(next) } as Prisma.InputJsonValue,
    reason,
    ip: input.ip ?? null,
  })

  const plain = await readChannelValues(input.method)
  const masked: Record<string, string> = {}
  for (const field of spec.fields) {
    masked[field.key] = field.secret
      ? plain[field.key]
        ? `${MASK_PREFIX}${plain[field.key].slice(-4)}`
        : ''
      : plain[field.key] ?? ''
  }

  return { method: input.method, values: masked }
}

/**
 * 设置启用中的支付渠道。
 * 只允许启用「代码已实现 + 必填参数齐全」的渠道，且至少要保留一个，避免下单入口被关死。
 */
export async function setEnabledPaymentMethods(input: AdminCommandContext & {
  methods: string[]
}): Promise<{ methods: string[] }> {
  const reason = requireReason(input.reason)

  const requested = Array.from(new Set(input.methods.map((method) => method.trim()).filter(Boolean)))
  if (requested.length === 0) {
    throw new Error('INVALID_PARAMS: 至少要启用一个支付渠道，否则用户无法下单')
  }

  const implemented = new Set(listImplementedPaymentMethods())
  const unknown = requested.filter((method) => !getPaymentChannelSpec(method))
  if (unknown.length > 0) {
    throw new Error(`INVALID_PARAMS: 未知的支付渠道 ${unknown.join(', ')}`)
  }

  const notImplemented = requested.filter((method) => !implemented.has(method))
  if (notImplemented.length > 0) {
    throw new Error(`INVALID_PARAMS: 渠道 ${notImplemented.join(', ')} 的对接代码尚未实现，无法启用`)
  }

  for (const method of requested) {
    const values = await readChannelValues(method)
    const missing = findMissingRequiredFields(method, values)
    if (missing.length > 0) {
      throw new Error(`INVALID_PARAMS: 渠道 ${method} 缺少必填参数：${missing.join(', ')}`)
    }
  }

  const before = await getSystemConfig(SYSTEM_CONFIG_KEY_PAYMENT_METHODS)
  const beforeMethods = await getEnabledPaymentMethods()

  await setSystemConfig(SYSTEM_CONFIG_KEY_PAYMENT_METHODS, requested)

  await writeAdminLog({
    adminId: input.adminId,
    action: ADMIN_ACTION.UPDATE_CONFIG,
    targetType: ADMIN_TARGET_TYPE.CONFIG,
    targetId: SYSTEM_CONFIG_KEY_PAYMENT_METHODS,
    before: { methods: beforeMethods, previousValue: before ?? null } as Prisma.InputJsonValue,
    after: { methods: requested } as Prisma.InputJsonValue,
    reason,
    ip: input.ip ?? null,
  })

  return { methods: requested }
}

export { PAYMENT_METHOD, PAYMENT_CHANNEL_METHODS }
