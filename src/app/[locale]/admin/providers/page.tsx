'use client'

/**
 * 供应商管理：列表 / 新增 / 编辑 / 启停 / 设默认
 *
 * 「默认供应商」是免费账号唯一可用的供应商，服务端在事务内保证全局唯一。
 * config 只允许放展示信息（控制台地址等），不承载 API Key 与 baseUrl。
 */
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { GlassModalShell } from '@/components/ui/primitives'
import { AdminListPage } from '../components/AdminListPage'
import { AdminShell } from '../components/AdminShell'
import { ReasonDialog } from '../components/ReasonDialog'
import { AdminApiError, adminRequest } from '../components/admin-api'
import { useAdminResource } from '../components/useAdminResource'
import type { AdminProviderDto } from '@/lib/admin/mappers'

interface ProviderListResponse {
  providers: AdminProviderDto[]
}

interface ProviderFormState {
  code: string
  name: string
  isDefault: boolean
  isActive: boolean
  sortOrder: string
  configText: string
}

const EMPTY_FORM: ProviderFormState = {
  code: '',
  name: '',
  isDefault: false,
  isActive: true,
  sortOrder: '0',
  configText: '',
}

type PendingAction =
  | { kind: 'setDefault'; provider: AdminProviderDto }
  | { kind: 'toggle'; provider: AdminProviderDto; nextActive: boolean }
  | null

export default function AdminProvidersPage() {
  const t = useTranslations('admin')
  const list = useAdminResource<ProviderListResponse>('/api/admin/providers')

  const [editing, setEditing] = useState<AdminProviderDto | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<ProviderFormState>(EMPTY_FORM)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [pendingAction, setPendingAction] = useState<PendingAction>(null)

  const dialogOpen = creating || editing !== null
  const providers = list.data?.providers ?? []

  function openCreate() {
    setForm(EMPTY_FORM)
    setReason('')
    setError(null)
    setEditing(null)
    setCreating(true)
  }

  function openEdit(provider: AdminProviderDto) {
    setForm({
      code: provider.code,
      name: provider.name,
      isDefault: provider.isDefault,
      isActive: provider.isActive,
      sortOrder: String(provider.sortOrder),
      configText: provider.config ? JSON.stringify(provider.config, null, 2) : '',
    })
    setReason('')
    setError(null)
    setCreating(false)
    setEditing(provider)
  }

  function closeDialog() {
    setCreating(false)
    setEditing(null)
    setError(null)
  }

  function parseConfig(): { ok: true; value: unknown } | { ok: false } {
    const text = form.configText.trim()
    if (!text) return { ok: true, value: null }
    try {
      return { ok: true, value: JSON.parse(text) }
    } catch {
      return { ok: false }
    }
  }

  async function submitForm() {
    const parsed = parseConfig()
    if (!parsed.ok) {
      setError(t('providers.fieldConfigHint'))
      return
    }

    const sortOrder = Number.parseInt(form.sortOrder, 10)
    setSubmitting(true)
    setError(null)

    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        isDefault: form.isDefault,
        isActive: form.isActive,
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
        ...(parsed.value !== null ? { config: parsed.value } : {}),
      }

      if (editing) {
        await adminRequest(`/api/admin/providers/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify({ provider: payload, reason: reason.trim() }),
        })
      } else {
        await adminRequest('/api/admin/providers', {
          method: 'POST',
          body: JSON.stringify({ provider: payload, reason: reason.trim() }),
        })
      }
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

  async function submitPendingAction(reasonText: string) {
    if (!pendingAction) return
    setSubmitting(true)
    setError(null)

    try {
      const { provider } = pendingAction
      const nextDefault = pendingAction.kind === 'setDefault' ? true : provider.isDefault
      const nextActive = pendingAction.kind === 'toggle' ? pendingAction.nextActive : provider.isActive

      await adminRequest(`/api/admin/providers/${provider.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          provider: {
            code: provider.code,
            name: provider.name,
            isDefault: nextDefault,
            isActive: nextActive,
            sortOrder: provider.sortOrder,
          },
          reason: reasonText,
        }),
      })
      setPendingAction(null)
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
      title={t('nav.providers')}
      description={t('providers.description')}
      actions={
        <button
          type='button'
          onClick={openCreate}
          className='glass-btn-base glass-btn-primary px-4 py-2 text-sm font-medium'
        >
          {t('create')}
        </button>
      }
    >
      <AdminListPage
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        total={providers.length}
        page={1}
        pageSize={Math.max(providers.length, 1)}
        onPageChange={() => undefined}
        itemCount={providers.length}
        emptyTitle={t('providers.emptyTitle')}
        emptyDescription={t('providers.emptyDescription')}
      >
        <table className='w-full text-sm'>
          <thead>
            <tr className='border-b border-[var(--glass-stroke-soft)] text-left'>
              <th className='px-4 py-3 font-medium text-[var(--glass-text-secondary)]'>{t('providers.columnCode')}</th>
              <th className='px-4 py-3 font-medium text-[var(--glass-text-secondary)]'>{t('providers.columnName')}</th>
              <th className='whitespace-nowrap px-4 py-3 font-medium text-[var(--glass-text-secondary)]'>{t('providers.columnDefault')}</th>
              <th className='whitespace-nowrap px-4 py-3 font-medium text-[var(--glass-text-secondary)]'>{t('providers.columnStatus')}</th>
              <th className='whitespace-nowrap px-4 py-3 font-medium text-[var(--glass-text-secondary)]'>{t('providers.columnSort')}</th>
              <th className='whitespace-nowrap px-4 py-3 text-right font-medium text-[var(--glass-text-secondary)]'>{t('providers.columnActions')}</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((provider) => (
              <tr key={provider.id} className='border-b border-[var(--glass-stroke-soft)] last:border-b-0'>
                <td className='whitespace-nowrap px-4 py-3 font-mono text-xs text-[var(--glass-text-primary)]'>
                  {provider.code}
                </td>
                <td className='px-4 py-3 text-[var(--glass-text-primary)]'>{provider.name}</td>
                <td className='whitespace-nowrap px-4 py-3'>
                  {provider.isDefault ? (
                    <span className='glass-chip glass-chip-info'>{t('providers.defaultBadge')}</span>
                  ) : (
                    <span className='text-[var(--glass-text-tertiary)]'>—</span>
                  )}
                </td>
                <td className='whitespace-nowrap px-4 py-3'>
                  <span className={provider.isActive ? 'glass-chip glass-chip-success' : 'glass-chip glass-chip-neutral'}>
                    {provider.isActive ? t('providers.activeBadge') : t('providers.inactiveBadge')}
                  </span>
                </td>
                <td className='whitespace-nowrap px-4 py-3 text-[var(--glass-text-secondary)]'>{provider.sortOrder}</td>
                <td className='whitespace-nowrap px-4 py-3'>
                  <div className='flex justify-end gap-1'>
                    <button
                      type='button'
                      onClick={() => openEdit(provider)}
                      className='glass-btn-base glass-btn-ghost px-2 py-1 text-xs font-medium'
                    >
                      {t('edit')}
                    </button>
                    {!provider.isDefault && provider.isActive && (
                      <button
                        type='button'
                        onClick={() => {
                          setError(null)
                          setPendingAction({ kind: 'setDefault', provider })
                        }}
                        className='glass-btn-base glass-btn-soft px-2 py-1 text-xs font-medium'
                      >
                        {t('providers.setDefault')}
                      </button>
                    )}
                    <button
                      type='button'
                      onClick={() => {
                        setError(null)
                        setPendingAction({
                          kind: 'toggle',
                          provider,
                          nextActive: !provider.isActive,
                        })
                      }}
                      className='glass-btn-base glass-btn-ghost px-2 py-1 text-xs font-medium'
                    >
                      {provider.isActive ? t('providers.disable') : t('providers.enable')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminListPage>

      <GlassModalShell
        open={dialogOpen}
        onClose={closeDialog}
        title={editing ? t('providers.editTitle', { code: editing.code }) : t('providers.createTitle')}
        size='lg'
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
              disabled={submitting || !form.name.trim() || !form.code.trim() || !reason.trim()}
              onClick={() => void submitForm()}
              className='glass-btn-base glass-btn-primary px-4 py-2 text-sm font-medium'
            >
              {submitting ? t('saving') : t('save')}
            </button>
          </div>
        }
      >
        <div className='space-y-4'>
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
            <div>
              <label htmlFor='provider-code' className='glass-field-label text-[var(--glass-text-primary)]'>
                {t('providers.fieldCode')}
              </label>
              <input
                id='provider-code'
                value={form.code}
                disabled={editing !== null}
                onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
                className='glass-input-base mt-1.5 w-full px-3 py-2 text-sm'
              />
              <p className='glass-field-hint mt-1.5'>{t('providers.fieldCodeHint')}</p>
            </div>

            <div>
              <label htmlFor='provider-name' className='glass-field-label text-[var(--glass-text-primary)]'>
                {t('providers.fieldName')}
              </label>
              <input
                id='provider-name'
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                className='glass-input-base mt-1.5 w-full px-3 py-2 text-sm'
              />
            </div>

            <div>
              <label htmlFor='provider-sort' className='glass-field-label text-[var(--glass-text-primary)]'>
                {t('providers.columnSort')}
              </label>
              <input
                id='provider-sort'
                type='number'
                value={form.sortOrder}
                onChange={(event) => setForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
                className='glass-input-base mt-1.5 w-full px-3 py-2 text-sm'
              />
            </div>

            <div className='flex flex-col justify-end gap-2'>
              <label className='flex items-center gap-2 text-sm text-[var(--glass-text-primary)]'>
                <input
                  type='checkbox'
                  checked={form.isDefault}
                  onChange={(event) => setForm((prev) => ({ ...prev, isDefault: event.target.checked }))}
                />
                {t('providers.fieldDefault')}
              </label>
              <label className='flex items-center gap-2 text-sm text-[var(--glass-text-primary)]'>
                <input
                  type='checkbox'
                  checked={form.isActive}
                  onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                />
                {t('providers.fieldActive')}
              </label>
            </div>
          </div>

          <div>
            <label htmlFor='provider-config' className='glass-field-label text-[var(--glass-text-primary)]'>
              config（JSON）
            </label>
            <textarea
              id='provider-config'
              rows={4}
              value={form.configText}
              onChange={(event) => setForm((prev) => ({ ...prev, configText: event.target.value }))}
              placeholder='{"consoleUrl": "https://example.com"}'
              className='glass-textarea-base mt-1.5 w-full px-3 py-2 font-mono text-xs'
            />
            <p className='glass-field-hint mt-1.5'>{t('providers.fieldConfigHint')}</p>
          </div>

          <div>
            <label htmlFor='provider-reason' className='glass-field-label text-[var(--glass-text-primary)]'>
              {t('reasonLabel')}
            </label>
            <textarea
              id='provider-reason'
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

      <ReasonDialog
        open={pendingAction !== null}
        title={
          pendingAction?.kind === 'setDefault'
            ? t('providers.setDefaultTitle', { name: pendingAction.provider.name })
            : pendingAction
              ? t('providers.toggleTitle', {
                  action: pendingAction.nextActive ? t('providers.enable') : t('providers.disable'),
                  name: pendingAction.provider.name,
                })
              : ''
        }
        description={
          pendingAction?.kind === 'setDefault'
            ? t('providers.setDefaultDescription')
            : t('providers.toggleDescription')
        }
        confirmLabel={
          pendingAction?.kind === 'setDefault' ? t('providers.setDefault') : t('save')
        }
        danger={pendingAction?.kind === 'toggle' && pendingAction.nextActive === false}
        submitting={submitting}
        error={error}
        onClose={() => setPendingAction(null)}
        onConfirm={(reasonText) => void submitPendingAction(reasonText)}
      />
    </AdminShell>
  )
}
