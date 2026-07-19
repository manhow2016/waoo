import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { logAuthAction } from '@/lib/logging/semantic'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { checkRateLimit, getClientIp, AUTH_REGISTER_LIMIT } from '@/lib/rate-limit'

/**
 * 验证邮箱格式
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * 验证 Cloudflare Turnstile 验证码
 */
async function verifyTurnstileToken(token: string): Promise<boolean> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY
  
  // 如果没有配置密钥，跳过验证（开发环境）
  if (!secretKey) {
    console.warn('TURNSTILE_SECRET_KEY not configured, skipping captcha verification')
    return true
  }

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        secret: secretKey,
        response: token,
      }),
    })

    const data = await response.json()
    return data.success === true
  } catch (error) {
    console.error('Turnstile verification failed:', error)
    return false
  }
}

export const POST = apiHandler(async (request: NextRequest) => {
  // 🛡️ IP 限流
  const ip = getClientIp(request)
  const rateResult = await checkRateLimit('auth:register', ip, AUTH_REGISTER_LIMIT)
  if (rateResult.limited) {
    logAuthAction('REGISTER', 'unknown', { error: 'Rate limited', ip })
    return NextResponse.json(
      { success: false, message: `请求过于频繁，请 ${rateResult.retryAfterSeconds} 秒后再试` },
      {
        status: 429,
        headers: { 'Retry-After': String(rateResult.retryAfterSeconds) },
      },
    )
  }

  const body = await request.json()
  const { email, password, turnstileToken } = body

  // 验证输入
  if (!email || !password) {
    logAuthAction('REGISTER', email || 'unknown', { error: 'Missing credentials' })
    throw new ApiError('INVALID_PARAMS')
  }

  // 验证邮箱格式
  if (!isValidEmail(email)) {
    logAuthAction('REGISTER', email, { error: 'Invalid email format' })
    return NextResponse.json(
      { success: false, message: '邮箱格式不正确' },
      { status: 400 }
    )
  }

  // 验证密码长度
  if (password.length < 6) {
    logAuthAction('REGISTER', email, { error: 'Password too short' })
    return NextResponse.json(
      { success: false, message: '密码长度至少6位' },
      { status: 400 }
    )
  }

  // 验证 Turnstile 人机验证
  if (!turnstileToken) {
    logAuthAction('REGISTER', email, { error: 'Missing captcha token' })
    return NextResponse.json(
      { success: false, message: '请完成人机验证' },
      { status: 400 }
    )
  }

  const captchaValid = await verifyTurnstileToken(turnstileToken)
  if (!captchaValid) {
    logAuthAction('REGISTER', email, { error: 'Captcha verification failed' })
    return NextResponse.json(
      { success: false, message: '人机验证失败，请重试' },
      { status: 400 }
    )
  }

  // 检查邮箱是否已存在
  const existingUser = await prisma.user.findUnique({
    where: { email }
  })

  if (existingUser) {
    logAuthAction('REGISTER', email, { error: 'Email already exists' })
    return NextResponse.json(
      { success: false, message: '该邮箱已被注册' },
      { status: 400 }
    )
  }

  // 哈希密码
  const hashedPassword = await bcrypt.hash(password, 12)

  // 创建用户（事务）
  const user = await prisma.$transaction(async (tx) => {
    // 创建用户
    const newUser = await tx.user.create({
      data: {
        email,
        password: hashedPassword
      }
    })

    // 💰 创建用户余额记录（初始余额为0）
    await tx.userBalance.create({
      data: {
        userId: newUser.id,
        balance: 0,
        frozenAmount: 0,
        totalSpent: 0
      }
    })

    return newUser
  })

  logAuthAction('REGISTER', email, { userId: user.id, success: true })

  return NextResponse.json(
    {
      message: "注册成功",
      user: {
        id: user.id,
        email: user.email
      }
    },
    { status: 201 }
  )
})
