'use client'

/**
 * 首页 - 创作中心
 * 用户登录后的主入口页面：快速创作 + 项目管理（含搜索/分页/新建/编辑/删除）
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import Navbar from '@/components/Navbar'
import ConfirmDialog from '@/components/ConfirmDialog'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { AppIcon, IconGradientDefs } from '@/components/ui/icons'
import StoryInputComposer from '@/components/story-input/StoryInputComposer'
import TypewriterHero from '@/components/home/TypewriterHero'
import { ART_STYLES, VIDEO_RATIOS } from '@/lib/constants'
import { DEFAULT_STYLE_PRESET_VALUE, STYLE_PRESETS } from '@/lib/style-presets'
import { Link, useRouter } from '@/i18n/navigation'
import { apiFetch } from '@/lib/api-fetch'
import { expandHomeStory } from '@/lib/home/ai-story-expand'
import { createHomeProjectLaunch } from '@/lib/home/create-project-launch'
import { formatDefaultProjectTimestamp } from '@/lib/projects/default-name'
import { HOME_QUICK_START_MIN_ROWS } from '@/lib/ui/textarea-height'
import { shouldGuideToModelSetup } from '@/lib/workspace/model-setup'
import { readApiErrorMessage } from '@/lib/api/read-error-message'
import { validateProjectDraft } from '@/lib/projects/validation'
import AiWriteModal from '@/components/home/AiWriteModal'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import AiImageTab from '@/components/home/ai-image/AiImageTab'

interface ProjectStats {
  episodes: number
  images: number
  videos: number
  panels: number
  firstEpisodePreview: string | null
}

interface Project {
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
  totalCost?: number
  stats?: ProjectStats
}

interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

const PAGE_SIZE = 7
const DEFAULT_BILLING_CURRENCY = 'CNY'

function formatProjectCost(amount: number, currency = DEFAULT_BILLING_CURRENCY): string {
  if (currency === 'USD') return `$${amount.toFixed(2)}`
  return `¥${amount.toFixed(2)}`
}

function toProjectValidationMessage(
  issue: ReturnType<typeof validateProjectDraft>,
  t: ReturnType<typeof useTranslations>,
): string | null {
  if (!issue) return null

  switch (issue.code) {
    case 'PROJECT_NAME_REQUIRED':
      return t('validation.nameRequired')
    case 'PROJECT_NAME_TOO_LONG':
      return t('validation.nameTooLong')
    case 'PROJECT_DESCRIPTION_TOO_LONG':
      return t('validation.descriptionTooLong')
  }

  return null
}

export default function HomePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const t = useTranslations('home')
  const tw = useTranslations('workspace')
  const tc = useTranslations('common')

  // 分页状态：快速创作 / AI图片 / 项目管理
  const [activeTab, setActiveTab] = useState<'creation' | 'aiImage' | 'projects'>('creation')

  // 快速创作状态
  const [inputValue, setInputValue] = useState('')
  const [videoRatio, setVideoRatio] = useState('9:16')
  const [artStyle, setArtStyle] = useState('american-comic')
  const [stylePresetValue, setStylePresetValue] = useState<string>(DEFAULT_STYLE_PRESET_VALUE)
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [aiWriteOpen, setAiWriteOpen] = useState(false)
  const [aiWriteLoading, setAiWriteLoading] = useState(false)

  // 项目管理状态
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [modalCreateLoading, setModalCreateLoading] = useState(false)
  const [modalCreateError, setModalCreateError] = useState<string | null>(null)
  const [formData, setFormData] = useState({ name: '', description: '' })
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editFormData, setEditFormData] = useState({ name: '', description: '' })
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null)
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 0 })
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [modelNotConfigured, setModelNotConfigured] = useState(false)

  // 鉴权
  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      router.push({ pathname: '/auth/signin' })
    }
  }, [session, status, router])

  // 获取项目列表
  const fetchProjects = useCallback(async (page: number = 1, search: string = '') => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: PAGE_SIZE.toString()
      })
      if (search.trim()) {
        params.set('search', search.trim())
      }

      const response = await apiFetch(`/api/projects?${params}`)
      if (response.ok) {
        const data = await response.json()
        setProjects(data.projects)
        setPagination(data.pagination)
      }
    } catch {
      // 静默处理
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (session) {
      fetchProjects(pagination.page, searchQuery)
    }
  }, [session, pagination.page, searchQuery, fetchProjects])

  // 搜索处理
  const handleSearch = () => {
    setSearchQuery(searchInput)
    setPagination(prev => ({ ...prev, page: 1 }))
  }

  // 分页处理
  const handlePageChange = (newPage: number) => {
    setPagination(prev => ({ ...prev, page: newPage }))
  }

  // 打开新建项目弹窗
  const openCreateModal = useCallback(() => {
    setModalCreateError(null)
    setShowCreateModal(true)
    void (async () => {
      try {
        const res = await apiFetch('/api/user-preference')
        if (res.ok) {
          const payload: unknown = await res.json()
          setModelNotConfigured(shouldGuideToModelSetup(payload))
        }
      } catch {
        // 忽略检测失败
      }
    })()
  }, [])

  // 快速创作 - 创建项目并跳转
  const handleCreate = async () => {
    if (!inputValue.trim() || createLoading) return
    setCreateError(null)
    setCreateLoading(true)
    try {
      const storyText = inputValue.trim()
      const result = await createHomeProjectLaunch({
        apiFetch,
        projectName: t('defaultProjectName', {
          timestamp: formatDefaultProjectTimestamp(new Date()),
        }),
        storyText,
        videoRatio,
        artStyle,
        episodeName: `${tc('episode')} 1`,
      })

      router.push(result.target)
    } catch (error) {
      const message = error instanceof Error ? error.message : t('createFailed')
      setCreateError(message)
    } finally {
      setCreateLoading(false)
    }
  }

  // AI 帮我写
  const handleAiWriteStart = async (prompt: string) => {
    if (aiWriteLoading) return
    setAiWriteLoading(true)
    try {
      const result = await expandHomeStory({
        apiFetch,
        prompt,
      })

      setInputValue(result.expandedText)
      setAiWriteOpen(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed'
      window.alert(message)
    } finally {
      setAiWriteLoading(false)
    }
  }

  // 新建项目（弹窗）
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    const validationMessage = toProjectValidationMessage(validateProjectDraft(formData), tw)
    if (validationMessage) {
      setModalCreateError(validationMessage)
      return
    }

    setModalCreateError(null)
    setModalCreateLoading(true)
    try {
      const response = await apiFetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        let shouldOpenModelSetup = true
        const preferenceResponse = await apiFetch('/api/user-preference')
        if (preferenceResponse.ok) {
          const preferencePayload: unknown = await preferenceResponse.json()
          shouldOpenModelSetup = shouldGuideToModelSetup(preferencePayload)
        }

        setSearchQuery('')
        setSearchInput('')
        setPagination(prev => ({ ...prev, page: 1 }))
        void fetchProjects(1, '')
        setShowCreateModal(false)
        setFormData({ name: '', description: '' })

        if (shouldOpenModelSetup) {
          alert(tw('analysisModelRequiredAfterCreate'))
          router.push({ pathname: '/profile' })
        }
      } else {
        setModalCreateError(await readApiErrorMessage(response, tw('createFailed')))
      }
    } catch (error) {
      setModalCreateError(error instanceof Error ? error.message : tw('createFailed'))
    } finally {
      setModalCreateLoading(false)
    }
  }

  // 编辑项目
  const handleEditProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingProject) return

    const validationMessage = toProjectValidationMessage(validateProjectDraft(editFormData), tw)
    if (validationMessage) {
      setEditError(validationMessage)
      return
    }

    setEditError(null)
    setModalCreateLoading(true)
    try {
      const response = await apiFetch(`/api/projects/${editingProject.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFormData)
      })

      if (response.ok) {
        const data = await response.json()
        setProjects(projects.map(p => p.id === editingProject.id ? data.project : p))
        setShowEditModal(false)
        setEditingProject(null)
        setEditFormData({ name: '', description: '' })
      } else {
        setEditError(await readApiErrorMessage(response, tw('updateFailed')))
      }
    } catch (error) {
      setEditError(error instanceof Error ? error.message : tw('updateFailed'))
    } finally {
      setModalCreateLoading(false)
    }
  }

  // 删除项目
  const handleDeleteProject = async () => {
    if (!projectToDelete) return

    setDeletingProjectId(projectToDelete.id)
    setShowDeleteConfirm(false)

    try {
      const response = await apiFetch(`/api/projects/${projectToDelete.id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        fetchProjects(pagination.page, searchQuery)
      } else {
        alert(tw('deleteFailed'))
      }
    } catch {
      alert(tw('deleteFailed'))
    } finally {
      setDeletingProjectId(null)
      setProjectToDelete(null)
    }
  }

  const openDeleteConfirm = (project: Project, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setProjectToDelete(project)
    setShowDeleteConfirm(true)
  }

  const cancelDelete = () => {
    setShowDeleteConfirm(false)
    setProjectToDelete(null)
  }

  const openEditModal = (project: Project, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setEditingProject(project)
    setEditError(null)
    setEditFormData({
      name: project.name,
      description: project.description || ''
    })
    setShowEditModal(true)
  }

  // 格式化日期
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const beijingTime = new Date(date.getTime() + 8 * 60 * 60 * 1000)
    return beijingTime.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Shanghai'
    })
  }

  // 比例选项
  const ratioOptions = useMemo(
    () => VIDEO_RATIOS.map((r) => ({ ...r, recommended: r.value === '9:16' })),
    []
  )

  // 风格选项
  const styleOptions = useMemo(
    () => ART_STYLES.map((s) => ({ ...s, recommended: s.value === 'realistic' })),
    []
  )

  if (status === 'loading' || !session) {
    return (
      <div className="glass-page min-h-screen flex items-center justify-center">
        <div className="text-[var(--glass-text-secondary)]">{tc('loading')}</div>
      </div>
    )
  }

  return (
    <div className="glass-page min-h-screen">
      <Navbar />

      {/* 自定义呼吸动画 */}
      <style>{`
        @keyframes breathe-drift-1 {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.5; }
          25% { transform: translate(30px, -20px) scale(1.15); opacity: 0.7; }
          50% { transform: translate(-20px, 15px) scale(0.95); opacity: 0.4; }
          75% { transform: translate(15px, 25px) scale(1.1); opacity: 0.65; }
        }
        @keyframes breathe-drift-2 {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.45; }
          30% { transform: translate(-25px, 20px) scale(1.2); opacity: 0.7; }
          60% { transform: translate(20px, -15px) scale(0.9); opacity: 0.35; }
          80% { transform: translate(-10px, -25px) scale(1.05); opacity: 0.6; }
        }
        @keyframes breathe-drift-3 {
          0%, 100% { transform: translate(0, 0) scale(1.05); opacity: 0.4; }
          20% { transform: translate(20px, 15px) scale(0.9); opacity: 0.55; }
          45% { transform: translate(-15px, -20px) scale(1.15); opacity: 0.7; }
          70% { transform: translate(10px, -10px) scale(1); opacity: 0.35; }
        }
        @keyframes bracket-breathe {
          0%, 70%, 100% { opacity: 0.2; }
          75%, 90% { opacity: 0.6; }
        }
      `}</style>

      <main className="flex flex-col items-center pt-[13vh] pb-12 px-4 max-w-5xl mx-auto w-full">

        {/* 分页控制 */}
        <div className="w-full max-w-md mb-8">
          <SegmentedControl
            options={[
              { value: 'creation', label: t('tabCreation') },
              { value: 'aiImage', label: t('tabAiImage') },
              { value: 'projects', label: t('tabProjects') },
            ]}
            value={activeTab}
            onChange={(v) => setActiveTab(v as 'creation' | 'aiImage' | 'projects')}
          />
        </div>

        {/* 快速创作分页 */}
        {activeTab === 'creation' && (
          <>
            {/* 取景器整体包裹：标题 + 输入框 */}
            <div className="w-full relative p-5">
              {/* 四角校准线 */}
              <span className="absolute top-0 left-0 w-5 h-5 border-t border-l border-[var(--glass-text-primary)] pointer-events-none z-10" style={{ animation: 'bracket-breathe 8s ease-in-out infinite' }} />
              <span className="absolute top-0 right-0 w-5 h-5 border-t border-r border-[var(--glass-text-primary)] pointer-events-none z-10" style={{ animation: 'bracket-breathe 8s ease-in-out infinite' }} />
              <span className="absolute bottom-0 left-0 w-5 h-5 border-b border-l border-[var(--glass-text-primary)] pointer-events-none z-10" style={{ animation: 'bracket-breathe 8s ease-in-out infinite' }} />
              <span className="absolute bottom-0 right-0 w-5 h-5 border-b border-r border-[var(--glass-text-primary)] pointer-events-none z-10" style={{ animation: 'bracket-breathe 8s ease-in-out infinite' }} />

              {/* REC 录制指示灯 */}
              <span
                className="absolute top-2 right-7 flex items-center gap-1 z-10"
                style={{ animation: 'bracket-breathe 2s ease-in-out infinite' }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.7)]" />
                <span className="text-[8px] font-mono font-bold tracking-widest text-red-500/70">REC</span>
              </span>

              {/* 标题区 */}
              <TypewriterHero title={t('title')} subtitle={t('subtitle')} />

              {/* 呼吸光晕 + 输入区域 */}
              <div className="w-full relative group">
                <div
                  className="absolute -inset-10 rounded-[48px] pointer-events-none"
                  style={{
                    background: 'radial-gradient(ellipse 80% 60% at 30% 40%, rgba(6, 182, 212, 0.4), transparent 70%)',
                    animation: 'breathe-drift-1 8s ease-in-out infinite',
                    filter: 'blur(30px)',
                  }}
                />
                <div
                  className="absolute -inset-10 rounded-[48px] pointer-events-none"
                  style={{
                    background: 'radial-gradient(ellipse 70% 80% at 70% 60%, rgba(139, 92, 246, 0.35), transparent 70%)',
                    animation: 'breathe-drift-2 10s ease-in-out infinite',
                    filter: 'blur(35px)',
                  }}
                />
                <div
                  className="absolute -inset-12 rounded-[56px] pointer-events-none"
                  style={{
                    background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(59, 130, 246, 0.3), transparent 70%)',
                    animation: 'breathe-drift-3 12s ease-in-out infinite',
                    filter: 'blur(40px)',
                  }}
                />

                <StoryInputComposer
                  value={inputValue}
                  onValueChange={(nextValue) => {
                    setInputValue(nextValue)
                    if (createError) {
                      setCreateError(null)
                    }
                  }}
                  placeholder={t('inputPlaceholder')}
                  minRows={HOME_QUICK_START_MIN_ROWS}
                  textareaClassName="px-0 pt-0 pb-3 align-top"
                  videoRatio={videoRatio}
                  onVideoRatioChange={setVideoRatio}
                  ratioOptions={ratioOptions}
                  artStyle={artStyle}
                  onArtStyleChange={setArtStyle}
                  styleOptions={styleOptions}
                  stylePresetValue={stylePresetValue}
                  onStylePresetChange={setStylePresetValue}
                  stylePresetOptions={STYLE_PRESETS}
                  primaryAction={(
                    <button
                      onClick={() => void handleCreate()}
                      disabled={!inputValue.trim() || createLoading}
                      className="glass-btn-base glass-btn-primary h-10 flex-shrink-0 px-5 text-sm disabled:opacity-50"
                    >
                      {createLoading ? tc('loading') : t('startCreation')}
                      <AppIcon name="arrowRight" className="w-4 h-4" />
                    </button>
                  )}
                  secondaryActions={(
                    <button
                      onClick={() => setAiWriteOpen(true)}
                      disabled={createLoading}
                      className="glass-btn-base flex h-10 flex-shrink-0 items-center gap-1.5 border border-[var(--glass-stroke-strong)] px-3 text-sm transition-all hover:border-[var(--glass-tone-info-fg)]/40"
                    >
                      <AppIcon name="sparkles" className="w-4 h-4 text-[#7c3aed]" />
                      <span
                        className="font-medium"
                        style={{
                          background: 'linear-gradient(135deg, #3b82f6, #7c3aed)',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                        }}
                      >
                        {t('aiWrite.trigger')}
                      </span>
                    </button>
                  )}
                  footer={createError ? (
                    <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600">
                      {createError}
                    </p>
                  ) : null}
                />
              </div>
            </div>
            {/* AI 帮我写模态框 */}
            <AiWriteModal
              open={aiWriteOpen}
              loading={aiWriteLoading}
              onClose={() => setAiWriteOpen(false)}
              onStart={(prompt) => void handleAiWriteStart(prompt)}
              t={(key: string) => t(`aiWrite.${key}`)}
            />
          </>
        )}

        {/* AI图片分页 */}
        {activeTab === 'aiImage' && (
          <div className="w-full">
            <AiImageTab />
          </div>
        )}
      </main>

      {/* 项目管理分页 */}
      {activeTab === 'projects' && (
        <section className="px-4 sm:px-6 lg:px-10 pb-8 max-w-[1600px] mx-auto w-full">
          {/* 搜索栏 */}
          <div className="mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h2 className="text-sm font-semibold text-[var(--glass-text-secondary)]">{t('recentProjects')}</h2>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder={tw('searchPlaceholder')}
                className="glass-input-base w-48 sm:w-64 px-3 py-2 text-sm"
              />
              <button
                onClick={handleSearch}
                className="glass-btn-base glass-btn-primary px-4 py-2 text-sm"
              >
                {tw('searchButton')}
              </button>
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchInput('')
                    setSearchQuery('')
                    setPagination(prev => ({ ...prev, page: 1 }))
                  }}
                  className="glass-btn-base glass-btn-secondary px-4 py-2 text-sm"
                >
                  {tw('clearButton')}
                </button>
              )}
            </div>
          </div>

          {/* 项目网格 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {/* 新建项目卡片 */}
            <div
              onClick={() => openCreateModal()}
              className="glass-surface p-6 cursor-pointer group flex items-center justify-center bg-gradient-to-br from-blue-500/5 via-cyan-500/5 to-blue-600/5 hover:from-blue-500/10 hover:via-cyan-500/10 hover:to-blue-600/10 transition-all duration-300"
            >
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:shadow-blue-500/40 group-hover:scale-110 transition-all duration-300">
                  <AppIcon name="plus" className="w-6 h-6 text-white" />
                </div>
                <span className="text-sm font-medium text-[var(--glass-text-secondary)] group-hover:text-[var(--glass-text-primary)] transition-colors">{tw('newProject')}</span>
              </div>
            </div>

            {/* 项目卡片 */}
            {loading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="glass-surface p-6 animate-pulse">
                  <div className="h-4 bg-[var(--glass-bg-muted)] rounded mb-3" />
                  <div className="h-3 bg-[var(--glass-bg-muted)] rounded mb-2" />
                  <div className="h-3 bg-[var(--glass-bg-muted)] rounded w-2/3" />
                </div>
              ))
            ) : (
              projects.map((project) => (
                <Link
                  key={project.id}
                  href={{ pathname: `/workspace/${project.id}` }}
                  className="glass-surface cursor-pointer relative group block hover:border-[var(--glass-tone-info-fg)]/40 transition-all duration-300 overflow-hidden"
                >
                  {/* 悬停光效 */}
                  <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                  <div className="p-5 relative z-10">
                    {/* 操作按钮 */}
                    <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                      <button
                        onClick={(e) => openEditModal(project, e)}
                        className="glass-btn-base glass-btn-secondary p-2 rounded-lg transition-colors"
                        title={tw('editProject')}
                      >
                        <AppIcon name="editSquare" className="w-4 h-4 text-[var(--glass-tone-info-fg)]" />
                      </button>
                      <button
                        onClick={(e) => openDeleteConfirm(project, e)}
                        className="glass-btn-base glass-btn-secondary p-2 rounded-lg transition-colors"
                        title={tw('deleteProject')}
                        disabled={deletingProjectId === project.id}
                      >
                        {deletingProjectId === project.id ? (
                          <TaskStatusInline
                            state={resolveTaskPresentationState({
                              phase: 'processing',
                              intent: 'process',
                              resource: 'text',
                              hasOutput: true,
                            })}
                            className="[&>span]:sr-only"
                          />
                        ) : (
                          <AppIcon name="trash" className="w-4 h-4 text-[var(--glass-tone-danger-fg)]" />
                        )}
                      </button>
                    </div>

                    {/* 标题 */}
                    <h3 className="text-base font-bold text-[var(--glass-text-primary)] mb-2 line-clamp-2 pr-20 group-hover:text-[var(--glass-tone-info-fg)] transition-colors">
                      {project.name}
                    </h3>

                    {/* 描述 */}
                    {(project.description || project.stats?.firstEpisodePreview) && (
                      <div className="flex items-start gap-2 mb-3">
                        <AppIcon name="fileText" className="w-3.5 h-3.5 text-[var(--glass-text-tertiary)] mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-[var(--glass-text-secondary)] line-clamp-2 leading-relaxed">
                          {project.description || project.stats?.firstEpisodePreview}
                        </p>
                      </div>
                    )}

                    {/* 统计信息 */}
                    {project.stats && (project.stats.episodes > 0 || project.stats.images > 0 || project.stats.videos > 0) ? (
                      <div className="flex items-center gap-2 mb-3">
                        <IconGradientDefs className="w-0 h-0 absolute" aria-hidden="true" />
                        <AppIcon name="statsBarGradient" className="w-4 h-4 flex-shrink-0" />
                        <div className="flex items-center gap-3 text-sm font-semibold bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent">
                          {project.stats.episodes > 0 && (
                            <span className="flex items-center gap-1" title={tw('statsEpisodes')}>
                              <AppIcon name="statsEpisodeGradient" className="w-3.5 h-3.5" />
                              {project.stats.episodes}
                            </span>
                          )}
                          {project.stats.images > 0 && (
                            <span className="flex items-center gap-1" title={tw('statsImages')}>
                              <AppIcon name="statsImageGradient" className="w-3.5 h-3.5" />
                              {project.stats.images}
                            </span>
                          )}
                          {project.stats.videos > 0 && (
                            <span className="flex items-center gap-1" title={tw('statsVideos')}>
                              <AppIcon name="statsVideoGradient" className="w-3.5 h-3.5" />
                              {project.stats.videos}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2.5 mb-3">
                        <AppIcon name="statsBar" className="w-4 h-4 text-[var(--glass-text-tertiary)] flex-shrink-0" />
                        <span className="text-xs text-[var(--glass-text-tertiary)]">{tw('noContent')}</span>
                      </div>
                    )}

                    {/* 底部信息 */}
                    <div className="flex items-center justify-between text-[11px] text-[var(--glass-text-tertiary)]">
                      <div className="flex items-center gap-1">
                        <AppIcon name="clock" className="w-3 h-3" />
                        {formatDate(project.updatedAt)}
                      </div>
                      {project.totalCost !== undefined && project.totalCost > 0 && (
                        <span className="text-[11px] font-mono font-medium text-[var(--glass-text-secondary)]">
                          {formatProjectCost(project.totalCost)}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>

          {/* 空状态 */}
          {!loading && projects.length === 0 && (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-[var(--glass-bg-muted)] rounded-xl flex items-center justify-center mx-auto mb-4">
                <AppIcon name="folderCards" className="w-8 h-8 text-[var(--glass-text-tertiary)]" />
              </div>
              <h3 className="text-lg font-medium text-[var(--glass-text-primary)] mb-2">
                {searchQuery ? tw('noResults') : tw('noProjects')}
              </h3>
              <p className="text-[var(--glass-text-secondary)] mb-6">
                {searchQuery ? tw('noResultsDesc') : tw('noProjectsDesc')}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => openCreateModal()}
                  className="glass-btn-base glass-btn-primary px-6 py-3"
                >
                  {tw('newProject')}
                </button>
              )}
            </div>
          )}

          {/* 分页控件 */}
          {!loading && pagination.totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <button
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="glass-btn-base glass-btn-secondary px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <AppIcon name="chevronLeft" className="w-5 h-5" />
              </button>

              {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                .filter(page => {
                  return page === 1 ||
                    page === pagination.totalPages ||
                    Math.abs(page - pagination.page) <= 2
                })
                .map((page, index, array) => (
                  <span key={page} className="flex items-center">
                    {index > 0 && array[index - 1] !== page - 1 && (
                      <span className="px-2 text-[var(--glass-text-tertiary)]">...</span>
                    )}
                    <button
                      onClick={() => handlePageChange(page)}
                      className={`glass-btn-base px-4 py-2 ${page === pagination.page
                        ? 'glass-btn-primary'
                        : 'glass-btn-secondary'
                        }`}
                    >
                      {page}
                    </button>
                  </span>
                ))}

              <button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="glass-btn-base glass-btn-secondary px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <AppIcon name="chevronRight" className="w-5 h-5" />
              </button>

              <span className="ml-4 text-sm text-[var(--glass-text-tertiary)]">
                {tw('totalProjects', { count: pagination.total })}
              </span>
            </div>
          )}
        </section>
      )}

      {/* 新建项目弹窗 */}
      {showCreateModal && (
        <div className="fixed inset-0 glass-overlay flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="glass-surface-modal p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold text-[var(--glass-text-primary)] mb-4">{tw('createProject')}</h2>
            {modelNotConfigured && (
              <div className="flex items-start gap-2 mb-4 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400">
                <AppIcon name="alert" className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="text-[12px] leading-relaxed">
                  {tw('modelNotConfigured.before')}
                  <Link
                    href={{ pathname: '/profile' }}
                    className="font-semibold underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-300 mx-0.5"
                    onClick={() => setShowCreateModal(false)}
                  >
                    {tw('modelNotConfigured.link')}
                  </Link>
                  {tw('modelNotConfigured.after')}
                </span>
              </div>
            )}
            <form onSubmit={handleCreateProject}>
              <div className="mb-4">
                <label htmlFor="name" className="glass-field-label block mb-2">
                  {tw('projectName')} *
                </label>
                <input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => {
                    setFormData({ ...formData, name: e.target.value })
                    if (modalCreateError) {
                      setModalCreateError(null)
                    }
                  }}
                  className="glass-input-base w-full px-3 py-2"
                  placeholder={tw('projectNamePlaceholder')}
                  maxLength={100}
                  required
                  autoFocus
                />
              </div>
              <div className="mb-6">
                <label htmlFor="description" className="glass-field-label block mb-2">
                  {tw('projectDescription')}
                </label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => {
                    setFormData({ ...formData, description: e.target.value })
                    if (modalCreateError) {
                      setModalCreateError(null)
                    }
                  }}
                  className="glass-textarea-base w-full px-3 py-2"
                  placeholder={tw('projectDescriptionPlaceholder')}
                  rows={3}
                  maxLength={500}
                />
              </div>
              {modalCreateError && (
                <p className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600">
                  {modalCreateError}
                </p>
              )}
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false)
                    setModalCreateError(null)
                    setFormData({ name: '', description: '' })
                  }}
                  className="glass-btn-base glass-btn-secondary px-4 py-2"
                  disabled={modalCreateLoading}
                >
                  {tc('cancel')}
                </button>
                <button
                  type="submit"
                  className="glass-btn-base glass-btn-primary px-4 py-2 disabled:opacity-50"
                  disabled={modalCreateLoading || !formData.name.trim()}
                >
                  {modalCreateLoading ? tw('creating') : tw('createProject')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 编辑项目弹窗 */}
      {showEditModal && editingProject && (
        <div className="fixed inset-0 glass-overlay flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="glass-surface-modal p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold text-[var(--glass-text-primary)] mb-4">{tw('editProject')}</h2>
            <form onSubmit={handleEditProject}>
              <div className="mb-4">
                <label htmlFor="edit-name" className="glass-field-label block mb-2">
                  {tw('projectName')} *
                </label>
                <input
                  id="edit-name"
                  type="text"
                  value={editFormData.name}
                  onChange={(e) => {
                    setEditFormData({ ...editFormData, name: e.target.value })
                    if (editError) {
                      setEditError(null)
                    }
                  }}
                  className="glass-input-base w-full px-3 py-2"
                  placeholder={tw('projectNamePlaceholder')}
                  maxLength={100}
                  required
                />
              </div>
              <div className="mb-6">
                <label htmlFor="edit-description" className="glass-field-label block mb-2">
                  {tw('projectDescription')}
                </label>
                <textarea
                  id="edit-description"
                  value={editFormData.description}
                  onChange={(e) => {
                    setEditFormData({ ...editFormData, description: e.target.value })
                    if (editError) {
                      setEditError(null)
                    }
                  }}
                  className="glass-textarea-base w-full px-3 py-2"
                  placeholder={tw('projectDescriptionPlaceholder')}
                  rows={3}
                  maxLength={500}
                />
              </div>
              {editError && (
                <p className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600">
                  {editError}
                </p>
              )}
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false)
                    setEditingProject(null)
                    setEditError(null)
                    setEditFormData({ name: '', description: '' })
                  }}
                  className="glass-btn-base glass-btn-secondary px-4 py-2"
                  disabled={modalCreateLoading}
                >
                  {tc('cancel')}
                </button>
                <button
                  type="submit"
                  className="glass-btn-base glass-btn-primary px-4 py-2 disabled:opacity-50"
                  disabled={modalCreateLoading || !editFormData.name.trim()}
                >
                  {modalCreateLoading ? tw('saving') : tc('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 删除确认对话框 */}
      <ConfirmDialog
        show={showDeleteConfirm}
        title={tw('deleteProject')}
        message={tw('deleteConfirm', { name: projectToDelete?.name || '' })}
        confirmText={tc('delete')}
        cancelText={tc('cancel')}
        type="danger"
        onConfirm={handleDeleteProject}
        onCancel={cancelDelete}
      />
    </div>
  )
}
