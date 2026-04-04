"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { signIn } from "@/lib/auth-client"
import { Loader2 } from "lucide-react"

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
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight text-white">
          С возвращением
        </h2>
        <p className="mt-1.5 text-sm text-neutral-500">
          Войдите, чтобы продолжить работу
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="email" className="block text-sm font-medium text-neutral-400">
            Email
          </label>
          <input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            className="h-11 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3.5 text-sm text-white placeholder-neutral-600 outline-none transition-colors focus:border-x-blue/50 focus:ring-1 focus:ring-x-blue/30"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="block text-sm font-medium text-neutral-400">
            Пароль
          </label>
          <input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="h-11 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3.5 text-sm text-white placeholder-neutral-600 outline-none transition-colors focus:border-x-blue/50 focus:ring-1 focus:ring-x-blue/30"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-x-blue text-sm font-bold text-white transition-colors hover:bg-x-blue-hover active:scale-[0.98] disabled:opacity-50"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? "Вход..." : "Войти"}
        </button>
      </form>

      <div className="mt-8 text-center text-sm text-neutral-500">
        Нет аккаунта?{" "}
        <Link
          href="/register"
          className="font-medium text-x-blue transition-colors hover:text-x-blue-hover"
        >
          Зарегистрироваться
        </Link>
      </div>
    </div>
  )
}
