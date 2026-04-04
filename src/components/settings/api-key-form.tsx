"use client"

import { useState, useTransition } from "react"
import { KeyRound, Trash2, Check, Loader2, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { saveApiKey, deleteApiKey } from "@/lib/actions/api-keys"
import { PROVIDER_INFO } from "@/lib/providers/registry"
import { toast } from "sonner"

interface ApiKeyData {
  id: string
  provider: string
  keyHint: string
  isActive: boolean
  createdAt: Date
}

interface ApiKeyFormProps {
  initialKeys: ApiKeyData[]
}

export function ApiKeyForm({ initialKeys }: ApiKeyFormProps) {
  const [keys, setKeys] = useState(initialKeys)
  const [editingProvider, setEditingProvider] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState("")
  const [showKey, setShowKey] = useState(false)
  const [isPending, startTransition] = useTransition()

  const providers = ["openai", "xai", "openrouter"] as const

  function handleSave(provider: string) {
    if (!inputValue.trim()) return

    startTransition(async () => {
      const result = await saveApiKey(provider, inputValue.trim())
      if (result.success) {
        toast.success("Ключ сохранён", {
          description: `API ключ ${PROVIDER_INFO[provider]?.name} успешно сохранён`,
        })
        // Обновляем локальное состояние
        setKeys((prev) => {
          const existing = prev.find((k) => k.provider === provider)
          if (existing) {
            return prev.map((k) =>
              k.provider === provider
                ? { ...k, keyHint: `...${inputValue.slice(-4)}`, isActive: true }
                : k
            )
          }
          return [
            ...prev,
            {
              id: crypto.randomUUID(),
              provider,
              keyHint: `...${inputValue.slice(-4)}`,
              isActive: true,
              createdAt: new Date(),
            },
          ]
        })
        setEditingProvider(null)
        setInputValue("")
        setShowKey(false)
      } else {
        toast.error("Ошибка", { description: result.error })
      }
    })
  }

  function handleDelete(keyId: string, provider: string) {
    startTransition(async () => {
      await deleteApiKey(keyId)
      setKeys((prev) => prev.filter((k) => k.id !== keyId))
      toast.success("Ключ удалён", {
        description: `API ключ ${PROVIDER_INFO[provider]?.name} удалён`,
      })
    })
  }

  return (
    <div className="space-y-4">
      {providers.map((provider) => {
        const info = PROVIDER_INFO[provider]
        const existingKey = keys.find((k) => k.provider === provider)
        const isEditing = editingProvider === provider

        return (
          <Card key={provider}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <KeyRound className="size-5 text-muted-foreground" />
                  <div>
                    <CardTitle className="text-base">{info?.name || provider}</CardTitle>
                    <CardDescription className="text-sm">
                      {info?.description}
                    </CardDescription>
                  </div>
                </div>
                {existingKey && !isEditing && (
                  <Badge variant={existingKey.isActive ? "default" : "secondary"}>
                    {existingKey.isActive ? "Активен" : "Неактивен"}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor={`key-${provider}`}>API ключ</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          id={`key-${provider}`}
                          type={showKey ? "text" : "password"}
                          placeholder="sk-..."
                          value={inputValue}
                          onChange={(e) => setInputValue(e.target.value)}
                          disabled={isPending}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 size-7 -translate-y-1/2"
                          onClick={() => setShowKey(!showKey)}
                        >
                          {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleSave(provider)}
                      disabled={isPending || !inputValue.trim()}
                    >
                      {isPending ? (
                        <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                      ) : (
                        <Check className="mr-1.5 size-3.5" />
                      )}
                      {isPending ? "Проверка..." : "Сохранить"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingProvider(null)
                        setInputValue("")
                        setShowKey(false)
                      }}
                      disabled={isPending}
                    >
                      Отмена
                    </Button>
                  </div>
                </div>
              ) : existingKey ? (
                <div className="flex items-center justify-between">
                  <code className="rounded bg-muted px-2 py-1 text-sm">
                    {existingKey.keyHint}
                  </code>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingProvider(provider)
                        setInputValue("")
                      }}
                    >
                      Изменить
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(existingKey.id, provider)}
                      disabled={isPending}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingProvider(provider)
                    setInputValue("")
                  }}
                >
                  Добавить ключ
                </Button>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
