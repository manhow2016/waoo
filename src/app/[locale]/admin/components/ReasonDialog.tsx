'use client'

/**
 * 危险操作确认弹窗（强制填写原因）
 *
 * 封禁/解封、退款、补单、下架套餐、设默认供应商等所有会写 AdminLog 的操作
 * 都必须经过这里，保证审计日志里的 reason 一定有内容。
 */
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { GlassModalShell } from '@/components/ui/primitives'

interface ReasonDialogProps {
  open: boolean
  title: string
  description?: string
  /** 额外展示的上下文（如订单号、用户名） */
  context?: React.ReactNode
  confirmLabel: string
  /** 危险操作使用红色确认按钮 */
  danger?: boolean
  submitting?: boolean
  error?: string | null
  onClose: () => void
  onConfirm: (reason: string) => void
}

export function ReasonDialog({
  open,
  title,
  description,
  context,
  confirmLabel,
  danger,
  submitting,
  error,
  onClose,
  onConfirm,
}: ReasonDialogProps) {
  const t = useTranslations('admin')
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (open) setReason('')
  }, [open])

  const trimmed = reason.trim()

  return (
    <GlassModalShell
      open={open}
      onClose={onClose}
      title={title}
      description={description}
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
            disabled={!trimmed || submitting}
            onClick={() => onConfirm(trimmed)}
            className={`glass-btn-base px-4 py-2 text-sm font-medium ${
              danger ? 'glass-btn-danger' : 'glass-btn-primary'
            }`}
          >
            {submitting ? t('submitting') : confirmLabel}
          </button>
        </div>
      }
    >
      <div className='space-y-4'>
        {context}

        <div>
          <label
            htmlFor='admin-reason'
            className='glass-field-label text-[var(--glass-text-primary)]'
          >
            {t('reasonLabel')}
          </label>
          <textarea
            id='admin-reason'
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t('reasonPlaceholder')}
            className='glass-textarea-base mt-1.5 w-full px-3 py-2 text-sm'
          />
          <p className='glass-field-hint mt-1.5'>{t('reasonHint')}</p>
        </div>

        {error && (
          <p className='text-sm text-[var(--glass-tone-danger-fg)]'>{error}</p>
        )}
      </div>
    </GlassModalShell>
  )
}

export default ReasonDialog
