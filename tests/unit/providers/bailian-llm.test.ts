import { beforeEach, describe, expect, it, vi } from 'vitest'

const createChatCompletionMock = vi.hoisted(() =>
  vi.fn(async () => ({
    id: 'chatcmpl_bailian',
    object: 'chat.completion',
    created: 1,
    model: 'deepseek-v4.1-flash',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: 'ok' },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 1,
      completion_tokens: 1,
      total_tokens: 2,
    },
  })),
)

const openAiCtorMock = vi.hoisted(() =>
  vi.fn(() => ({
    chat: {
      completions: {
        create: createChatCompletionMock,
      },
    },
  })),
)

vi.mock('openai', () => ({
  default: openAiCtorMock,
}))

import { completeBailianLlm } from '@/lib/providers/bailian/llm'

describe('bailian llm provider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.BAILIAN_LLM_TIMEOUT_MS
  })

  it('calls dashscope openai-compatible endpoint for registered model', async () => {
    const completion = await completeBailianLlm({
      modelId: 'deepseek-v4.1-flash',
      messages: [{ role: 'user', content: 'hello' }],
      apiKey: 'bl-key',
      temperature: 0.2,
    })

    expect(openAiCtorMock).toHaveBeenCalledWith({
      apiKey: 'bl-key',
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      timeout: 300_000,
    })
    expect(createChatCompletionMock).toHaveBeenCalledWith({
      model: 'deepseek-v4.1-flash',
      messages: [{ role: 'user', content: 'hello' }],
      temperature: 0.2,
      enable_thinking: true,
    })
    expect(completion.choices[0]?.message?.content).toBe('ok')
  })

  it('默认超时足以覆盖推理模型（回归：30s 会导致片段切分 GENERATION_TIMEOUT）', async () => {
    await completeBailianLlm({
      modelId: 'deepseek-v4.1-flash',
      messages: [{ role: 'user', content: 'hello' }],
      apiKey: 'bl-key',
    })

    const ctorArgs = (openAiCtorMock.mock.calls as unknown as Array<[{ timeout?: number }]>)[0]?.[0]
    expect(ctorArgs?.timeout).toBeGreaterThanOrEqual(120_000)
  })

  it('支持 BAILIAN_LLM_TIMEOUT_MS 覆盖超时', async () => {
    process.env.BAILIAN_LLM_TIMEOUT_MS = '45000'

    await completeBailianLlm({
      modelId: 'deepseek-v4.1-flash',
      messages: [{ role: 'user', content: 'hello' }],
      apiKey: 'bl-key',
    })

    expect(openAiCtorMock).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 45_000 }),
    )
  })

  it('reasoning=false 时下发 enable_thinking=false 以关闭思考', async () => {
    await completeBailianLlm({
      modelId: 'deepseek-v4.1-flash',
      messages: [{ role: 'user', content: 'hello' }],
      apiKey: 'bl-key',
      reasoning: false,
    })

    expect(createChatCompletionMock).toHaveBeenCalledWith(
      expect.objectContaining({ enable_thinking: false }),
    )
    const body = (createChatCompletionMock.mock.calls as unknown as Array<[Record<string, unknown>]>)[0]?.[0]
    expect(body.reasoning_effort).toBeUndefined()
  })

  it('reasoning=true 时透传 reasoning_effort，minimal 映射为 low', async () => {
    await completeBailianLlm({
      modelId: 'deepseek-v4.1-flash',
      messages: [{ role: 'user', content: 'hello' }],
      apiKey: 'bl-key',
      reasoning: true,
      reasoningEffort: 'minimal',
    })

    expect(createChatCompletionMock).toHaveBeenCalledWith(
      expect.objectContaining({ enable_thinking: true, reasoning_effort: 'low' }),
    )
  })

  it('fails fast when model is not in official bailian catalog', async () => {
    await expect(
      completeBailianLlm({
        modelId: 'qwen-plus',
        messages: [{ role: 'user', content: 'hello' }],
        apiKey: 'bl-key',
      }),
    ).rejects.toThrow(/MODEL_NOT_REGISTERED/)

    expect(openAiCtorMock).not.toHaveBeenCalled()
    expect(createChatCompletionMock).not.toHaveBeenCalled()
  })
})
