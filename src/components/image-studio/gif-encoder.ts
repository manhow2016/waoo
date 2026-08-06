/**
 * GIF 编码工具（移植自 nova-image-studio，基于 gifenc）
 *
 * 将 3×4 网格图切帧并编码为浏览器可播放的 GIF。
 */

'use client'

import { GIFEncoder, quantize, applyPalette } from 'gifenc'

export const GIF_GRID_COLS = 4
export const GIF_GRID_ROWS = 3
export const GIF_GRID_FRAMES = GIF_GRID_COLS * GIF_GRID_ROWS

export interface GifEncodeOptions {
  frameDelayMs?: number
  repeat?: number
  framePaddingPercent?: number
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = url
  })
}

function drawImageScaledToCanvas(
  source: HTMLImageElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  targetSize: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = targetSize
  canvas.height = targetSize
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建 canvas 上下文')
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, targetSize, targetSize)
  return canvas
}

/** 计算每帧在网格图中的源矩形（含内缩 padding） */
function computeFrameSources(
  imageWidth: number,
  imageHeight: number,
  paddingPercent: number,
): Array<{ sx: number; sy: number; sw: number; sh: number }> {
  const cellWidth = imageWidth / GIF_GRID_COLS
  const cellHeight = imageHeight / GIF_GRID_ROWS
  const padX = cellWidth * (paddingPercent / 100) / 2
  const padY = cellHeight * (paddingPercent / 100) / 2

  const sources: Array<{ sx: number; sy: number; sw: number; sh: number }> = []
  for (let row = 0; row < GIF_GRID_ROWS; row += 1) {
    for (let col = 0; col < GIF_GRID_COLS; col += 1) {
      const sx = col * cellWidth + padX
      const sy = row * cellHeight + padY
      const sw = Math.max(1, cellWidth - padX * 2)
      const sh = Math.max(1, cellHeight - padY * 2)
      sources.push({ sx, sy, sw, sh })
    }
  }
  return sources
}

function canvasToImageData(canvas: HTMLCanvasElement): ImageData {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建 canvas 上下文')
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

/**
 * 将网格图切帧并编码为 GIF Blob。
 */
export async function encodeGifFromGrid(
  gridImageUrl: string,
  options: GifEncodeOptions = {},
): Promise<Blob> {
  const frameDelayMs = options.frameDelayMs ?? 150
  const repeat = options.repeat ?? 0
  const paddingPercent = options.framePaddingPercent ?? 4
  const frameSize = 320

  const img = await loadImage(gridImageUrl)
  const sources = computeFrameSources(img.naturalWidth, img.naturalHeight, paddingPercent)

  const frames = sources.map((source) => {
    const canvas = drawImageScaledToCanvas(img, source.sx, source.sy, source.sw, source.sh, frameSize)
    return canvasToImageData(canvas)
  })

  return await encodeFramesToBlob(frames, { frameDelayMs, repeat })
}

/**
 * 将等尺寸帧数组编码为 GIF Blob（全局量化保证调色板一致）。
 */
export async function encodeFramesToBlob(
  frames: ImageData[],
  options: GifEncodeOptions = {},
): Promise<Blob> {
  const frameDelayMs = options.frameDelayMs ?? 150
  const repeat = options.repeat ?? 0
  const gif = GIFEncoder()

  // 合并所有帧做一次全局量化
  const merged = new Uint8ClampedArray(frames[0].data.length * frames.length)
  for (let i = 0; i < frames.length; i += 1) {
    merged.set(frames[i].data, i * frames[0].data.length)
  }
  const palette = quantize(merged, 256, { format: 'rgb565' })

  for (let i = 0; i < frames.length; i += 1) {
    const index = applyPalette(frames[i].data, palette, { format: 'rgb565' })
    gif.writeFrame(index, frames[i].width, frames[i].height, {
      palette,
      delay: frameDelayMs,
      repeat,
      dispose: 2,
      transparent: false,
    })
  }

  gif.finish()
  const bytes = gif.bytes()
  return new Blob([bytes as unknown as ArrayBuffer], { type: 'image/gif' })
}

/**
 * 将网格图切成 12 帧 PNG data URL（供微调面板使用）。
 */
export async function extractGridCells(
  gridImageUrl: string,
  targetSize = 240,
  paddingPercent = 4,
): Promise<string[]> {
  const img = await loadImage(gridImageUrl)
  const sources = computeFrameSources(img.naturalWidth, img.naturalHeight, paddingPercent)

  return sources.map((source) => {
    const canvas = drawImageScaledToCanvas(img, source.sx, source.sy, source.sw, source.sh, targetSize)
    return canvas.toDataURL('image/png')
  })
}
