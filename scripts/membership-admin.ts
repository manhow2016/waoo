/**
 * 会员运营工具（阶段三管理后台之前，开通/撤销的唯一可用入口）
 *
 * 用法：
 *   # 按订单号开通（用户已下单，运营确认收款后核销）
 *   npx tsx --env-file=.env scripts/membership-admin.ts grant \
 *     --orderNo WOO20260101120000ABCD1234 --admin admin --reason "微信收款 29 元"
 *
 *   # 直接给某个账号开通（自动建单并立即激活）
 *   npx tsx --env-file=.env scripts/membership-admin.ts grant \
 *     --email user@example.com --plan monthly --admin admin --reason "内测赠送"
 *
 *   # 撤销订阅（退款后同步取消）
 *   npx tsx --env-file=.env scripts/membership-admin.ts revoke \
 *     --orderNo WOO... --admin admin --reason "用户申请退款"
 *
 *   # 兜底扫描：到期未降级的订阅 + 超时未支付订单
 *   npx tsx --env-file=.env scripts/membership-admin.ts sweep
 *
 *   # 查询某账号的订单
 *   npx tsx --env-file=.env scripts/membership-admin.ts list --email user@example.com
 *
 * 说明：所有会开通/撤销的操作都必须带 --admin 与 --reason，用于写入 AdminLog 审计。
 */
import { prisma } from '@/lib/prisma'
import { ADMIN_ACTION, ADMIN_TARGET_TYPE, writeAdminLog } from '@/lib/admin-audit'
import { sweepSubscriptions } from '@/lib/membership-expiry'
import {
  activateSubscriptionOrder,
  cancelSubscriptionOrder,
  createSubscriptionOrder,
  listUserSubscriptions,
  serializeSubscriptionOrder,
} from '@/lib/subscription-order'

class CliError extends Error {}

function writeJson(payload: unknown) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
}

function writeError(payload: unknown) {
  process.stderr.write(
    `${typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)}\n`,
  )
}

type ArgMap = Map<string, string>

function parseArgs(argv: string[]): { command: string; args: ArgMap; flags: Set<string> } {
  const [command = '', ...rest] = argv
  const args: ArgMap = new Map()
  const flags = new Set<string>()

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]
    if (!token.startsWith('--')) continue
    const body = token.slice(2)
    const separatorIndex = body.indexOf('=')
    if (separatorIndex !== -1) {
      args.set(body.slice(0, separatorIndex), body.slice(separatorIndex + 1))
      continue
    }
    const next = rest[index + 1]
    if (next !== undefined && !next.startsWith('--')) {
      args.set(body, next)
      index += 1
    } else {
      flags.add(body)
    }
  }

  return { command, args, flags }
}

function requireArg(args: ArgMap, name: string): string {
  const value = (args.get(name) || '').trim()
  if (!value) throw new CliError(`缺少必填参数 --${name}`)
  return value
}

function requireAuditArgs(args: ArgMap): { adminId: string; reason: string } {
  const username = requireArg(args, 'admin')
  const reason = requireArg(args, 'reason')
  return { adminId: username, reason }
}

async function resolveAdmin(username: string) {
  const admin = await prisma.admin.findUnique({ where: { username } })
  if (!admin) throw new CliError(`管理员不存在：${username}`)
  if (!admin.isActive) throw new CliError(`管理员已停用：${username}`)
  return admin
}

async function resolveUserByEmail(email: string) {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) throw new CliError(`用户不存在：${email}`)
  return user
}

async function commandGrant(args: ArgMap) {
  const { adminId, reason } = requireAuditArgs(args)
  const admin = await resolveAdmin(adminId)

  const orderNoArg = (args.get('orderNo') || '').trim()
  const emailArg = (args.get('email') || '').trim()
  const planArg = (args.get('plan') || '').trim()

  let orderNo = orderNoArg

  if (!orderNo) {
    if (!emailArg) throw new CliError('需要 --orderNo，或同时提供 --email 与 --plan')
    if (!planArg) throw new CliError('使用 --email 时必须同时提供 --plan')
    const user = await resolveUserByEmail(emailArg)
    const created = await createSubscriptionOrder({ userId: user.id, planCode: planArg })
    orderNo = created.subscription.orderNo
  }

  const before = await prisma.subscription.findUnique({ where: { orderNo } })
  if (!before) throw new CliError(`订单不存在：${orderNo}`)

  const result = await activateSubscriptionOrder({
    orderNo,
    payMethod: 'manual',
  })

  await writeAdminLog({
    adminId: admin.id,
    action: ADMIN_ACTION.GRANT_MEMBERSHIP,
    targetType: ADMIN_TARGET_TYPE.ORDER,
    targetId: orderNo,
    before: { status: before.status, paidAt: before.paidAt, expireAt: before.expireAt.toISOString() },
    after: {
      status: result.subscription.status,
      paidAt: result.subscription.paidAt?.toISOString() ?? null,
      expireAt: result.subscription.expireAt.toISOString(),
    },
    reason,
  })

  writeJson({
    ok: true,
    action: 'grant',
    order: serializeSubscriptionOrder({ ...result.subscription, plan: result.plan }),
    alreadyProcessed: result.alreadyProcessed,
  })
}

async function commandRevoke(args: ArgMap) {
  const { adminId, reason } = requireAuditArgs(args)
  const admin = await resolveAdmin(adminId)
  const orderNo = requireArg(args, 'orderNo')

  const before = await prisma.subscription.findUnique({ where: { orderNo } })
  if (!before) throw new CliError(`订单不存在：${orderNo}`)

  const after = await cancelSubscriptionOrder({ orderNo })

  await writeAdminLog({
    adminId: admin.id,
    action: ADMIN_ACTION.REVOKE_MEMBERSHIP,
    targetType: ADMIN_TARGET_TYPE.ORDER,
    targetId: orderNo,
    before: { status: before.status, expireAt: before.expireAt.toISOString() },
    after: { status: after.status, expireAt: after.expireAt.toISOString() },
    reason,
  })

  writeJson({ ok: true, action: 'revoke', orderNo, status: after.status })
}

async function commandSweep() {
  const result = await sweepSubscriptions()
  writeJson({ ok: true, action: 'sweep', ...result })
}

async function commandList(args: ArgMap) {
  const email = requireArg(args, 'email')
  const user = await resolveUserByEmail(email)
  const orders = await listUserSubscriptions({ userId: user.id, limit: 50 })
  writeJson({
    ok: true,
    action: 'list',
    userId: user.id,
    email: user.email,
    orders: orders.map(serializeSubscriptionOrder),
  })
}

const USAGE = `用法：
  membership-admin.ts grant --orderNo <订单号> --admin <用户名> --reason <原因>
  membership-admin.ts grant --email <邮箱> --plan <套餐code> --admin <用户名> --reason <原因>
  membership-admin.ts revoke --orderNo <订单号> --admin <用户名> --reason <原因>
  membership-admin.ts sweep
  membership-admin.ts list --email <邮箱>`

async function main() {
  const { command, args, flags } = parseArgs(process.argv.slice(2))

  if (!command || flags.has('help')) {
    writeError(USAGE)
    process.exitCode = command ? 0 : 1
    return
  }

  switch (command) {
    case 'grant':
      await commandGrant(args)
      return
    case 'revoke':
      await commandRevoke(args)
      return
    case 'sweep':
      await commandSweep()
      return
    case 'list':
      await commandList(args)
      return
    default:
      throw new CliError(`未知子命令：${command}\n${USAGE}`)
  }
}

main()
  .catch((error: unknown) => {
    writeError({ ok: false, error: error instanceof Error ? error.message : String(error) })
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
    // BullMQ / Redis 连接会阻止事件循环自然退出，脚本必须显式结束进程，
    // 否则运维命令执行完仍然挂着（stdout 已同步写出，不会丢失输出）。
    process.exit(process.exitCode ?? 0)
  })
