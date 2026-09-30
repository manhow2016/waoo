'use client'

import type { ComponentProps } from 'react'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { AppIcon } from '@/components/ui/icons'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface ApiConfigSaveStatusProps {
  saveStatus: SaveStatus
  savingState: ComponentProps<typeof TaskStatusInline>['state'] | null
  savingLabel: string
  savedLabel: string
  saveFailedLabel: string
}

/**
 * 设置中心模型配置的自动保存状态指示。
 *
 * 保存是自动触发的，界面上没有「保存」按钮，因此用户必须能感知
 * 「保存中 / 已保存 / 保存失败」三种状态。其中失败状态会持续保留
 * （见 api-config/hooks.ts，不设超时），否则配置写库失败将完全静默，
 * 用户会误以为已经配置成功。
 */
export function ApiConfigSaveStatus({
  saveStatus,
  savingState,
  savingLabel,
  savedLabel,
  saveFailedLabel,
}: ApiConfigSaveStatusProps) {
  return (
    <div
      aria-live='polite'
      className='flex shrink-0 items-center gap-2 text-sm'
    >
      {saveStatus === 'saving' && (
        <span className='glass-chip glass-chip-info flex items-center gap-1'>
          <TaskStatusInline state={savingState} className='[&>span]:sr-only' />
          <span>{savingLabel}</span>
        </span>
      )}
      {saveStatus === 'saved' && (
        <span className='glass-chip glass-chip-success flex items-center gap-1'>
          <AppIcon name='check' className='w-4 h-4' />
          {savedLabel}
        </span>
      )}
      {saveStatus === 'error' && (
        <span className='glass-chip glass-chip-danger flex items-center gap-1'>
          <AppIcon name='close' className='w-4 h-4' />
          {saveFailedLabel}
        </span>
      )}
    </div>
  )
}
