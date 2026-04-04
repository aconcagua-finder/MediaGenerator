"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { signUp } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"

export default function RegisterPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    const { error: authError } = await signUp.email({ name, email, password })

    if (authError) {
      setError(authError.message || "Ошибка регистрации")
      setLoading(false)
      return
    }

    router.push("/")
    router.refresh()
  }

  return (
    <div className="rounded-lg border border-border bg-card p-8">
      <div className="mb-6">
        <h2 className="text-xl font-medium tracking-tight text-foreground">
          Создать аккаунт
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Начните генерировать изображения
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="name" className="text-sm text-muted-foreground">
            Имя
          </Label>
          <Input
            id="name"
            type="text"
            placeholder="Ваше имя"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            className="h-10 bg-background"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm text-muted-foreground">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-10 bg-background"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm text-muted-foreground">
            Пароль
          </Label>
          <Input
            id="password"
            type="password"
            placeholder="Минимум 8 символов"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="h-10 bg-background"
          />
        </div>

        <Button
          type="submit"
          className="mt-2 h-10 w-full font-medium"
          disabled={loading}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {loading ? "Создание..." : "Создать аккаунт"}
        </Button>
      </form>

      <div className="mt-6 text-center text-sm text-muted-foreground">
        Уже есть аккаунт?{" "}
        <Link
          href="/login"
          className="text-foreground underline underline-offset-4 transition-colors hover:text-muted-foreground"
        >
          Войти
        </Link>
      </div>
    </div>
  )
}
