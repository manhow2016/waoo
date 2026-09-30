'use client'

/**
 * 后台列表页通用外壳：筛选区 + 工具区 + 三态（加载/错误/空）+ 分页
 *
 * 所有后台列表共用同一套骨架，保证交互与视觉一致，
 * 页面只需要提供筛选控件、表格内容与分页状态。
 */
import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import type { AdminApiError } from './admin-api'

interface AdminListPageProps {
  loading: boolean
  error: AdminApiError | null
  onRetry: () => void
  total: number
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  itemCount: number
  emptyTitle: string
  emptyDescription?: string
  filters?: ReactNode
  toolbar?: ReactNode
  children: ReactNode
}

export function AdminListPage({
  loading,
  error,
  onRetry,
  total,
  page,
  pageSize,
  onPageChange,
  itemCount,
  emptyTitle,
  emptyDescription,
  filters,
  toolbar,
  children,
}: AdminListPageProps) {
  const t = useTranslations('admin')
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const showEmpty = !loading && !error && itemCount === 0

  return (
    <div className='space-y-4'>
      {(filters || toolbar) && (
        <div className='flex flex-wrap items-end justify-between gap-3'>
          <div className='flex flex-wrap items-end gap-2'>{filters}</div>
          <div className='flex flex-wrap items-center gap-2'>{toolbar}</div>
        </div>
      )}

      {loading ? (
        <div className='glass-surface space-y-2 rounded-2xl p-4'>
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className='h-10 animate-pulse rounded-lg bg-[var(--glass-bg-muted)]' />
          ))}
        </div>
      ) : error ? (
        <div className='glass-surface rounded-2xl p-6'>
          <div className='flex items-start gap-3'>
            <AppIcon name='alert' className='mt-0.5 h-5 w-5 shrink-0 text-[var(--glass-tone-danger-fg)]' />
            <div className='min-w-0'>
              <h2 className='text-base font-semibold text-[var(--glass-text-primary)]'>
                {t('loadFailedTitle')}
              </h2>
              <p className='mt-1 text-sm text-[var(--glass-text-secondary)]'>
                {error.message}（{error.code}）
              </p>
              <button
                type='button'
                onClick={onRetry}
                className='glass-btn-base glass-btn-primary mt-4 px-4 py-2 text-sm font-medium'
              >
                {t('retry')}
              </button>
            </div>
          </div>
        </div>
      ) : showEmpty ? (
        <div className='glass-surface rounded-2xl p-10 text-center'>
          <AppIcon name='search' className='mx-auto h-6 w-6 text-[var(--glass-text-tertiary)]' />
          <h2 className='mt-3 text-base font-semibold text-[var(--glass-text-primary)]'>
            {emptyTitle}
          </h2>
          {emptyDescription && (
            <p className='mt-1 text-sm text-[var(--glass-text-secondary)]'>{emptyDescription}</p>
          )}
        </div>
      ) : (
        <div className='glass-surface overflow-hidden rounded-2xl'>
          <div className='overflow-x-auto'>{children}</div>
        </div>
      )}

      {!loading && !error && total > 0 && (
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <p className='text-xs text-[var(--glass-text-tertiary)]'>
            {t('pagination.summary', { total, page, totalPages })}
          </p>
          <div className='flex items-center gap-2'>
            <button
              type='button'
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className='glass-btn-base glass-btn-soft px-3 py-1.5 text-sm font-medium'
            >
              {t('pagination.prev')}
            </button>
            <button
              type='button'
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className='glass-btn-base glass-btn-soft px-3 py-1.5 text-sm font-medium'
            >
              {t('pagination.next')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminListPage
