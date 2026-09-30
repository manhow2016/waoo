'use client'

/**
 * 管理后台登录页
 *
 * 与用户端登录完全分离：使用管理员账密，成功后会写入独立的后台会话 Cookie。
 */
import { useState, type FormEvent } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { AppIcon } from '@/components/ui/icons'
import { AdminApiError, adminRequest } from '../components/admin-api'
import { resolveAdminLandingPath, type AdminRole } from '../components/AdminShell'

interface LoginResponse {
  admin: { id: string; username: string; role: AdminRole }
}

export default function AdminLoginPage() {
  const t = useTranslations('admin')
  const router = useRouter()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setErrorMessage(null)

    try {
      const payload = await adminRequest<LoginResponse>('/api/admin/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      })
      router.replace({ pathname: resolveAdminLandingPath(payload.admin.role) })
    } catch (caught) {
      if (caught instanceof AdminApiError) {
        if (caught.status === 401) {
          setErrorMessage(t('login.invalidCredentials'))
        } else if (caught.status === 429) {
          setErrorMessage(t('login.rateLimited'))
        } else if (caught.message.includes('ADMIN_SESSION_CONFIG_MISSING')) {
          setErrorMessage(t('login.configMissing'))
        } else {
          setErrorMessage(`${t('login.genericFailed')}（${caught.code}）`)
        }
      } else {
        setErrorMessage(t('login.genericFailed'))
      }
      setSubmitting(false)
    }
  }

  return (
    <div className='glass-page flex min-h-screen items-center justify-center px-4 py-10'>
      <div className='w-full max-w-sm'>
        <div className='mb-6 flex items-center gap-2'>
          <AppIcon name='lock' className='h-5 w-5 text-[var(--glass-text-tertiary)]' />
          <div>
            <h1 className='text-lg font-semibold text-[var(--glass-text-primary)]'>
              {t('login.title')}
            </h1>
            <p className='text-xs leading-5 text-[var(--glass-text-tertiary)]'>
              {t('login.subtitle')}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className='glass-surface space-y-4 rounded-2xl p-5'>
          <div>
            <label htmlFor='admin-username' className='glass-field-label text-[var(--glass-text-primary)]'>
              {t('login.username')}
            </label>
            <input
              id='admin-username'
              name='username'
              autoComplete='username'
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className='glass-input-base mt-1.5 w-full px-3 py-2 text-sm'
            />
          </div>

          <div>
            <label htmlFor='admin-password' className='glass-field-label text-[var(--glass-text-primary)]'>
              {t('login.password')}
            </label>
            <input
              id='admin-password'
              name='password'
              type='password'
              autoComplete='current-password'
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className='glass-input-base mt-1.5 w-full px-3 py-2 text-sm'
            />
          </div>

          {errorMessage && (
            <p className='text-sm leading-5 text-[var(--glass-tone-danger-fg)]'>{errorMessage}</p>
          )}

          <button
            type='submit'
            disabled={submitting || !username.trim() || !password}
            className='glass-btn-base glass-btn-primary w-full px-4 py-2 text-sm font-medium'
          >
            {submitting ? t('login.submitting') : t('login.submit')}
          </button>
        </form>
      </div>
    </div>
  )
}
