'use client'

/**
 * 账号设置：管理员自助修改密码
 *
 * 修改成功后服务端会自增 sessionVersion，当前会话立即失效，
 * 因此这里展示成功态并引导重新登录。
 */
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { AdminShell, useAdminSession } from '../components/AdminShell'
import { AdminApiError, adminRequest } from '../components/admin-api'

const MIN_PASSWORD_LENGTH = 12

export default function AdminAccountPage() {
  const t = useTranslations('admin')

  return (
    <AdminShell title={t('account.title')} description={t('account.description')}>
      <AdminAccountBody />
    </AdminShell>
  )
}

function AdminAccountBody() {
  const t = useTranslations('admin')
  const session = useAdminSession()
  const router = useRouter()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword
  const canSubmit =
    currentPassword.length > 0
    && newPassword.length >= MIN_PASSWORD_LENGTH
    && newPassword === confirmPassword
    && !submitting

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      await adminRequest('/api/admin/auth/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      setDone(true)
    } catch (caught) {
      if (caught instanceof AdminApiError) {
        if (caught.message.includes('当前密码不正确') || caught.message.includes('current password')) {
          setError(t('account.currentPasswordWrong'))
        } else if (caught.message.includes('PASSWORD_TOO_SHORT')) {
          setError(t('account.passwordRules'))
        } else {
          setError(caught.message)
        }
      } else {
        setError(t('actionFailedTitle'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <section className='glass-surface max-w-lg rounded-2xl p-6'>
        <h2 className='text-base font-semibold text-[var(--glass-text-primary)]'>
          {t('account.successTitle')}
        </h2>
        <p className='mt-2 text-sm leading-6 text-[var(--glass-text-secondary)]'>
          {t('account.successDesc')}
        </p>
        <button
          type='button'
          onClick={() => router.replace({ pathname: '/admin/login' })}
          className='glass-btn-base glass-btn-primary mt-5 px-4 py-2 text-sm font-medium'
        >
          {t('account.goToLogin')}
        </button>
      </section>
    )
  }

  return (
    <section className='glass-surface max-w-lg rounded-2xl p-6'>
      <p className='text-xs text-[var(--glass-text-tertiary)]'>
        {session.username} · {t(`role.${session.role}`)}
      </p>

      <div className='mt-5 space-y-4'>
        <div>
          <label htmlFor='account-current' className='glass-field-label text-[var(--glass-text-primary)]'>
            {t('account.currentPassword')}
          </label>
          <input
            id='account-current'
            type='password'
            autoComplete='current-password'
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            className='glass-input-base mt-1.5 w-full px-3 py-2 text-sm'
          />
        </div>

        <div>
          <label htmlFor='account-new' className='glass-field-label text-[var(--glass-text-primary)]'>
            {t('account.newPassword')}
          </label>
          <input
            id='account-new'
            type='password'
            autoComplete='new-password'
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className='glass-input-base mt-1.5 w-full px-3 py-2 text-sm'
          />
          <p className='glass-field-hint mt-1.5'>{t('account.passwordRules')}</p>
        </div>

        <div>
          <label htmlFor='account-confirm' className='glass-field-label text-[var(--glass-text-primary)]'>
            {t('account.confirmPassword')}
          </label>
          <input
            id='account-confirm'
            type='password'
            autoComplete='new-password'
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className='glass-input-base mt-1.5 w-full px-3 py-2 text-sm'
          />
          {mismatch && (
            <p className='mt-1.5 text-xs text-[var(--glass-tone-danger-fg)]'>
              {t('account.mismatch')}
            </p>
          )}
        </div>

        {error && <p className='text-sm text-[var(--glass-tone-danger-fg)]'>{error}</p>}

        <button
          type='button'
          disabled={!canSubmit}
          onClick={() => void handleSubmit()}
          className='glass-btn-base glass-btn-primary px-4 py-2 text-sm font-medium'
        >
          {submitting ? t('submitting') : t('account.submit')}
        </button>
      </div>
    </section>
  )
}
