import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // src/core 必须可在 Node 环境直接测试 —— 不使用 jsdom。
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    reporters: ['default'],
  },
})
