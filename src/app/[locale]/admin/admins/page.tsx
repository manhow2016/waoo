'use client'

/**
 * 管理员账号管理（仅超级管理员）
 *
 * 服务端强约束：不能停用自己，也不能停用/降级最后一个启用中的超级管理员。
 * 重置密码会自增 sessionVersion，使目标账号的所有后台会话立即失效。
 */
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { GlassModalShell } from '@/components/ui/primitives'
import { AdminListPage } from '../components/AdminListPage'
import { AdminShell, useAdminSession } from '../components/AdminShell'
import { AdminApiError, adminRequest } from '../components/admin-api'
import { useAdminResource } from '../components/useAdminResource'

const ROLES = ['support', 'operation', 'super'] as const
type AdminRoleValue = (typeof ROLES)[number]

interface AdminAccount {
  id: string
  username: string
  role: AdminRoleValue
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
}

interface AdminListResponse {
  admins: AdminAccount[]
}

const MIN_PASSWORD_LENGTH = 12

export default function AdminAdminsPage() {
  const t = useTranslations('admin')

  return (
    <AdminShell title={t('nav.admins')} description={t('admins.description')}>
      <AdminAdminsBody />
    </AdminShell>
  )
}

function AdminAdminsBody() {
  const t = useTranslations('admin')
  const session = useAdminSession()
  const list = useAdminResource<AdminListResponse>('/api/admin/admins')

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<AdminAccount | null>(null)
  const [resetting, setResetting] = useState<AdminAccount | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const admins = list.data?.admins ?? []
  const activeSupers = admins.filter((item) => item.role === 'super' && item.isActive)

  function reset() {
    setCreating(false)
    setEditing(null)
    setResetting(null)
    setError(null)
  }

  async function submit(path: string, method: 'POST' | 'PUT', body: Record<string, unknown>) {
    setSubmitting(true)
    setError(null)
    try {
      await adminRequest(path, { method, body: JSON.stringify(body) })
      reset()
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
    <>
      <AdminListPage
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        total={admins.length}
        page={1}
        pageSize={Math.max(admins.length, 1)}
        onPageChange={() => undefined}
        itemCount={admins.length}
        emptyTitle={t('admins.emptyTitle')}
        emptyDescription={t('admins.emptyDescription')}
        toolbar={
          <button
            type='button'
            onClick={() => {
              setError(null)
              setCreating(true)
            }}
            className='glass-btn-base glass-btn-primary px-4 py-2 text-sm font-medium'
          >
            {t('create')}
          </button>
        }
      >
        <table className='w-full text-sm'>
          <thead>
            <tr className='border-b border-[var(--glass-stroke-soft)] text-left'>
              <th className='px-4 py-3 font-medium text-[var(--glass-text-secondary)]'>{t('admins.columnUsername')}</th>
              <th className='whitespace-nowrap px-4 py-3 font-medium text-[var(--glass-text-secondary)]'>{t('admins.columnRole')}</th>
              <th className='whitespace-nowrap px-4 py-3 font-medium text-[var(--glass-text-secondary)]'>{t('admins.columnStatus')}</th>
              <th className='whitespace-nowrap px-4 py-3 font-medium text-[var(--glass-text-secondary)]'>{t('admins.columnLastLogin')}</th>
              <th className='whitespace-nowrap px-4 py-3 font-medium text-[var(--glass-text-secondary)]'>{t('admins.columnCreatedAt')}</th>
              <th className='whitespace-nowrap px-4 py-3 text-right font-medium text-[var(--glass-text-secondary)]'>{t('admins.columnActions')}</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((item) => {
              const isSelf = item.id === session.id
              const isLastSuper = item.role === 'super' && item.isActive && activeSupers.length <= 1
              return (
                <tr key={item.id} className='border-b border-[var(--glass-stroke-soft)] last:border-b-0'>
                  <td className='px-4 py-3'>
                    <div className='flex items-center gap-2'>
                      <span className='truncate text-[var(--glass-text-primary)]'>{item.username}</span>
                      {isSelf && (
                        <span className='glass-chip glass-chip-info'>{t('admins.selfBadge')}</span>
                      )}
                      {isLastSuper && (
                        <span className='glass-chip glass-chip-warning' title={t('admins.lastSuperWarning')}>
                          super
                        </span>
                      )}
                    </div>
                  </td>
                  <td className='whitespace-nowrap px-4 py-3'>
                    <span className='glass-chip glass-chip-neutral'>{t(`role.${item.role}`)}</span>
                  </td>
                  <td className='whitespace-nowrap px-4 py-3'>
                    <span className={item.isActive ? 'glass-chip glass-chip-success' : 'glass-chip glass-chip-neutral'}>
                      {item.isActive ? t('admins.activeBadge') : t('admins.inactiveBadge')}
                    </span>
                  </td>
                  <td className='whitespace-nowrap px-4 py-3 text-[var(--glass-text-secondary)]'>
                    {item.lastLoginAt ? new Date(item.lastLoginAt).toLocaleString() : t('admins.neverLogin')}
                  </td>
                  <td className='whitespace-nowrap px-4 py-3 text-[var(--glass-text-tertiary)]'>
                    {new Date(item.createdAt).toLocaleDateString()}
                  </td>
                  <td className='whitespace-nowrap px-4 py-3'>
                    <div className='flex justify-end gap-1'>
                      <button
                        type='button'
                        onClick={() => {
                          setError(null)
                          setEditing(item)
                        }}
                        className='glass-btn-base glass-btn-ghost px-2 py-1 text-xs font-medium'
                      >
                        {t('admins.edit')}
                      </button>
                      <button
                        type='button'
                        onClick={() => {
                          setError(null)
                          setResetting(item)
                        }}
                        className='glass-btn-base glass-btn-soft px-2 py-1 text-xs font-medium'
                      >
                        {t('admins.resetPassword')}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </AdminListPage>

      <CreateAdminDialog
        open={creating}
        submitting={submitting}
        error={error}
        onClose={reset}
        onSubmit={(payload) => void submit('/api/admin/admins', 'POST', payload)}
      />

      <EditAdminDialog
        open={editing !== null}
        admin={editing}
        isSelf={editing?.id === session.id}
        isLastActiveSuper={
          editing !== null
          && editing.role === 'super'
          && editing.isActive
          && activeSupers.length <= 1
        }
        submitting={submitting}
        error={error}
        onClose={reset}
        onSubmit={(payload) => {
          if (!editing) return
          void submit(`/api/admin/admins/${editing.id}`, 'PUT', payload)
        }}
      />

      <ResetAdminPasswordDialog
        open={resetting !== null}
        username={resetting?.username ?? ''}
        submitting={submitting}
        error={error}
        onClose={reset}
        onSubmit={(payload) => {
          if (!resetting) return
          void submit(`/api/admin/admins/${resetting.id}/password`, 'POST', payload)
        }}
      />
    </>
  )
}

function RoleField({
  value,
  onChange,
  disabled,
}: {
  value: AdminRoleValue
  onChange: (value: AdminRoleValue) => void
  disabled?: boolean
}) {
  const t = useTranslations('admin')
  return (
    <div className='space-y-1.5'>
      {ROLES.map((role) => (
        <label
          key={role}
          className='flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm text-[var(--glass-text-primary)] hover:bg-[var(--glass-bg-muted)]'
        >
          <input
            type='radio'
            name='admin-role'
            className='mt-0.5'
            checked={value === role}
            disabled={disabled}
            onChange={() => onChange(role)}
          />
          <span>
            <span className='font-medium'>{t(`role.${role}`)}</span>
            <span className='mt-0.5 block text-xs text-[var(--glass-text-tertiary)]'>
              {t(`admins.roleHint${role.charAt(0).toUpperCase()}${role.slice(1)}`)}
            </span>
          </span>
        </label>
      ))}
    </div>
  )
}

function CreateAdminDialog({
  open,
  submitting,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean
  submitting: boolean
  error: string | null
  onClose: () => void
  onSubmit: (payload: Record<string, unknown>) => void
}) {
  const t = useTranslations('admin')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<AdminRoleValue>('support')
  const [reason, setReason] = useState('')

  const valid =
    username.trim().length >= 3
    && password.length >= MIN_PASSWORD_LENGTH
    && reason.trim().length > 0

  return (
    <GlassModalShell
      open={open}
      onClose={onClose}
      title={t('admins.createTitle')}
      size='md'
      footer={
        <div className='flex justify-end gap-2'>
          <button type='button' onClick={onClose} className='glass-btn-base glass-btn-soft px-4 py-2 text-sm font-medium'>
            {t('cancel')}
          </button>
          <button
            type='button'
            disabled={!valid || submitting}
            onClick={() =>
              onSubmit({ username: username.trim(), password, role, reason: reason.trim() })
            }
            className='glass-btn-base glass-btn-primary px-4 py-2 text-sm font-medium'
          >
            {submitting ? t('saving') : t('create')}
          </button>
        </div>
      }
    >
      <div className='space-y-4'>
        <div>
          <label htmlFor='admin-username' className='glass-field-label text-[var(--glass-text-primary)]'>
            {t('admins.fieldUsername')}
          </label>
          <input
            id='admin-username'
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className='glass-input-base mt-1.5 w-full px-3 py-2 text-sm'
          />
          <p className='glass-field-hint mt-1.5'>{t('admins.fieldUsernameHint')}</p>
        </div>

        <div>
          <label htmlFor='admin-password' className='glass-field-label text-[var(--glass-text-primary)]'>
            {t('admins.fieldPassword')}
          </label>
          <input
            id='admin-password'
            type='password'
            autoComplete='new-password'
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className='glass-input-base mt-1.5 w-full px-3 py-2 text-sm'
          />
          <p className='glass-field-hint mt-1.5'>{t('account.passwordRules')}</p>
        </div>

        <div>
          <p className='glass-field-label text-[var(--glass-text-primary)]'>{t('admins.fieldRole')}</p>
          <RoleField value={role} onChange={setRole} />
        </div>

        <div>
          <label htmlFor='admin-reason' className='glass-field-label text-[var(--glass-text-primary)]'>
            {t('reasonLabel')}
          </label>
          <textarea
            id='admin-reason'
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t('reasonPlaceholder')}
            className='glass-textarea-base mt-1.5 w-full px-3 py-2 text-sm'
          />
        </div>

        {error && <p className='text-sm text-[var(--glass-tone-danger-fg)]'>{error}</p>}
      </div>
    </GlassModalShell>
  )
}

function EditAdminDialog({
  open,
  admin,
  isSelf,
  isLastActiveSuper,
  submitting,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean
  admin: AdminAccount | null
  isSelf: boolean
  isLastActiveSuper: boolean
  submitting: boolean
  error: string | null
  onClose: () => void
  onSubmit: (payload: Record<string, unknown>) => void
}) {
  const t = useTranslations('admin')
  const [role, setRole] = useState<AdminRoleValue>('support')
  const [isActive, setIsActive] = useState(true)
  const [reason, setReason] = useState('')
  // 打开时用目标账号的当前值初始化
  useEffect(() => {
    if (!open || !admin) return
    setRole(admin.role)
    setIsActive(admin.isActive)
    setReason('')
  }, [open, admin])

  const blockedBySelf = isSelf && !isActive
  const blockedByLastSuper = isLastActiveSuper && (!isActive || role !== 'super')
  const valid = reason.trim().length > 0 && !blockedBySelf && !blockedByLastSuper

  return (
    <GlassModalShell
      open={open}
      onClose={onClose}
      title={admin ? t('admins.editTitle', { username: admin.username }) : ''}
      size='md'
      footer={
        <div className='flex justify-end gap-2'>
          <button type='button' onClick={onClose} className='glass-btn-base glass-btn-soft px-4 py-2 text-sm font-medium'>
            {t('cancel')}
          </button>
          <button
            type='button'
            disabled={!valid || submitting}
            onClick={() => onSubmit({ role, isActive, reason: reason.trim() })}
            className='glass-btn-base glass-btn-primary px-4 py-2 text-sm font-medium'
          >
            {submitting ? t('saving') : t('save')}
          </button>
        </div>
      }
    >
      <div className='space-y-4'>
        <div>
          <p className='glass-field-label text-[var(--glass-text-primary)]'>{t('admins.fieldRole')}</p>
          <RoleField value={role} onChange={setRole} />
        </div>

        <label className='flex items-center gap-2 text-sm text-[var(--glass-text-primary)]'>
          <input
            type='checkbox'
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
          />
          {t('admins.fieldActive')}
        </label>

        {blockedBySelf && (
          <p className='rounded-lg bg-[var(--glass-tone-warning-bg)] px-3 py-2 text-xs leading-5 text-[var(--glass-tone-warning-fg)]'>
            {t('admins.selfWarning')}
          </p>
        )}
        {blockedByLastSuper && (
          <p className='rounded-lg bg-[var(--glass-tone-warning-bg)] px-3 py-2 text-xs leading-5 text-[var(--glass-tone-warning-fg)]'>
            {t('admins.lastSuperWarning')}
          </p>
        )}

        <div>
          <label htmlFor='admin-edit-reason' className='glass-field-label text-[var(--glass-text-primary)]'>
            {t('reasonLabel')}
          </label>
          <textarea
            id='admin-edit-reason'
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t('reasonPlaceholder')}
            className='glass-textarea-base mt-1.5 w-full px-3 py-2 text-sm'
          />
        </div>

        {error && <p className='text-sm text-[var(--glass-tone-danger-fg)]'>{error}</p>}
      </div>
    </GlassModalShell>
  )
}

function ResetAdminPasswordDialog({
  open,
  username,
  submitting,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean
  username: string
  submitting: boolean
  error: string | null
  onClose: () => void
  onSubmit: (payload: Record<string, unknown>) => void
}) {
  const t = useTranslations('admin')
  const [newPassword, setNewPassword] = useState('')
  const [reason, setReason] = useState('')

  const valid = newPassword.length >= MIN_PASSWORD_LENGTH && reason.trim().length > 0

  return (
    <GlassModalShell
      open={open}
      onClose={onClose}
      title={t('admins.resetTitle', { username })}
      description={t('admins.resetHint')}
      size='md'
      footer={
        <div className='flex justify-end gap-2'>
          <button type='button' onClick={onClose} className='glass-btn-base glass-btn-soft px-4 py-2 text-sm font-medium'>
            {t('cancel')}
          </button>
          <button
            type='button'
            disabled={!valid || submitting}
            onClick={() => onSubmit({ newPassword, reason: reason.trim() })}
            className='glass-btn-base glass-btn-danger px-4 py-2 text-sm font-medium'
          >
            {submitting ? t('saving') : t('admins.resetPassword')}
          </button>
        </div>
      }
    >
      <div className='space-y-4'>
        <div>
          <label htmlFor='admin-new-password' className='glass-field-label text-[var(--glass-text-primary)]'>
            {t('admins.fieldNewPassword')}
          </label>
          <input
            id='admin-new-password'
            type='password'
            autoComplete='new-password'
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className='glass-input-base mt-1.5 w-full px-3 py-2 text-sm'
          />
          <p className='glass-field-hint mt-1.5'>{t('account.passwordRules')}</p>
        </div>

        <div>
          <label htmlFor='admin-reset-reason' className='glass-field-label text-[var(--glass-text-primary)]'>
            {t('reasonLabel')}
          </label>
          <textarea
            id='admin-reset-reason'
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t('reasonPlaceholder')}
            className='glass-textarea-base mt-1.5 w-full px-3 py-2 text-sm'
          />
        </div>

        {error && <p className='text-sm text-[var(--glass-tone-danger-fg)]'>{error}</p>}
      </div>
    </GlassModalShell>
  )
}
