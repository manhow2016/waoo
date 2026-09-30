'use client'

import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import {
  formatPrice,
  resolveFeatureKey,
  resolvePlanDescKey,
  resolvePlanNameKey,
  type MembershipPlan,
} from '../membership-display'

interface PlanCardProps {
  plan: MembershipPlan
  /** 相对月付的折扣百分比；无法比较时为 null */
  savePercent: number | null
  /** 是否为当前生效套餐 */
  isCurrent: boolean
  /** 是否可购买（免费套餐不可购买） */
  purchasable: boolean
  /** 不可购买时给用户的原因说明 */
  disabledReason: string
  /** 该套餐正在下单中 */
  subscribing: boolean
  onSubscribe: (planCode: string) => void
}

export function PlanCard({
  plan,
  savePercent,
  isCurrent,
  purchasable,
  disabledReason,
  subscribing,
  onSubscribe,
}: PlanCardProps) {
  const t = useTranslations('membership')

  const nameKey = resolvePlanNameKey(plan.code)
  const descKey = resolvePlanDescKey(plan.code)
  const planName = nameKey ? t(nameKey) : plan.name
  const planDesc = descKey ? t(descKey) : null
  const isFree = plan.price <= 0

  return (
    <article
      className={`flex flex-col rounded-2xl p-5 ${
        isCurrent ? 'glass-surface-elevated' : 'glass-surface'
      }`}
    >
      <div className='flex items-start justify-between gap-2'>
        <div className='min-w-0'>
          <h3 className='text-base font-semibold text-[var(--glass-text-primary)]'>
            {planName}
          </h3>
          {planDesc && (
            <p className='mt-1 text-xs leading-5 text-[var(--glass-text-tertiary)]'>
              {planDesc}
            </p>
          )}
        </div>
        {isCurrent && (
          <span className='glass-chip glass-chip-info shrink-0'>
            {t('currentPlan')}
          </span>
        )}
      </div>

      <div className='mt-4 flex items-baseline gap-2'>
        <span className='text-3xl font-semibold tracking-tight text-[var(--glass-text-primary)]'>
          {isFree ? t('freePriceLabel') : t('priceAmount', { price: formatPrice(plan.price) })}
        </span>
        {plan.durationDay > 0 && (
          <span className='text-xs text-[var(--glass-text-tertiary)]'>
            {t('daysSuffix', { days: plan.durationDay })}
          </span>
        )}
        {savePercent !== null && (
          <span className='glass-chip glass-chip-success shrink-0'>
            {t('savePercent', { percent: savePercent })}
          </span>
        )}
      </div>

      <ul className='mt-5 space-y-2'>
        {plan.featureKeys.map((featureKey) => {
          const i18nKey = resolveFeatureKey(featureKey)
          if (!i18nKey) return null
          return (
            <li key={featureKey} className='flex items-start gap-2'>
              <AppIcon
                name='check'
                className='mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--glass-tone-success-fg)]'
              />
              <span className='text-sm leading-5 text-[var(--glass-text-secondary)]'>
                {t(i18nKey)}
              </span>
            </li>
          )
        })}
      </ul>

      <div className='mt-auto pt-5'>
        <button
          type='button'
          disabled={!purchasable || isCurrent || subscribing}
          title={!purchasable ? disabledReason : undefined}
          onClick={() => {
            if (!purchasable || isCurrent || subscribing) return
            onSubscribe(plan.code)
          }}
          className={`glass-btn-base w-full px-4 py-2 text-sm font-medium ${
            isCurrent ? 'glass-btn-soft' : 'glass-btn-primary'
          }`}
        >
          {isCurrent ? t('currentPlan') : subscribing ? t('subscribing') : t('choosePlan')}
        </button>
        {!purchasable && !isCurrent && (
          <p className='mt-2 text-xs leading-5 text-[var(--glass-text-tertiary)]'>
            {disabledReason}
          </p>
        )}
      </div>
    </article>
  )
}

export default PlanCard
