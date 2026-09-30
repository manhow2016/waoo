'use client'

/**
 * 操作日志（仅超级管理员）
 *
 * 展示管理员关键操作的审计记录：操作人、动作、目标、原因，以及操作前后值。
 */
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AdminListPage } from '../components/AdminListPage'
import { AdminShell } from '../components/AdminShell'
import { buildQuery } from '../components/admin-api'
import { useAdminResource } from '../components/useAdminResource'
import type { AdminLogDto } from '@/lib/admin/mappers'

const PAGE_SIZE = 20
const ACTION_OPTIONS = [
  'grant_membership',
  'revoke_membership',
  'refund_order',
  'repair_order',
  'ban_user',
  'unban_user',
  'update_plan',
  'update_provider',
  'update_config',
] as const

/** 已维护文案的动作（含只在系统内部触发的动作），其余动作直接展示原始 code */
const LABELED_ACTIONS: readonly string[] = [...ACTION_OPTIONS, 'expire_membership']

interface LogListResponse {
  items: AdminLogDto[]
  total: number
  page: number
  pageSize: number
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return '—'
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export default function AdminLogsPage() {
  const t = useTranslations('admin')

  const [action, setAction] = useState('')
  const [targetId, setTargetId] = useState('')
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const query = useMemo(
    () => buildQuery({ action, targetId: targetId.trim(), page, pageSize: PAGE_SIZE }),
    [action, targetId, page],
  )

  const list = useAdminResource<LogListResponse>(`/api/admin/logs${query}`)

  const actionLabel = (value: string): string =>
    LABELED_ACTIONS.includes(value) ? t(`logAction.${value}` as never) : value

  return (
    <AdminShell title={t('nav.logs')} description={t('logs.description')}>
      <AdminListPage
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        total={list.data?.total ?? 0}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        itemCount={list.data?.items.length ?? 0}
        emptyTitle={t('logs.emptyTitle')}
        emptyDescription={t('logs.emptyDescription')}
        filters={
          <>
            <div>
              <label htmlFor='log-action' className='sr-only'>
                {t('logs.actionLabel')}
              </label>
              <select
                id='log-action'
                value={action}
                onChange={(event) => {
                  setAction(event.target.value)
                  setPage(1)
                }}
                className='glass-select-base px-3 py-2 text-sm'
              >
                <option value=''>{t('all')}</option>
                {ACTION_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {t(`logAction.${value}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor='log-target' className='sr-only'>
                {t('logs.columnTarget')}
              </label>
              <input
                id='log-target'
                value={targetId}
                onChange={(event) => {
                  setTargetId(event.target.value)
                  setPage(1)
                }}
                placeholder={t('logs.searchPlaceholder')}
                className='glass-input-base w-64 px-3 py-2 text-sm'
              />
            </div>
          </>
        }
      >
        <table className='w-full text-sm'>
          <thead>
            <tr className='border-b border-[var(--glass-stroke-soft)] text-left'>
              <th className='whitespace-nowrap px-4 py-3 font-medium text-[var(--glass-text-secondary)]'>{t('logs.columnTime')}</th>
              <th className='whitespace-nowrap px-4 py-3 font-medium text-[var(--glass-text-secondary)]'>{t('logs.columnAdmin')}</th>
              <th className='whitespace-nowrap px-4 py-3 font-medium text-[var(--glass-text-secondary)]'>{t('logs.columnAction')}</th>
              <th className='px-4 py-3 font-medium text-[var(--glass-text-secondary)]'>{t('logs.columnTarget')}</th>
              <th className='px-4 py-3 font-medium text-[var(--glass-text-secondary)]'>{t('logs.columnReason')}</th>
              <th className='whitespace-nowrap px-4 py-3 text-right font-medium text-[var(--glass-text-secondary)]'>{t('logs.columnDiff')}</th>
            </tr>
          </thead>
          <tbody>
            {(list.data?.items ?? []).map((log) => (
              <tr key={log.id} className='border-b border-[var(--glass-stroke-soft)] last:border-b-0 align-top'>
                <td className='whitespace-nowrap px-4 py-3 text-[var(--glass-text-secondary)]'>
                  {new Date(log.createdAt).toLocaleString()}
                </td>
                <td className='whitespace-nowrap px-4 py-3 text-[var(--glass-text-primary)]'>
                  {log.adminUsername ?? t('logs.unknownAdmin')}
                </td>
                <td className='whitespace-nowrap px-4 py-3'>
                  <span className='glass-chip glass-chip-neutral'>
                    {actionLabel(log.action)}
                  </span>
                </td>
                <td className='px-4 py-3'>
                  <p className='truncate font-mono text-xs text-[var(--glass-text-secondary)]'>
                    {log.targetType ?? '—'}
                  </p>
                  <p className='truncate font-mono text-xs text-[var(--glass-text-tertiary)]'>
                    {log.targetId ?? '—'}
                  </p>
                </td>
                <td className='max-w-xs px-4 py-3 text-[var(--glass-text-secondary)]'>
                  <span className='line-clamp-2'>{log.reason ?? '—'}</span>
                </td>
                <td className='whitespace-nowrap px-4 py-3 text-right'>
                  <button
                    type='button'
                    onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                    className='glass-btn-base glass-btn-ghost px-2 py-1 text-xs font-medium'
                  >
                    {expandedId === log.id ? t('close') : t('detail')}
                  </button>
                </td>
              </tr>
            ))}
            {(list.data?.items ?? []).map((log) =>
              expandedId === log.id ? (
                <tr key={`${log.id}-detail`} className='border-b border-[var(--glass-stroke-soft)] last:border-b-0'>
                  <td colSpan={6} className='bg-[var(--glass-bg-muted)] px-4 py-3'>
                    <dl className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
                      <div>
                        <dt className='text-xs text-[var(--glass-text-tertiary)]'>{t('logs.beforeLabel')}</dt>
                        <dd className='mt-1 break-all font-mono text-xs text-[var(--glass-text-secondary)]'>
                          {stringify(log.before)}
                        </dd>
                      </div>
                      <div>
                        <dt className='text-xs text-[var(--glass-text-tertiary)]'>{t('logs.afterLabel')}</dt>
                        <dd className='mt-1 break-all font-mono text-xs text-[var(--glass-text-secondary)]'>
                          {stringify(log.after)}
                        </dd>
                      </div>
                    </dl>
                  </td>
                </tr>
              ) : null,
            )}
          </tbody>
        </table>
      </AdminListPage>
    </AdminShell>
  )
}
