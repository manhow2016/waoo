'use client'

/**
 * 后台仪表盘：平台运营数据概览
 *
 * 展示的都是可直接驱动运营动作的指标（新增用户、有效会员、待处理订单、收入）。
 * 统计口径由 /api/admin/stats 统一提供，前端不做二次计算。
 */
import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { AdminShell } from './components/AdminShell'
import { useAdminResource } from './components/useAdminResource'
import type { AdminStatsDto } from '@/lib/admin/queries'

interface StatsResponse {
  stats: AdminStatsDto
  planOptions: Array<{ code: string; name: string }>
}

function MetricSection({ title, metrics }: { title: string; metrics: Array<{ label: string; value: ReactNode }> }) {
  return (
    <section className='glass-surface rounded-2xl p-5'>
      <h2 className='text-sm font-semibold text-[var(--glass-text-secondary)]'>{title}</h2>
      <dl className='mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4'>
        {metrics.map((metric) => (
          <div key={metric.label} className='min-w-0'>
            <dt className='truncate text-xs text-[var(--glass-text-tertiary)]'>{metric.label}</dt>
            <dd className='mt-1 truncate text-lg font-semibold text-[var(--glass-text-primary)]'>
              {metric.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export default function AdminDashboardPage() {
  const t = useTranslations('admin')
  const resource = useAdminResource<StatsResponse>('/api/admin/stats')
  const stats = resource.data?.stats

  return (
    <AdminShell title={t('nav.dashboard')} description={t('dashboard.description')}>
      {resource.loading ? (
        <div className='space-y-4'>
          {[0, 1, 2].map((index) => (
            <div key={index} className='glass-surface h-40 animate-pulse rounded-2xl' />
          ))}
        </div>
      ) : resource.error || !stats ? (
        <div className='glass-surface rounded-2xl p-6'>
          <h2 className='text-base font-semibold text-[var(--glass-text-primary)]'>
            {t('loadFailedTitle')}
          </h2>
          <p className='mt-1 text-sm text-[var(--glass-text-secondary)]'>
            {resource.error?.message}
          </p>
          <button
            type='button'
            onClick={resource.reload}
            className='glass-btn-base glass-btn-primary mt-4 px-4 py-2 text-sm font-medium'
          >
            {t('retry')}
          </button>
        </div>
      ) : (
        <div className='space-y-4'>
          <MetricSection
            title={t('dashboard.usersSection')}
            metrics={[
              { label: t('dashboard.usersTotal'), value: stats.users.total },
              { label: t('dashboard.usersNew7d'), value: stats.users.newLast7Days },
              { label: t('dashboard.usersBanned'), value: stats.users.banned },
            ]}
          />

          <MetricSection
            title={t('dashboard.membershipSection')}
            metrics={[
              { label: t('dashboard.membershipActive'), value: stats.memberships.active },
              ...(stats.memberships.byLevel.length > 0
                ? stats.memberships.byLevel.map((row) => ({
                    label: row.planCode,
                    value: row.count,
                  }))
                : []),
            ]}
          />
          {stats.memberships.byLevel.length === 0 && (
            <p className='text-xs text-[var(--glass-text-tertiary)]'>
              {t('dashboard.membershipNoData')}
            </p>
          )}

          <MetricSection
            title={t('dashboard.ordersSection')}
            metrics={[
              { label: t('dashboard.ordersPending'), value: stats.orders.pending },
              { label: t('dashboard.ordersPaid'), value: stats.orders.paid },
              { label: t('dashboard.ordersCancelled'), value: stats.orders.cancelled },
              { label: t('dashboard.revenueTotal'), value: `¥${stats.orders.revenueTotal}` },
              { label: t('dashboard.revenue30d'), value: `¥${stats.orders.revenueLast30Days}` },
            ]}
          />
          <p className='text-xs text-[var(--glass-text-tertiary)]'>{t('dashboard.revenueNote')}</p>

          <MetricSection
            title={t('dashboard.providersSection')}
            metrics={[
              { label: t('dashboard.providersTotal'), value: stats.providers.total },
              { label: t('dashboard.providersActive'), value: stats.providers.active },
              {
                label: t('dashboard.providersDefault'),
                value: stats.providers.defaultCode ?? t('dashboard.providersNone'),
              },
            ]}
          />

          <MetricSection
            title={t('dashboard.plansSection')}
            metrics={[
              { label: t('dashboard.plansTotal'), value: stats.plans.total },
              { label: t('dashboard.plansActive'), value: stats.plans.active },
            ]}
          />
        </div>
      )}
    </AdminShell>
  )
}
