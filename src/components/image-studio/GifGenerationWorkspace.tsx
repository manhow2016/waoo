/**
 * 动图生成（GIF Generation Workspace）
 *
 * 移植自 nova-image-studio：生成 3×4 网格图 → 浏览器端 gifenc 编码。
 */

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import { AppIcon } from '@/components/ui/icons'
import { useStudioModels, findStudioImageModelWithSize } from '@/lib/image-studio/models'
import { studioGenerate } from '@/lib/image-studio/client'
import { prepareImageFile, extractImageFiles, triggerDownload, type PreparedImage } from './image-utils'
import { GlassSelect, GlassSlider, GlassSwitch, StudioSpinner, StudioModal, cx } from './ui'
import { encodeGifFromGrid, extractGridCells, GIF_GRID_COLS, GIF_GRID_ROWS, GIF_GRID_FRAMES } from './gif-encoder'
import { useRouter } from '@/i18n/navigation'

interface GridJob {
  id: string
  prompt: string
  status: 'generating_grid' | 'grid_ready' | 'failed'
  gridImageUrl?: string
  error?: string
  createdAt: string
}

export default function GifGenerationWorkspace() {
  const t = useTranslations('imageStudio')
  const tc = useTranslations('imageStudio.common')
  const { data: session } = useSession()
  const router = useRouter()

  const { imageModels } = useStudioModels()

  const [prompt, setPrompt] = useState('')
  const [pendingFiles, setPendingFiles] = useState<PreparedImage[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [outputSize, setOutputSize] = useState('2K')
  const [closedLoop, setClosedLoop] = useState(true)

  const [job, setJob] = useState<GridJob | null>(null)
  const [generating, setGenerating] = useState(false)
  const [encoding, setEncoding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // GIF 编码参数
  const [frameDelay, setFrameDelay] = useState(150)
  const [repeat, setRepeat] = useState(0)
  const [framePadding, setFramePadding] = useState(4)

  const [gifBlobUrl, setGifBlobUrl] = useState<string | null>(null)
  const [cells, setCells] = useState<string[]>([])
  const [tuneOpen, setTuneOpen] = useState(false)
  const [tunedCells, setTunedCells] = useState<string[]>([])

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (selectedModel || imageModels.length === 0) return
    const fallback = findStudioImageModelWithSize(imageModels, '2K') || findStudioImageModelWithSize(imageModels, '1K')
    if (fallback) {
      setSelectedModel(fallback.value)
      const options = fallback.resolutionOptions || ['1K']
      setOutputSize(options.includes('2K') ? '2K' : '1K')
    }
  }, [imageModels, selectedModel])

  const activeModel = useMemo(
    () => imageModels.find((model) => model.value === selectedModel),
    [imageModels, selectedModel],
  )

  // GIF 输出尺寸固定为 1K/2K 两档，与模型能力求交集，无能力时回退两档
  const sizeOptions = useMemo(() => {
    const supported = (activeModel?.resolutionOptions || []).filter((size) => size === '1K' || size === '2K')
    const sizes = supported.length > 0 ? supported : ['1K', '2K']
    return sizes.map((size) => ({ value: size, label: size }))
  }, [activeModel])

  const handleFiles = useCallback(async (files: File[]) => {
    setError(null)
    try {
      const prepared = await Promise.all(files.map((file) => prepareImageFile(file)))
      setPendingFiles((prev) => [...prev, ...prepared].slice(0, 6))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    void handleFiles(extractImageFiles(e.dataTransfer.items))
  }

  const buildGridPrompt = (userPrompt: string): string => {
    const parts: string[] = []
    if (closedLoop) {
      parts.push('这是一个首尾帧闭合的循环动画，第 1 帧与第 12 帧必须无缝衔接，形成平滑循环。')
    }
    parts.push(
      `请生成一个严格 3 行 × 4 列的网格图（共 12 帧），每帧为 1:1 正方形，帧与帧之间有明显等宽黑色间隔线，用于后续切帧编码 GIF。`,
    )
    parts.push('动画内容：' + userPrompt)
    return parts.join('\n')
  }

  const handleGenerateGrid = async () => {
    const text = prompt.trim()
    if (!text) {
      setError(t('gif.gridPromptPlaceholder'))
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

    setGenerating(true)
    setError(null)
    setCells([])

    const item: GridJob = {
      id: `gif_${Date.now().toString(36)}`,
      prompt: text,
      status: 'generating_grid',
      createdAt: new Date().toISOString(),
    }
    setJob(item)

    try {
      const result = await studioGenerate({
        modelKey: selectedModel,
        prompt: buildGridPrompt(text),
        referenceImages: pendingFiles.map((file) => file.dataUrl),
        options: {
          outputSize: outputSize as never,
          aspectRatio: '4:3',
        },
        parallelCount: 1,
      })
      const gridUrl = result.images[0]
      if (!gridUrl) throw new Error('生成结果为空')
      setJob({ ...item, status: 'grid_ready', gridImageUrl: gridUrl })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setJob({ ...item, status: 'failed', error: message })
      setError(message)
    } finally {
      setGenerating(false)
    }
  }

  const handleEncodeGif = async () => {
    if (!job?.gridImageUrl || encoding) return
    setEncoding(true)
    setError(null)
    try {
      const blob = await encodeGifFromGrid(job.gridImageUrl, {
        frameDelayMs: frameDelay,
        repeat,
        framePaddingPercent: framePadding,
      })
      const url = URL.createObjectURL(blob)
      setGifBlobUrl(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setEncoding(false)
    }
  }

  const handleDownloadGif = () => {
    if (gifBlobUrl) triggerDownload(gifBlobUrl, `animation-${Date.now()}.gif`)
  }

  const openTuner = async () => {
    if (!job?.gridImageUrl) return
    try {
      const extracted = await extractGridCells(job.gridImageUrl, 240, framePadding)
      setCells(extracted)
      setTunedCells(extracted)
      setTuneOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_460px] gap-6">
      {/* 左侧：参数 + 参考图 */}
      <div className="space-y-4">
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
              {t('gif.refImages')} · {tc('uploadHint')}
            </button>
          ) : (
            <div className="flex flex-wrap gap-3 justify-center">
              {pendingFiles.map((file) => (
                <div key={file.id} className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={file.dataUrl}
                    alt={file.name}
                    className="w-20 h-20 object-cover rounded-xl border border-[var(--glass-stroke-soft)]"
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
                className="w-20 h-20 rounded-xl border border-dashed border-[var(--glass-stroke-soft)] flex items-center justify-center text-[var(--glass-text-tertiary)]"
              >
                <AppIcon name="plus" className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t('gif.gridPromptPlaceholder')}
          rows={4}
          className="glass-textarea-base w-full px-3 py-2"
        />

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
              <label className="glass-field-label block mb-1.5">{tc('outputResolution')}</label>
              <GlassSelect
                value={outputSize}
                options={sizeOptions}
                onChange={setOutputSize}
              />
            </div>
          </div>
          <GlassSwitch checked={closedLoop} onChange={setClosedLoop} label={t('gif.closedLoop')} />
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={() => void handleGenerateGrid()}
          disabled={generating || imageModels.length === 0}
          className="glass-btn-base glass-btn-primary px-6 py-2.5 flex items-center gap-2 disabled:opacity-50"
        >
          {generating ? <StudioSpinner /> : <AppIcon name="sparkles" className="w-4 h-4" />}
          {generating ? t('gif.generatingGrid') : t('gif.generateGrid')}
        </button>

        <p className="text-xs text-[var(--glass-text-tertiary)]">
          {GIF_GRID_ROWS}×{GIF_GRID_COLS} = {GIF_GRID_FRAMES} 帧
        </p>
      </div>

      {/* 右侧：网格 + GIF 预览 */}
      <div className="space-y-4">
        <div className="glass-surface rounded-2xl p-4">
          <h3 className="text-sm font-semibold text-[var(--glass-text-primary)] mb-3">
            {t('gif.previewGif')}
          </h3>
          {job?.gridImageUrl ? (
            <div className="space-y-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={job.gridImageUrl}
                alt="grid"
                className="w-full rounded-xl border border-[var(--glass-stroke-soft)]"
              />
              {gifBlobUrl ? (
                <div className="space-y-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={gifBlobUrl} alt="gif" className="w-full rounded-xl border border-[var(--glass-stroke-soft)]" />
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleDownloadGif}
                      className="glass-btn-base glass-btn-primary px-4 py-2 flex items-center gap-2"
                    >
                      <AppIcon name="download" className="w-4 h-4" />
                      {t('gif.downloadGif')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-3">
                    <GlassSlider
                      label={t('gif.frameDelay')}
                      value={frameDelay}
                      min={50}
                      max={500}
                      step={10}
                      onChange={setFrameDelay}
                    />
                    <GlassSlider
                      label={t('gif.repeatCount')}
                      value={repeat}
                      min={0}
                      max={10}
                      step={1}
                      onChange={setRepeat}
                    />
                    <GlassSlider
                      label={t('gif.framePadding')}
                      value={framePadding}
                      min={0}
                      max={20}
                      step={1}
                      onChange={setFramePadding}
                    />
                    <p className="text-[10px] text-[var(--glass-text-tertiary)]">{t('gif.repeatInfinite')}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void handleEncodeGif()}
                      disabled={encoding}
                      className="glass-btn-base glass-btn-primary px-4 py-2 flex items-center gap-2 disabled:opacity-50"
                    >
                      {encoding ? <StudioSpinner /> : <AppIcon name="play" className="w-4 h-4" />}
                      {encoding ? t('gif.encodingGif') : t('gif.encodeGif')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void openTuner()}
                      className="glass-btn-base glass-btn-secondary px-4 py-2"
                    >
                      {t('gif.modeTune')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : job?.status === 'generating_grid' || generating ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-[var(--glass-text-secondary)]">
              <StudioSpinner />
              {t('gif.generatingGrid')}
            </div>
          ) : (
            <p className="text-sm text-[var(--glass-text-tertiary)] py-12 text-center">
              {t('gif.gridNotReady')}
            </p>
          )}
        </div>
      </div>

      {/* 微调帧序弹窗 */}
      {tuneOpen && (
        <StudioModal
          title={t('gif.modeTune')}
          onClose={() => setTuneOpen(false)}
          width="w-full max-w-3xl"
        >
          <p className="text-sm text-[var(--glass-text-secondary)] mb-4">
            调整帧顺序后点击「编码 GIF」生成。当前 {tunedCells.length} 帧。
          </p>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {tunedCells.map((cell, index) => (
              <div key={index} className="relative aspect-square group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cell} alt={`frame-${index}`} className="w-full h-full object-cover rounded-lg border border-[var(--glass-stroke-soft)]" />
                <span className="absolute top-1 left-1 text-[10px] bg-black/60 text-white px-1 rounded">
                  {index + 1}
                </span>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setTunedCells(cells.slice())}
              className="glass-btn-base glass-btn-secondary px-4 py-2"
            >
              {tc('clear')}
            </button>
            <button
              type="button"
              onClick={() => void encodeTunedGif()}
              disabled={encoding}
              className="glass-btn-base glass-btn-primary px-4 py-2 flex items-center gap-2 disabled:opacity-50"
            >
              {encoding && <StudioSpinner />}
              {encoding ? t('gif.encodingGif') : t('gif.encodeGif')}
            </button>
          </div>
        </StudioModal>
      )}
    </div>
  )

  async function encodeTunedGif() {
    if (encoding || tunedCells.length === 0) return
    setEncoding(true)
    setError(null)
    try {
      const { encodeFramesToBlob } = await import('./gif-encoder')
      const frames = await Promise.all(
        tunedCells.map(async (cell) => {
          const img = new Image()
          img.src = cell
          await img.decode()
          const canvas = document.createElement('canvas')
          canvas.width = 240
          canvas.height = 240
          const ctx = canvas.getContext('2d')
          if (!ctx) throw new Error('canvas context')
          ctx.drawImage(img, 0, 0, 240, 240)
          return ctx.getImageData(0, 0, 240, 240)
        }),
      )
      const blob = await encodeFramesToBlob(frames, { frameDelayMs: frameDelay, repeat })
      const url = URL.createObjectURL(blob)
      setGifBlobUrl(url)
      setTuneOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setEncoding(false)
    }
  }
}
