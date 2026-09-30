/**
 * 数据库初始化脚本（幂等）
 *
 * 写入内容：
 * 1. 平台级供应商准入元数据（默认供应商 token61 + 非默认供应商 bailian）
 * 2. 四档套餐（free / monthly / quarterly / yearly）
 * 3. 初始超级管理员
 *
 * 运行方式：
 *   npx prisma db seed
 *   npm run db:seed
 *
 * 说明：
 * - 本脚本可重复执行，全部使用 upsert，不会覆盖运营已修改的数据（update 分支刻意留空）。
 * - Provider.config 只存展示信息（控制台地址等），不存 baseUrl / 协议 / 模型白名单，
 *   这些仍由 src/lib/providers/* 与 src/lib/model-gateway/* 的代码目录负责。
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

const prisma = new PrismaClient()

/** 平台级供应商：准入与展示元数据 */
const PROVIDERS = [
  {
    code: 'token61',
    name: 'Token六一',
    isDefault: true,
    sortOrder: 0,
    config: {
      // 仅展示用：用户去何处申请自己的 API Key
      consoleUrl: 'https://token61.com',
    },
  },
  {
    code: 'bailian',
    name: '阿里百炼',
    isDefault: false,
    sortOrder: 1,
    config: {
      consoleUrl: 'https://bailian.console.aliyun.com',
    },
  },
]

/**
 * 套餐定义。
 * name 仅作为兜底展示名，前端优先使用 messages/<locale>/membership.json 中
 * 以 plan code 为键的文案，保证中英文同步维护。
 * features.featureKeys 同样是 i18n key，由前端翻译。
 */
const PLANS = [
  {
    code: 'free',
    name: '免费',
    level: 0,
    price: 0,
    durationDay: 0,
    allowAllProviders: false,
    sortOrder: 0,
    features: { featureKeys: ['unlimitedDefaultProvider'] },
  },
  {
    code: 'monthly',
    name: '月付会员',
    level: 1,
    price: 29,
    durationDay: 30,
    allowAllProviders: true,
    sortOrder: 1,
    features: { featureKeys: ['unlimitedDefaultProvider', 'allProviders'] },
  },
  {
    code: 'quarterly',
    name: '季付会员',
    level: 2,
    price: 79,
    durationDay: 90,
    allowAllProviders: true,
    sortOrder: 2,
    features: { featureKeys: ['unlimitedDefaultProvider', 'allProviders'] },
  },
  {
    code: 'yearly',
    name: '年付会员',
    level: 3,
    price: 259,
    durationDay: 365,
    allowAllProviders: true,
    sortOrder: 3,
    features: { featureKeys: ['unlimitedDefaultProvider', 'allProviders'] },
  },
]

/** 生成随机初始密码（避免使用硬编码弱口令） */
function generateInitialPassword(): string {
  return crypto.randomBytes(12).toString('base64url')
}

async function seedProviders() {
  for (const provider of PROVIDERS) {
    await prisma.provider.upsert({
      where: { code: provider.code },
      update: {},
      create: {
        code: provider.code,
        name: provider.name,
        isDefault: provider.isDefault,
        isActive: true,
        sortOrder: provider.sortOrder,
        config: provider.config,
      },
    })
  }
  // 全局唯一默认供应商：确保 isDefault 只落在期望的那一条上
  const defaultCode = PROVIDERS.find((p) => p.isDefault)?.code
  if (defaultCode) {
    await prisma.provider.updateMany({
      where: { isDefault: true, code: { not: defaultCode } },
      data: { isDefault: false },
    })
  }
}

async function seedPlans() {
  for (const plan of PLANS) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: {},
      create: {
        code: plan.code,
        name: plan.name,
        level: plan.level,
        price: plan.price,
        durationDay: plan.durationDay,
        allowAllProviders: plan.allowAllProviders,
        sortOrder: plan.sortOrder,
        features: plan.features,
        isActive: true,
      },
    })
  }
}

async function seedAdmin() {
  // 测试引导流程只需要供应商与套餐，不应创建运营账号
  if (process.env.SEED_SKIP_ADMIN === '1') {
    return
  }

  const username = (process.env.ADMIN_INITIAL_USERNAME || 'admin').trim()
  const envPassword = (process.env.ADMIN_INITIAL_PASSWORD || '').trim()

  const existing = await prisma.admin.findUnique({ where: { username } })
  if (existing) {
    console.log(`[seed] 管理员 ${username} 已存在，跳过（不会覆盖已有密码）`)
    return
  }

  const password = envPassword || generateInitialPassword()
  const passwordHash = await bcrypt.hash(password, 10)

  await prisma.admin.create({
    data: { username, passwordHash, role: 'super', isActive: true },
  })

  if (envPassword) {
    console.log(`[seed] 已创建超级管理员：${username}（密码来自 ADMIN_INITIAL_PASSWORD）`)
  } else {
    console.log('─'.repeat(64))
    console.log(`[seed] 已创建超级管理员：${username}`)
    console.log(`[seed] 初始密码（仅本次显示，请立即登录后台修改）：${password}`)
    console.log('─'.repeat(64))
  }
}

async function main() {
  console.log('[seed] 开始初始化会员系统基础数据...')
  await seedProviders()
  console.log(`[seed] 供应商就绪：${PROVIDERS.map((p) => p.code).join(', ')}`)
  await seedPlans()
  console.log(`[seed] 套餐就绪：${PLANS.map((p) => `${p.code}(¥${p.price})`).join(', ')}`)
  await seedAdmin()
  console.log('[seed] 完成')
}

main()
  .catch((error) => {
    console.error('[seed] 初始化失败：', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
