'use client'

/**
 * BillingTab - 计费信息标签页
 * 显示余额概览、交易流水、项目费用汇总
 */
import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import { apiFetch } from '@/lib/api-fetch'

interface BalanceInfo {
  balance: number
  frozenAmount: number
  totalSpent: number
  currency: string
}

interface Transaction {
  id: string
  type: string
  amount: number
  balanceAfter: number
  action: string | null
  projectName: string | null
  episodeNumber: number | null
  episodeName: string | null
  billingMeta: Record<string, unknown> | null
  createdAt: string
}

interface ProjectCost {
  projectId: string
  projectName: string
  totalCost: number
  recordCount: number
}

interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

type TabMode = 'transactions' | 'projects'

export default function BillingTab() {
  const t = useTranslations('profile')
  const [balance, setBalance] = useState<BalanceInfo | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [projectCosts, setProjectCosts] = useState<ProjectCost[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 0 })
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabMode>('transactions')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // 获取余额
  const fetchBalance = useCallback(async () => {
    try {
      const res = await apiFetch('/api/user/balance')
      if (res.ok) {
        const data = await res.json()
        setBalance({
          balance: data.balance,
          frozenAmount: data.frozenAmount,
          totalSpent: data.totalSpent,
          currency: data.currency,
        })
      }
    } catch {
      // 静默处理
    }
  }, [])

  // 获取交易流水
  const fetchTransactions = useCallback(async (page: number = 1) => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: '20',
      })
      if (typeFilter !== 'all') params.set('type', typeFilter)
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)

      const res = await apiFetch(`/api/user/transactions?${params}`)
      if (res.ok) {
        const data = await res.json()
        setTransactions(data.transactions)
        setPagination(data.pagination)
      }
    } catch {
      // 静默处理
    } finally {
      setLoading(false)
    }
  }, [typeFilter, startDate, endDate])

  // 获取项目费用汇总
  const fetchProjectCosts = useCallback(async () => {
    try {
      setLoading(true)
      const res = await apiFetch('/api/user/costs')
      if (res.ok) {
        const data = await res.json()
        setProjectCosts(data.byProject || [])
      }
    } catch {
      // 静默处理
    } finally {
      setLoading(false)
    }
  }, [])

  // 初始加载
  useEffect(() => {
    void fetchBalance()
  }, [fetchBalance])

  // 切换标签或筛选时重新加载
  useEffect(() => {
    if (activeTab === 'transactions') {
      void fetchTransactions(1)
    } else {
      void fetchProjectCosts()
    }
  }, [activeTab, fetchTransactions, fetchProjectCosts])

  // 格式化金额
  const formatAmount = (amount: number, showSign: boolean = false) => {
    const prefix = showSign ? (amount >= 0 ? '+' : '') : ''
    return `${prefix}¥${amount.toFixed(2)}`
  }

  // 格式化日期
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // 获取操作类型显示名
  const getActionLabel = (action: string | null) => {
    if (!action) return null
    try {
      return t(`actionTypes.${action}` as never)
    } catch {
      return action
    }
  }

  // 获取计费详情显示
  const getBillingDetail = (meta: Record<string, unknown> | null) => {
    if (!meta) return null
    const parts: string[] = []
    if (meta.model && typeof meta.model === 'string') {
      const shortModel = meta.model.split('::').pop() || meta.model
      parts.push(shortModel)
    }
    if (meta.quantity !== undefined) {
      const qty = Number(meta.quantity)
      const unit = typeof meta.unit === 'string' ? meta.unit : ''
      if (unit && !isNaN(qty)) {
        parts.push(`${qty} ${unit}`)
      }
    }
    if (meta.resolution && typeof meta.resolution === 'string') {
      parts.push(meta.resolution)
    }
    return parts.length > 0 ? parts.join(' · ') : null
  }

  // 筛选操作
  const handleFilter = () => {
    void fetchTransactions(1)
  }

  const handleReset = () => {
    setTypeFilter('all')
    setStartDate('')
    setEndDate('')
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 余额概览卡片 */}
      <div className="p-6 border-b border-[var(--glass-stroke-base)]">
        <div className="grid grid-cols-3 gap-4">
          <div className="glass-surface-soft rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <AppIcon name="coins" className="w-4 h-4 text-[var(--glass-tone-success-fg)]" />
              <span className="text-xs font-medium text-[var(--glass-text-secondary)]">{t('availableBalance')}</span>
            </div>
            <div className="text-2xl font-bold text-[var(--glass-text-primary)]">
              {balance ? formatAmount(balance.balance) : '¥0.00'}
            </div>
          </div>
          <div className="glass-surface-soft rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <AppIcon name="lock" className="w-4 h-4 text-[var(--glass-tone-warning-fg)]" />
              <span className="text-xs font-medium text-[var(--glass-text-secondary)]">{t('frozen')}</span>
            </div>
            <div className="text-2xl font-bold text-[var(--glass-text-primary)]">
              {balance ? formatAmount(balance.frozenAmount) : '¥0.00'}
            </div>
          </div>
          <div className="glass-surface-soft rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <AppIcon name="chart" className="w-4 h-4 text-[var(--glass-tone-info-fg)]" />
              <span className="text-xs font-medium text-[var(--glass-text-secondary)]">{t('totalSpent')}</span>
            </div>
            <div className="text-2xl font-bold text-[var(--glass-text-primary)]">
              {balance ? formatAmount(balance.totalSpent) : '¥0.00'}
            </div>
          </div>
        </div>
      </div>

      {/* 标签切换 */}
      <div className="px-6 pt-4 flex items-center gap-4 border-b border-[var(--glass-stroke-base)]">
        <button
          onClick={() => setActiveTab('transactions')}
          className={`pb-3 px-1 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'transactions'
              ? 'border-[var(--glass-tone-info-fg)] text-[var(--glass-tone-info-fg)]'
              : 'border-transparent text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)]'
          }`}
        >
          {t('transactions')}
        </button>
        <button
          onClick={() => setActiveTab('projects')}
          className={`pb-3 px-1 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'projects'
              ? 'border-[var(--glass-tone-info-fg)] text-[var(--glass-tone-info-fg)]'
              : 'border-transparent text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)]'
          }`}
        >
          {t('projectDetails')}
        </button>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto app-scrollbar p-6">
        {activeTab === 'transactions' ? (
          <>
            {/* 筛选栏 */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="glass-input-base px-3 py-2 text-sm"
              >
                <option value="all">{t('allTypes')}</option>
                <option value="recharge">{t('recharge')}</option>
                <option value="consume">{t('consume')}</option>
              </select>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="glass-input-base px-3 py-2 text-sm"
              />
              <span className="text-[var(--glass-text-tertiary)]">~</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="glass-input-base px-3 py-2 text-sm"
              />
              <button
                onClick={handleFilter}
                className="glass-btn-base glass-btn-primary px-4 py-2 text-sm"
              >
                {t('filter')}
              </button>
              <button
                onClick={handleReset}
                className="glass-btn-base glass-btn-secondary px-4 py-2 text-sm"
              >
                {t('reset')}
              </button>
            </div>

            {/* 流水列表 */}
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="glass-surface-soft p-4 animate-pulse">
                    <div className="h-4 bg-[var(--glass-bg-muted)] rounded mb-2 w-1/3" />
                    <div className="h-3 bg-[var(--glass-bg-muted)] rounded w-2/3" />
                  </div>
                ))}
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-12">
                <AppIcon name="receipt" className="w-12 h-12 text-[var(--glass-text-tertiary)] mx-auto mb-3" />
                <p className="text-sm text-[var(--glass-text-tertiary)]">{t('noTransactions')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {transactions.map((tx) => {
                  const isIncome = tx.amount > 0
                  const actionLabel = getActionLabel(tx.action)
                  const billingDetail = getBillingDetail(tx.billingMeta)

                  return (
                    <div
                      key={tx.id}
                      className="glass-surface-soft rounded-xl p-4 hover:border-[var(--glass-stroke-active)] transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                              isIncome
                                ? 'bg-[var(--glass-tone-success-bg)] text-[var(--glass-tone-success-fg)]'
                                : 'bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)]'
                            }`}>
                              {isIncome ? t('recharge') : t('consume')}
                            </span>
                            {actionLabel && (
                              <span className="text-sm font-medium text-[var(--glass-text-primary)]">
                                {actionLabel}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-[var(--glass-text-tertiary)]">
                            <span>{formatDate(tx.createdAt)}</span>
                            {tx.projectName && (
                              <>
                                <span>·</span>
                                <span className="truncate">{tx.projectName}</span>
                              </>
                            )}
                            {tx.episodeNumber && (
                              <>
                                <span>·</span>
                                <span>{t('episodeLabel', { number: tx.episodeNumber })}</span>
                              </>
                            )}
                          </div>
                          {billingDetail && (
                            <div className="text-xs text-[var(--glass-text-tertiary)] mt-1">
                              {billingDetail}
                            </div>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className={`text-base font-semibold ${
                            isIncome ? 'text-[var(--glass-tone-success-fg)]' : 'text-[var(--glass-text-primary)]'
                          }`}>
                            {formatAmount(tx.amount, true)}
                          </div>
                          <div className="text-xs text-[var(--glass-text-tertiary)]">
                            {t('balanceAfter', { amount: `¥${tx.balanceAfter.toFixed(2)}` })}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* 分页 */}
            {pagination.totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-[var(--glass-text-tertiary)]">
                  {t('pagination', { total: pagination.total, page: pagination.page, totalPages: pagination.totalPages })}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fetchTransactions(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                    className="glass-btn-base glass-btn-secondary px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    {t('previousPage')}
                  </button>
                  <button
                    onClick={() => fetchTransactions(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages}
                    className="glass-btn-base glass-btn-secondary px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    {t('nextPage')}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          /* 项目费用汇总 */
          loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="glass-surface-soft p-4 animate-pulse">
                  <div className="h-4 bg-[var(--glass-bg-muted)] rounded mb-2 w-1/2" />
                  <div className="h-3 bg-[var(--glass-bg-muted)] rounded w-1/3" />
                </div>
              ))}
            </div>
          ) : projectCosts.length === 0 ? (
            <div className="text-center py-12">
              <AppIcon name="folderCards" className="w-12 h-12 text-[var(--glass-text-tertiary)] mx-auto mb-3" />
              <p className="text-sm text-[var(--glass-text-tertiary)]">{t('noProjectCosts')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {projectCosts.map((project) => (
                <div
                  key={project.projectId}
                  className="glass-surface-soft rounded-xl p-4 hover:border-[var(--glass-stroke-active)] transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-[var(--glass-text-primary)] truncate">
                        {project.projectName}
                      </h4>
                      <p className="text-xs text-[var(--glass-text-tertiary)] mt-1">
                        {t('recordCount', { count: project.recordCount })}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-lg font-bold text-[var(--glass-text-primary)]">
                        {formatAmount(project.totalCost)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}
