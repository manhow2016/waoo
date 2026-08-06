'use client'

/**
 * AI图片分页卡
 * 使用 iframe 嵌入 nova-image-studio 的功能
 */
import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'

// nova-image-studio 的地址
const NOVA_IMAGE_STUDIO_URL = process.env.NEXT_PUBLIC_NOVA_IMAGE_STUDIO_URL || 'http://localhost:3001'

// 功能类型
type AiImageFeature = 'workbench' | 'canvas' | 'reverse-prompt' | 'gif'

interface FeatureCard {
  id: AiImageFeature
  icon: string
  titleKey: string
  descriptionKey: string
  color: string
}

// 功能卡片配置
const FEATURES: FeatureCard[] = [
  {
    id: 'workbench',
    icon: 'image',
    titleKey: 'aiImage.workbench.title',
    descriptionKey: 'aiImage.workbench.description',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    id: 'canvas',
    icon: 'folderOpen',
    titleKey: 'aiImage.canvas.title',
    descriptionKey: 'aiImage.canvas.description',
    color: 'from-purple-500 to-pink-500',
  },
  {
    id: 'reverse-prompt',
    icon: 'search',
    titleKey: 'aiImage.reversePrompt.title',
    descriptionKey: 'aiImage.reversePrompt.description',
    color: 'from-green-500 to-emerald-500',
  },
  {
    id: 'gif',
    icon: 'film',
    titleKey: 'aiImage.gif.title',
    descriptionKey: 'aiImage.gif.description',
    color: 'from-orange-500 to-red-500',
  },
]

export default function AiImageTab() {
  const t = useTranslations('home')
  const [activeFeature, setActiveFeature] = useState<AiImageFeature | null>(null)

  // 构建 iframe URL
  const buildIframeUrl = useCallback((feature: AiImageFeature): string => {
    // nova-image-studio 使用 tab 参数来切换功能
    const tabMap: Record<AiImageFeature, string> = {
      'workbench': 'image-generation',
      'canvas': 'canvas',
      'reverse-prompt': 'reverse-prompt',
      'gif': 'gif',
    }
    return `${NOVA_IMAGE_STUDIO_URL}?tab=${tabMap[feature]}`
  }, [])

  // 打开功能
  const handleOpenFeature = useCallback((feature: AiImageFeature) => {
    setActiveFeature(feature)
  }, [])

  // 如果选中了功能，显示 iframe
  if (activeFeature) {
    return (
      <div className="relative w-full h-[calc(100vh-200px)] min-h-[600px] mx-auto">
        {/* iframe */}
        <iframe
          src={buildIframeUrl(activeFeature)}
          className="w-[95%] h-full border-0 rounded-xl mx-auto"
          title={t(`aiImage.${activeFeature}.title`)}
          allow="clipboard-read; clipboard-write"
        />
      </div>
    )
  }

  // 显示功能选择卡片
  return (
    <div className="w-full">
      {/* 标题 */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-[var(--glass-text-primary)]">
          {t('aiImage.title')}
        </h2>
        <p className="text-sm text-[var(--glass-text-secondary)] mt-1">
          {t('aiImage.subtitle')}
        </p>
      </div>

      {/* 功能卡片网格 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {FEATURES.map((feature) => (
          <button
            key={feature.id}
            onClick={() => handleOpenFeature(feature.id)}
            className="glass-surface p-5 text-left group hover:border-[var(--glass-tone-info-fg)]/40 transition-all duration-300"
          >
            {/* 图标 */}
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-all duration-300 ${feature.color}`}>
              <AppIcon name={feature.icon as 'image' | 'folderOpen' | 'search' | 'film'} className="w-6 h-6 text-white" />
            </div>

            {/* 标题 */}
            <h3 className="text-base font-semibold text-[var(--glass-text-primary)] mb-2 group-hover:text-[var(--glass-tone-info-fg)] transition-colors">
              {t(feature.titleKey)}
            </h3>

            {/* 描述 */}
            <p className="text-sm text-[var(--glass-text-secondary)] line-clamp-2">
              {t(feature.descriptionKey)}
            </p>
          </button>
        ))}
      </div>

      {/* 提示信息 */}
      <div className="mt-6 p-4 rounded-xl bg-[var(--glass-bg-muted)]/50 border border-[var(--glass-stroke-base)]">
        <p className="text-xs text-[var(--glass-text-tertiary)]">
          {t('aiImage.hint')}
        </p>
      </div>
    </div>
  )
}
