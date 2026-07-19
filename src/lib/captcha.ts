/**
 * 图片验证码工具
 * 使用 sharp 生成验证码图片，Redis 存储验证码
 */
import sharp from 'sharp'
import { redis } from '@/lib/redis'
import crypto from 'crypto'

// 验证码配置
const CAPTCHA_WIDTH = 120
const CAPTCHA_HEIGHT = 40
const CAPTCHA_LENGTH = 4
const CAPTCHA_EXPIRE_SECONDS = 300 // 5分钟过期

// 字符集（去除易混淆字符）
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/**
 * 生成随机验证码文本
 */
function generateCaptchaText(): string {
  let text = ''
  for (let i = 0; i < CAPTCHA_LENGTH; i++) {
    text += CHARS[Math.floor(Math.random() * CHARS.length)]
  }
  return text
}

/**
 * 生成随机颜色
 */
function randomColor(min: number = 0, max: number = 200): { r: number; g: number; b: number } {
  return {
    r: Math.floor(Math.random() * (max - min) + min),
    g: Math.floor(Math.random() * (max - min) + min),
    b: Math.floor(Math.random() * (max - min) + min),
  }
}

/**
 * 生成验证码图片
 */
async function generateCaptchaImage(text: string): Promise<Buffer> {
  // 创建背景
  const bgColor = randomColor(220, 255)
  
  // 创建文字 SVG
  const textElements = text.split('').map((char, i) => {
    const color = randomColor(50, 150)
    const x = 15 + i * 25
    const y = 25 + Math.floor(Math.random() * 10 - 5)
    const rotate = Math.floor(Math.random() * 30 - 15)
    const fontSize = 20 + Math.floor(Math.random() * 6)
    
    return `<text 
      x="${x}" 
      y="${y}" 
      font-family="Arial, sans-serif" 
      font-size="${fontSize}" 
      font-weight="bold"
      fill="rgb(${color.r},${color.g},${color.b})"
      transform="rotate(${rotate} ${x} ${y})"
    >${char}</text>`
  }).join('')

  // 添加干扰线
  const lines = Array.from({ length: 3 }, () => {
    const color = randomColor(150, 220)
    const x1 = Math.floor(Math.random() * CAPTCHA_WIDTH)
    const y1 = Math.floor(Math.random() * CAPTCHA_HEIGHT)
    const x2 = Math.floor(Math.random() * CAPTCHA_WIDTH)
    const y2 = Math.floor(Math.random() * CAPTCHA_HEIGHT)
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgb(${color.r},${color.g},${color.b})" stroke-width="1" />`
  }).join('')

  // 添加干扰点
  const dots = Array.from({ length: 20 }, () => {
    const color = randomColor(100, 200)
    const cx = Math.floor(Math.random() * CAPTCHA_WIDTH)
    const cy = Math.floor(Math.random() * CAPTCHA_HEIGHT)
    return `<circle cx="${cx}" cy="${cy}" r="1" fill="rgb(${color.r},${color.g},${color.b})" />`
  }).join('')

  const svg = `
    <svg width="${CAPTCHA_WIDTH}" height="${CAPTCHA_HEIGHT}">
      <rect width="100%" height="100%" fill="rgb(${bgColor.r},${bgColor.g},${bgColor.b})" />
      ${lines}
      ${dots}
      ${textElements}
    </svg>
  `

  return sharp(Buffer.from(svg)).png().toBuffer()
}

/**
 * 生成验证码（图片 + sessionId）
 */
export async function createCaptcha(): Promise<{ image: string; sessionId: string }> {
  const text = generateCaptchaText()
  const sessionId = crypto.randomUUID()
  
  // 存储到 Redis，5分钟过期
  await redis.setex(`captcha:${sessionId}`, CAPTCHA_EXPIRE_SECONDS, text.toUpperCase())
  
  // 生成图片
  const imageBuffer = await generateCaptchaImage(text)
  const imageBase64 = imageBuffer.toString('base64')
  
  return {
    image: `data:image/png;base64,${imageBase64}`,
    sessionId,
  }
}

/**
 * 验证验证码
 */
export async function verifyCaptcha(sessionId: string, code: string): Promise<boolean> {
  if (!sessionId || !code) return false
  
  const key = `captcha:${sessionId}`
  const storedCode = await redis.get(key)
  
  if (!storedCode) return false
  
  // 验证后立即删除（一次性使用）
  await redis.del(key)
  
  return storedCode.toUpperCase() === code.toUpperCase()
}
