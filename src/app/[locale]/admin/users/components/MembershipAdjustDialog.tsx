'use client'

/**
 * 手动调整会员弹窗
 *
 * 两种语义互斥，避免运营误操作：
 * - extend：按套餐时长新建订单并顺延开通
 * - set：直接改写当前有效订阅的到期时间（仅当账号已有有效会员时可用）
 * 两者都必须填写原因，服务端会写入 AdminLog。
 */
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { GlassModalShell } from '@/components/ui/primitives'

export interface MembershipAdjustDialogProps {
  open: boolean
  email: string
  current: { planName: string | null; expireAt: string | null; isActive: boolean } | null
  plans: Array<{ id: string; code: string; name: string; durationDay: number }>
  loadingPlans: boolean
  submitting: boolean
  error: string | null
  onClose: () => void
  onSubmit: (payload: Record<string, unknown>, done: () => void) => void
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

export function MembershipAdjustDialog({
  open,
  email,
  current,
  plans,
  loadingPlans,
  submitting,
  error,
  onClose,
  onSubmit,
}: MembershipAdjustDialogProps) {
  const t = useTranslations('admin')
  const [mode, setMode] = useState<'extend' | 'set'>('extend')
  const [planCode, setPlanCode] = useState('')
  const [expireAt, setExpireAt] = useState('')
  const [reason, setReason] = useState('')

  const canExtend = plans.length > 0 || loadingPlans
  const effectiveMode = current?.isActive || canExtend ? mode : 'extend'
  const valid = reason.trim().length > 0
    && (effectiveMode === 'extend' ? Boolean(planCode) : Boolean(expireAt))
    && (!current?.isActive ? effectiveMode === 'extend' : true)

  return (
    <GlassModalShell
      open={open}
      onClose={onClose}
      title={t('users.adjustTitle', { email })}
      size='md'
      footer={
        <div className='flex justify-end gap-2'>
          <button
            type='button'
            onClick={onClose}
            className='glass-btn-base glass-btn-soft px-4 py-2 text-sm font-medium'
          >
            {t('cancel')}
          </button>
          <button
            type='button'
            disabled={!valid || submitting}
            onClick={() =>
              onSubmit(
                effectiveMode === 'extend'
                  ? { mode: 'extend', planCode, reason: reason.trim() }
                  : { mode: 'set', expireAt: new Date(expireAt).toISOString(), planCode: planCode || undefined, reason: reason.trim() },
                () => {
                  setReason('')
                },
              )
            }
            className='glass-btn-base glass-btn-primary px-4 py-2 text-sm font-medium'
          >
            {submitting ? t('submitting') : t('save')}
          </button>
        </div>
      }
    >
      <div className='space-y-4'>
        {current?.isActive ? (
          <p className='text-sm text-[var(--glass-text-secondary)]'>
            {t('users.adjustCurrentHint', {
              plan: current.planName ?? '—',
              expireAt: current.expireAt ? formatDate(current.expireAt) : '—',
            })}
          </p>
        ) : (
          <p className='text-sm text-[var(--glass-text-secondary)]'>{t('users.adjustNoActiveHint')}</p>
        )}

        <div>
          <p className='glass-field-label text-[var(--glass-text-primary)]'>{t('users.adjustMode')}</p>
          <div className='mt-1.5 flex flex-wrap gap-2'>
            {(['extend', 'set'] as const).map((option) => {
              const disabled = option === 'set' && !current?.isActive
              return (
                <button
                  key={option}
                  type='button'
                  disabled={disabled}
                  onClick={() => setMode(option)}
                  className={`glass-btn-base px-3 py-1.5 text-sm font-medium ${
                    effectiveMode === option ? 'glass-btn-tone-info' : 'glass-btn-soft'
                  }`}
                >
                  {option === 'extend' ? t('users.adjustModeExtend') : t('users.adjustModeSet')}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label htmlFor='adjust-plan' className='glass-field-label text-[var(--glass-text-primary)]'>
            {t('users.adjustPlan')}
          </label>
          <select
            id='adjust-plan'
            value={planCode}
            onChange={(event) => setPlanCode(event.target.value)}
            className='glass-select-base mt-1.5 w-full px-3 py-2 text-sm'
          >
            <option value=''>—</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.code}>
                {plan.name}（{plan.durationDay} 天）
              </option>
            ))}
          </select>
        </div>

        {effectiveMode === 'set' && (
          <div>
            <label htmlFor='adjust-expire' className='glass-field-label text-[var(--glass-text-primary)]'>
              {t('users.adjustExpireAt')}
            </label>
            <input
              id='adjust-expire'
              type='datetime-local'
              value={expireAt}
              onChange={(event) => setExpireAt(event.target.value)}
              className='glass-input-base mt-1.5 w-full px-3 py-2 text-sm'
            />
            <p className='glass-field-hint mt-1.5'>{t('users.adjustExpireAtHint')}</p>
          </div>
        )}

        <div>
          <label htmlFor='adjust-reason' className='glass-field-label text-[var(--glass-text-primary)]'>
            {t('reasonLabel')}
          </label>
          <textarea
            id='adjust-reason'
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t('reasonPlaceholder')}
            className='glass-textarea-base mt-1.5 w-full px-3 py-2 text-sm'
          />
        </div>

        {error && <p className='text-sm text-[var(--glass-tone-danger-fg)]'>{error}</p>}
      </div>
    </GlassModalShell>
  )
}
