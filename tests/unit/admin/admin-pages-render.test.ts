import * as React from 'react'
import { createElement, type ComponentProps, type ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'

import adminMessages from '../../../messages/zh/admin.json'

// 只替换应用自己的导航封装，避免连带加载 next-intl 的 createNavigation
vi.mock('@/i18n/navigation', () => ({
  Link: 'a',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/zh/admin',
  redirect: vi.fn(),
  getPathname: () => '/',
}))

import AdminDashboardPage from '@/app/[locale]/admin/page'
import AdminLoginPage from '@/app/[locale]/admin/login/page'
import AdminUsersPage from '@/app/[locale]/admin/users/page'
import AdminOrdersPage from '@/app/[locale]/admin/orders/page'
import AdminPlansPage from '@/app/[locale]/admin/plans/page'
import AdminProvidersPage from '@/app/[locale]/admin/providers/page'
import AdminConfigsPage from '@/app/[locale]/admin/configs/page'
import AdminLogsPage from '@/app/[locale]/admin/logs/page'
import AdminAccountPage from '@/app/[locale]/admin/account/page'
import AdminAdminsPage from '@/app/[locale]/admin/admins/page'
import AdminPaymentsPage from '@/app/[locale]/admin/payments/page'
import { AdminSessionProvider } from '@/app/[locale]/admin/components/AdminSessionProvider'
import type { AdminIdentity } from '@/app/[locale]/admin/components/AdminShell'

const FAKE_ADMIN: AdminIdentity = {
  id: 'test-admin-id',
  username: 'test-admin',
  role: 'super',
  lastLoginAt: null,
}

const renderWithIntl = (node: ReactElement) => {
  const props: ComponentProps<typeof NextIntlClientProvider> = {
    locale: 'zh',
    messages: { admin: adminMessages } as unknown as AbstractIntlMessages,
    timeZone: 'Asia/Shanghai',
    children: node,
  }
  return renderToStaticMarkup(createElement(NextIntlClientProvider, props))
}

/**
 * 后台页面必须能通过服务端渲染。
 *
 * 契约测试只打接口，覆盖不到页面渲染：曾经 useAdminSession() 被写在页面组件自身，
 * 而 Context Provider 在 AdminShell 内部，导致 /admin/users 与 /admin/orders 在 SSR 直接 500。
 *
 * 现在会话 Provider 位于 admin/layout.tsx（段级），因此这里必须按生产环境的方式渲染：
 * AdminSessionProvider 包裹页面。注入已知会话还有个额外好处 ——
 * 页面能越过 AdminShell 的加载门控，测试真正校验到页面内容，而不只是骨架屏。
 */
describe('admin pages / 服务端渲染', () => {
  const consolePages: Array<[string, React.ComponentType, string]> = [
    ['admin dashboard', AdminDashboardPage, adminMessages.nav.dashboard],
    ['admin users', AdminUsersPage, adminMessages.nav.users],
    ['admin orders', AdminOrdersPage, adminMessages.nav.orders],
    ['admin plans', AdminPlansPage, adminMessages.nav.plans],
    ['admin providers', AdminProvidersPage, adminMessages.nav.providers],
    ['admin configs', AdminConfigsPage, adminMessages.nav.configs],
    ['admin logs', AdminLogsPage, adminMessages.nav.logs],
    ['admin account', AdminAccountPage, adminMessages.account.title],
    ['admin admins', AdminAdminsPage, adminMessages.nav.admins],
    ['admin payments', AdminPaymentsPage, adminMessages.nav.payments],
  ]

  it.each(consolePages)('%s 在段级 Provider 内渲染出真实内容', (_name, Page, expectedTitle) => {
    const html = renderWithIntl(
      createElement(AdminSessionProvider, { initialAdmin: FAKE_ADMIN }, createElement(Page)),
    )

    // 已越过加载门控：外壳（侧边栏 + 退出登录）真实渲染
    expect(html).toContain(adminMessages.logout)
    // 页面标题也渲染出来，说明拿到的是页面本身而不是骨架屏
    expect(html).toContain(expectedTitle)
  })

  it('登录页同样可在段级 Provider 内渲染', () => {
    const html = renderWithIntl(
      createElement(AdminSessionProvider, null, createElement(AdminLoginPage)),
    )
    expect(html.length).toBeGreaterThan(0)
  })
})
