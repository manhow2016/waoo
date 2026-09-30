'use client'

import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { AppIcon } from '@/components/ui/icons'

interface LockedProviderCardProps {
  /** 已按当前语言解析好的供应商展示名 */
  name: string
  /** 该供应商是否还残留着已保存的 API Key（降级后需要清理） */
  hasSavedKey: boolean
  /** 清除残留 Key；缺省时不展示清理入口 */
  onClearSavedKey?: () => void
}

/**
 * 被会员等级锁定的供应商卡片。
 *
 * 免费用户只能使用平台默认供应商，其余供应商在此仅做置灰展示与升级引导。
 * 真正的准入拦截在服务端：保存配置、任务入队、worker 运行时三处校验。
 */
export function LockedProviderCard({
  name,
  hasSavedKey,
  onClearSavedKey,
}: LockedProviderCardProps) {
  const t = useTranslations('providerSection')

  return (
    <div className='glass-surface-soft rounded-2xl p-3.5'>
      <div className='flex items-start justify-between gap-3'>
        <div className='flex min-w-0 items-center gap-2'>
          <AppIcon
            name='lock'
            className='h-4 w-4 shrink-0 text-[var(--glass-text-tertiary)]'
          />
          <span className='truncate text-sm font-medium text-[var(--glass-text-tertiary)]'>
            {name}
          </span>
        </div>
        <span className='glass-chip glass-chip-warning shrink-0'>
          {t('membershipLockedBadge')}
        </span>
      </div>

      <p className='mt-2 text-xs leading-5 text-[var(--glass-text-tertiary)]'>
        {t('membershipLockedHint')}
      </p>

      {hasSavedKey && onClearSavedKey && (
        <p className='mt-3 rounded-lg bg-[var(--glass-tone-warning-bg)] px-3 py-2 text-xs leading-5 text-[var(--glass-tone-warning-fg)]'>
          {t('membershipStaleKeyHint')}
        </p>
      )}

      <div className='mt-3 flex flex-wrap items-center gap-2'>
        <Link
          href={{ pathname: '/membership' }}
          className='glass-btn-base glass-btn-soft inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium'
        >
          {t('membershipUpgradeCta')}
          <AppIcon name='arrowRight' className='h-3.5 w-3.5' />
        </Link>

        {hasSavedKey && onClearSavedKey && (
          <button
            type='button'
            onClick={onClearSavedKey}
            className='glass-btn-base glass-btn-ghost px-2.5 py-1 text-xs font-medium'
          >
            {t('membershipClearStaleKey')}
          </button>
        )}
      </div>
    </div>
  )
}

export default LockedProviderCard
