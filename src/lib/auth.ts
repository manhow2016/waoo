import { PrismaAdapter } from "@next-auth/prisma-adapter"
import CredentialsProvider from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { logAuthAction } from './logging/semantic'
import { prisma } from './prisma'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const authOptions: any = {
  adapter: PrismaAdapter(prisma),
  // 🔥 允许从任意 Host 访问（解决局域网访问问题）
  trustHost: true,
  // 🔥 根据 URL 协议决定是否使用 Secure Cookie
  // 局域网 HTTP 访问时需要关闭，否则 Cookie 无法设置
  useSecureCookies: (process.env.NEXTAUTH_URL || '').startsWith('https://'),
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          logAuthAction('LOGIN', credentials?.username || 'unknown', { error: 'Missing credentials' })
          return null
        }

        const user = await prisma.user.findUnique({
          where: {
            email: credentials.username
          }
        })

        if (!user || !user.password) {
          logAuthAction('LOGIN', credentials.username, { error: 'User not found' })
          return null
        }

        // 验证密码
        const isPasswordValid = await bcrypt.compare(credentials.password, user.password)

        if (!isPasswordValid) {
          logAuthAction('LOGIN', credentials.username, { error: 'Invalid password' })
          return null
        }

        // 封禁账号不允许再建立新会话
        if (user.isBanned) {
          logAuthAction('LOGIN', user.email, { error: 'Account banned', userId: user.id })
          return null
        }

        logAuthAction('LOGIN', user.email, { userId: user.id, success: true })

        return {
          id: user.id,
          email: user.email,
        }
      }
    })
  ],
  session: {
    strategy: "jwt"
  },
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async jwt({ token, user }: any) {
      if (user) {
        token.id = user.id
      }
      // 封禁状态每次读库：JWT 策略下服务端无法吊销已签发的 token，
      // 因此只能在每次读取会话时校验，账号被封禁后有效会话立即失效。
      // 账号已被删除时同样视为不可用（避免残留 token 继续命中会话）。
      if (token?.id) {
        const current = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { isBanned: true },
        })
        token.banned = current ? current.isBanned === true : true
      }
      return token
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async session({ session, token }: any) {
      if (token && session.user) {
        session.user.id = token.id as string
        // token 中的封禁状态必须透传到 session，否则 getAuthSession 无法据此拒绝被封禁的会话
        session.user.banned = token.banned === true
      }
      return session
    }
  }
}
