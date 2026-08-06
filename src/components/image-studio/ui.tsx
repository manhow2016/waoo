/**
 * image-studio 共享 UI 小组件
 *
 * 复用 waoowaoo 的 glass 样式体系，提供模型下拉、尺寸/比例选择等通用控件。
 */

'use client'

import { type ReactNode } from 'react'
import { AppIcon } from '@/components/ui/icons'

function cx(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(' ')
}

export interface Option<T extends string = string> {
  value: T
  label: string
}

/** 简单原生 select 封装（glass 风格） */
export function GlassSelect<T extends string = string>(props: {
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
  className?: string
  disabled?: boolean
  title?: string
}) {
  return (
    <select
      value={props.value}
      onChange={(e) => props.onChange(e.target.value as T)}
      disabled={props.disabled}
      title={props.title}
      className={cx('glass-select-base px-3 py-2 text-sm w-full', props.className)}
    >
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

/** 分段控件（Segmented Control） */
export function Segmented<T extends string = string>(props: {
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div className={cx('inline-flex rounded-xl p-0.5 bg-[var(--glass-bg-muted)] gap-0.5', props.className)}>
      {props.options.map((option) => {
        const active = option.value === props.value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => props.onChange(option.value)}
            className={cx(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              active
                ? 'bg-[var(--glass-bg-surface-strong)] text-[var(--glass-text-primary)] shadow-sm'
                : 'text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)]',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** 滑块（Range Input） */
export function GlassSlider(props: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  label?: string
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-3">
      {props.label && (
        <span className="text-xs text-[var(--glass-text-secondary)] w-14 shrink-0">{props.label}</span>
      )}
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 0.1}
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="flex-1 accent-[var(--glass-tone-info-fg)]"
      />
      <span className="text-xs text-[var(--glass-text-secondary)] w-10 text-right font-mono">
        {props.value}
      </span>
    </div>
  )
}

/** 切换开关（Switch） */
export function GlassSwitch(props: {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      disabled={props.disabled}
      onClick={() => props.onChange(!props.checked)}
      className={cx(
        'inline-flex items-center gap-2 text-sm text-[var(--glass-text-secondary)]',
        props.disabled && 'opacity-50',
      )}
    >
      <span
        className={cx(
          'inline-flex items-center w-9 h-5 rounded-full p-0.5 transition-colors',
          props.checked ? 'bg-[var(--glass-tone-info-fg)]' : 'bg-[var(--glass-bg-muted)]',
        )}
      >
        <span
          className={cx(
            'inline-block w-4 h-4 rounded-full bg-white shadow transition-transform',
            props.checked ? 'translate-x-4' : 'translate-x-0',
          )}
        />
      </span>
      {props.label && <span>{props.label}</span>}
    </button>
  )
}

/** 加载骨架 */
export function StudioSpinner(props: { className?: string }) {
  return (
    <span className={cx('inline-block w-4 h-4 border-2 border-t-transparent rounded-full animate-spin border-[var(--glass-tone-info-fg)]', props.className)} />
  )
}

/** 模态框外壳 */
export function StudioModal(props: {
  title: string
  onClose: () => void
  children: ReactNode
  width?: string
}) {
  return (
    <div className="fixed inset-0 glass-overlay flex items-center justify-center z-50 backdrop-blur-sm">
      <div className={cx('glass-surface-modal p-6 mx-4 max-h-[85vh] overflow-y-auto', props.width || 'w-full max-w-md')}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-[var(--glass-text-primary)]">{props.title}</h2>
          <button
            type="button"
            onClick={props.onClose}
            className="glass-btn-base glass-btn-ghost p-2 rounded-lg"
          >
            <AppIcon name="close" className="w-4 h-4" />
          </button>
        </div>
        {props.children}
      </div>
    </div>
  )
}

/** 空状态提示 */
export function StudioEmptyState(props: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="text-center py-12">
      <div className="w-16 h-16 bg-[var(--glass-bg-muted)] rounded-xl flex items-center justify-center mx-auto mb-4">
        <AppIcon name="image" className="w-8 h-8 text-[var(--glass-text-tertiary)]" />
      </div>
      <h3 className="text-lg font-medium text-[var(--glass-text-primary)] mb-2">{props.title}</h3>
      {props.description && (
        <p className="text-[var(--glass-text-secondary)] mb-6">{props.description}</p>
      )}
      {props.action}
    </div>
  )
}

export { cx }
