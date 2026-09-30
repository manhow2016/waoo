'use client'

import type { ReactNode } from 'react'

interface ApiConfigPageHeaderProps {
  /** 分页图标，统一使用 AppIcon */
  icon: ReactNode
  title: string
  description: string
}

/**
 * 设置中心模型配置的分页页头。
 *
 * 「默认模型」与「模型服务商」两个分页共用同一套标题层级与间距，
 * 保证切换分页时视觉基线不跳动。
 */
export function ApiConfigPageHeader({
  icon,
  title,
  description,
}: ApiConfigPageHeaderProps) {
  return (
    <header className='mb-6 flex items-start gap-2.5'>
      <span className='glass-surface-soft mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--glass-text-secondary)]'>
        {icon}
      </span>
      <div className='min-w-0'>
        <h2 className='text-lg font-semibold text-[var(--glass-text-primary)]'>
          {title}
        </h2>
        <p className='mt-1 text-[13px] leading-5 text-[var(--glass-text-secondary)]'>
          {description}
        </p>
      </div>
    </header>
  )
}
