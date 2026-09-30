import { describe, expect, it } from 'vitest'
import {
  BENEFIT_ROWS,
  computeSavePercent,
  formatPrice,
  resolveFeatureKey,
  resolvePlanDescKey,
  resolvePlanNameKey,
  type MembershipPlan,
} from '@/app/[locale]/membership/membership-display'

function buildPlan(overrides: Partial<MembershipPlan> & { code: string }): MembershipPlan {
  return {
    name: overrides.code,
    level: 1,
    price: 0,
    durationDay: 0,
    allowAllProviders: true,
    sortOrder: 1,
    featureKeys: [],
    ...overrides,
  }
}

const PLANS: MembershipPlan[] = [
  buildPlan({ code: 'free', level: 0, price: 0, durationDay: 0, allowAllProviders: false }),
  buildPlan({ code: 'monthly', price: 29, durationDay: 30 }),
  buildPlan({ code: 'quarterly', price: 79, durationDay: 90 }),
  buildPlan({ code: 'yearly', price: 259, durationDay: 365 }),
]

describe('membership-display / i18n 映射', () => {
  it('已知套餐 code 映射到文案 key', () => {
    expect(resolvePlanNameKey('monthly')).toBe('planMonthlyName')
    expect(resolvePlanDescKey('yearly')).toBe('planYearlyDesc')
    expect(resolveFeatureKey('allProviders')).toBe('featureAllProviders')
  })

  it('未知 code 返回 null，由调用方回退到数据库展示名', () => {
    expect(resolvePlanNameKey('unknown-plan')).toBeNull()
    expect(resolvePlanDescKey('unknown-plan')).toBeNull()
    expect(resolveFeatureKey('unknown-feature')).toBeNull()
  })

  it('权益对比表覆盖默认供应商与全部供应商两项差异', () => {
    const defaultProviderRow = BENEFIT_ROWS.find((row) => row.key === 'unlimitedDefaultProvider')
    const allProvidersRow = BENEFIT_ROWS.find((row) => row.key === 'allProviders')

    expect(defaultProviderRow).toMatchObject({ free: true, paid: true })
    expect(allProvidersRow).toMatchObject({ free: false, paid: true })
  })
})

describe('membership-display / computeSavePercent', () => {
  it('季付与年付相对月付给出折扣', () => {
    expect(computeSavePercent(PLANS[2], PLANS)).toBe(9)
    expect(computeSavePercent(PLANS[3], PLANS)).toBe(27)
  })

  it('月付自身无折扣', () => {
    expect(computeSavePercent(PLANS[1], PLANS)).toBeNull()
  })

  it('免费套餐无折扣', () => {
    expect(computeSavePercent(PLANS[0], PLANS)).toBeNull()
  })

  it('缺少月付基准时不给出无依据的折扣', () => {
    expect(computeSavePercent(PLANS[3], [PLANS[0], PLANS[3]])).toBeNull()
  })

  it('单价不划算时不显示折扣', () => {
    const expensive = buildPlan({ code: 'custom', price: 400, durationDay: 30 })
    expect(computeSavePercent(expensive, PLANS)).toBeNull()
  })
})

describe('membership-display / formatPrice', () => {
  it('整数价格不补小数位，非整数保留两位', () => {
    expect(formatPrice(0)).toBe('0')
    expect(formatPrice(29)).toBe('29')
    expect(formatPrice(29.5)).toBe('29.50')
  })

  it('非法数值回退为 0', () => {
    expect(formatPrice(Number.NaN)).toBe('0')
  })
})
