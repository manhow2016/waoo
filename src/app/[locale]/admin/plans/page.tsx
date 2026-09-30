'use client'

/**
 * 套餐管理：列表 / 新增 / 编辑 / 下架
 *
 * 套餐 code 创建后不可修改（订单与订阅都按 code 关联展示口径）。
 * 下架为软删除，已有订阅不受影响。
 */
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { GlassModalShell } from '@/components/ui/primitives'
import { AdminListPage } from '../components/AdminListPage'
import { AdminShell } from '../components/AdminShell'
import { ReasonDialog } from '../components/ReasonDialog'
import { AdminApiError, adminRequest } from '../components/admin-api'
import { useAdminResource } from '../components/useAdminResource'
import type { AdminPlanDto } from '@/lib/admin/mappers'

interface PlanListResponse {
  plans: AdminPlanDto[]
}

interface PlanFormState {
  code: string
  name: string
  level: string
  price: string
  durationDay: string
  allowAllProviders: boolean
  sortOrder: string
  isActive: boolean
}

const EMPTY_FORM: PlanFormState = {
  code: '',
  name: '',
  level: '1',
  price: '0',
  durationDay: '30',
  allowAllProviders: true,
  sortOrder: '0',
  isActive: true,
}

function toFormState(plan: AdminPlanDto): PlanFormState {
  return {
    code: plan.code,
    name: plan.name,
    level: String(plan.level),
    price: String(plan.price),
    durationDay: String(plan.durationDay),
    allowAllProviders: plan.allowAllProviders,
    sortOrder: String(plan.sortOrder),
    isActive: plan.isActive,
  }
}

export default function AdminPlansPage() {
  const t = useTranslations('admin')
  const list = useAdminResource<PlanListResponse>('/api/admin/plans')

  const [editing, setEditing] = useState<AdminPlanDto | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<PlanFormState>(EMPTY_FORM)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [deactivating, setDeactivating] = useState<AdminPlanDto | null>(null)

  const dialogOpen = creating || editing !== null

  function openCreate() {
    setForm(EMPTY_FORM)
    setReason('')
    setError(null)
    setEditing(null)
    setCreating(true)
  }

  function openEdit(plan: AdminPlanDto) {
    setForm(toFormState(plan))
    setReason('')
    setError(null)
    setCreating(false)
    setEditing(plan)
  }

  function closeDialog() {
    setCreating(false)
    setEditing(null)
    setError(null)
  }

  async function submitForm() {
    const level = Number.parseInt(form.level, 10)
    const price = Number.parseFloat(form.price)
    const durationDay = Number.parseInt(form.durationDay, 10)
    const sortOrder = Number.parseInt(form.sortOrder, 10)

    if (!Number.isFinite(level) || !Number.isFinite(price) || !Number.isFinite(durationDay)) {
      setError(t('plans.invalidNumber'))
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const planPayload = {
        code: form.code.trim(),
        name: form.name.trim(),
        level,
        price,
        durationDay,
        allowAllProviders: form.allowAllProviders,
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
        isActive: form.isActive,
      }

      if (editing) {
        await adminRequest(`/api/admin/plans/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify({ plan: planPayload, reason: reason.trim() }),
        })
      } else {
        await adminRequest('/api/admin/plans', {
          method: 'POST',
          body: JSON.stringify({ plan: planPayload, reason: reason.trim() }),
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

  async function submitDeactivate(reasonText: string) {
    if (!deactivating) return
    setSubmitting(true)
    setError(null)
    try {
      await adminRequest(
        `/api/admin/plans/${deactivating.id}?reason=${encodeURIComponent(reasonText)}`,
        { method: 'DELETE' },
      )
      setDeactivating(null)
      list.reload()
    } catch (caught) {
      setError(
        caught instanceof AdminApiError ? `${caught.message}（${caught.code}）` : t('actionFailedTitle'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  const plans = list.data?.plans ?? []

  return (
    <AdminShell
      title={t('nav.plans')}
      description={t('plans.description')}
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
        total={plans.length}
        page={1}
        pageSize={Math.max(plans.length, 1)}
        onPageChange={() => undefined}
        itemCount={plans.length}
        emptyTitle={t('plans.emptyTitle')}
        emptyDescription={t('plans.emptyDescription')}
      >
        <table className='w-full text-sm'>
          <thead>
            <tr className='border-b border-[var(--glass-stroke-soft)] text-left'>
              <th className='px-4 py-3 font-medium text-[var(--glass-text-secondary)]'>{t('plans.columnCode')}</th>
              <th className='px-4 py-3 font-medium text-[var(--glass-text-secondary)]'>{t('plans.columnName')}</th>
              <th className='whitespace-nowrap px-4 py-3 font-medium text-[var(--glass-text-secondary)]'>{t('plans.columnLevel')}</th>
              <th className='whitespace-nowrap px-4 py-3 font-medium text-[var(--glass-text-secondary)]'>{t('plans.columnPrice')}</th>
              <th className='whitespace-nowrap px-4 py-3 font-medium text-[var(--glass-text-secondary)]'>{t('plans.columnDuration')}</th>
              <th className='whitespace-nowrap px-4 py-3 font-medium text-[var(--glass-text-secondary)]'>{t('plans.columnAllowAll')}</th>
              <th className='whitespace-nowrap px-4 py-3 font-medium text-[var(--glass-text-secondary)]'>{t('plans.columnStatus')}</th>
              <th className='whitespace-nowrap px-4 py-3 text-right font-medium text-[var(--glass-text-secondary)]'>{t('plans.columnActions')}</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => (
              <tr key={plan.id} className='border-b border-[var(--glass-stroke-soft)] last:border-b-0'>
                <td className='whitespace-nowrap px-4 py-3 font-mono text-xs text-[var(--glass-text-primary)]'>
                  {plan.code}
                </td>
                <td className='px-4 py-3 text-[var(--glass-text-primary)]'>{plan.name}</td>
                <td className='whitespace-nowrap px-4 py-3 text-[var(--glass-text-secondary)]'>{plan.level}</td>
                <td className='whitespace-nowrap px-4 py-3 text-[var(--glass-text-primary)]'>¥{plan.price}</td>
                <td className='whitespace-nowrap px-4 py-3 text-[var(--glass-text-secondary)]'>{plan.durationDay}</td>
                <td className='whitespace-nowrap px-4 py-3 text-[var(--glass-text-secondary)]'>
                  {plan.allowAllProviders ? t('plans.yes') : t('plans.no')}
                </td>
                <td className='whitespace-nowrap px-4 py-3'>
                  <span className={plan.isActive ? 'glass-chip glass-chip-success' : 'glass-chip glass-chip-neutral'}>
                    {plan.isActive ? t('plans.activeBadge') : t('plans.inactiveBadge')}
                  </span>
                </td>
                <td className='whitespace-nowrap px-4 py-3'>
                  <div className='flex justify-end gap-1'>
                    <button
                      type='button'
                      onClick={() => openEdit(plan)}
                      className='glass-btn-base glass-btn-ghost px-2 py-1 text-xs font-medium'
                    >
                      {t('edit')}
                    </button>
                    {plan.isActive && (
                      <button
                        type='button'
                        onClick={() => {
                          setError(null)
                          setDeactivating(plan)
                        }}
                        className='glass-btn-base glass-btn-ghost px-2 py-1 text-xs font-medium'
                      >
                        {t('plans.deactivate')}
                      </button>
                    )}
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
        title={editing ? t('plans.editTitle', { code: editing.code }) : t('plans.createTitle')}
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
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
          <div>
            <label htmlFor='plan-code' className='glass-field-label text-[var(--glass-text-primary)]'>
              {t('plans.fieldCode')}
            </label>
            <input
              id='plan-code'
              value={form.code}
              disabled={editing !== null}
              onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
              className='glass-input-base mt-1.5 w-full px-3 py-2 text-sm'
            />
            <p className='glass-field-hint mt-1.5'>{t('plans.fieldCodeHint')}</p>
          </div>

          <div>
            <label htmlFor='plan-name' className='glass-field-label text-[var(--glass-text-primary)]'>
              {t('plans.fieldName')}
            </label>
            <input
              id='plan-name'
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              className='glass-input-base mt-1.5 w-full px-3 py-2 text-sm'
            />
          </div>

          <div>
            <label htmlFor='plan-level' className='glass-field-label text-[var(--glass-text-primary)]'>
              {t('plans.fieldLevel')}
            </label>
            <input
              id='plan-level'
              type='number'
              min={0}
              value={form.level}
              onChange={(event) => setForm((prev) => ({ ...prev, level: event.target.value }))}
              className='glass-input-base mt-1.5 w-full px-3 py-2 text-sm'
            />
          </div>

          <div>
            <label htmlFor='plan-price' className='glass-field-label text-[var(--glass-text-primary)]'>
              {t('plans.fieldPrice')}
            </label>
            <input
              id='plan-price'
              type='number'
              min={0}
              step='0.01'
              value={form.price}
              onChange={(event) => setForm((prev) => ({ ...prev, price: event.target.value }))}
              className='glass-input-base mt-1.5 w-full px-3 py-2 text-sm'
            />
          </div>

          <div>
            <label htmlFor='plan-duration' className='glass-field-label text-[var(--glass-text-primary)]'>
              {t('plans.fieldDuration')}
            </label>
            <input
              id='plan-duration'
              type='number'
              min={0}
              value={form.durationDay}
              onChange={(event) => setForm((prev) => ({ ...prev, durationDay: event.target.value }))}
              className='glass-input-base mt-1.5 w-full px-3 py-2 text-sm'
            />
          </div>

          <div>
            <label htmlFor='plan-sort' className='glass-field-label text-[var(--glass-text-primary)]'>
              {t('plans.fieldSort')}
            </label>
            <input
              id='plan-sort'
              type='number'
              value={form.sortOrder}
              onChange={(event) => setForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
              className='glass-input-base mt-1.5 w-full px-3 py-2 text-sm'
            />
          </div>

          <label className='flex items-center gap-2 text-sm text-[var(--glass-text-primary)]'>
            <input
              type='checkbox'
              checked={form.allowAllProviders}
              onChange={(event) => setForm((prev) => ({ ...prev, allowAllProviders: event.target.checked }))}
            />
            {t('plans.fieldAllowAll')}
          </label>

          <label className='flex items-center gap-2 text-sm text-[var(--glass-text-primary)]'>
            <input
              type='checkbox'
              checked={form.isActive}
              onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
            />
            {t('plans.fieldActive')}
          </label>

          <div className='sm:col-span-2'>
            <label htmlFor='plan-reason' className='glass-field-label text-[var(--glass-text-primary)]'>
              {t('reasonLabel')}
            </label>
            <textarea
              id='plan-reason'
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
        open={deactivating !== null}
        title={deactivating ? t('plans.deactivateTitle', { code: deactivating.code }) : ''}
        description={t('plans.deactivateDescription')}
        confirmLabel={t('plans.deactivate')}
        danger
        submitting={submitting}
        error={error}
        onClose={() => setDeactivating(null)}
        onConfirm={(reasonText) => void submitDeactivate(reasonText)}
      />
    </AdminShell>
  )
}
