/**
 * image-studio AI 文本生成服务
 *
 * 无限画布文字节点：根据用户提示词流式生成文本内容。
 * 通过 waoowaoo 统一 LLM 网关调用。
 */

import { chatCompletionStream } from '@/lib/llm/chat-stream'
import type { ChatCompletionStreamCallbacks } from '@/lib/llm/types'

/** 构建 AI 文本生成的系统提示词（对齐 nova-image-studio） */
export function buildAiTextSystemPrompt(existingContent?: string): string {
  const sections: string[] = []

  sections.push(
    '你是一个AI文本生成助手，正在为无限画布（Infinite Canvas）中的文本节点生成内容。',
    '',
    '【使用场景】',
    '- 无限画布是一个可视化编排工具，用户可以在画布上创建文本节点来记录想法、提示词、说明等',
    '- 文本节点可以独立存在，也可以与其他节点（图片、配置节点等）建立连接关系',
    '- 用户可能想要新建内容，也可能是基于现有内容进行优化、扩展或改写',
    '',
  )

  sections.push(
    '【用户意图识别】',
    '- 请仔细分析用户的输入，识别其核心意图：',
    '  1) 新建内容：用户希望从零开始创建特定类型的文本',
    '  2) 优化改进：用户希望基于现有内容进行润色、优化、精简或扩展',
    '  3) 格式转换：用户希望将内容转换为特定格式（如列表、标题、说明等）',
    '  4) 风格调整：用户希望改变文本的风格或语调',
    '  5) 信息补充：用户希望为现有内容添加更多信息或细节',
    '  6) 摘要概括：用户希望对长文本进行总结或提炼要点',
    '- 根据识别的意图，采用合适的生成策略和输出形式',
  )

  if (existingContent && existingContent.trim()) {
    sections.push(
      '',
      '【节点现有内容】',
      '当前文本节点已包含以下内容，请作为上下文参考：',
      '---',
      existingContent,
      '---',
      '',
      '注意事项：',
      '- 理解现有内容的主题、风格和结构',
      '- 如果用户要求修改或扩展，请保持与现有内容的一致性',
      '- 如果用户要求重新生成，可以基于现有内容提供全新的视角',
    )
  } else {
    sections.push(
      '',
      '【节点现有内容】',
      '当前文本节点为空，请根据用户需求创建全新的内容。',
    )
  }

  sections.push(
    '',
    '【输出要求】',
    '- 直接输出最终文本，不要添加任何解释、前缀或额外说明',
    '- 保持内容简洁、清晰、有逻辑性',
    '- 如果是列表，使用标准的项目符号格式',
    '- 如果包含多段落，段落之间用空行分隔',
    '- 根据内容类型，合理使用标题、加粗等格式（如果支持）',
    '- 输出长度应根据用户需求和内容合理控制，不要冗长也不要过于简略',
  )

  return sections.join('\n')
}

/**
 * 流式生成 AI 文本，回调转发给路由（SSE）。
 */
export async function streamAiText(input: {
  userId: string
  modelKey: string
  prompt: string
  existingContent?: string
  callbacks: ChatCompletionStreamCallbacks
}): Promise<string> {
  const { userId, modelKey, prompt, existingContent, callbacks } = input
  const systemPrompt = buildAiTextSystemPrompt(existingContent)

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
