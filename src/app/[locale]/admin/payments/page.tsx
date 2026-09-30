'use client'

/**
 * 支付渠道配置（仅超级管理员）
 *
 * 渠道、字段、哪些字段是敏感信息全部由服务端下发的 schema 驱动，
 * 因此新增支付渠道时这个页面不需要任何改动。
 *
 * 安全约定：敏感字段接口只回掩码；输入框留空 = 保持原值不变，不会把掩码写回。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import { AdminShell } from '../components/AdminShell'
import { ReasonDialog } from '../components/ReasonDialog'
import { AdminApiError, adminRequest } from '../components/admin-api'
import { useAdminResource } from '../components/useAdminResource'

interface PaymentChannelField {
  key: string
  labelKey: string
  secret: boolean
  required: boolean
  placeholder: string | null
}

interface PaymentChannelStatus {
  method: string
  fields: PaymentChannelField[]
  implemented: boolean
  enabledInConfig: boolean
  configured: boolean
  effective: boolean
  missingFields: string[]
  values: Record<string, string>
  docsUrl: string | null
}

interface PaymentChannelsResponse {
  channels: PaymentChannelStatus[]
  enabledMethods: string[]
  implementedMethods: string[]
}

export default function AdminPaymentsPage() {
  const t = useTranslations('admin')

  return (
    <AdminShell title={t('nav.payments')} description={t('payments.description')}>
      <AdminPaymentsBody />
    </AdminShell>
  )
}

function AdminPaymentsBody() {
  const t = useTranslations('admin')
  const resource = useAdminResource<PaymentChannelsResponse>('/api/admin/payments')

  // 页面级操作原因：保存参数与启停渠道都写入审计日志
  const [reason, setReason] = useState('')
  const [busyMethod, setBusyMethod] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [disabling, setDisabling] = useState<PaymentChannelStatus | null>(null)

  const channels = resource.data?.channels ?? []
  const reasonReady = reason.trim().length > 0

  const callbackUrl = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/api/membership/webhook?method=hmac-webhook`
  }, [])

  async function submit(path: string, method: 'PUT', body: Record<string, unknown>) {
    setError(null)
    setNotice(null)
    try {
      await adminRequest(path, { method, body: JSON.stringify(body) })
      setNotice(t('payments.saved'))
      resource.reload()
      return true
    } catch (caught) {
      setError(
        caught instanceof AdminApiError ? `${caught.message}（${caught.code}）` : t('actionFailedTitle'),
      )
      return false
    }
  }

  async function saveChannel(method: string, values: Record<string, string>) {
    setBusyMethod(method)
    try {
      await submit('/api/admin/payments', 'PUT', {
        method,
        values,
        reason: reason.trim(),
      })
    } finally {
      setBusyMethod(null)
    }
  }

  async function setEnabled(method: string, enabled: boolean) {
    const next = new Set(resource.data?.enabledMethods ?? [])
    if (enabled) next.add(method)
    else next.delete(method)

    setBusyMethod(method)
    try {
      await submit('/api/admin/payments/methods', 'PUT', {
        methods: Array.from(next),
        reason: reason.trim(),
      })
    } finally {
      setBusyMethod(null)
    }
  }

  return (
    <div className='space-y-5'>
      <section className='glass-surface rounded-2xl p-5'>
        <label htmlFor='payment-reason' className='glass-field-label text-[var(--glass-text-primary)]'>
          {t('reasonLabel')}
        </label>
        <input
          id='payment-reason'
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={t('reasonPlaceholder')}
          className='glass-input-base mt-1.5 w-full px-3 py-2 text-sm sm:max-w-lg'
        />
        <p className='glass-field-hint mt-1.5'>{t('payments.reasonHint')}</p>
        {!reasonReady && (
          <p className='mt-2 text-xs text-[var(--glass-tone-warning-fg)]'>
            {t('payments.reasonRequired')}
          </p>
        )}
        {notice && (
          <p className='mt-2 text-sm text-[var(--glass-tone-success-fg)]'>{notice}</p>
        )}
        {error && <p className='mt-2 text-sm text-[var(--glass-tone-danger-fg)]'>{error}</p>}
      </section>

      {resource.loading ? (
        <div className='space-y-3'>
          {[0, 1].map((index) => (
            <div key={index} className='glass-surface h-48 animate-pulse rounded-2xl' />
          ))}
        </div>
      ) : resource.error ? (
        <div className='glass-surface rounded-2xl p-6'>
          <h2 className='text-base font-semibold text-[var(--glass-text-primary)]'>
            {t('loadFailedTitle')}
          </h2>
          <p className='mt-1 text-sm text-[var(--glass-text-secondary)]'>
            {resource.error.message}
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
          {channels.map((channel) => (
            <ChannelCard
              key={channel.method}
              channel={channel}
              busy={busyMethod === channel.method}
              disabled={!reasonReady}
              callbackUrl={channel.method === 'hmac-webhook' ? callbackUrl : null}
              onSave={saveChannel}
              onRequestDisable={() => {
                setError(null)
                setDisabling(channel)
              }}
              onEnable={() => void setEnabled(channel.method, true)}
            />
          ))}
        </div>
      )}

      <ReasonDialog
        open={disabling !== null}
        title={disabling ? t('payments.disableTitle', { name: t(`payments.channels.${disabling.method}.name`) }) : ''}
        description={t('payments.disableDescription')}
        confirmLabel={t('payments.disable')}
        danger
        submitting={busyMethod !== null}
        error={error}
        onClose={() => setDisabling(null)}
        onConfirm={(reasonText) => {
          if (!disabling) return
          const next = new Set(resource.data?.enabledMethods ?? [])
          next.delete(disabling.method)
          setReason(reasonText)
          setDisabling(null)
          void submit('/api/admin/payments/methods', 'PUT', {
            methods: Array.from(next),
            reason: reasonText,
          })
        }}
      />
    </div>
  )
}

function ChannelCard({
  channel,
  busy,
  disabled,
  callbackUrl,
  onSave,
  onEnable,
  onRequestDisable,
}: {
  channel: PaymentChannelStatus
  busy: boolean
  disabled: boolean
  callbackUrl: string | null
  onSave: (method: string, values: Record<string, string>) => Promise<void>
  onEnable: () => void
  onRequestDisable: () => void
}) {
  const t = useTranslations('admin')
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState(false)

  // 切换渠道或刷新后，用服务端的非敏感字段值重置表单（敏感字段始终留空）
  useEffect(() => {
    const next: Record<string, string> = {}
    for (const field of channel.fields) {
      next[field.key] = field.secret ? '' : (channel.values[field.key] ?? '')
    }
    setDraft(next)
  }, [channel])

  const canSave = !disabled && !busy && channel.implemented

  const handleCopy = useCallback(async () => {
    if (!callbackUrl) return
    try {
      await navigator.clipboard.writeText(callbackUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 剪贴板不可用时可手动选中
    }
  }, [callbackUrl])

  return (
    <section className='glass-surface rounded-2xl p-5'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='min-w-0'>
          <div className='flex flex-wrap items-center gap-2'>
            <h2 className='text-base font-semibold text-[var(--glass-text-primary)]'>
              {t(`payments.channels.${channel.method}.name`)}
            </h2>
            {channel.effective && (
              <span className='glass-chip glass-chip-success'>{t('payments.badgeEffective')}</span>
            )}
            {channel.enabledInConfig && !channel.effective && (
              <span className='glass-chip glass-chip-warning'>{t('payments.badgeEnabledNotReady')}</span>
            )}
            {!channel.implemented && (
              <span className='glass-chip glass-chip-neutral'>{t('payments.badgeNotImplemented')}</span>
            )}
            {channel.implemented && !channel.configured && (
              <span className='glass-chip glass-chip-warning'>{t('payments.badgeMissingParams')}</span>
            )}
          </div>
          <p className='mt-1 max-w-2xl text-sm leading-6 text-[var(--glass-text-secondary)]'>
            {t(`payments.channels.${channel.method}.description`)}
          </p>
          {channel.docsUrl && (
            <a
              href={channel.docsUrl}
              target='_blank'
              rel='noreferrer'
              className='mt-1 inline-flex items-center gap-1 text-xs text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-secondary)]'
            >
              {t('payments.docsLink')}
              <AppIcon name='externalLink' className='h-3 w-3' />
            </a>
          )}
        </div>

        <div className='flex shrink-0 items-center gap-2'>
          {channel.enabledInConfig ? (
            <button
              type='button'
              disabled={busy}
              onClick={onRequestDisable}
              className='glass-btn-base glass-btn-soft px-3 py-1.5 text-xs font-medium'
            >
              {t('payments.disable')}
            </button>
          ) : (
            <button
              type='button'
              disabled={busy || !channel.implemented || !channel.configured}
              title={
                !channel.implemented
                  ? t('payments.notImplementedHint')
                  : !channel.configured
                    ? t('payments.missingParamsHint')
                    : undefined
              }
              onClick={onEnable}
              className='glass-btn-base glass-btn-primary px-3 py-1.5 text-xs font-medium'
            >
              {t('payments.enable')}
            </button>
          )}
        </div>
      </div>

      {!channel.implemented && (
        <p className='mt-3 rounded-lg bg-[var(--glass-tone-warning-bg)] px-3 py-2 text-xs leading-5 text-[var(--glass-tone-warning-fg)]'>
          {t('payments.notImplementedHint')}
        </p>
      )}

      {callbackUrl && (
        <div className='mt-3'>
          <p className='text-xs text-[var(--glass-text-tertiary)]'>{t('payments.callbackUrlLabel')}</p>
          <div className='mt-1 flex items-center gap-2'>
            <code className='min-w-0 truncate font-mono text-xs text-[var(--glass-text-secondary)]'>
              {callbackUrl}
            </code>
            <button
              type='button'
              onClick={() => void handleCopy()}
              className='glass-btn-base glass-btn-ghost shrink-0 px-2 py-0.5 text-xs font-medium'
            >
              {copied ? t('payments.copied') : t('payments.copy')}
            </button>
          </div>
          <p className='glass-field-hint mt-1'>{t('payments.callbackUrlHint')}</p>
        </div>
      )}

      {channel.fields.length > 0 && (
        <div className='mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2'>
          {channel.fields.map((field) => {
            const configuredMask = channel.values[field.key] ?? ''
            return (
              <div key={field.key} className={field.secret ? 'sm:col-span-1' : 'sm:col-span-1'}>
                <label
                  htmlFor={`payment-${channel.method}-${field.key}`}
                  className='glass-field-label text-[var(--glass-text-primary)]'
                >
                  {t(`payments.fields.${field.labelKey}`)}
                  {field.required && <span className='ml-1 text-[var(--glass-tone-danger-fg)]'>*</span>}
                </label>
                <input
                  id={`payment-${channel.method}-${field.key}`}
                  type={field.secret ? 'password' : 'text'}
                  autoComplete='off'
                  value={draft[field.key] ?? ''}
                  placeholder={field.secret && configuredMask ? configuredMask : (field.placeholder ?? '')}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, [field.key]: event.target.value }))
                  }
                  className='glass-input-base mt-1.5 w-full px-3 py-2 text-sm'
                />
                {field.secret && (
                  <p className='glass-field-hint mt-1.5'>
                    {configuredMask ? t('payments.secretConfiguredHint') : t('payments.secretEmptyHint')}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className='mt-4 flex flex-wrap items-center gap-3'>
        <button
          type='button'
          disabled={!canSave}
          onClick={() => void onSave(channel.method, draft)}
          className='glass-btn-base glass-btn-primary px-4 py-2 text-sm font-medium'
        >
          {busy ? t('saving') : t('payments.saveParams')}
        </button>
        {!channel.implemented && (
          <span className='text-xs text-[var(--glass-text-tertiary)]'>
            {t('payments.saveAnywayHint')}
          </span>
        )}
        {channel.missingFields.length > 0 && channel.implemented && (
          <span className='text-xs text-[var(--glass-tone-warning-fg)]'>
            {t('payments.missingFields', { fields: channel.missingFields.join(', ') })}
          </span>
        )}
      </div>
    </section>
  )
}
