import { beforeEach, describe, expect, it, vi } from 'vitest'

const getProviderConfigMock = vi.hoisted(() =>
  vi.fn(async () => ({
    id: 'bailian',
    apiKey: 'bl-key',
  })),
)

vi.mock('@/lib/api-config', () => ({
  getProviderConfig: getProviderConfigMock,
}))

import { generateBailianVideo } from '@/lib/providers/bailian/video'

describe('bailian video provider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('submits i2v task and returns async externalId', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        request_id: 'req-1',
        output: {
          task_id: 'task-123',
          task_status: 'PENDING',
        },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await generateBailianVideo({
      userId: 'user-1',
      imageUrl: 'https://example.com/frame.png',
      prompt: '让人物向前走',
      options: {
        provider: 'bailian',
        modelId: 'wan2.6-i2v-flash',
        modelKey: 'bailian::wan2.6-i2v-flash',
        duration: 5,
        resolution: '720P',
        promptExtend: true,
      },
    })

    expect(getProviderConfigMock).toHaveBeenCalledWith('user-1', 'bailian')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const firstCall = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit] | undefined
    expect(firstCall).toBeDefined()
    if (!firstCall) {
      throw new Error('missing fetch call')
    }
    const requestUrl = firstCall[0]
    const requestInit = firstCall[1]
    expect(requestUrl).toBe('https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis')
    expect(requestInit.method).toBe('POST')
    expect(requestInit.headers).toEqual({
      Authorization: 'Bearer bl-key',
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
    })
    expect(requestInit.body).toBe(JSON.stringify({
      model: 'wan2.6-i2v-flash',
      input: {
        img_url: 'https://example.com/frame.png',
        prompt: '让人物向前走',
      },
      parameters: {
        resolution: '720P',
        prompt_extend: true,
        duration: 5,
      },
    }))
    expect(result).toEqual({
      success: true,
      async: true,
      requestId: 'task-123',
      externalId: 'BAILIAN:VIDEO:task-123',
    })
  })

  it('submits wan2.7 i2v task without last frame', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        output: {
          task_id: 'task-wan27-i2v',
          task_status: 'PENDING',
        },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await generateBailianVideo({
      userId: 'user-1',
      imageUrl: 'https://example.com/frame.png',
      prompt: '让人物转身看向镜头',
      options: {
        provider: 'bailian',
        modelId: 'wan2.7-i2v',
        modelKey: 'bailian::wan2.7-i2v',
      },
    })

    const firstCall = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit] | undefined
    expect(firstCall).toBeDefined()
    if (!firstCall) {
      throw new Error('missing fetch call')
    }
    expect(firstCall[0]).toBe('https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis')
    expect(firstCall[1].body).toBe(JSON.stringify({
      model: 'wan2.7-i2v',
      input: {
        // wan2.7 系实测必须用 media 数组（img_url 会 Field required: input.media）
        media: [{ type: 'first_frame', url: 'https://example.com/frame.png' }],
        prompt: '让人物转身看向镜头',
      },
    }))
    expect(result).toEqual({
      success: true,
      async: true,
      requestId: 'task-wan27-i2v',
      externalId: 'BAILIAN:VIDEO:task-wan27-i2v',
    })
  })

  it('submits kf2v task with first and last frame', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        output: {
          task_id: 'task-kf2v-1',
          task_status: 'PENDING',
        },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await generateBailianVideo({
      userId: 'user-1',
      imageUrl: 'https://example.com/first.png',
      prompt: '让人物从左走到右',
      options: {
        provider: 'bailian',
        modelId: 'wan2.2-kf2v-flash',
        modelKey: 'bailian::wan2.2-kf2v-flash',
        lastFrameImageUrl: 'https://example.com/last.png',
        duration: 5,
      },
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const firstCall = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit] | undefined
    expect(firstCall).toBeDefined()
    if (!firstCall) {
      throw new Error('missing fetch call')
    }
    const requestUrl = firstCall[0]
    const requestInit = firstCall[1]
    expect(requestUrl).toBe('https://dashscope.aliyuncs.com/api/v1/services/aigc/image2video/video-synthesis')
    expect(requestInit.body).toBe(JSON.stringify({
      model: 'wan2.2-kf2v-flash',
      input: {
        first_frame_url: 'https://example.com/first.png',
        last_frame_url: 'https://example.com/last.png',
        prompt: '让人物从左走到右',
      },
      parameters: {
        duration: 5,
      },
    }))
    expect(result).toEqual({
      success: true,
      async: true,
      requestId: 'task-kf2v-1',
      externalId: 'BAILIAN:VIDEO:task-kf2v-1',
    })
  })

  it('submits wan2.7 i2v task with first and last frame', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        output: {
          task_id: 'task-wan27-flf',
          task_status: 'PENDING',
        },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await generateBailianVideo({
      userId: 'user-1',
      imageUrl: 'https://example.com/first.png',
      prompt: '从清晨过渡到夜晚',
      options: {
        provider: 'bailian',
        modelId: 'wan2.7-i2v',
        modelKey: 'bailian::wan2.7-i2v',
        lastFrameImageUrl: 'https://example.com/last.png',
      },
    })

    const firstCall = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit] | undefined
    expect(firstCall).toBeDefined()
    if (!firstCall) {
      throw new Error('missing fetch call')
    }
    // wan2.7 系首尾帧在主端点用 media 数组表达（kf2v 端点对它返回 url error，实测）
    expect(firstCall[0]).toBe('https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis')
    expect(firstCall[1].body).toBe(JSON.stringify({
      model: 'wan2.7-i2v',
      input: {
        media: [
          { type: 'first_frame', url: 'https://example.com/first.png' },
          { type: 'last_frame', url: 'https://example.com/last.png' },
        ],
        prompt: '从清晨过渡到夜晚',
      },
    }))
    expect(result).toEqual({
      success: true,
      async: true,
      requestId: 'task-wan27-flf',
      externalId: 'BAILIAN:VIDEO:task-wan27-flf',
    })
  })

  it('fails fast when kf2v model misses last frame', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    await expect(
      generateBailianVideo({
        userId: 'user-1',
        imageUrl: 'https://example.com/first.png',
        prompt: 'test',
        options: {
          provider: 'bailian',
          modelId: 'wanx2.1-kf2v-plus',
          modelKey: 'bailian::wanx2.1-kf2v-plus',
        },
      }),
    ).rejects.toThrow(/BAILIAN_VIDEO_LAST_FRAME_IMAGE_URL_REQUIRED/)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails fast when options contain unsupported field', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    await expect(
      generateBailianVideo({
        userId: 'user-1',
        imageUrl: 'https://example.com/frame.png',
        prompt: 'test',
        options: {
          provider: 'bailian',
          modelId: 'wan2.6-i2v',
          modelKey: 'bailian::wan2.6-i2v',
          fps: 24,
        },
      }),
    ).rejects.toThrow(/BAILIAN_VIDEO_OPTION_UNSUPPORTED: fps/)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('接受 aspectRatio 但不将其下发到请求（回归：曾抛 BAILIAN_VIDEO_OPTION_UNSUPPORTED）', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        request_id: 'req-ar',
        output: { task_id: 'task-ar', task_status: 'PENDING' },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await generateBailianVideo({
      userId: 'user-1',
      imageUrl: 'https://example.com/frame.png',
      prompt: '镜头缓慢推进',
      options: {
        provider: 'bailian',
        modelId: 'wan2.6-i2v-flash',
        modelKey: 'bailian::wan2.6-i2v-flash',
        aspectRatio: '9:16',
        resolution: '720P',
        duration: 5,
      },
    })

    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const requestInit = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
    const body = JSON.parse(String(requestInit.body)) as Record<string, unknown>
    // aspectRatio 不得出现在请求体中（百炼会静默忽略，下发会造成比例受控的错觉）
    expect(JSON.stringify(body)).not.toContain('9:16')
    expect(body.parameters).toEqual({ resolution: '720P', duration: 5 })
  })

  it('wan2.7 系必须用 media 数组承载输入图（回归：用 img_url 会 Field required: input.media）', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ output: { task_id: 'task-media', task_status: 'PENDING' } }),
    }))
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    await generateBailianVideo({
      userId: 'user-1',
      imageUrl: 'https://example.com/frame.png',
      prompt: '镜头缓慢推进',
      options: {
        provider: 'bailian',
        modelId: 'wan2.7-i2v',
        modelKey: 'bailian::wan2.7-i2v',
        resolution: '720P',
        duration: 5,
      },
    })

    const requestInit = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
    const body = JSON.parse(String(requestInit.body)) as { input: Record<string, unknown> }
    expect(body.input.media).toEqual([
      { type: 'first_frame', url: 'https://example.com/frame.png' },
    ])
    // 不得出现老字段
    expect(body.input.img_url).toBeUndefined()
  })

  it('wan2.7 系首尾帧用 media 的 last_frame 语义项', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ output: { task_id: 'task-media2', task_status: 'PENDING' } }),
    }))
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    await generateBailianVideo({
      userId: 'user-1',
      imageUrl: 'https://example.com/first.png',
      prompt: '运镜',
      options: {
        provider: 'bailian',
        modelId: 'wan2.7-i2v',
        modelKey: 'bailian::wan2.7-i2v',
        lastFrameImageUrl: 'https://example.com/last.png',
      },
    })

    const requestInit = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
    const body = JSON.parse(String(requestInit.body)) as { input: Record<string, unknown> }
    expect(body.input.media).toEqual([
      { type: 'first_frame', url: 'https://example.com/first.png' },
      { type: 'last_frame', url: 'https://example.com/last.png' },
    ])
  })

  it('老模型仍用 img_url 字符串字段', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ output: { task_id: 'task-legacy', task_status: 'PENDING' } }),
    }))
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    await generateBailianVideo({
      userId: 'user-1',
      imageUrl: 'https://example.com/frame.png',
      options: {
        provider: 'bailian',
        modelId: 'wan2.6-i2v-flash',
        modelKey: 'bailian::wan2.6-i2v-flash',
      },
    })

    const requestInit = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
    const body = JSON.parse(String(requestInit.body)) as { input: Record<string, unknown> }
    expect(body.input.img_url).toBe('https://example.com/frame.png')
    expect(body.input.media).toBeUndefined()
  })
})
