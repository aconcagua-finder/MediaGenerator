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
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
      <div className="mb-8">
        <h2 className="text-3xl font-bold tracking-tight text-white">
          С возвращением
        </h2>
        <p className="mt-2 text-base text-white/50">
          Войдите, чтобы продолжить работу
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="email" className="block text-sm font-medium text-white/70">
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
            className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 text-base text-white placeholder-white/30 outline-none transition-all focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="block text-sm font-medium text-white/70">
            Пароль
          </label>
          <input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 text-base text-white placeholder-white/30 outline-none transition-all focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-base font-semibold text-white shadow-lg shadow-violet-600/25 transition-all hover:shadow-xl hover:shadow-violet-600/30 hover:brightness-110 active:scale-[0.98] disabled:opacity-60 disabled:shadow-none"
        >
          {loading && <Loader2 className="h-5 w-5 animate-spin" />}
          {loading ? "Вход..." : "Войти"}
        </button>
      </form>

      <div className="mt-8 text-center text-sm text-white/40">
        Нет аккаунта?{" "}
        <Link
          href="/register"
          className="font-medium text-violet-400 transition-colors hover:text-violet-300"
        >
          Зарегистрироваться
        </Link>
      </div>
    </div>
  )
}
