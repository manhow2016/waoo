import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  // 与 Next 生产构建保持一致：tsconfig 的 jsx=preserve 交给构建器决定，
  // 测试环境必须显式使用 automatic runtime，否则未导入 React 的 .tsx 会被
  // 编译成裸 React.createElement 而在渲染测试中抛 "React is not defined"。
  esbuild: {
    jsx: 'automatic',
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    css: false,
    pool: 'forks',
    poolOptions: {
      forks: {
        minForks: 1,
        maxForks: 1,
      },
    },
    setupFiles: ['./tests/setup/env.ts'],
    globalSetup: ['./tests/setup/global-setup.ts'],
    include: ['**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage/billing',
      include: [
        'src/lib/billing/cost.ts',
        'src/lib/billing/mode.ts',
        'src/lib/billing/task-policy.ts',
        'src/lib/billing/runtime-usage.ts',
        'src/lib/billing/service.ts',
        'src/lib/billing/ledger.ts',
      ],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
})
