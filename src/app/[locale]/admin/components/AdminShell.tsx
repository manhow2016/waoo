'use client'

/**
 * 后台外壳：独立布局 + 独立会话守卫 + 按角色过滤的菜单
 *
 * 与用户端完全隔离：
 * - 不复用用户端 Navbar，也不读用户端会话
 * - 会话来自 /api/admin/auth/me（独立 Cookie + 独立签名密钥）
 * - 菜单只是可见性控制，真正的权限在服务端 requireAdminRole 中校验
 */
import { createContext, useContext, useEffect, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { AppIcon } from '@/components/ui/icons'
import { adminRequest } from './admin-api'
import { useAdminSessionResource } from './AdminSessionProvider'

export type AdminRole = 'support' | 'operation' | 'super'

export const ADMIN_ROLE_RANK: Record<AdminRole, number> = {
  support: 1,
  operation: 2,
  super: 3,
}

export interface AdminIdentity {
  id: string
  username: string
  role: AdminRole
  lastLoginAt: string | null
}

export function isRoleAtLeast(role: AdminRole, minRole: AdminRole): boolean {
  return ADMIN_ROLE_RANK[role] >= ADMIN_ROLE_RANK[minRole]
}

type AdminNavPath =
  | '/admin'
  | '/admin/users'
  | '/admin/orders'
  | '/admin/plans'
  | '/admin/providers'
  | '/admin/payments'
  | '/admin/admins'
  | '/admin/configs'
  | '/admin/logs'
  | '/admin/account'

interface AdminNavItem {
  key: string
  path: AdminNavPath
  icon: React.ComponentProps<typeof AppIcon>['name']
  minRole: AdminRole
}

/** 菜单权限与 §4.6 RBAC 一致：support=查询/补单，operation=运营管理，super=全部 */
export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { key: 'dashboard', path: '/admin', icon: 'chart', minRole: 'operation' },
  { key: 'users', path: '/admin/users', icon: 'usersRound', minRole: 'support' },
  { key: 'orders', path: '/admin/orders', icon: 'receipt', minRole: 'support' },
  { key: 'plans', path: '/admin/plans', icon: 'diamond', minRole: 'operation' },
  { key: 'providers', path: '/admin/providers', icon: 'package', minRole: 'operation' },
  { key: 'payments', path: '/admin/payments', icon: 'coins', minRole: 'super' },
  { key: 'admins', path: '/admin/admins', icon: 'userRoundCog', minRole: 'super' },
  { key: 'configs', path: '/admin/configs', icon: 'settingsHexAlt', minRole: 'super' },
  { key: 'logs', path: '/admin/logs', icon: 'fileText', minRole: 'super' },
  // 账号设置对所有角色开放；放在最后以免影响 resolveAdminLandingPath 的落点
  { key: 'account', path: '/admin/account', icon: 'user', minRole: 'support' },
]

const AdminSessionContext = createContext<AdminIdentity | null>(null)

/** 页面读取当前管理员（由 AdminShell 注入，避免每个页面重复请求） */
export function useAdminSession(): AdminIdentity {
  const admin = useContext(AdminSessionContext)
  if (!admin) {
    throw new Error('useAdminSession must be used inside AdminShell')
  }
  return admin
}

/** 角色可访问的首个页面（support 没有统计权限，登录后落到用户管理） */
export function resolveAdminLandingPath(role: AdminRole): AdminNavPath {
  return ADMIN_NAV_ITEMS.find((item) => isRoleAtLeast(role, item.minRole))?.path ?? '/admin/users'
}

interface AdminShellProps {
  title: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
}

export function AdminShell({ title, description, actions, children }: AdminShellProps) {
  const t = useTranslations('admin')
  const router = useRouter()
  const pathname = usePathname()
  // 会话由 admin/layout.tsx 的 Provider 持有，这里只消费并触发懒加载：
  // 切换菜单项时 Provider 不重建，因此不会重新请求，也不会闪全屏骨架
  const me = useAdminSessionResource()
  const ensureLoaded = me.ensureLoaded

  useEffect(() => {
    ensureLoaded()
  }, [ensureLoaded])

  const unauthorized = me.error?.status === 401

  useEffect(() => {
    if (unauthorized) {
      router.replace({ pathname: '/admin/login' })
    }
  }, [router, unauthorized])

  const visibleNavItems = useMemo(() => {
    const role = me.data?.admin.role
    if (!role) return []
    return ADMIN_NAV_ITEMS.filter((item) => isRoleAtLeast(role, item.minRole))
  }, [me.data?.admin.role])

  async function handleLogout() {
    try {
      await adminRequest('/api/admin/auth/logout', { method: 'POST' })
    } finally {
      // 清空会话，避免下一位管理员看到上一位的身份
      me.reset()
      router.replace({ pathname: '/admin/login' })
    }
  }

  if (me.loading || unauthorized) {
    return (
      <div className='glass-page min-h-screen'>
        <AdminSkeleton />
      </div>
    )
  }

  if (me.error || !me.data) {
    const loadErrorMessage = me.error?.message ?? t('loadFailedTitle')
    return (
      <div className='glass-page flex min-h-screen items-center justify-center px-4'>
        <div className='glass-surface w-full max-w-md rounded-2xl p-6 text-center'>
          <AppIcon name='alert' className='mx-auto h-6 w-6 text-[var(--glass-tone-danger-fg)]' />
          <h1 className='mt-3 text-base font-semibold text-[var(--glass-text-primary)]'>
            {t('loadFailedTitle')}
          </h1>
          <p className='mt-1 text-sm text-[var(--glass-text-secondary)]'>{loadErrorMessage}</p>
          <button
            type='button'
            onClick={me.reload}
            className='glass-btn-base glass-btn-primary mt-4 px-4 py-2 text-sm font-medium'
          >
            {t('retry')}
          </button>
        </div>
      </div>
    )
  }

  const admin = me.data.admin

  return (
    <AdminSessionContext.Provider value={admin}>
      <div className='glass-page min-h-screen'>
        <div className='mx-auto flex max-w-[1500px] flex-col lg:flex-row'>
          <aside className='lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0'>
            <div className='flex h-full flex-col gap-4 border-b border-[var(--glass-stroke-soft)] p-4 lg:border-b-0 lg:border-r lg:p-5'>
              <div className='flex items-center gap-2'>
                <AppIcon name='lock' className='h-4 w-4 text-[var(--glass-text-tertiary)]' />
                <div className='min-w-0'>
                  <p className='truncate text-sm font-semibold text-[var(--glass-text-primary)]'>
                    {t('consoleTitle')}
                  </p>
                  <p className='truncate text-xs text-[var(--glass-text-tertiary)]'>
                    {admin.username} · {t(`role.${admin.role}`)}
                  </p>
                </div>
              </div>

              <nav className='-mx-1 flex gap-1 overflow-x-auto pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:pb-0'>
                {visibleNavItems.map((item) => {
                  const active = pathname === item.path
                  return (
                    <Link
                      key={item.key}
                      href={{ pathname: item.path }}
                      className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        active
                          ? 'bg-[var(--glass-bg-muted)] text-[var(--glass-text-primary)]'
                          : 'text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)]'
                      }`}
                    >
                      <AppIcon name={item.icon} className='h-4 w-4 shrink-0' />
                      {t(`nav.${item.key}`)}
                    </Link>
                  )
                })}
              </nav>

              <button
                type='button'
                onClick={() => void handleLogout()}
                className='glass-btn-base glass-btn-ghost mt-auto hidden items-center gap-2 px-3 py-2 text-sm font-medium lg:flex'
              >
                <AppIcon name='logout' className='h-4 w-4' />
                {t('logout')}
              </button>
            </div>
          </aside>

          <main className='min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8'>
            <header className='mb-6 flex flex-wrap items-start justify-between gap-3'>
              <div className='min-w-0'>
                <h1 className='text-xl font-semibold tracking-tight text-[var(--glass-text-primary)] sm:text-2xl'>
                  {title}
                </h1>
                {description && (
                  <p className='mt-1 text-sm text-[var(--glass-text-secondary)]'>{description}</p>
                )}
              </div>
              <div className='flex items-center gap-2'>
                {actions}
                <button
                  type='button'
                  onClick={() => void handleLogout()}
                  className='glass-btn-base glass-btn-ghost px-3 py-2 text-sm font-medium lg:hidden'
                >
                  <AppIcon name='logout' className='h-4 w-4' />
                </button>
              </div>
            </header>

            {children}
          </main>
        </div>
      </div>
    </AdminSessionContext.Provider>
  )
}

function AdminSkeleton() {
  return (
    <div className='mx-auto flex max-w-[1500px] flex-col gap-4 p-6 lg:flex-row'>
      <div className='glass-surface h-40 w-full animate-pulse rounded-2xl lg:h-[70vh] lg:w-60' />
      <div className='glass-surface h-[60vh] flex-1 animate-pulse rounded-2xl' />
    </div>
  )
}

export default AdminShell
