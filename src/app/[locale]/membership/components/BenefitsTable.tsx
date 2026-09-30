'use client'

import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import { BENEFIT_ROWS, resolveFeatureKey } from '../membership-display'

function BenefitCell({ included, label }: { included: boolean; label: string }) {
  return (
    <td className='px-4 py-3 text-center align-middle'>
      {included ? (
        <AppIcon
          name='check'
          className='mx-auto h-4 w-4 text-[var(--glass-tone-success-fg)]'
          role='img'
          aria-label={label}
        />
      ) : (
        <AppIcon
          name='close'
          className='mx-auto h-4 w-4 text-[var(--glass-text-tertiary)]'
          role='img'
          aria-label={label}
        />
      )}
    </td>
  )
}

/** 会员权益对比表：免费 vs 付费 */
export function BenefitsTable() {
  const t = useTranslations('membership')

  return (
    <section className='mt-10'>
      <h2 className='text-lg font-semibold text-[var(--glass-text-primary)]'>
        {t('benefitsTitle')}
      </h2>

      <div className='glass-surface mt-4 overflow-hidden rounded-2xl'>
        <table className='w-full text-xs sm:text-sm'>
          <thead>
            <tr className='border-b border-[var(--glass-stroke-soft)]'>
              <th className='px-4 py-3 text-left font-medium text-[var(--glass-text-secondary)]'>
                {t('benefitName')}
              </th>
              <th className='whitespace-nowrap px-4 py-3 text-center font-medium text-[var(--glass-text-secondary)]'>
                {t('benefitFree')}
              </th>
              <th className='whitespace-nowrap px-4 py-3 text-center font-medium text-[var(--glass-text-secondary)]'>
                {t('benefitPaid')}
              </th>
            </tr>
          </thead>
          <tbody>
            {BENEFIT_ROWS.map((row) => {
              const i18nKey = resolveFeatureKey(row.key)
              return (
                <tr
                  key={row.key}
                  className='border-b border-[var(--glass-stroke-soft)] last:border-b-0'
                >
                  <td className='px-4 py-3 text-[var(--glass-text-primary)]'>
                    {i18nKey ? t(i18nKey) : row.key}
                  </td>
                  <BenefitCell included={row.free} label={t('included')} />
                  <BenefitCell included={row.paid} label={t('included')} />
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default BenefitsTable
