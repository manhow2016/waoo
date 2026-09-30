import type { ReactNode } from 'react'
import { AdminSessionProvider } from './components/AdminSessionProvider'

/**
 * 管理后台段 layout。
 *
 * 存在的理由：AdminShell 需要每页不同的 title/description/actions，属于页面级；
 * 但「管理后台会话」属于段级。此前没有这层 layout，会话随页面一起卸载重建，
 * 于是每次切换菜单项都会重新请求 /api/admin/auth/me 并用全屏骨架替换整个视口。
 *
 * 把会话放在 layout 里，生命周期即等于控制台会话：
 * - 登录页同样被包裹，但没有 AdminShell 消费者，懒加载不会触发请求
 * - 控制台页面切换时 Provider 不重建，因此不再有骨架闪烁与重复请求
 */
export default function AdminSegmentLayout({ children }: { children: ReactNode }) {
  return <AdminSessionProvider>{children}</AdminSessionProvider>
}
