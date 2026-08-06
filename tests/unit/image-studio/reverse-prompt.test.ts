import { describe, expect, it } from 'vitest'
import {
  isReversePromptMode,
  getReversePromptTemplate,
  REVERSE_PROMPT_TEMPLATES,
  REVERSE_PROMPT_MODE_OPTIONS,
  DEFAULT_REVERSE_MODE,
} from '@/lib/image-studio/reverse-prompt'
import { isPromptOptimizeMode, buildOptimizeSystemPrompt } from '@/lib/image-studio/prompt-optimize'

describe('image-studio reverse-prompt templates', () => {
  it('has both modes registered', () => {
    expect(REVERSE_PROMPT_MODE_OPTIONS.map((option) => option.value).sort()).toEqual(['replicate', 'style-extract'])
    expect(REVERSE_PROMPT_TEMPLATES['style-extract']).toContain('Image Style Prompt Extractor')
    expect(REVERSE_PROMPT_TEMPLATES.replicate).toContain('图像高保真复刻')
    expect(DEFAULT_REVERSE_MODE).toBe('style-extract')
  })

  it('validates reverse prompt modes', () => {
    expect(isReversePromptMode('style-extract')).toBe(true)
    expect(isReversePromptMode('replicate')).toBe(true)
    expect(isReversePromptMode('invalid')).toBe(false)
  })

  it('falls back to style-extract template for unknown mode', () => {
    expect(getReversePromptTemplate('unknown')).toBe(REVERSE_PROMPT_TEMPLATES['style-extract'])
    expect(getReversePromptTemplate('replicate')).toBe(REVERSE_PROMPT_TEMPLATES.replicate)
  })

  it('style-extract template requires placeholder', () => {
    expect(REVERSE_PROMPT_TEMPLATES['style-extract']).toContain('[在此处替换为您想要生成的主体内容]')
  })
})

describe('image-studio prompt-optimize modes', () => {
  it('validates optimize modes', () => {
    expect(isPromptOptimizeMode('text-to-image')).toBe(true)
    expect(isPromptOptimizeMode('image-to-image')).toBe(true)
    expect(isPromptOptimizeMode('gif')).toBe(true)
    expect(isPromptOptimizeMode('agent')).toBe(false)
  })

  it('builds system prompt per mode', () => {
    expect(buildOptimizeSystemPrompt('gif')).toContain('12 帧')
    expect(buildOptimizeSystemPrompt('image-to-image')).toContain('图生图')
    expect(buildOptimizeSystemPrompt('text-to-image')).toContain('文生图')
    // unknown mode falls back to text-to-image
    expect(buildOptimizeSystemPrompt('unknown')).toContain('文生图')
  })
})
