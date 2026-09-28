'use client'

/**
 * 项目配置弹窗专用选择器
 * 卡片边框风格：选中时蓝色描边 + 淡色背景 + 加粗文字
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AppIcon } from '@/components/ui/icons'

interface RatioSelectorProps {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}

interface StyleSelectorProps {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}

/** 线框比例预览块 */
function RatioShape({ ratio, selected, size = 26 }: { ratio: string; selected: boolean; size?: number }) {
  const [w, h] = ratio.split(':').map(Number)
  const max = Math.max(w, h)
  return (
    <div
      className={`rounded-md border-2 transition-colors ${
        selected ? 'border-[var(--glass-accent-from)]' : 'border-[var(--glass-stroke-strong)]'
      }`}
      style={{
        width: Math.min(size, size * (w / max)),
        height: Math.min(size, size * (h / max)),
      }}
    />
  )
}

export function RatioSelector({ value, onChange, options }: RatioSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedOption = options.find((option) => option.value === value)

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="glass-input-base h-11 px-3 flex items-center justify-between gap-2 cursor-pointer transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <RatioShape ratio={value} size={18} selected />
          <span className="text-sm text-[var(--glass-text-primary)] font-medium">
            {selectedOption?.label || value}
          </span>
        </div>
        <AppIcon name="chevronDown" className={`w-4 h-4 text-[var(--glass-text-tertiary)] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          className="glass-surface-modal absolute z-50 mt-1 left-0 right-0 p-3 max-h-60 overflow-y-auto app-scrollbar"
          style={{ minWidth: '300px' }}
        >
          <div className="grid grid-cols-5 gap-2">
            {options.map((option) => {
              const isSelected = value === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value)
                    setIsOpen(false)
                  }}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                    isSelected
                      ? 'border-[var(--glass-accent-from)] bg-[var(--glass-accent-from)]/5 shadow-sm'
                      : 'border-[var(--glass-stroke-soft)] hover:border-[var(--glass-stroke-strong)]'
                  }`}
                >
                  <RatioShape ratio={option.value} size={28} selected={isSelected} />
                  <span className={`text-xs ${isSelected ? 'font-semibold text-[var(--glass-accent-from)]' : 'text-[var(--glass-text-secondary)]'}`}>
                    {option.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export function ResolutionSelector({ value, onChange, options }: RatioSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({})

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (dropdownRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 计算面板定位：portal + fixed 视口定位，避免被弹窗滚动容器（overflow-y-auto）裁剪导致显示不全
  const updatePanelStyle = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth
    const panelWidth = Math.max(200, rect.width)
    const spaceBelow = Math.max(0, viewportHeight - rect.bottom - 8)
    const spaceAbove = Math.max(0, rect.top - 8)
    // 下方空间不足时向上展开，并按可用空间限制面板高度
    const openUpward = spaceBelow < Math.min(options.length * 46 + 24, 240) && spaceAbove > spaceBelow
    setPanelStyle({
      position: 'fixed',
      left: Math.max(8, Math.min(rect.left, viewportWidth - panelWidth - 8)),
      width: panelWidth,
      ...(openUpward
        ? { bottom: `${viewportHeight - rect.top + 8}px`, maxHeight: spaceAbove }
        : { top: `${rect.bottom + 8}px`, maxHeight: spaceBelow }),
    })
  }, [options.length])

  useEffect(() => {
    if (!isOpen) return
    updatePanelStyle()
    window.addEventListener('resize', updatePanelStyle)
    window.addEventListener('scroll', updatePanelStyle, true)
    return () => {
      window.removeEventListener('resize', updatePanelStyle)
      window.removeEventListener('scroll', updatePanelStyle, true)
    }
  }, [isOpen, updatePanelStyle])

  const selectedOption = options.find((option) => option.value === value)

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="glass-input-base h-11 px-3 flex items-center justify-between gap-2 cursor-pointer transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-sm text-[var(--glass-text-primary)] font-medium">
            {selectedOption?.label || value}
          </span>
        </div>
        <AppIcon name="chevronDown" className={`w-4 h-4 text-[var(--glass-text-tertiary)] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={panelRef}
            className="glass-surface-modal fixed z-[130] p-3 overflow-y-auto app-scrollbar"
            style={panelStyle}
          >
            <div className="flex flex-col gap-2">
              {options.map((option) => {
                const isSelected = value === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value)
                      setIsOpen(false)
                    }}
                    className={`flex items-center p-3 rounded-xl border transition-all ${
                      isSelected
                        ? 'border-[var(--glass-accent-from)] bg-[var(--glass-accent-from)]/5 shadow-sm'
                        : 'border-[var(--glass-stroke-soft)] hover:border-[var(--glass-stroke-strong)]'
                    }`}
                  >
                    <span className={`text-sm ${isSelected ? 'font-semibold text-[var(--glass-accent-from)]' : 'text-[var(--glass-text-secondary)]'}`}>
                      {option.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

export function StyleSelector({ value, onChange, options }: StyleSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedOption = options.find((option) => option.value === value) || options[0]

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="glass-input-base h-11 px-3 flex items-center justify-between gap-2 cursor-pointer transition-colors"
      >
        <span className="text-sm text-[var(--glass-text-primary)] font-medium">{selectedOption.label}</span>
        <AppIcon name="chevronDown" className={`w-4 h-4 text-[var(--glass-text-tertiary)] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="glass-surface-modal absolute z-50 mt-1 left-0 p-3" style={{ minWidth: '320px' }}>
          <div className="grid grid-cols-2 gap-2">
            {options.map((option) => {
              const isSelected = value === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value)
                    setIsOpen(false)
                  }}
                  className={`flex items-center p-3 rounded-xl border text-left transition-all ${
                    isSelected
                      ? 'border-[var(--glass-accent-from)] bg-[var(--glass-accent-from)]/5 shadow-sm'
                      : 'border-[var(--glass-stroke-soft)] hover:border-[var(--glass-stroke-strong)]'
                  }`}
                >
                  <span className={`text-sm whitespace-nowrap ${isSelected ? 'font-semibold text-[var(--glass-accent-from)]' : 'text-[var(--glass-text-secondary)]'}`}>
                    {option.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
