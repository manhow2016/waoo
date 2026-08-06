/**
 * image-studio 前端图片处理工具
 *
 * 提供上传图片压缩、data URL 处理、宽高比检测等通用能力。
 */

'use client'

const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024
const MAX_SIDE = 2560
const MAX_PIXELS = 5_000_000

export interface PreparedImage {
  id: string
  name: string
  preview: string
  dataUrl: string
  mimeType: string
  width: number
  height: number
  originalSize: number
  processedSize: number
}

function generateId(): string {
  return `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = dataUrl
  })
}

function dataUrlToMime(dataUrl: string): string {
  const match = /^data:([^;,]+)/.exec(dataUrl)
  return match?.[1] || 'image/png'
}

/**
 * 压缩图片：超过尺寸/像素/体积限制时缩放并转 webp。
 */
async function optimizeImage(dataUrl: string, originalSize: number): Promise<{ dataUrl: string; mimeType: string }> {
  const img = await loadImage(dataUrl)
  const longSide = Math.max(img.naturalWidth, img.naturalHeight)
  const pixels = img.naturalWidth * img.naturalHeight

  if (originalSize < 1.5 * 1024 * 1024 && longSide <= MAX_SIDE && pixels <= MAX_PIXELS) {
    return { dataUrl, mimeType: dataUrlToMime(dataUrl) }
  }

  const scale = Math.min(1, MAX_SIDE / longSide, Math.sqrt(MAX_PIXELS / pixels))
  const width = Math.max(1, Math.round(img.naturalWidth * scale))
  const height = Math.max(1, Math.round(img.naturalHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return { dataUrl, mimeType: dataUrlToMime(dataUrl) }
  ctx.drawImage(img, 0, 0, width, height)

  const canWebp = canvas.toDataURL('image/webp', 0.9).length < canvas.toDataURL('image/jpeg', 0.86).length
  const compressed = canWebp
    ? canvas.toDataURL('image/webp', 0.9)
    : canvas.toDataURL('image/jpeg', 0.86)

  return { dataUrl: compressed, mimeType: canWebp ? 'image/webp' : 'image/jpeg' }
}

/**
 * 预处理上传图片：读取 → 压缩 → 返回结构化数据。
 */
export async function prepareImageFile(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('仅支持图片文件')
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error('图片不能超过 10MB')
  }

  const rawDataUrl = await fileToDataUrl(file)
  await loadImage(rawDataUrl)
  const { dataUrl, mimeType } = await optimizeImage(rawDataUrl, file.size)
  const compressedImg = await loadImage(dataUrl)

  return {
    id: generateId(),
    name: file.name,
    preview: dataUrl,
    dataUrl,
    mimeType,
    width: compressedImg.naturalWidth,
    height: compressedImg.naturalHeight,
    originalSize: file.size,
    processedSize: Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75),
  }
}

/** 从拖拽/粘贴中提取图片文件 */
export function extractImageFiles(items: DataTransferItemList): File[] {
  const files: File[] = []
  for (const item of Array.from(items)) {
    if (item.kind === 'file') {
      const file = item.getAsFile()
      if (file && file.type.startsWith('image/')) files.push(file)
    }
  }
  return files
}

/** 计算宽高比并匹配最近的预设比例 */
export function detectAspectRatio(width: number, height: number): string {
  if (!width || !height) return '1:1'
  const ratio = width / height
  const options = [
    { v: '1:1', r: 1 },
    { v: '16:9', r: 16 / 9 },
    { v: '9:16', r: 9 / 16 },
    { v: '3:2', r: 1.5 },
    { v: '2:3', r: 2 / 3 },
    { v: '4:3', r: 4 / 3 },
    { v: '3:4', r: 3 / 4 },
    { v: '21:9', r: 21 / 9 },
  ]
  let closest = options[0]
  let minDistance = Number.POSITIVE_INFINITY
  for (const option of options) {
    const distance = Math.abs(option.r - ratio)
    if (distance < minDistance) {
      minDistance = distance
      closest = option
    }
  }
  return closest.v
}

/** data URL → Blob */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl)
  return await response.blob()
}

/** 触发浏览器下载 */
export function triggerDownload(dataUrl: string, filename: string) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

/** 复制文本到剪贴板 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      return true
    } catch {
      return false
    }
  }
}
