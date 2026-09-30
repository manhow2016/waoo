/**
 * 会员中心展示辅助（纯函数）
 *
 * 套餐名称与权益描述统一走 i18n key（按 plan code 映射），保证中英文同步维护；
 * 数据库里的 Plan.name 只作为兜底展示名。
 */

/** 套餐 DTO（与 /api/membership/plans 返回结构一致） */
export interface MembershipPlan {
  code: string
  name: string
  level: number
  price: number
  durationDay: number
  allowAllProviders: boolean
  sortOrder: number
  featureKeys: string[]
}

const PLAN_NAME_KEYS: Record<string, string> = {
  free: 'planFreeName',
  monthly: 'planMonthlyName',
  quarterly: 'planQuarterlyName',
  yearly: 'planYearlyName',
}

const PLAN_DESC_KEYS: Record<string, string> = {
  free: 'planFreeDesc',
  monthly: 'planMonthlyDesc',
  quarterly: 'planQuarterlyDesc',
  yearly: 'planYearlyDesc',
}

/** 权益 key → i18n key */
const FEATURE_KEYS: Record<string, string> = {
  unlimitedDefaultProvider: 'featureUnlimitedDefaultProvider',
  allProviders: 'featureAllProviders',
}

export function resolvePlanNameKey(code: string): string | null {
  return PLAN_NAME_KEYS[code] ?? null
}

export function resolvePlanDescKey(code: string): string | null {
  return PLAN_DESC_KEYS[code] ?? null
}

export function resolveFeatureKey(featureKey: string): string | null {
  return FEATURE_KEYS[featureKey] ?? null
}

/** 权益对比表的固定行（顺序即展示顺序） */
export const BENEFIT_ROWS = [
  { key: 'unlimitedDefaultProvider', free: true, paid: true },
  { key: 'allProviders', free: false, paid: true },
  { key: 'noCallFee', free: true, paid: true },
] as const

/** 订单 DTO（与 /api/membership/orders 返回结构一致） */
export interface MembershipOrder {
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
}

/** 下单接口返回的支付指引 */
export interface PaymentIntent {
  method: string
  autoActivate: boolean
  instructionsKey: string
  payUrl?: string
  qrCode?: string
}

const ORDER_STATUS_KEYS: Record<string, string> = {
  pending: 'orderStatusPending',
  active: 'orderStatusActive',
  expired: 'orderStatusExpired',
  cancelled: 'orderStatusCancelled',
}

export function resolveOrderStatusKey(status: string): string | null {
  return ORDER_STATUS_KEYS[status] ?? null
}

/** 订单状态对应的 chip 语义色 */
export function resolveOrderStatusTone(status: string): string {
  switch (status) {
    case 'active':
      return 'glass-chip-success'
    case 'pending':
      return 'glass-chip-warning'
    case 'cancelled':
      return 'glass-chip-danger'
    default:
      return 'glass-chip-neutral'
  }
}

/** 金额展示：整数不补小数位 */
export function formatPrice(price: number): string {
  if (!Number.isFinite(price)) return '0'
  return Number.isInteger(price) ? String(price) : price.toFixed(2)
}

/**
 * 相对「月付」计算折扣百分比。
 * 无法比较（缺少月付基准、免费套餐、非整数天）时返回 null，避免展示无依据的折扣。
 */
export function computeSavePercent(
  plan: MembershipPlan,
  plans: MembershipPlan[],
): number | null {
  if (plan.durationDay <= 0 || plan.price <= 0) return null

  const monthly = plans.find(
    (candidate) =>
      candidate.code === 'monthly' && candidate.durationDay > 0 && candidate.price > 0,
  )
  if (!monthly) return null

  const monthlyDailyRate = monthly.price / monthly.durationDay
  const planDailyRate = plan.price / plan.durationDay
  if (planDailyRate >= monthlyDailyRate) return null

  const percent = Math.round((1 - planDailyRate / monthlyDailyRate) * 100)
  return percent > 0 ? percent : null
}
