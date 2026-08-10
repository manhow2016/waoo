/**
 * 生图工作台（Image Generation Workbench）
 *
 * 移植自 nova-image-studio，模型配置统一采用 waoowaoo 的 /api/user/models。
 */

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import { AppIcon } from '@/components/ui/icons'
import {
  useStudioModels,
  getStudioOutputSizeOptions,
  STUDIO_ASPECT_RATIOS,
  findStudioImageModelWithSize,
} from '@/lib/image-studio/models'
import { studioGenerate, streamStudioPromptOptimize, type StudioPromptOptimizeMode } from '@/lib/image-studio/client'
import type { StudioGenerateOptions } from '@/lib/image-studio/types'
import {
  prepareImageFile,
  extractImageFiles,
  copyText,
  triggerDownload,
  dataUrlToBlob,
  type PreparedImage,
} from './image-utils'
import {
  GlassSelect,
  Segmented,
  StudioModal,
  StudioSpinner,
  StudioEmptyState,
  cx,
} from './ui'
import { useRouter } from '@/i18n/navigation'

interface HistoryItem {
  id: string
  prompt: string
  images: string[]
  createdAt: string
  model: string
  mode: 'text-to-image' | 'image-to-image'
  status: 'processing' | 'completed' | 'failed'
  error?: string
}

const HISTORY_KEY = 'waoowaoo-image-studio-history'

function loadHistory(): HistoryItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? (JSON.parse(raw) as HistoryItem[]) : []
  } catch {
    return []
  }
}

function saveHistory(items: HistoryItem[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 50)))
  } catch {
    // ignore quota
  }
}

export default function ImageGenerationWorkbench() {
  const t = useTranslations('imageStudio')
  const tc = useTranslations('imageStudio.common')
  const { data: session } = useSession()
  const router = useRouter()

  const { imageModels, llmModels } = useStudioModels()

  const [prompt, setPrompt] = useState('')
  const [pendingFiles, setPendingFiles] = useState<PreparedImage[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [outputSize, setOutputSize] = useState('1K')
  const [aspectRatio, setAspectRatio] = useState('1:1')
  const [parallelCount, setParallelCount] = useState(1)
  const [quality, setQuality] = useState<'auto' | 'low' | 'medium' | 'high'>('auto')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [optimizeOpen, setOptimizeOpen] = useState(false)
  const [optimizeDraft, setOptimizeDraft] = useState('')
  const [optimizing, setOptimizing] = useState(false)
  const [optimizeResult, setOptimizeResult] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const optimizeAbortRef = useRef<(() => void) | null>(null)

  // 初始选择模型
  useEffect(() => {
    if (selectedModel || imageModels.length === 0) return
    const fallback = findStudioImageModelWithSize(imageModels, outputSize)
    if (fallback) setSelectedModel(fallback.value)
  }, [imageModels, selectedModel, outputSize])

  // 模型变化时重置输出尺寸
  const activeModel = useMemo(
    () => imageModels.find((model) => model.value === selectedModel),
    [imageModels, selectedModel],
  )

  const sizeOptions = useMemo(() => {
    return getStudioOutputSizeOptions(activeModel).map((size) => ({ value: size, label: size }))
  }, [activeModel])

  useEffect(() => {
    if (sizeOptions.length > 0 && !sizeOptions.some((option) => option.value === outputSize)) {
      setOutputSize(sizeOptions[0].value)
    }
  }, [sizeOptions, outputSize])

  // 加载历史
  useEffect(() => {
    setHistory(loadHistory())
  }, [])

  // 支持拖拽/粘贴
  const handleFiles = useCallback(async (files: File[]) => {
    setError(null)
    try {
      const prepared = await Promise.all(files.map((file) => prepareImageFile(file)))
      setPendingFiles((prev) => [...prev, ...prepared].slice(0, 8))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    void handleFiles(extractImageFiles(e.dataTransfer.items))
  }

  const currentMode = pendingFiles.length > 0 ? 'image-to-image' : 'text-to-image'

  const handleSubmit = async () => {
    const text = prompt.trim()
    if (!text) {
      setError(tc('promptPlaceholder'))
      return
    }
    if (!selectedModel) {
      setError(tc('noModels'))
      return
    }
    if (!session?.user) {
      router.push({ pathname: '/auth/signin' })
      return
    }

    const options: StudioGenerateOptions = {
      outputSize: outputSize as StudioGenerateOptions['outputSize'],
      aspectRatio,
      quality,
    }

    const item: HistoryItem = {
      id: `hist_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      prompt: text,
      images: [],
      createdAt: new Date().toISOString(),
      model: selectedModel,
      mode: currentMode,
      status: 'processing',
    }
    setHistory((prev) => [item, ...prev])
    setLoading(true)
    setError(null)

    try {
      const result = await studioGenerate({
        modelKey: selectedModel,
        prompt: text,
        referenceImages: pendingFiles.map((file) => file.dataUrl),
        options,
        parallelCount,
      })
      setHistory((prev) => {
        const next = prev.map((h) =>
          h.id === item.id
            ? { ...h, status: 'completed' as const, images: result.images }
            : h,
        )
        saveHistory(next)
        return next
      })
      setPrompt('')
      if (currentMode === 'text-to-image') {
        setPendingFiles([])
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setHistory((prev) => {
        const next = prev.map((h) =>
          h.id === item.id ? { ...h, status: 'failed' as const, error: message } : h,
        )
        saveHistory(next)
        return next
      })
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleRetry = async (item: HistoryItem) => {
    setPrompt(item.prompt)
    setSelectedModel(item.model)
    if (item.mode === 'image-to-image') {
      setError(tc('retry') + ': ' + item.model)
    }
  }

  const handleOptimize = () => {
    const text = prompt.trim()
    if (!text) {
      setError(tc('promptPlaceholder'))
      return
    }
    if (!activeLlmModel) {
      setError(tc('noModels'))
      return
    }
    setOptimizeDraft(text)
    setOptimizeResult('')
    setOptimizeOpen(true)
  }

  const activeLlmModel = llmModels[0]?.value

  const startOptimize = async () => {
    if (!activeLlmModel || optimizing) return
    setOptimizing(true)
    setOptimizeResult('')
    const mode: StudioPromptOptimizeMode = currentMode === 'image-to-image' ? 'image-to-image' : 'text-to-image'
    const handle = streamStudioPromptOptimize({
      modelKey: activeLlmModel,
      prompt: optimizeDraft,
      mode,
      callbacks: {
        onDelta: (delta) => setOptimizeResult((prev) => prev + delta),
        onDone: () => setOptimizing(false),
        onError: (err) => {
          setError(err.message)
          setOptimizing(false)
        },
      },
    })
    optimizeAbortRef.current = handle.abort
  }

  const handleUseOptimized = () => {
    if (optimizeResult.trim()) {
      setPrompt(optimizeResult.trim())
    }
    setOptimizeOpen(false)
  }

  useEffect(() => {
    return () => {
      optimizeAbortRef.current?.()
    }
  }, [])

  const handleCopy = async (url: string, id: string) => {
    const ok = await copyText(url)
    if (ok) {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1500)
    }
  }

  const handleDownload = async (url: string, index: number) => {
    try {
      const blob = await dataUrlToBlob(url)
      const objectUrl = URL.createObjectURL(blob)
      triggerDownload(objectUrl, `studio-${index + 1}.png`)
      URL.revokeObjectURL(objectUrl)
    } catch {
      // ignore
    }
  }

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_420px] gap-6">
      {/* 左侧：输入区 */}
      <div className="space-y-4">
        {/* 参考图上传区 */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className={cx(
            'rounded-2xl border-2 border-dashed border-[var(--glass-stroke-soft)] p-6 text-center transition-colors',
            'hover:border-[var(--glass-tone-info-fg)]/50 bg-[var(--glass-bg-muted)]/30',
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void handleFiles(Array.from(e.target.files))
              e.target.value = ''
            }}
          />
          {pendingFiles.length === 0 ? (
            <button type="button" onClick={() => fileInputRef.current?.click()} className="text-sm text-[var(--glass-text-secondary)]">
              <AppIcon name="upload" className="w-8 h-8 mx-auto mb-2 text-[var(--glass-text-tertiary)]" />
              {tc('uploadHint')}
            </button>
          ) : (
            <div className="flex flex-wrap gap-3 justify-center">
              {pendingFiles.map((file) => (
                <div key={file.id} className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={file.dataUrl}
                    alt={file.name}
                    className="w-24 h-24 object-cover rounded-xl border border-[var(--glass-stroke-soft)]"
                  />
                  <button
                    type="button"
                    onClick={() => setPendingFiles((prev) => prev.filter((f) => f.id !== file.id))}
                    className="absolute -top-1.5 -right-1.5 glass-btn-base glass-btn-ghost p-1 rounded-full"
                  >
                    <AppIcon name="close" className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-24 h-24 rounded-xl border border-dashed border-[var(--glass-stroke-soft)] flex items-center justify-center text-[var(--glass-text-tertiary)] hover:text-[var(--glass-tone-info-fg)]"
              >
                <AppIcon name="plus" className="w-6 h-6" />
              </button>
            </div>
          )}
        </div>

        {/* 提示词输入 */}
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={tc('promptPlaceholder')}
          rows={5}
          className="glass-textarea-base w-full px-3 py-2"
        />

        {/* 参数栏 */}
        <div className="glass-surface p-4 rounded-2xl space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="glass-field-label block mb-1.5">{tc('model')}</label>
              <GlassSelect
                value={selectedModel}
                options={imageModels.map((model) => ({ value: model.value, label: model.label }))}
                onChange={setSelectedModel}
                disabled={imageModels.length === 0}
              />
            </div>
            <div>
              <label className="glass-field-label block mb-1.5">{tc('outputSize')}</label>
              <GlassSelect
                value={outputSize}
                options={sizeOptions}
                onChange={setOutputSize}
              />
            </div>
            <div>
              <label className="glass-field-label block mb-1.5">{tc('aspectRatio')}</label>
              <GlassSelect
                value={aspectRatio}
                options={STUDIO_ASPECT_RATIOS.map((option) => ({ value: option.value, label: option.label }))}
                onChange={setAspectRatio}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <label className="glass-field-label block mb-1.5">{tc('parallelCount')}</label>
              <Segmented
                value={String(parallelCount)}
                options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) }))}
                onChange={(value) => setParallelCount(Number(value))}
              />
            </div>
          </div>

          {/* 高级参数 */}
          <div>
            <label className="glass-field-label block mb-1.5">{tc('advancedParams')} · 质量</label>
            <Segmented
              value={quality}
              options={[
                { value: 'auto', label: '自动' },
                { value: 'low', label: '低' },
                { value: 'medium', label: '中' },
                { value: 'high', label: '高' },
              ]}
              onChange={(value) => setQuality(value)}
            />
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={loading || imageModels.length === 0}
            className="glass-btn-base glass-btn-primary px-6 py-2.5 flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <StudioSpinner /> : <AppIcon name="sparkles" className="w-4 h-4" />}
            {loading ? tc('generating') : tc('generate')}
          </button>
          <button
            type="button"
            onClick={handleOptimize}
            disabled={!prompt.trim() || llmModels.length === 0}
            className="glass-btn-base glass-btn-secondary px-4 py-2.5 flex items-center gap-2 disabled:opacity-50"
          >
            <AppIcon name="sparkles" className="w-4 h-4" />
            {tc('optimize')}
          </button>
        </div>
      </div>

      {/* 右侧：历史记录 */}
      <div className="glass-surface rounded-2xl p-4 h-fit">
        <h3 className="text-sm font-semibold text-[var(--glass-text-primary)] mb-4">
          {t('workbench.history')}
        </h3>
        {history.length === 0 ? (
          <StudioEmptyState title={t('workbench.historyEmpty')} />
        ) : (
          <div className="space-y-4">
            {history.map((item) => (
              <div key={item.id} className="border border-[var(--glass-stroke-soft)] rounded-xl overflow-hidden">
                {item.images.length > 0 ? (
                  <div className="grid grid-cols-2 gap-1">
                    {item.images.map((url, index) => (
                      <div key={index} className="relative group aspect-square">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                          <button
                            type="button"
                            onClick={() => void handleCopy(url, `${item.id}-${index}`)}
                            className="glass-btn-base glass-btn-soft p-1.5 rounded-lg"
                            title={tc('copy')}
                          >
                            <AppIcon name="copy" className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDownload(url, index)}
                            className="glass-btn-base glass-btn-soft p-1.5 rounded-lg"
                            title={tc('download')}
                          >
                            <AppIcon name="download" className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {copiedId === `${item.id}-${index}` && (
                          <span className="absolute bottom-1 right-1 text-[10px] text-white bg-black/70 px-1.5 py-0.5 rounded">
                            {tc('copied')}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : item.status === 'processing' ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-sm text-[var(--glass-text-secondary)]">
                    <StudioSpinner />
                    {tc('generating')}
                  </div>
                ) : (
                  <div className="py-6 text-center text-sm text-red-500">
                    {item.error || tc('error')}
                    <button
                      type="button"
                      onClick={() => void handleRetry(item)}
                      className="block mx-auto mt-2 glass-btn-base glass-btn-secondary px-3 py-1 text-xs"
                    >
                      {tc('retry')}
                    </button>
                  </div>
                )}
                <div className="px-3 py-2 border-t border-[var(--glass-stroke-soft)]">
                  <p className="text-xs text-[var(--glass-text-secondary)] line-clamp-2">{item.prompt}</p>
                  <p className="text-[10px] text-[var(--glass-text-tertiary)] mt-1">
                    {item.mode} · {new Date(item.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 提示词优化弹窗 */}
      {optimizeOpen && (
        <StudioModal
          title={t('workbench.promptOptimizeTitle')}
          onClose={() => {
            optimizeAbortRef.current?.()
            setOptimizeOpen(false)
          }}
          width="w-full max-w-2xl"
        >
          <p className="text-sm text-[var(--glass-text-secondary)] mb-4">{t('workbench.promptOptimizeDesc')}</p>
          <textarea
            value={optimizeDraft}
            onChange={(e) => setOptimizeDraft(e.target.value)}
            rows={4}
            className="glass-textarea-base w-full px-3 py-2 text-sm mb-3"
          />
          {optimizeResult && (
            <div className="rounded-xl border border-[var(--glass-stroke-soft)] bg-[var(--glass-bg-muted)]/30 p-3 mb-3 max-h-64 overflow-y-auto whitespace-pre-wrap text-sm">
              {optimizeResult}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setOptimizeOpen(false)} className="glass-btn-base glass-btn-secondary px-4 py-2">
              {tc('cancel')}
            </button>
            {optimizeResult && (
              <button type="button" onClick={handleUseOptimized} className="glass-btn-base glass-btn-primary px-4 py-2">
                {tc('useOptimized')}
              </button>
            )}
            <button
              type="button"
              onClick={() => void startOptimize()}
              disabled={optimizing || !optimizeDraft.trim()}
              className="glass-btn-base glass-btn-tone-info px-4 py-2 flex items-center gap-2 disabled:opacity-50"
            >
              {optimizing && <StudioSpinner />}
              {optimizing ? tc('optimizing') : tc('optimize')}
            </button>
          </div>
        </StudioModal>
      )}
    </div>
  )
}
