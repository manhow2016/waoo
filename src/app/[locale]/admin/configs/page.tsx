'use client'

/**
 * 系统配置（仅超级管理员）
 *
 * 值使用 JSON 编辑，服务端会做键名格式校验并写入操作日志。
 */
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { GlassModalShell } from '@/components/ui/primitives'
import { AdminListPage } from '../components/AdminListPage'
import { AdminShell } from '../components/AdminShell'
import { AdminApiError, adminRequest } from '../components/admin-api'
import { useAdminResource } from '../components/useAdminResource'

interface ConfigEntry {
  key: string
  value: unknown
  updatedAt: string
}

interface ConfigListResponse {
  configs: ConfigEntry[]
}

function stringifyValue(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString()
}

export default function AdminConfigsPage() {
  const t = useTranslations('admin')
  const list = useAdminResource<ConfigListResponse>('/api/admin/configs')

  const [editing, setEditing] = useState<ConfigEntry | null>(null)
  const [creating, setCreating] = useState(false)
  const [key, setKey] = useState('')
  const [valueText, setValueText] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dialogOpen = creating || editing !== null
  const entries = list.data?.configs ?? []

  function openCreate() {
    setKey('')
    setValueText('')
    setReason('')
    setError(null)
    setEditing(null)
    setCreating(true)
  }

  function openEdit(entry: ConfigEntry) {
    setKey(entry.key)
    setValueText(JSON.stringify(entry.value, null, 2))
    setReason('')
    setError(null)
    setCreating(false)
    setEditing(entry)
  }

  function closeDialog() {
    setCreating(false)
    setEditing(null)
    setError(null)
  }

  async function submitForm() {
    let parsed: unknown
    try {
      parsed = JSON.parse(valueText)
    } catch {
      setError(t('configs.invalidJson'))
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await adminRequest('/api/admin/configs', {
        method: 'PUT',
        body: JSON.stringify({
          entries: [{ key: key.trim(), value: parsed }],
          reason: reason.trim(),
        }),
      })
      closeDialog()
      list.reload()
    } catch (caught) {
      setError(
        caught instanceof AdminApiError ? `${caught.message}（${caught.code}）` : t('actionFailedTitle'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AdminShell
      title={t('nav.configs')}
      description={t('configs.description')}
      actions={
        <button
          type='button'
          onClick={openCreate}
          className='glass-btn-base glass-btn-primary px-4 py-2 text-sm font-medium'
        >
          {t('configs.addConfig')}
        </button>
      }
    >
      <AdminListPage
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        total={entries.length}
        page={1}
        pageSize={Math.max(entries.length, 1)}
        onPageChange={() => undefined}
        itemCount={entries.length}
        emptyTitle={t('configs.emptyTitle')}
        emptyDescription={t('configs.emptyDescription')}
      >
        <table className='w-full text-sm'>
          <thead>
            <tr className='border-b border-[var(--glass-stroke-soft)] text-left'>
              <th className='px-4 py-3 font-medium text-[var(--glass-text-secondary)]'>{t('configs.columnKey')}</th>
              <th className='px-4 py-3 font-medium text-[var(--glass-text-secondary)]'>{t('configs.columnValue')}</th>
              <th className='whitespace-nowrap px-4 py-3 font-medium text-[var(--glass-text-secondary)]'>{t('configs.columnUpdatedAt')}</th>
              <th className='whitespace-nowrap px-4 py-3 text-right font-medium text-[var(--glass-text-secondary)]'>{t('configs.columnActions')}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.key} className='border-b border-[var(--glass-stroke-soft)] last:border-b-0'>
                <td className='whitespace-nowrap px-4 py-3 font-mono text-xs text-[var(--glass-text-primary)]'>
                  {entry.key}
                </td>
                <td className='max-w-md px-4 py-3'>
                  <code className='line-clamp-2 block break-all font-mono text-xs text-[var(--glass-text-secondary)]'>
                    {stringifyValue(entry.value)}
                  </code>
                </td>
                <td className='whitespace-nowrap px-4 py-3 text-[var(--glass-text-tertiary)]'>
                  {formatDate(entry.updatedAt)}
                </td>
                <td className='whitespace-nowrap px-4 py-3 text-right'>
                  <button
                    type='button'
                    onClick={() => openEdit(entry)}
                    className='glass-btn-base glass-btn-ghost px-2 py-1 text-xs font-medium'
                  >
                    {t('edit')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminListPage>

      <GlassModalShell
        open={dialogOpen}
        onClose={closeDialog}
        title={editing ? t('configs.editTitle', { key: editing.key }) : t('configs.createTitle')}
        size='md'
        footer={
          <div className='flex justify-end gap-2'>
            <button
              type='button'
              onClick={closeDialog}
              className='glass-btn-base glass-btn-soft px-4 py-2 text-sm font-medium'
            >
              {t('cancel')}
            </button>
            <button
              type='button'
              disabled={submitting || !key.trim() || !valueText.trim() || !reason.trim()}
              onClick={() => void submitForm()}
              className='glass-btn-base glass-btn-primary px-4 py-2 text-sm font-medium'
            >
              {submitting ? t('saving') : t('save')}
            </button>
          </div>
        }
      >
        <div className='space-y-4'>
          <div>
            <label htmlFor='config-key' className='glass-field-label text-[var(--glass-text-primary)]'>
              {t('configs.fieldKey')}
            </label>
            <input
              id='config-key'
              value={key}
              disabled={editing !== null}
              onChange={(event) => setKey(event.target.value)}
              className='glass-input-base mt-1.5 w-full px-3 py-2 font-mono text-sm'
            />
            <p className='glass-field-hint mt-1.5'>{t('configs.fieldKeyHint')}</p>
          </div>

          <div>
            <label htmlFor='config-value' className='glass-field-label text-[var(--glass-text-primary)]'>
              {t('configs.fieldValue')}
            </label>
            <textarea
              id='config-value'
              rows={4}
              value={valueText}
              onChange={(event) => setValueText(event.target.value)}
              className='glass-textarea-base mt-1.5 w-full px-3 py-2 font-mono text-xs'
            />
            <p className='glass-field-hint mt-1.5'>{t('configs.fieldValueHint')}</p>
          </div>

          <div>
            <label htmlFor='config-reason' className='glass-field-label text-[var(--glass-text-primary)]'>
              {t('reasonLabel')}
            </label>
            <textarea
              id='config-reason'
              rows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t('reasonPlaceholder')}
              className='glass-textarea-base mt-1.5 w-full px-3 py-2 text-sm'
            />
          </div>
        </div>

        {error && <p className='mt-3 text-sm text-[var(--glass-tone-danger-fg)]'>{error}</p>}
      </GlassModalShell>
    </AdminShell>
  )
}
