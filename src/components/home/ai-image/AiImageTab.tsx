'use client'

/**
 * AI图片分页卡
 * 深度集成：功能卡片跳转到内置 /image-studio 页面，模型配置统一使用 waoowaoo 配置。
 */
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import { Link } from '@/i18n/navigation'

// 功能类型
type AiImageFeature = 'workbench' | 'canvas' | 'reverse-prompt' | 'gif'

interface FeatureCard {
  id: AiImageFeature
  icon: string
  titleKey: string
  descriptionKey: string
  color: string
  tab: string
}

// 功能卡片配置
const FEATURES: FeatureCard[] = [
  {
    id: 'workbench',
    icon: 'image',
    titleKey: 'aiImage.workbench.title',
    descriptionKey: 'aiImage.workbench.description',
    color: 'from-blue-500 to-cyan-500',
    tab: 'workbench',
  },
  {
    id: 'canvas',
    icon: 'folderOpen',
    titleKey: 'aiImage.canvas.title',
    descriptionKey: 'aiImage.canvas.description',
    color: 'from-purple-500 to-pink-500',
    tab: 'canvas',
  },
  {
    id: 'reverse-prompt',
    icon: 'search',
    titleKey: 'aiImage.reversePrompt.title',
    descriptionKey: 'aiImage.reversePrompt.description',
    color: 'from-green-500 to-emerald-500',
    tab: 'reversePrompt',
  },
  {
    id: 'gif',
    icon: 'film',
    titleKey: 'aiImage.gif.title',
    descriptionKey: 'aiImage.gif.description',
    color: 'from-orange-500 to-red-500',
    tab: 'gif',
  },
]

export default function AiImageTab() {
  const t = useTranslations('home')

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
          <Link
            key={feature.id}
            href={{ pathname: '/image-studio', query: { tab: feature.tab } }}
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
          </Link>
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
