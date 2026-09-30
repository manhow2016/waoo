'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import {
  formatPrice,
  resolvePlanNameKey,
  type MembershipOrder,
  type PaymentIntent,
} from '../membership-display'

interface PendingOrderPanelProps {
  order: MembershipOrder
  payment: PaymentIntent | null
  /** 取消待支付订单；缺省时不展示取消入口 */
  onCancelOrder?: (orderNo: string) => void
  cancelling?: boolean
  cancelError?: string | null
}

/**
 * 待支付订单面板。
 * 当前平台没有真实支付渠道，主要信息是「订单号」——用户把它交给运营核销。
 */
export function PendingOrderPanel({
  order,
  payment,
  onCancelOrder,
  cancelling,
  cancelError,
}: PendingOrderPanelProps) {
  const t = useTranslations('membership')
  const [copied, setCopied] = useState(false)
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
    }
  }, [])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(order.orderNo)
      setCopied(true)
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
      resetTimerRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      // 剪贴板不可用时不阻塞流程，用户仍可手动选中订单号
    }
  }, [order.orderNo])

  const planNameKey = resolvePlanNameKey(order.planCode)
  const planLabel = planNameKey ? t(planNameKey) : order.planName
  const instructions = payment ? t(payment.instructionsKey) : t('paymentManualInstructions')

  return (
    <section className='glass-surface rounded-2xl p-5'>
      <div className='flex items-center gap-2'>
        <AppIcon name='clock' className='h-4 w-4 shrink-0 text-[var(--glass-tone-warning-fg)]' />
        <h2 className='text-sm font-semibold text-[var(--glass-text-primary)]'>
          {t('pendingOrderTitle')}
        </h2>
      </div>

      <dl className='mt-4 grid grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-3'>
        <div className='min-w-0 sm:col-span-1'>
          <dt className='text-xs text-[var(--glass-text-tertiary)]'>{t('orderNoLabel')}</dt>
          <dd className='mt-1 flex items-center gap-2'>
            <code className='truncate font-mono text-sm text-[var(--glass-text-primary)]'>
              {order.orderNo}
            </code>
            <button
              type='button'
              onClick={handleCopy}
              className='glass-btn-base glass-btn-ghost shrink-0 px-2 py-0.5 text-xs font-medium'
            >
              {copied ? t('copied') : t('copyOrderNo')}
            </button>
          </dd>
        </div>
        <div>
          <dt className='text-xs text-[var(--glass-text-tertiary)]'>{t('orderPlanLabel')}</dt>
          <dd className='mt-1 text-sm text-[var(--glass-text-primary)]'>{planLabel}</dd>
        </div>
        <div>
          <dt className='text-xs text-[var(--glass-text-tertiary)]'>{t('orderAmountLabel')}</dt>
          <dd className='mt-1 text-sm text-[var(--glass-text-primary)]'>
            ¥{formatPrice(order.amount)}
          </dd>
        </div>
      </dl>

      <p className='mt-4 text-sm leading-6 text-[var(--glass-text-secondary)]'>
        {instructions}
      </p>
      <p className='mt-1 text-xs text-[var(--glass-text-tertiary)]'>{t('orderExpiresHint')}</p>

      {cancelError && (
        <p className='mt-3 text-sm text-[var(--glass-tone-danger-fg)]'>{cancelError}</p>
      )}

      {onCancelOrder && (
        <div className='mt-4 flex flex-wrap items-center gap-3'>
          <button
            type='button'
            disabled={cancelling}
            onClick={() => onCancelOrder(order.orderNo)}
            className='glass-btn-base glass-btn-soft px-3 py-1.5 text-xs font-medium'
          >
            {cancelling ? t('cancelling') : t('cancelOrder')}
          </button>
          <span className='text-xs text-[var(--glass-text-tertiary)]'>
            {t('cancelOrderConfirm')}
          </span>
        </div>
      )}

      {payment?.payUrl && (
        <a
          href={payment.payUrl}
          target='_blank'
          rel='noreferrer'
          className='glass-btn-base glass-btn-primary mt-4 inline-flex items-center gap-1 px-4 py-2 text-sm font-medium'
        >
          {t('goToPay')}
          <AppIcon name='externalLink' className='h-3.5 w-3.5' />
        </a>
      )}
    </section>
  )
}

export default PendingOrderPanel
