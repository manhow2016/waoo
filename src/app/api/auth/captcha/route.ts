import { NextResponse } from 'next/server'
import { createCaptcha } from '@/lib/captcha'
import { apiHandler } from '@/lib/api-errors'

/**
 * GET /api/auth/captcha
 * 生成图片验证码
 */
export const GET = apiHandler(async () => {
  const { image, sessionId } = await createCaptcha()
  
  return NextResponse.json({
    success: true,
    image,
    sessionId,
  })
})
