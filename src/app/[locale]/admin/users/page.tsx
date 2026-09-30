'use client'

/**
 * 用户管理：查询账号、查看详情、封禁/解封、手动调整会员
 *
 * 权限：support 可查询与查看详情；封禁与调整会员需要 operation 及以上（服务端同样校验）。
 */
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { GlassModalShell } from '@/components/ui/primitives'
import { AdminListPage } from '../components/AdminListPage'
import { AdminShell, useAdminSession } from '../components/AdminShell'
import { ReasonDialog } from '../components/ReasonDialog'
import { MembershipAdjustDialog } from './components/MembershipAdjustDialog'
import { AdminApiError, adminRequest, buildQuery } from '../components/admin-api'
import { useAdminResource } from '../components/useAdminResource'
import type { AdminUserDetailDto, AdminUserDto } from '@/lib/admin/mappers'

const PAGE_SIZE = 20

interface UserListResponse {
  items: AdminUserDto[]
  total: number
  page: number
  pageSize: number
}

interface UserDetailResponse {
  user: AdminUserDetailDto
}

interface PlanListResponse {
  plans: Array<{ id: string; code: string; name: string; durationDay: number; isActive: boolean }>
}

type PendingAction =
  | { kind: 'ban'; user: AdminUserDto; banned: boolean }
  | null

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

export default function AdminUsersPage() {
  const t = useTranslations('admin')

  return (
    <AdminShell title={t('nav.users')} description={t('users.description')}>
      <AdminUsersBody />
    </AdminShell>
  )
}

/**
 * 业务体必须是 AdminShell 的子组件：
 * useAdminSession 读取的是 AdminShell 提供的 Context，
 * 在页面组件自身调用会因 Provider 尚未包裹而直接抛错（曾真实导致 500）。
 */
function AdminUsersBody() {
  const t = useTranslations('admin')
  const session = useAdminSession()
  const canOperate = session.role === 'operation' || session.role === 'super'

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | 'active' | 'banned'>('all')
  const [membership, setMembership] = useState<'all' | 'free' | 'paid'>('all')
  const [page, setPage] = useState(1)

  const [detailUserId, setDetailUserId] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [adjustUser, setAdjustUser] = useState<AdminUserDto | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const query = useMemo(
    () => buildQuery({ search: search.trim(), status, membership, page, pageSize: PAGE_SIZE }),
    [search, status, membership, page],
  )

  const list = useAdminResource<UserListResponse>(`/api/admin/users${query}`)
  const detail = useAdminResource<UserDetailResponse>(
    detailUserId ? `/api/admin/users/${detailUserId}` : null,
  )
  const plans = useAdminResource<PlanListResponse>(
    adjustUser && canOperate ? '/api/admin/plans' : null,
  )

  async function runAction(
    path: string,
    body: Record<string, unknown>,
    onDone: () => void,
  ): Promise<void> {
    setSubmitting(true)
    setActionError(null)
    try {
      await adminRequest(path, { method: 'POST', body: JSON.stringify(body) })
      onDone()
      list.reload()
      detail.reload()
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
        emptyTitle={t('users.emptyTitle')}
        emptyDescription={t('users.emptyDescription')}
        filters={
          <>
            <div>
              <label htmlFor='user-search' className='sr-only'>
                {t('users.searchPlaceholder')}
              </label>
              <input
                id='user-search'
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
                placeholder={t('users.searchPlaceholder')}
                className='glass-input-base w-56 px-3 py-2 text-sm'
              />
            </div>
            <div>
              <label htmlFor='user-status' className='sr-only'>
                {t('users.statusLabel')}
              </label>
              <select
                id='user-status'
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as typeof status)
                  setPage(1)
                }}
                className='glass-select-base px-3 py-2 text-sm'
              >
                <option value='all'>{t('users.statusAll')}</option>
                <option value='active'>{t('users.statusActive')}</option>
                <option value='banned'>{t('users.statusBanned')}</option>
              </select>
            </div>
            <div>
              <label htmlFor='user-membership' className='sr-only'>
                {t('users.membershipLabel')}
              </label>
              <select
                id='user-membership'
                value={membership}
                onChange={(event) => {
                  setMembership(event.target.value as typeof membership)
                  setPage(1)
                }}
                className='glass-select-base px-3 py-2 text-sm'
              >
                <option value='all'>{t('users.membershipAll')}</option>
                <option value='free'>{t('users.membershipFree')}</option>
                <option value='paid'>{t('users.membershipPaid')}</option>
              </select>
            </div>
          </>
        }
      >
        <table className='w-full text-sm'>
          <thead>
            <tr className='border-b border-[var(--glass-stroke-soft)] text-left'>
              <th className='px-4 py-3 font-medium text-[var(--glass-text-secondary)]'>{t('users.columnEmail')}</th>
              <th className='whitespace-nowrap px-4 py-3 font-medium text-[var(--glass-text-secondary)]'>{t('users.columnMembership')}</th>
              <th className='whitespace-nowrap px-4 py-3 font-medium text-[var(--glass-text-secondary)]'>{t('users.columnExpireAt')}</th>
              <th className='whitespace-nowrap px-4 py-3 font-medium text-[var(--glass-text-secondary)]'>{t('users.columnStatus')}</th>
              <th className='whitespace-nowrap px-4 py-3 text-right font-medium text-[var(--glass-text-secondary)]'>{t('users.columnActions')}</th>
            </tr>
          </thead>
          <tbody>
            {(list.data?.items ?? []).map((user) => (
              <tr key={user.id} className='border-b border-[var(--glass-stroke-soft)] last:border-b-0'>
                <td className='px-4 py-3'>
                  <p className='truncate text-[var(--glass-text-primary)]'>{user.email}</p>
                  <p className='truncate text-xs text-[var(--glass-text-tertiary)]'>
                    {user.name || '—'} · {formatDate(user.createdAt)}
                  </p>
                </td>
                <td className='whitespace-nowrap px-4 py-3'>
                  {user.membership.isActive ? (
                    <span className='glass-chip glass-chip-success'>
                      {user.membership.planName || t('users.levelPaid', { level: user.membership.level })}
                    </span>
                  ) : (
                    <span className='glass-chip glass-chip-neutral'>{t('users.levelFree')}</span>
                  )}
                </td>
                <td className='whitespace-nowrap px-4 py-3 text-[var(--glass-text-secondary)]'>
                  {user.membership.expireAt ? formatDate(user.membership.expireAt) : t('users.noExpire')}
                </td>
                <td className='whitespace-nowrap px-4 py-3'>
                  {user.isBanned ? (
                    <span className='glass-chip glass-chip-danger'>{t('users.bannedBadge')}</span>
                  ) : (
                    <span className='glass-chip glass-chip-neutral'>{t('users.activeBadge')}</span>
                  )}
                </td>
                <td className='whitespace-nowrap px-4 py-3'>
                  <div className='flex justify-end gap-1'>
                    <button
                      type='button'
                      onClick={() => setDetailUserId(user.id)}
                      className='glass-btn-base glass-btn-ghost px-2 py-1 text-xs font-medium'
                    >
                      {t('users.viewDetail')}
                    </button>
                    {canOperate && (
                      <>
                        <button
                          type='button'
                          onClick={() => {
                            setActionError(null)
                            setPendingAction({ kind: 'ban', user, banned: !user.isBanned })
                          }}
                          className='glass-btn-base glass-btn-ghost px-2 py-1 text-xs font-medium'
                        >
                          {user.isBanned ? t('users.unban') : t('users.ban')}
                        </button>
                        <button
                          type='button'
                          onClick={() => {
                            setActionError(null)
                            setAdjustUser(user)
                          }}
                          className='glass-btn-base glass-btn-soft px-2 py-1 text-xs font-medium'
                        >
                          {t('users.adjustMembership')}
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminListPage>

      {/* 账号详情 */}
      <GlassModalShell
        open={detailUserId !== null}
        onClose={() => setDetailUserId(null)}
        title={t('users.detailTitle')}
        size='lg'
      >
        {detail.loading ? (
          <div className='h-24 animate-pulse rounded-xl bg-[var(--glass-bg-muted)]' />
        ) : detail.error || !detail.data ? (
          <p className='text-sm text-[var(--glass-tone-danger-fg)]'>
            {detail.error?.message ?? t('loadFailedTitle')}
          </p>
        ) : (
          <div className='space-y-5'>
            <dl className='grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4'>
              <div>
                <dt className='text-xs text-[var(--glass-text-tertiary)]'>{t('users.columnEmail')}</dt>
                <dd className='truncate text-sm text-[var(--glass-text-primary)]'>{detail.data.user.email}</dd>
              </div>
              <div>
                <dt className='text-xs text-[var(--glass-text-tertiary)]'>{t('users.detailRegisteredAt')}</dt>
                <dd className='text-sm text-[var(--glass-text-primary)]'>{formatDate(detail.data.user.createdAt)}</dd>
              </div>
              <div>
                <dt className='text-xs text-[var(--glass-text-tertiary)]'>{t('users.detailProjectCount')}</dt>
                <dd className='text-sm text-[var(--glass-text-primary)]'>{detail.data.user.projectCount}</dd>
              </div>
              <div>
                <dt className='text-xs text-[var(--glass-text-tertiary)]'>{t('users.detailTaskCount')}</dt>
                <dd className='text-sm text-[var(--glass-text-primary)]'>{detail.data.user.taskCount}</dd>
              </div>
            </dl>

            <div>
              <h3 className='text-sm font-semibold text-[var(--glass-text-secondary)]'>
                {t('users.detailOrders')}
              </h3>
              {detail.data.user.orders.length === 0 ? (
                <p className='mt-2 text-sm text-[var(--glass-text-tertiary)]'>
                  {t('users.detailNoOrders')}
                </p>
              ) : (
                <ul className='mt-2 space-y-1.5'>
                  {detail.data.user.orders.map((order) => (
                    <li
                      key={order.id}
                      className='flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--glass-bg-muted)] px-3 py-2'
                    >
                      <span className='truncate font-mono text-xs text-[var(--glass-text-secondary)]'>
                        {order.orderNo}
                      </span>
                      <span className='text-xs text-[var(--glass-text-secondary)]'>
                        {order.planName} · ¥{order.amount} · {t(`orderStatus.${order.status}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </GlassModalShell>

      {/* 封禁 / 解封 */}
      <ReasonDialog
        open={pendingAction !== null}
        title={
          pendingAction
            ? pendingAction.banned
              ? t('users.banTitle', { email: pendingAction.user.email })
              : t('users.unbanTitle', { email: pendingAction.user.email })
            : ''
        }
        description={pendingAction?.banned ? t('users.banDescription') : t('users.unbanDescription')}
        confirmLabel={pendingAction?.banned ? t('users.ban') : t('users.unban')}
        danger={pendingAction?.banned === true}
        submitting={submitting}
        error={actionError}
        onClose={() => setPendingAction(null)}
        onConfirm={(reason) => {
          if (!pendingAction) return
          void runAction(
            `/api/admin/users/${pendingAction.user.id}/ban`,
            { banned: pendingAction.banned, reason },
            () => setPendingAction(null),
          )
        }}
      />

      <MembershipAdjustDialog
        open={adjustUser !== null}
        email={adjustUser?.email ?? ''}
        current={
          adjustUser
            ? {
                planName: adjustUser.membership.planName,
                expireAt: adjustUser.membership.expireAt,
                isActive: adjustUser.membership.isActive,
              }
            : null
        }
        plans={(plans.data?.plans ?? []).filter((plan) => plan.isActive && plan.code !== 'free')}
        loadingPlans={plans.loading}
        submitting={submitting}
        error={actionError}
        onClose={() => {
          setAdjustUser(null)
          setActionError(null)
        }}
        onSubmit={(payload, done) => {
          if (!adjustUser) return
          void runAction(`/api/admin/users/${adjustUser.id}/membership`, payload, () => {
            done()
            setAdjustUser(null)
          })
        }}
      />
    </>
  )
}
