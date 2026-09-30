'use client'

/**
 * 订单管理：查询订阅订单、退款、补单
 *
 * 权限：support 可查询与补单；退款需要 operation 及以上（服务端同样校验）。
 */
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AdminListPage } from '../components/AdminListPage'
import { AdminShell, useAdminSession } from '../components/AdminShell'
import { ReasonDialog } from '../components/ReasonDialog'
import { AdminApiError, adminRequest, buildQuery } from '../components/admin-api'
import { useAdminResource } from '../components/useAdminResource'
import type { AdminOrderDto } from '@/lib/admin/mappers'

const PAGE_SIZE = 20
const ORDER_STATUSES = ['pending', 'active', 'expired', 'cancelled'] as const

interface OrderListResponse {
  items: AdminOrderDto[]
  total: number
  page: number
  pageSize: number
}

interface PlanListResponse {
  plans: Array<{ id: string; code: string; name: string }>
}

type PendingAction =
  | { kind: 'refund'; order: AdminOrderDto }
  | { kind: 'repair'; order: AdminOrderDto }
  | null

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

function statusChipClass(status: string): string {
  switch (status) {
    case 'active':
      return 'glass-chip glass-chip-success'
    case 'pending':
      return 'glass-chip glass-chip-warning'
    case 'cancelled':
      return 'glass-chip glass-chip-danger'
    default:
      return 'glass-chip glass-chip-neutral'
  }
}

export default function AdminOrdersPage() {
  const t = useTranslations('admin')

  return (
    <AdminShell title={t('nav.orders')} description={t('orders.description')}>
      <AdminOrdersBody />
    </AdminShell>
  )
}

/**
 * 业务体必须是 AdminShell 的子组件：
 * useAdminSession 读取的是 AdminShell 提供的 Context，
 * 在页面组件自身调用会因 Provider 尚未包裹而直接抛错（曾真实导致 500）。
 */
function AdminOrdersBody() {
  const t = useTranslations('admin')
  const session = useAdminSession()
  const canRefund = session.role === 'operation' || session.role === 'super'

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<(typeof ORDER_STATUSES)[number] | 'all'>('all')
  const [planCode, setPlanCode] = useState('')
  const [page, setPage] = useState(1)

  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const query = useMemo(
    () => buildQuery({ search: search.trim(), status, planCode, page, pageSize: PAGE_SIZE }),
    [search, status, planCode, page],
  )

  const list = useAdminResource<OrderListResponse>(`/api/admin/orders${query}`)
  const plans = useAdminResource<PlanListResponse>('/api/admin/plans')

  async function submitAction(path: string, reason: string) {
    setSubmitting(true)
    setActionError(null)
    try {
      await adminRequest(path, { method: 'POST', body: JSON.stringify({ reason }) })
      setPendingAction(null)
      list.reload()
    } catch (caught) {
      setActionError(
        caught instanceof AdminApiError ? `${caught.message}（${caught.code}）` : t('actionFailedTitle'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <AdminListPage
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        total={list.data?.total ?? 0}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        itemCount={list.data?.items.length ?? 0}
        emptyTitle={t('orders.emptyTitle')}
        emptyDescription={t('orders.emptyDescription')}
        filters={
          <>
            <div>
              <label htmlFor='order-search' className='sr-only'>
                {t('orders.searchPlaceholder')}
              </label>
              <input
                id='order-search'
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
                placeholder={t('orders.searchPlaceholder')}
                className='glass-input-base w-60 px-3 py-2 text-sm'
              />
            </div>
            <div>
              <label htmlFor='order-status' className='sr-only'>
                {t('orders.statusLabel')}
              </label>
              <select
                id='order-status'
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as typeof status)
                  setPage(1)
                }}
                className='glass-select-base px-3 py-2 text-sm'
              >
                <option value='all'>{t('all')}</option>
                {ORDER_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {t(`orderStatus.${value}`)}
                  </option>
                ))}
              </select>
            </div>
            {plans.data && plans.data.plans.length > 0 && (
              <div>
                <label htmlFor='order-plan' className='sr-only'>
                  {t('orders.planLabel')}
                </label>
                <select
                  id='order-plan'
                  value={planCode}
                  onChange={(event) => {
                    setPlanCode(event.target.value)
                    setPage(1)
                  }}
                  className='glass-select-base px-3 py-2 text-sm'
                >
                  <option value=''>{t('all')}</option>
                  {plans.data.plans.map((plan) => (
                    <option key={plan.id} value={plan.code}>
                      {plan.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        }
      >
        <table className='w-full text-sm'>
          <thead>
            <tr className='border-b border-[var(--glass-stroke-soft)] text-left'>
              <th className='px-4 py-3 font-medium text-[var(--glass-text-secondary)]'>{t('orders.columnOrderNo')}</th>
              <th className='whitespace-nowrap px-4 py-3 font-medium text-[var(--glass-text-secondary)]'>{t('orders.columnPlan')}</th>
              <th className='whitespace-nowrap px-4 py-3 font-medium text-[var(--glass-text-secondary)]'>{t('orders.columnAmount')}</th>
              <th className='whitespace-nowrap px-4 py-3 font-medium text-[var(--glass-text-secondary)]'>{t('orders.columnStatus')}</th>
              <th className='whitespace-nowrap px-4 py-3 font-medium text-[var(--glass-text-secondary)]'>{t('orders.columnExpireAt')}</th>
              <th className='whitespace-nowrap px-4 py-3 text-right font-medium text-[var(--glass-text-secondary)]'>{t('orders.columnActions')}</th>
            </tr>
          </thead>
          <tbody>
            {(list.data?.items ?? []).map((order) => (
              <tr key={order.id} className='border-b border-[var(--glass-stroke-soft)] last:border-b-0'>
                <td className='px-4 py-3'>
                  <p className='truncate font-mono text-xs text-[var(--glass-text-primary)]'>{order.orderNo}</p>
                  <p className='truncate text-xs text-[var(--glass-text-tertiary)]'>
                    {order.userEmail || order.userId}
                  </p>
                </td>
                <td className='whitespace-nowrap px-4 py-3 text-[var(--glass-text-secondary)]'>
                  {order.planName}
                </td>
                <td className='whitespace-nowrap px-4 py-3 text-[var(--glass-text-primary)]'>
                  ¥{order.amount}
                </td>
                <td className='whitespace-nowrap px-4 py-3'>
                  <span className={statusChipClass(order.status)}>
                    {t(`orderStatus.${order.status}`)}
                  </span>
                </td>
                <td className='whitespace-nowrap px-4 py-3 text-[var(--glass-text-secondary)]'>
                  {order.paidAt ? formatDate(order.expireAt) : t('orders.notPaid')}
                </td>
                <td className='whitespace-nowrap px-4 py-3'>
                  <div className='flex justify-end gap-1'>
                    {!order.paidAt && order.status !== 'cancelled' && (
                      <button
                        type='button'
                        onClick={() => {
                          setActionError(null)
                          setPendingAction({ kind: 'repair', order })
                        }}
                        className='glass-btn-base glass-btn-soft px-2 py-1 text-xs font-medium'
                      >
                        {t('orders.repair')}
                      </button>
                    )}
                    {canRefund && order.paidAt && order.status !== 'cancelled' && (
                      <button
                        type='button'
                        onClick={() => {
                          setActionError(null)
                          setPendingAction({ kind: 'refund', order })
                        }}
                        className='glass-btn-base glass-btn-danger px-2 py-1 text-xs font-medium'
                      >
                        {t('orders.refund')}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminListPage>

      <ReasonDialog
        open={pendingAction !== null}
        title={
          pendingAction?.kind === 'refund'
            ? t('orders.refundTitle', { orderNo: pendingAction.order.orderNo })
            : pendingAction
              ? t('orders.repairTitle', { orderNo: pendingAction.order.orderNo })
              : ''
        }
        description={
          pendingAction?.kind === 'refund'
            ? t('orders.refundDescription')
            : t('orders.repairDescription')
        }
        context={
          pendingAction && (
            <p className='rounded-lg bg-[var(--glass-bg-muted)] px-3 py-2 text-xs leading-5 text-[var(--glass-text-secondary)]'>
              {pendingAction.order.planName} · ¥{pendingAction.order.amount} ·{' '}
              {pendingAction.order.userEmail || pendingAction.order.userId}
            </p>
          )
        }
        confirmLabel={pendingAction?.kind === 'refund' ? t('orders.refund') : t('orders.repair')}
        danger={pendingAction?.kind === 'refund'}
        submitting={submitting}
        error={actionError}
        onClose={() => setPendingAction(null)}
        onConfirm={(reason) => {
          if (!pendingAction) return
          const path = pendingAction.kind === 'refund'
            ? `/api/admin/orders/${pendingAction.order.id}/refund`
            : `/api/admin/orders/${pendingAction.order.id}/repair`
          void submitAction(path, reason)
        }}
      />
    </>
  )
}
