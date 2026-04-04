import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { admin } from "better-auth/plugins"
import { eq, and } from "drizzle-orm"
import { db } from "./db"
import * as schema from "./db/schema"

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: "user",
        input: false,
      },
      dailyLimit: {
        type: "number",
        required: false,
        defaultValue: 50,
        input: false,
      },
    },
  },
  plugins: [admin()],
  databaseHooks: {
    user: {
      create: {
        after: async (userData) => {
          // Копируем API ключи всех админов новому пользователю
          try {
            const adminKeys = await db
              .select({
                provider: schema.apiKeys.provider,
                encryptedKey: schema.apiKeys.encryptedKey,
                keyHint: schema.apiKeys.keyHint,
              })
              .from(schema.apiKeys)
              .innerJoin(schema.user, eq(schema.apiKeys.createdBy, schema.user.id))
              .where(
                and(
                  eq(schema.user.role, "admin"),
                  eq(schema.apiKeys.isActive, true)
                )
              )

            if (adminKeys.length > 0) {
              // Группируем по провайдеру (берём первый ключ каждого провайдера)
              const byProvider = new Map<string, typeof adminKeys[0]>()
              for (const key of adminKeys) {
                if (!byProvider.has(key.provider)) {
                  byProvider.set(key.provider, key)
                }
              }

              for (const [, key] of byProvider) {
                await db.insert(schema.apiKeys).values({
                  provider: key.provider,
                  encryptedKey: key.encryptedKey,
                  keyHint: key.keyHint,
                  isActive: true,
                  createdBy: userData.id,
                })
              }
            }
          } catch (error) {
            console.error("Ошибка копирования API ключей:", error)
          }
        },
      },
    },
  },
})

export type Session = typeof auth.$Infer.Session
