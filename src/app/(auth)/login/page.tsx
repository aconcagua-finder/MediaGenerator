"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { signIn } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    const { error: authError } = await signIn.email({ email, password })

    if (authError) {
      setError(authError.message || "Ошибка входа")
      setLoading(false)
      return
    }

    router.push("/")
    router.refresh()
  }

  return (
    <Card
      className="border-0 shadow-2xl"
      style={{
        background: "oklch(0.16 0.01 260 / 80%)",
        backdropFilter: "blur(20px)",
        border: "1px solid oklch(1 0 0 / 8%)",
        boxShadow:
          "0 0 0 1px oklch(1 0 0 / 5%), 0 32px 64px oklch(0 0 0 / 40%), 0 0 80px oklch(0.65 0.22 280 / 6%)",
      }}
    >
      <CardHeader className="pb-6 pt-8 px-8">
        <CardTitle
          className="text-2xl font-bold tracking-tight"
          style={{ color: "oklch(0.97 0 0)" }}
        >
          Добро пожаловать
        </CardTitle>
        <CardDescription style={{ color: "oklch(0.65 0 0)" }}>
          Войдите в свой аккаунт, чтобы продолжить
        </CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-5 px-8">
          {error && (
            <div
              className="rounded-lg px-4 py-3 text-sm"
              style={{
                background: "oklch(0.50 0.20 25 / 12%)",
                border: "1px solid oklch(0.60 0.20 25 / 30%)",
                color: "oklch(0.80 0.15 25)",
              }}
            >
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label
              htmlFor="email"
              className="text-sm font-medium"
              style={{ color: "oklch(0.80 0 0)" }}
            >
              Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-11 transition-all duration-200"
              style={{
                background: "oklch(1 0 0 / 5%)",
                border: "1px solid oklch(1 0 0 / 12%)",
                color: "oklch(0.97 0 0)",
              }}
            />
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="password"
              className="text-sm font-medium"
              style={{ color: "oklch(0.80 0 0)" }}
            >
              Пароль
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-11 transition-all duration-200"
              style={{
                background: "oklch(1 0 0 / 5%)",
                border: "1px solid oklch(1 0 0 / 12%)",
                color: "oklch(0.97 0 0)",
              }}
            />
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-5 px-8 pb-8 pt-2">
          <Button
            type="submit"
            className="w-full h-11 font-semibold text-white transition-all duration-200 active:scale-[0.98]"
            disabled={loading}
            style={{
              background: loading
                ? "oklch(0.45 0.15 280)"
                : "linear-gradient(135deg, oklch(0.60 0.22 280) 0%, oklch(0.65 0.20 220) 100%)",
              border: "none",
              boxShadow: loading
                ? "none"
                : "0 4px 24px oklch(0.65 0.22 280 / 35%), inset 0 1px 0 oklch(1 0 0 / 15%)",
            }}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="3"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Вход...
              </span>
            ) : (
              "Войти"
            )}
          </Button>

          <p className="text-sm text-center" style={{ color: "oklch(0.58 0 0)" }}>
            Нет аккаунта?{" "}
            <Link
              href="/register"
              className="font-medium transition-colors duration-150 hover:opacity-80"
              style={{ color: "oklch(0.72 0.18 280)" }}
            >
              Зарегистрироваться
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}
