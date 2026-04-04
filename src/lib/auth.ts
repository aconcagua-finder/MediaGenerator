import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { admin } from "better-auth/plugins"
import { eq, count } from "drizzle-orm"
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
        before: async (userData) => {
          // Первый пользователь автоматически становится admin
          const [result] = await db
            .select({ value: count() })
            .from(schema.user)
          if (result.value === 0) {
            return {
              data: {
                ...userData,
                role: "admin",
              },
            }
          }
          return { data: userData }
        },
      },
    },
  },
})

export type Session = typeof auth.$Infer.Session
