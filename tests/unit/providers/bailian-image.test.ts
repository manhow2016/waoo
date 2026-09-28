import { beforeEach, describe, expect, it, vi } from 'vitest'

const getProviderConfigMock = vi.hoisted(() =>
  vi.fn(async () => ({
    id: 'bailian',
    apiKey: 'bl-key',
  })),
)

// 参考图规范化会真实拉取图片并做 base64 转换，单测中桩掉
const normalizeToBase64ForGenerationMock = vi.hoisted(() =>
  vi.fn(async (input: string) => `data:image/png;base64,${Buffer.from(input).toString('base64')}`),
)

vi.mock('@/lib/api-config', () => ({
  getProviderConfig: getProviderConfigMock,
}))

vi.mock('@/lib/media/outbound-image', () => ({
  normalizeToBase64ForGeneration: normalizeToBase64ForGenerationMock,
}))

import { generateBailianImage } from '@/lib/providers/bailian/image'

const MULTIMODAL_ENDPOINT =
  'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'

function stubFetch(payload: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn(async () => ({
    ok,
    status,
    text: async () => JSON.stringify(payload),
  }))
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)
  return fetchMock
}

function syncPayload(imageUrls: string[], requestId = 'req-1') {
  return {
    request_id: requestId,
    output: {
      choices: [
        {
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: imageUrls.map((image) => ({ image })),
          },
        },
      ],
    },
  }
}

function readRequest(fetchMock: ReturnType<typeof vi.fn>, index = 0) {
  const call = fetchMock.mock.calls[index] as unknown as [string, RequestInit] | undefined
  if (!call) throw new Error('missing fetch call')
  return { url: call[0], init: call[1], body: JSON.parse(String(call[1].body)) as Record<string, unknown> }
}

describe('bailian image provider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('纯文本走同步 multimodal 接口生成图片（回归：新系模型不支持旧异步文生图接口）', async () => {
    const fetchMock = stubFetch(syncPayload(['https://dashscope-result.oss.aliyuncs.com/cat.png']))

    const result = await generateBailianImage({
      userId: 'user-1',
      prompt: '一只戴帽子的猫',
      options: {
        provider: 'bailian',
        modelId: 'wan2.7-image-pro',
        modelKey: 'bailian::wan2.7-image-pro',
        aspectRatio: '16:9',
      },
    })

    expect(result).toEqual({
      success: true,
      imageUrl: 'https://dashscope-result.oss.aliyuncs.com/cat.png',
      imageUrls: ['https://dashscope-result.oss.aliyuncs.com/cat.png'],
      requestId: 'req-1',
    })

    const request = readRequest(fetchMock)
    // 必须打新系同步接口，不能是旧的 text2image/image-synthesis
    expect(request.url).toBe(MULTIMODAL_ENDPOINT)
    expect(request.url).not.toContain('text2image')
    // 回归：带了 X-DashScope-Async 会被判为异步调用而 403
    expect(request.init.headers).toEqual({
      Authorization: 'Bearer bl-key',
      'Content-Type': 'application/json',
    })
    expect(request.body).toEqual({
      model: 'wan2.7-image-pro',
      input: {
        messages: [{ role: 'user', content: [{ text: '一只戴帽子的猫' }] }],
      },
      parameters: { size: '1280*720', n: 1 },
    })
  })

  it('显式 size 会被归一化为 DashScope 的「宽*高」格式', async () => {
    const fetchMock = stubFetch(syncPayload(['https://x/1.png']))

    await generateBailianImage({
      userId: 'user-1',
      prompt: '风景',
      options: {
        provider: 'bailian',
        modelId: 'qwen-image-2.0-pro',
        modelKey: 'bailian::qwen-image-2.0-pro',
        size: '1024x1536',
      },
    })

    expect(readRequest(fetchMock).body).toEqual({
      model: 'qwen-image-2.0-pro',
      input: { messages: [{ role: 'user', content: [{ text: '风景' }] }] },
      parameters: { size: '1024*1536', n: 1 },
    })
  })

  it('非法 size 直接报错，不发起请求', async () => {
    const fetchMock = stubFetch(syncPayload([]))

    await expect(generateBailianImage({
      userId: 'user-1',
      prompt: '风景',
      options: {
        provider: 'bailian',
        modelId: 'qwen-image-2.0',
        modelKey: 'bailian::qwen-image-2.0',
        size: 'huge',
      },
    })).rejects.toThrow('BAILIAN_IMAGE_SIZE_INVALID: huge')

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('有参考图时走图像编辑：图在前、文本在后，并内联参考图', async () => {
    const fetchMock = stubFetch(syncPayload(['https://dashscope-result.oss.aliyuncs.com/edited.png'], 'req-2'))

    const result = await generateBailianImage({
      userId: 'user-1',
      prompt: '把背景换成夜晚',
      referenceImages: ['https://example.com/source.png', 'data:image/png;base64,QUJD'],
      options: {
        provider: 'bailian',
        modelId: 'qwen-image-2.0-pro',
        modelKey: 'bailian::qwen-image-2.0-pro',
        aspectRatio: '3:2',
      },
    })

    expect(result.imageUrls).toEqual(['https://dashscope-result.oss.aliyuncs.com/edited.png'])

    // 参考图必须被内联（百炼服务端无法访问本机 MinIO 地址）
    expect(normalizeToBase64ForGenerationMock).toHaveBeenCalledTimes(1)
    expect(normalizeToBase64ForGenerationMock).toHaveBeenCalledWith('https://example.com/source.png')

    expect(readRequest(fetchMock).body).toEqual({
      model: 'qwen-image-2.0-pro',
      input: {
        messages: [
          {
            role: 'user',
            content: [
              { image: expect.stringMatching(/^data:image\/png;base64,/) },
              { image: 'data:image/png;base64,QUJD' },
              { text: '把背景换成夜晚' },
            ],
          },
        ],
      },
      parameters: { size: '1152*768', n: 1 },
    })
  })

  it('参考图超过 3 张时报错', async () => {
    const fetchMock = stubFetch(syncPayload([]))

    await expect(generateBailianImage({
      userId: 'user-1',
      prompt: '融合',
      referenceImages: [
        'https://example.com/a.png',
        'https://example.com/b.png',
        'https://example.com/c.png',
        'https://example.com/d.png',
      ],
      options: {
        provider: 'bailian',
        modelId: 'qwen-image-2.0',
        modelKey: 'bailian::qwen-image-2.0',
      },
    })).rejects.toThrow('BAILIAN_IMAGE_REFERENCE_TOO_MANY')

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('未在白名单内的图像模型会被拒绝', async () => {
    stubFetch(syncPayload([]))

    await expect(generateBailianImage({
      userId: 'user-1',
      prompt: 'x',
      options: {
        provider: 'bailian',
        modelId: 'not-a-real-image-model',
        modelKey: 'bailian::not-a-real-image-model',
      },
    })).rejects.toThrow('MODEL_NOT_REGISTERED: bailian/image/not-a-real-image-model')
  })

  it('接口返回非 2xx 时抛出带状态码与原始信息的错误', async () => {
    const fetchMock = stubFetch({
      code: 'InvalidParameter',
      message: 'url error, please check url！',
    }, false, 400)

    await expect(generateBailianImage({
      userId: 'user-1',
      prompt: 'x',
      options: {
        provider: 'bailian',
        modelId: 'qwen-image-2.0',
        modelKey: 'bailian::qwen-image-2.0',
      },
    })).rejects.toThrow('BAILIAN_IMAGE_FAILED(400): url error, please check url！')

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('响应中没有图片时抛出结果缺失错误', async () => {
    stubFetch({ request_id: 'req-3', output: { choices: [{ message: { content: [{ text: '抱歉' }] } }] } })

    await expect(generateBailianImage({
      userId: 'user-1',
      prompt: 'x',
      options: {
        provider: 'bailian',
        modelId: 'qwen-image-2.0',
        modelKey: 'bailian::qwen-image-2.0',
      },
    })).rejects.toThrow('BAILIAN_IMAGE_RESULT_MISSING')
  })
})
