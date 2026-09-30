'use client'

import { useLocale, useTranslations } from 'next-intl'
import {
  formatPrice,
  resolveOrderStatusKey,
  resolveOrderStatusTone,
  resolvePlanNameKey,
  type MembershipOrder,
} from '../membership-display'

interface OrderListProps {
  orders: MembershipOrder[]
}

/** 订单历史（仅在存在订单时渲染，避免空区块占位） */
export function OrderList({ orders }: OrderListProps) {
  const t = useTranslations('membership')
  const locale = useLocale()

  if (orders.length === 0) return null

  return (
    <section className='mt-10'>
      <h2 className='text-lg font-semibold text-[var(--glass-text-primary)]'>
        {t('myOrdersTitle')}
      </h2>

      <div className='glass-surface mt-4 overflow-hidden rounded-2xl'>
        <ul>
          {orders.map((order) => {
            const planNameKey = resolvePlanNameKey(order.planCode)
            const planLabel = planNameKey ? t(planNameKey) : order.planName
            const statusKey = resolveOrderStatusKey(order.status)
            const statusLabel = statusKey ? t(statusKey) : order.status
            const createdAt = new Date(order.createdAt).toLocaleDateString(locale, {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            })

            return (
              <li
                key={order.orderNo}
                className='flex flex-wrap items-center justify-between gap-3 border-b border-[var(--glass-stroke-soft)] px-4 py-3 last:border-b-0'
              >
                <div className='min-w-0'>
                  <p className='truncate font-mono text-xs text-[var(--glass-text-tertiary)]'>
                    {order.orderNo}
                  </p>
                  <p className='mt-1 text-sm text-[var(--glass-text-primary)]'>
                    {planLabel}
                    <span className='text-[var(--glass-text-tertiary)]'>
                      {' · '}¥{formatPrice(order.amount)}
                    </span>
                  </p>
                </div>

                <div className='flex shrink-0 items-center gap-3'>
                  <span className='text-xs text-[var(--glass-text-tertiary)]'>{createdAt}</span>
                  <span className={`glass-chip ${resolveOrderStatusTone(order.status)}`}>
                    {statusLabel}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

export default OrderList
