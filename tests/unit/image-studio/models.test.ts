import { describe, expect, it } from 'vitest'
import {
  getStudioOutputSizeOptions,
  STUDIO_ASPECT_RATIOS,
  findStudioImageModelWithSize,
  type StudioImageModelOption,
} from '@/lib/image-studio/models'

function makeModel(partial: Partial<StudioImageModelOption> & { value: string; label: string }): StudioImageModelOption {
  return {
    resolutionOptions: ['1K', '2K', '4K'],
    ...partial,
  }
}

describe('image-studio model adapter helpers', () => {
  it('returns output size options from capability resolution options', () => {
    const model = makeModel({ value: 'google::gemini-3-pro-image-preview', label: 'Pro' })
    expect(getStudioOutputSizeOptions(model)).toEqual(['1K', '2K', '4K'])
  })

  it('filters out non-1K/2K/4K tiers from capability options', () => {
    const model = makeModel({ value: 'google::gemini-3.1-flash-image-preview', label: 'Flash', resolutionOptions: ['0.5K', '1K', '2K', '4K'] })
    expect(getStudioOutputSizeOptions(model)).toEqual(['1K', '2K', '4K'])
  })

  it('falls back to the fixed 1K/2K/4K set when no options available', () => {
    expect(getStudioOutputSizeOptions(undefined)).toEqual(['1K', '2K', '4K'])
    expect(getStudioOutputSizeOptions(makeModel({ value: 'm', label: 'M', resolutionOptions: [] }))).toEqual(['1K', '2K', '4K'])
  })

  it('exposes a set of aspect ratio options', () => {
    expect(STUDIO_ASPECT_RATIOS.map((option) => option.value)).toContain('1:1')
    expect(STUDIO_ASPECT_RATIOS.map((option) => option.value)).toContain('16:9')
  })

  it('finds a model that supports the requested size', () => {
    const models = [
      makeModel({ value: 'google::gemini-2.5-flash-image', label: 'Flash', resolutionOptions: ['1K'] }),
      makeModel({ value: 'google::gemini-3-pro-image-preview', label: 'Pro', resolutionOptions: ['1K', '2K', '4K'] }),
    ]
    expect(findStudioImageModelWithSize(models, '4K')?.value).toBe('google::gemini-3-pro-image-preview')
    // falls back to first model if none supports
    expect(findStudioImageModelWithSize(models, '8K')?.value).toBe('google::gemini-2.5-flash-image')
  })
})
