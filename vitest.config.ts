import { defineConfig } from "vitest/config"
import path from "node:path"

/**
 * Vitest конфиг для модульных тестов.
 *
 * Тесты ничего не знают про Next.js — это чистые юнит-тесты на pure
 * функции (валидация, парсер картинок, capability-карты, сборка payload).
 * Полагаемся на node-окружение + автоматический TS из Vitest.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
})
