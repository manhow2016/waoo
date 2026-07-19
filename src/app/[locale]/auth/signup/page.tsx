'use client'

import { useState, useEffect, useCallback } from "react"
import { useTranslations } from 'next-intl'
import Navbar from "@/components/Navbar"
import PasswordStrengthIndicator from "@/components/auth/PasswordStrengthIndicator"
import { apiFetch } from '@/lib/api-fetch'
import { Link, useRouter } from '@/i18n/navigation'
import { AppIcon } from '@/components/ui/icons'

export default function SignUp() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [captchaCode, setCaptchaCode] = useState("")
  const [captchaSessionId, setCaptchaSessionId] = useState("")
  const [captchaImage, setCaptchaImage] = useState("")
  const [captchaLoading, setCaptchaLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const router = useRouter()
  const t = useTranslations('auth')

  // 获取验证码
  const fetchCaptcha = useCallback(async () => {
    setCaptchaLoading(true)
    try {
      const response = await apiFetch('/api/auth/captcha')
      if (response.ok) {
        const data = await response.json()
        setCaptchaImage(data.image)
        setCaptchaSessionId(data.sessionId)
        setCaptchaCode("")
      }
    } catch {
      // 静默处理
    } finally {
      setCaptchaLoading(false)
    }
  }, [])

  // 初始加载验证码
  useEffect(() => {
    void fetchCaptcha()
  }, [fetchCaptcha])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    setSuccess("")

    if (password !== confirmPassword) {
      setError(t('passwordMismatch'))
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError(t('passwordTooShort'))
      setLoading(false)
      return
    }

    if (!captchaCode) {
      setError(t('captchaRequired'))
      setLoading(false)
      return
    }

    try {
      const response = await apiFetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          captchaSessionId,
          captchaCode,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setSuccess(t('signupSuccess'))
        setTimeout(() => {
          router.push({ pathname: '/auth/signin' })
        }, 2000)
      } else {
        setError(data.message || t('signupFailed'))
        // 验证码错误时刷新验证码
        if (data.message?.includes('验证码')) {
          void fetchCaptcha()
        }
      }
    } catch {
      setError(t('signupError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass-page min-h-screen">
      <Navbar />
      <div className="flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full">
          <div className="glass-surface-modal p-8">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-[var(--glass-text-primary)] mb-2">
                {t('createAccount')}
              </h1>
              <p className="text-[var(--glass-text-secondary)]">{t('joinPlatform')}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="email" className="glass-field-label block mb-2">
                  {t('email')}
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="glass-input-base w-full px-4 py-3"
                  placeholder={t('emailPlaceholder')}
                />
              </div>

              <div>
                <label htmlFor="password" className="glass-field-label block mb-2">
                  {t('password')}
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="glass-input-base w-full px-4 py-3"
                  placeholder={t('passwordMinPlaceholder')}
                />
                <PasswordStrengthIndicator password={password} />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="glass-field-label block mb-2">
                  {t('confirmPassword')}
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="glass-input-base w-full px-4 py-3"
                  placeholder={t('confirmPasswordPlaceholder')}
                />
              </div>

              <div>
                <label className="glass-field-label block mb-2">
                  {t('captcha')}
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={captchaCode}
                    onChange={(e) => setCaptchaCode(e.target.value)}
                    required
                    maxLength={4}
                    className="glass-input-base flex-1 px-4 py-3 uppercase"
                    placeholder={t('captchaPlaceholder')}
                  />
                  <div 
                    className="relative cursor-pointer flex-shrink-0"
                    onClick={() => !captchaLoading && fetchCaptcha()}
                    title={t('captchaRefresh')}
                  >
                    {captchaImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img 
                        src={captchaImage} 
                        alt={t('captcha')}
                        className="h-[46px] rounded-lg border border-[var(--glass-stroke-base)]"
                      />
                    ) : (
                      <div className="h-[46px] w-[120px] rounded-lg border border-[var(--glass-stroke-base)] flex items-center justify-center bg-[var(--glass-bg-muted)]">
                        {captchaLoading ? (
                          <AppIcon name="loader" className="w-5 h-5 animate-spin text-[var(--glass-text-tertiary)]" />
                        ) : (
                          <span className="text-xs text-[var(--glass-text-tertiary)]">{t('captchaLoading')}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-xs text-[var(--glass-text-tertiary)] mt-1">
                  {t('captchaHint')}
                </p>
              </div>

              {error && (
                <div className="bg-[var(--glass-tone-danger-bg)] border border-[color:color-mix(in_srgb,var(--glass-tone-danger-fg)_22%,transparent)] text-[var(--glass-tone-danger-fg)] px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {success && (
                <div className="bg-[var(--glass-tone-success-bg)] border border-[color:color-mix(in_srgb,var(--glass-tone-success-fg)_22%,transparent)] text-[var(--glass-tone-success-fg)] px-4 py-3 rounded-lg text-sm">
                  {success}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="glass-btn-base glass-btn-primary w-full py-3 px-4 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? t('signupButtonLoading') : t('signupButton')}
              </button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-[var(--glass-text-secondary)]">
                {t('hasAccount')}{" "}
                <Link href={{ pathname: '/auth/signin' }} className="text-[var(--glass-tone-info-fg)] hover:underline font-medium">
                  {t('signinNow')}
                </Link>
              </p>
            </div>

            <div className="mt-6 text-center">
              <Link href={{ pathname: '/' }} className="text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-secondary)] text-sm">
                {t('backToHome')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
