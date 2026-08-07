/**
 * image-studio 前端 API 客户端
 *
 * 统一封装对 /api/image-studio/* 的调用。
 */

import type {
  StudioGenerateRequest,
  StudioReversePromptMode,
} from './types'

export interface StudioGenerateResult {
  success: boolean
  images: string[]
  warning?: string
}

/** 从 data URL 提取裸 base64 */
export function stripDataUrlPrefix(dataUrl: string): string {
  const idx = dataUrl.indexOf(';base64,')
  return idx === -1 ? dataUrl : dataUrl.slice(idx + 8)
}

/**
 * 生图/图生图。返回 /m/{publicId} URL 列表。
 */
export async function studioGenerate(input: StudioGenerateRequest): Promise<StudioGenerateResult> {
  const response = await fetch('/api/image-studio/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    const detail = await readApiError(response)
    throw new Error(detail)
  }

  const data = (await response.json()) as StudioGenerateResponse
  if (!data.success) {
    throw new Error((data as { message?: string }).message || '图像生成失败')
  }
  return { success: true, images: data.images || [], warning: data.warning }
}

interface StudioGenerateResponse {
  success: boolean
  images?: string[]
  warning?: string
  message?: string
}

/** 反推提示词流式回调 */
export interface StudioStreamCallbacks {
  onDelta?: (delta: string) => void
  onDone?: (text: string) => void
  onError?: (error: Error) => void
}

export interface StudioStreamHandle {
  abort: () => void
  promise: Promise<void>
}

function readSseStream(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onEvent: (event: { event: string; data: string }) => void,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const processLines = (text: string) => {
    const lines = text.split('\n')
    let event = ''
    let data: string[] = []
    for (const line of lines) {
      if (line === '') {
        if (data.length > 0) {
          onEvent({ event, data: data.join('\n') })
        }
        event = ''
        data = []
        continue
      }
      if (line.startsWith('event:')) {
        event = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        data.push(line.slice(5).trimStart())
      }
    }
    return data.length > 0 ? `${event}\ndata:${data.join('\n')}\n\n` : ''
  }

  return new Promise((resolve) => {
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const remainder = processLines(buffer)
        buffer = remainder
      }
      const rest = processLines(buffer + '\n')
      if (rest) {
        // 处理尾部未闭合事件
        buffer += rest
      }
      resolve()
    }
    pump().catch(() => resolve())
  })
}

/**
 * 流式反推提示词。
 */
export function streamStudioReversePrompt(input: {
  modelKey: string
  imageDataUrl: string
  mode: StudioReversePromptMode
  callbacks: StudioStreamCallbacks
}): StudioStreamHandle {
  const controller = new AbortController()

  const promise = (async () => {
    try {
      const response = await fetch('/api/image-studio/reverse-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelKey: input.modelKey,
          imageDataUrl: input.imageDataUrl,
          mode: input.mode,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(await readApiError(response))
      }
      if (!response.body) {
        throw new Error('响应没有可读流')
      }

      let accumulated = ''
      let fired = false
      const fireDone = () => {
        if (fired) return
        fired = true
        input.callbacks.onDone?.(accumulated)
      }

      await readSseStream(response.body, controller.signal, (event) => {
        if (event.event === 'delta' && event.data) {
          try {
            const payload = JSON.parse(event.data) as { delta?: string }
            if (payload.delta) {
              accumulated += payload.delta
              input.callbacks.onDelta?.(payload.delta)
            }
          } catch {
            // ignore malformed chunk
          }
        } else if (event.event === 'done' && event.data) {
          try {
            const payload = JSON.parse(event.data) as { text?: string }
            accumulated = payload.text || accumulated
          } catch {
            // ignore
          }
          fireDone()
        } else if (event.event === 'error' && event.data) {
          try {
            const payload = JSON.parse(event.data) as { message?: string }
            throw new Error(payload.message || '反推提示词失败')
          } catch (err) {
            if (controller.signal.aborted) return
            input.callbacks.onError?.(err instanceof Error ? err : new Error(String(err)))
          }
        }
      })

      fireDone()
    } catch (err) {
      if (controller.signal.aborted) return
      input.callbacks.onError?.(err instanceof Error ? err : new Error(String(err)))
    }
  })()

  return { abort: () => controller.abort(), promise }
}

export type StudioPromptOptimizeMode = 'text-to-image' | 'image-to-image' | 'gif'

/**
 * 流式提示词优化。
 */
export function streamStudioPromptOptimize(input: {
  modelKey: string
  prompt: string
  mode: StudioPromptOptimizeMode
  callbacks: StudioStreamCallbacks
}): StudioStreamHandle {
  const controller = new AbortController()

  const promise = (async () => {
    try {
      const response = await fetch('/api/image-studio/prompt-optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelKey: input.modelKey,
          prompt: input.prompt,
          mode: input.mode,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(await readApiError(response))
      }
      if (!response.body) {
        throw new Error('响应没有可读流')
      }

      let accumulated = ''
      let fired = false
      const fireDone = () => {
        if (fired) return
        fired = true
        input.callbacks.onDone?.(accumulated)
      }

      await readSseStream(response.body, controller.signal, (event) => {
        if (event.event === 'delta' && event.data) {
          try {
            const payload = JSON.parse(event.data) as { delta?: string }
            if (payload.delta) {
              accumulated += payload.delta
              input.callbacks.onDelta?.(payload.delta)
            }
          } catch {
            // ignore
          }
        } else if (event.event === 'done' && event.data) {
          try {
            const payload = JSON.parse(event.data) as { text?: string }
            accumulated = payload.text || accumulated
          } catch {
            // ignore
          }
          fireDone()
        } else if (event.event === 'error' && event.data) {
          try {
            const payload = JSON.parse(event.data) as { message?: string }
            throw new Error(payload.message || '提示词优化失败')
          } catch (err) {
            if (controller.signal.aborted) return
            input.callbacks.onError?.(err instanceof Error ? err : new Error(String(err)))
          }
        }
      })

      fireDone()
    } catch (err) {
      if (controller.signal.aborted) return
      input.callbacks.onError?.(err instanceof Error ? err : new Error(String(err)))
    }
  })()

  return { abort: () => controller.abort(), promise }
}

/**
 * 无限画布文字节点：流式 AI 生成文本。
 */
export function streamStudioAiText(input: {
  modelKey: string
  prompt: string
  existingContent?: string
  callbacks: StudioStreamCallbacks
}): StudioStreamHandle {
  const controller = new AbortController()

  const promise = (async () => {
    try {
      const response = await fetch('/api/image-studio/ai-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelKey: input.modelKey,
          prompt: input.prompt,
          ...(input.existingContent ? { existingContent: input.existingContent } : {}),
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(await readApiError(response))
      }
      if (!response.body) {
        throw new Error('响应没有可读流')
      }

      let accumulated = ''
      let fired = false
      const fireDone = () => {
        if (fired) return
        fired = true
        input.callbacks.onDone?.(accumulated)
      }

      await readSseStream(response.body, controller.signal, (event) => {
        if (event.event === 'delta' && event.data) {
          try {
            const payload = JSON.parse(event.data) as { delta?: string }
            if (payload.delta) {
              accumulated += payload.delta
              input.callbacks.onDelta?.(payload.delta)
            }
          } catch {
            // ignore
          }
        } else if (event.event === 'done' && event.data) {
          try {
            const payload = JSON.parse(event.data) as { text?: string }
            accumulated = payload.text || accumulated
          } catch {
            // ignore
          }
          fireDone()
        } else if (event.event === 'error' && event.data) {
          try {
            const payload = JSON.parse(event.data) as { message?: string }
            throw new Error(payload.message || 'AI 生成失败')
          } catch (err) {
            if (controller.signal.aborted) return
            input.callbacks.onError?.(err instanceof Error ? err : new Error(String(err)))
          }
        }
      })

      fireDone()
    } catch (err) {
      if (controller.signal.aborted) return
      input.callbacks.onError?.(err instanceof Error ? err : new Error(String(err)))
    }
  })()

  return { abort: () => controller.abort(), promise }
}

async function readApiError(response: Response): Promise<string> {
  let detail = ''
  try {
    detail = await response.text()
  } catch {
    // ignore
  }
  if (detail) {
    try {
      const parsed = JSON.parse(detail) as { error?: { message?: string }; message?: string }
      return parsed.error?.message || parsed.message || `${response.status} ${response.statusText}`
    } catch {
      // not JSON
    }
  }
  return `${response.status} ${response.statusText}${detail ? `: ${detail.slice(0, 300)}` : ''}`
}
