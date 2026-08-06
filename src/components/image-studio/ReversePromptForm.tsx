/**
 * 反推提示词（Reverse Prompt）
 *
 * 移植自 nova-image-studio，通过 waoowaoo 统一 LLM 网关流式反推。
 */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import { AppIcon } from '@/components/ui/icons'
import { useStudioModels } from '@/lib/image-studio/models'
import { streamStudioReversePrompt } from '@/lib/image-studio/client'
import type { StudioReversePromptMode } from '@/lib/image-studio/types'
import { prepareImageFile, extractImageFiles, copyText, type PreparedImage } from './image-utils'
import { GlassSelect, Segmented, StudioSpinner, cx } from './ui'
import { useRouter } from '@/i18n/navigation'

interface ResultEntry {
  id: string
  mode: StudioReversePromptMode
  model: string
  text: string
  createdAt: string
}

const RESULT_KEY = 'waoowaoo-image-studio-reverse-results'

function loadResults(): ResultEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(RESULT_KEY)
    return raw ? (JSON.parse(raw) as ResultEntry[]) : []
  } catch {
    return []
  }
}

function saveResults(results: ResultEntry[]) {
  try {
    localStorage.setItem(RESULT_KEY, JSON.stringify(results.slice(0, 20)))
  } catch {
    // ignore
  }
}

export default function ReversePromptForm() {
  const t = useTranslations('imageStudio')
  const tc = useTranslations('imageStudio.common')
  const { data: session } = useSession()
  const router = useRouter()

  const { llmModels } = useStudioModels()

  const [pendingFile, setPendingFile] = useState<PreparedImage | null>(null)
  const [selectedModel, setSelectedModel] = useState('')
  const [mode, setMode] = useState<StudioReversePromptMode>('style-extract')
  const [resultText, setResultText] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [previousResults, setPreviousResults] = useState<ResultEntry[]>([])

  const abortRef = useRef<(() => void) | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (selectedModel || llmModels.length === 0) return
    setSelectedModel(llmModels[0].value)
  }, [llmModels, selectedModel])

  useEffect(() => {
    setPreviousResults(loadResults())
  }, [])

  const handleFile = useCallback(async (file: File) => {
    setError(null)
    try {
      const prepared = await prepareImageFile(file)
      setPendingFile(prepared)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const files = extractImageFiles(e.dataTransfer.items)
    if (files.length > 0) void handleFile(files[0])
  }

  const handleExtract = async () => {
    if (!pendingFile || extracting) return
    if (!selectedModel) {
      setError(tc('noModels'))
      return
    }
    if (!session?.user) {
      router.push({ pathname: '/auth/signin' })
      return
    }

    setExtracting(true)
    setError(null)
    setResultText('')

    const handle = streamStudioReversePrompt({
      modelKey: selectedModel,
      imageDataUrl: pendingFile.dataUrl,
      mode,
      callbacks: {
        onDelta: (delta) => setResultText((prev) => prev + delta),
        onDone: (text) => {
          if (text.trim()) {
            const entry: ResultEntry = {
              id: `rev_${Date.now().toString(36)}`,
              mode,
              model: selectedModel,
              text: text.trim(),
              createdAt: new Date().toISOString(),
            }
            setPreviousResults((prev) => {
              const next = [entry, ...prev].slice(0, 20)
              saveResults(next)
              return next
            })
          }
          setExtracting(false)
        },
        onError: (err) => {
          setError(err.message)
          setExtracting(false)
        },
      },
    })
    abortRef.current = handle.abort
  }

  useEffect(() => {
    return () => abortRef.current?.()
  }, [])

  const handleCopy = async () => {
    const ok = await copyText(resultText)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_420px] gap-6">
      {/* 左侧：上传 + 参数 */}
      <div className="space-y-4">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className={cx(
            'rounded-2xl border-2 border-dashed border-[var(--glass-stroke-soft)] p-8 text-center transition-colors',
            'hover:border-[var(--glass-tone-info-fg)]/50 bg-[var(--glass-bg-muted)]/30',
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) void handleFile(e.target.files[0])
              e.target.value = ''
            }}
          />
          {pendingFile ? (
            <div className="flex flex-col items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pendingFile.dataUrl}
                alt={pendingFile.name}
                className="max-h-72 rounded-xl border border-[var(--glass-stroke-soft)] object-contain"
              />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="glass-btn-base glass-btn-secondary px-3 py-1.5 text-xs"
                >
                  {tc('uploadImage')}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingFile(null)}
                  className="glass-btn-base glass-btn-ghost px-3 py-1.5 text-xs"
                >
                  {tc('remove')}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-sm text-[var(--glass-text-secondary)]"
            >
              <AppIcon name="upload" className="w-10 h-10 mx-auto mb-2 text-[var(--glass-text-tertiary)]" />
              {t('reversePrompt.uploadHint')}
            </button>
          )}
        </div>

        <div className="glass-surface p-4 rounded-2xl space-y-4">
          <div>
            <label className="glass-field-label block mb-1.5">{t('reversePrompt.mode')}</label>
            <Segmented
              value={mode}
              options={[
                { value: 'style-extract', label: t('reversePrompt.modeStyleExtract') },
                { value: 'replicate', label: t('reversePrompt.modeReplicate') },
              ]}
              onChange={(value) => setMode(value)}
            />
            <p className="glass-field-hint mt-1.5">
              {mode === 'style-extract' ? t('reversePrompt.modeStyleExtractDesc') : t('reversePrompt.modeReplicateDesc')}
            </p>
          </div>
          <div>
            <label className="glass-field-label block mb-1.5">{tc('model')}</label>
            <GlassSelect
              value={selectedModel}
              options={llmModels.map((model) => ({ value: model.value, label: model.label }))}
              onChange={setSelectedModel}
              disabled={llmModels.length === 0}
            />
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={() => void handleExtract()}
          disabled={!pendingFile || extracting || llmModels.length === 0}
          className="glass-btn-base glass-btn-primary px-6 py-2.5 flex items-center gap-2 disabled:opacity-50"
        >
          {extracting ? <StudioSpinner /> : <AppIcon name="sparkles" className="w-4 h-4" />}
          {extracting ? t('reversePrompt.extracting') : t('reversePrompt.extractNow')}
        </button>
      </div>

      {/* 右侧：结果 */}
      <div className="space-y-4">
        <div className="glass-surface rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-[var(--glass-text-primary)]">
              {t('reversePrompt.currentResult')}
            </h3>
            {resultText && (
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="glass-btn-base glass-btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5"
              >
                <AppIcon name="copy" className="w-3.5 h-3.5" />
                {copied ? tc('copied') : t('reversePrompt.copyPrompt')}
              </button>
            )}
          </div>
          {resultText ? (
            <div className="max-h-[420px] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-[var(--glass-text-secondary)]">
              {resultText}
            </div>
          ) : (
            <p className="text-sm text-[var(--glass-text-tertiary)] py-8 text-center">
              {t('reversePrompt.resultHint')}
            </p>
          )}
        </div>

        {previousResults.length > 0 && (
          <div className="glass-surface rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-[var(--glass-text-primary)] mb-3">
              {t('reversePrompt.previousResult')}
            </h3>
            <div className="space-y-3">
              {previousResults.map((entry) => (
                <div key={entry.id} className="border border-[var(--glass-stroke-soft)] rounded-xl p-3">
                  <p className="text-xs whitespace-pre-wrap line-clamp-4 text-[var(--glass-text-secondary)] mb-2">
                    {entry.text}
                  </p>
                  <p className="text-[10px] text-[var(--glass-text-tertiary)]">
                    {entry.mode} · {new Date(entry.createdAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
