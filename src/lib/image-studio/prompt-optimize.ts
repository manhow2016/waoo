/**
 * image-studio 提示词优化服务
 *
 * 通过 waoowaoo 统一 LLM 网关流式优化提示词。
 */

import { chatCompletionStream } from '@/lib/llm/chat-stream'
import type { ChatCompletionStreamCallbacks } from '@/lib/llm/types'

export type PromptOptimizeMode = 'text-to-image' | 'image-to-image' | 'gif'

const SYSTEM_PROMPTS: Record<PromptOptimizeMode, string> = {
  'text-to-image': `你是一位专业的 AI 绘图提示词优化专家。
你的任务是将用户的简短描述优化为高质量的文生图提示词。
优化规则：
- 保留用户的原始意图和核心描述
- 补充画面主体的细节（外观、材质、姿态等）
- 添加合适的艺术风格描述（如摄影、插画、油画等）
- 补充光影、色调、氛围描述
- 优化构图和视角描述
- 使用简洁精准的中文描述
- 不要添加与画面无关的说明文字
只输出优化后的提示词本身，不要输出任何解释、前缀或额外说明。`,
  'image-to-image': `你是一位专业的图生图提示词优化专家。
你的任务是结合参考图和用户描述，优化为精准的图生图提示词。
优化规则：
- 观察参考图的内容、风格、色调、构图
- 结合用户的修改意图，生成精准的图生图提示词
- 保留用户想要保留的参考图元素
- 明确描述用户想要修改的部分
- 使用简洁精准的中文描述
- 不要添加与画面无关的说明文字
只输出优化后的提示词本身，不要输出任何解释、前缀或额外说明。`,
  gif: `你是一位专业的动图生成提示词优化专家。
你的任务是结合参考图和用户描述，优化为适合生成 3×4 = 12 帧网格动画的提示词。
优化规则：
- 观察参考图（如有）的内容、风格、色调
- 描述必须适合 1:1 正方形帧构图
- 强调动作的连续性和逐帧变化，确保 12 帧之间动作流畅衔接
- 描述一个完整、有节奏的动作过程（如眨眼、点头、转身等）
- 动作幅度适中，适合在 12 帧内完成一个循环
- 如有首尾帧闭合需求，确保第 12 帧自然过渡回第 1 帧
- 使用简洁精准的中文描述
- 不要添加与画面无关的说明文字
只输出优化后的提示词本身，不要输出任何解释、前缀或额外说明。`,
}

export function isPromptOptimizeMode(value: string): value is PromptOptimizeMode {
  return value === 'text-to-image' || value === 'image-to-image' || value === 'gif'
}

export function buildOptimizeSystemPrompt(mode: string): string {
  return isPromptOptimizeMode(mode) ? SYSTEM_PROMPTS[mode] : SYSTEM_PROMPTS['text-to-image']
}

/**
 * 流式优化提示词，回调转发给路由（SSE）。
 */
export async function streamPromptOptimize(input: {
  userId: string
  modelKey: string
  mode: PromptOptimizeMode
  prompt: string
  callbacks: ChatCompletionStreamCallbacks
}): Promise<string> {
  const { userId, modelKey, mode, prompt, callbacks } = input
  const systemPrompt = buildOptimizeSystemPrompt(mode)

  let collected = ''
  const wrappedCallbacks: ChatCompletionStreamCallbacks = {
    ...callbacks,
    onChunk(chunk) {
      if (chunk.kind === 'text') collected += chunk.delta
      callbacks.onChunk?.(chunk)
    },
    onComplete(text) {
      collected = text || collected
      callbacks.onComplete?.(text)
    },
  }

  await chatCompletionStream(
    userId,
    modelKey,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `用户输入：\n${prompt}` },
    ],
    {
      reasoning: false,
      temperature: 0.7,
    },
    wrappedCallbacks,
  )

  return collected
}
