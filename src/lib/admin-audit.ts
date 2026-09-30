/**
 * 管理员操作审计（AdminLog 的唯一写入 owner）
 *
 * 所有关键操作（开通/撤销会员、退款、改配置、改套餐、改供应商、封禁用户）
 * 都必须经过这里写入，保证日志字段与「操作前后值」结构一致。
 * 后台接口与运维脚本共用本模块，避免出现第二套审计格式。
 */
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/** 已登记的审计动作 */
export const ADMIN_ACTION = {
  GRANT_MEMBERSHIP: 'grant_membership',
  REVOKE_MEMBERSHIP: 'revoke_membership',
  EXPIRE_MEMBERSHIP: 'expire_membership',
  REFUND_ORDER: 'refund_order',
  REPAIR_ORDER: 'repair_order',
  BAN_USER: 'ban_user',
  UNBAN_USER: 'unban_user',
  UPDATE_CONFIG: 'update_config',
  UPDATE_PLAN: 'update_plan',
  UPDATE_PROVIDER: 'update_provider',
  CREATE_ADMIN: 'create_admin',
  UPDATE_ADMIN: 'update_admin',
  RESET_ADMIN_PASSWORD: 'reset_admin_password',
  CHANGE_PASSWORD: 'change_password',
} as const

export type AdminAction = (typeof ADMIN_ACTION)[keyof typeof ADMIN_ACTION]

export const ADMIN_TARGET_TYPE = {
  USER: 'user',
  ORDER: 'order',
  PLAN: 'plan',
  PROVIDER: 'provider',
  CONFIG: 'config',
  ADMIN: 'admin',
} as const

export type AdminTargetType = (typeof ADMIN_TARGET_TYPE)[keyof typeof ADMIN_TARGET_TYPE]

export interface AdminAuditInput {
  adminId: string
  action: AdminAction
  targetType?: AdminTargetType | null
  targetId?: string | null
  before?: Prisma.InputJsonValue | null
  after?: Prisma.InputJsonValue | null
  reason?: string | null
  ip?: string | null
}

export async function writeAdminLog(input: AdminAuditInput): Promise<void> {
  await prisma.adminLog.create({
    data: {
      adminId: input.adminId,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      before: input.before ?? undefined,
      after: input.after ?? undefined,
      reason: input.reason ?? null,
      ip: input.ip ?? null,
    },
  })
}
