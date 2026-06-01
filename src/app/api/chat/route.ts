import { NextRequest, NextResponse } from "next/server"
import { eq, and, sql } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { chats, chatMessages, user, type ChatAttachment } from "@/lib/db/schema"
import { getDecryptedApiKey } from "@/lib/actions/api-keys"
import { getTextModel } from "@/lib/providers/text-models"
import { supportsVision } from "@/lib/capabilities"
import { buildOpenRouterMessages } from "@/lib/chat-payload"
import { calculateChatCost, isOverBudget } from "@/lib/utils/chat-cost"
import { fetchUploadBuffers, resolveUserUploads } from "@/lib/uploads-helper"
import { headers } from "next/headers"

/**
 * Генерирует короткое название чата (3-5 слов) по первому диалогу
 * через дешёвую модель. Если не получилось — возвращает null.
 */
async function generateChatTitle(
  apiKey: string,
  userMsg: string,
  assistantMsg: string
): Promise<string | null> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "MediaGenerator Title",
      },
      body: JSON.stringify({
        model: "anthropic/claude-haiku-4.5",
        max_tokens: 30,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "Ты придумываешь название для чата. Выведи ровно 3-5 слов на русском, без кавычек, без точки, без префиксов вроде 'Чат:'. Только смысловой заголовок темы.",
          },
          {
            role: "user",
            content: `Пользователь:\n${userMsg.slice(0, 800)}\n\nОтвет:\n${assistantMsg.slice(0, 400)}\n\nПридумай заголовок темы.`,
          },
        ],
      }),
    })

    if (!response.ok) return null
    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const raw = data.choices?.[0]?.message?.content?.trim()
    if (!raw) return null

    // Чистим: убираем кавычки, переводы строк, лишние пробелы, точку в конце
    let title = raw
      .replace(/^["'«»]+|["'«»]+$/g, "")
      .replace(/\s+/g, " ")
      .replace(/[.,;:!?]+$/g, "")
      .trim()

    if (title.length < 2) return null
    if (title.length > 80) title = title.slice(0, 80).trimEnd() + "…"
    return title
  } catch {
    return null
  }
}

interface ChatBody {
  chatId: string
  /** Содержимое нового сообщения пользователя */
  userMessage: string
  /** ID вложенных пользователем картинок (paste/drop/picker → /api/uploads) */
  attachmentIds?: string[]
}

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }

  const body = (await request.json()) as ChatBody
  const { chatId, userMessage, attachmentIds } = body

  if (!chatId) {
    return NextResponse.json({ error: "chatId обязателен" }, { status: 400 })
  }
  const hasAttachments = Array.isArray(attachmentIds) && attachmentIds.length > 0
  // Если есть вложение — текст может быть пустым ("посмотри на скрин"),
  // в этом случае подставим минимальный плейсхолдер.
  if (!userMessage?.trim() && !hasAttachments) {
    return NextResponse.json({ error: "Нужно сообщение или вложение" }, { status: 400 })
  }

  // Получить чат и проверить владельца
  const [chat] = await db
    .select()
    .from(chats)
    .where(and(eq(chats.id, chatId), eq(chats.userId, session.user.id)))

  if (!chat) {
    return NextResponse.json({ error: "Чат не найден" }, { status: 404 })
  }

  const model = getTextModel(chat.model)
  if (!model) {
    return NextResponse.json({ error: `Модель ${chat.model} не настроена` }, { status: 400 })
  }

  // Проверка лимитов и блокировки — то же, что в /api/generate и /api/edit.
  // Чат тоже стоит денег (токены), поэтому участвует в общем `costLimit`.
  const isAdmin = session.user.role === "admin"
  const [userData] = await db
    .select({
      banned: user.banned,
      banReason: user.banReason,
      costLimit: user.costLimit,
      totalSpent: user.totalSpent,
    })
    .from(user)
    .where(eq(user.id, session.user.id))

  if (userData?.banned) {
    return NextResponse.json(
      {
        error: userData.banReason
          ? `Аккаунт заблокирован: ${userData.banReason}`
          : "Аккаунт заблокирован",
      },
      { status: 403 }
    )
  }

  if (!isAdmin && userData) {
    const spent = parseFloat(userData.totalSpent) || 0
    const limit = parseFloat(userData.costLimit) || 0
    if (isOverBudget(spent, limit)) {
      return NextResponse.json(
        {
          error: `Бюджет исчерпан ($${limit.toFixed(2)}). Обратитесь к админу, чтобы поднять лимит.`,
        },
        { status: 429 }
      )
    }
  }

  const modelHasVision = supportsVision(chat.model)
  if (hasAttachments && !modelHasVision) {
    return NextResponse.json(
      {
        error:
          `Модель ${model.name} не работает с картинками. ` +
          `Переключитесь на vision-модель (например, Claude Sonnet 4.6, GPT-5.4 или Gemini 3 Flash) и повторите.`,
      },
      { status: 400 }
    )
  }

  // Разрешаем вложения и подтягиваем data-url для отправки в провайдер.
  let attachmentsForMessage: ChatAttachment[] | null = null
  const dataUrlMap = new Map<string, string>()
  if (hasAttachments) {
    const resolved = await resolveUserUploads(attachmentIds!, session.user.id)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.message }, { status: 400 })
    }
    const buffers = await fetchUploadBuffers(resolved.rows)
    attachmentsForMessage = resolved.rows.map((r) => ({
      uploadId: r.id,
      mimeType: r.mimeType,
      width: r.width,
      height: r.height,
    }))
    resolved.rows.forEach((r, i) => {
      dataUrlMap.set(r.id, buffers[i].dataUrl)
    })
  }

  // API ключ OpenRouter
  const apiKey = await getDecryptedApiKey(session.user.id, "openrouter")
  if (!apiKey) {
    return NextResponse.json(
      { error: "API ключ OpenRouter не настроен. Добавьте его в Настройках." },
      { status: 400 }
    )
  }

  // Это первое сообщение в чате? Если да — после стрима сгенерируем умное название.
  const [{ count: existingMsgCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(chatMessages)
    .where(eq(chatMessages.chatId, chatId))
  const isFirstMessage = existingMsgCount === 0

  // Сохраняем сообщение пользователя (с вложениями, если есть)
  await db.insert(chatMessages).values({
    chatId,
    role: "user",
    content: userMessage.trim(),
    attachments: attachmentsForMessage,
  })

  // Собираем историю — пред. сообщения могут содержать свои вложения,
  // их тоже надо отправить (vision-модель ожидает увидеть полный контекст).
  const history = await db
    .select({
      role: chatMessages.role,
      content: chatMessages.content,
      attachments: chatMessages.attachments,
    })
    .from(chatMessages)
    .where(eq(chatMessages.chatId, chatId))
    .orderBy(chatMessages.createdAt)

  // Для предыдущих сообщений с вложениями нужно тоже подтянуть data-url
  if (modelHasVision) {
    const allAttachmentIds: string[] = []
    for (const m of history) {
      for (const att of m.attachments ?? []) {
        if (!dataUrlMap.has(att.uploadId)) {
          allAttachmentIds.push(att.uploadId)
        }
      }
    }
    if (allAttachmentIds.length > 0) {
      const resolved = await resolveUserUploads(allAttachmentIds, session.user.id)
      if (resolved.ok) {
        const buffers = await fetchUploadBuffers(resolved.rows)
        resolved.rows.forEach((r, i) => {
          dataUrlMap.set(r.id, buffers[i].dataUrl)
        })
      }
      // Если часть прошлых вложений недоступна — молча игнорируем,
      // не блокируем новый запрос из-за чужой ошибки в истории.
    }
  }

  const messages = buildOpenRouterMessages({
    systemPrompt: chat.systemPrompt,
    history,
    attachmentDataUrls: dataUrlMap,
    modelSupportsVision: modelHasVision,
  })

  const settings = (chat.settings || {}) as Record<string, unknown>
  const temperature = typeof settings.temperature === "number" ? settings.temperature : 0.7
  const maxTokens = typeof settings.maxTokens === "number" ? settings.maxTokens : 4096
  const topP = typeof settings.topP === "number" ? settings.topP : 1.0

  const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      "X-Title": "MediaGenerator Chat",
    },
    body: JSON.stringify({
      model: chat.model,
      messages,
      temperature,
      max_tokens: maxTokens,
      top_p: topP,
      stream: true,
    }),
  })

  if (!upstream.ok || !upstream.body) {
    const err = await upstream.json().catch(() => ({}))
    const msg = (err as { error?: { message?: string } })?.error?.message
      || `OpenRouter ошибка: ${upstream.status}`
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  // Если OpenRouter вернул 200, но НЕ SSE (а просто JSON с ошибкой) — это бывает,
  // когда модель не найдена или провайдер отказал. Перехватываем заранее, чтобы не
  // зависнуть на чтении "стрима" который никогда не начнётся.
  const contentType = upstream.headers.get("content-type") || ""
  if (!contentType.includes("event-stream")) {
    const body = await upstream.text()
    let msg = "Модель не вернула поток. Возможно, она недоступна или не существует."
    try {
      const json = JSON.parse(body) as { error?: { message?: string; code?: number } }
      if (json.error?.message) msg = json.error.message
    } catch {
      if (body.trim()) msg = body.trim().slice(0, 300)
    }
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  // SSE поток наружу. На лету парсим OpenRouter SSE, отдаём клиенту чистый текст по чанку,
  // и накапливаем полный ответ, чтобы записать его в БД в конце.
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  let fullResponse = ""
  let tokensIn = 0
  let tokensOut = 0
  let upstreamError: string | null = null
  let upstreamFinishReason: string | null = null

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader()
      let buffer = ""

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() || ""

          for (const rawLine of lines) {
            const line = rawLine.trim()
            if (!line || !line.startsWith("data:")) continue
            const payload = line.slice(5).trim()
            if (payload === "[DONE]") continue
            try {
              const json = JSON.parse(payload) as {
                choices?: Array<{
                  delta?: { content?: string }
                  finish_reason?: string
                  native_finish_reason?: string
                }>
                usage?: { prompt_tokens?: number; completion_tokens?: number }
                error?: { message?: string; code?: number }
              }
              // OpenRouter может прислать ошибку прямо в SSE-чанке
              if (json.error?.message) {
                upstreamError = json.error.message
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ error: upstreamError })}\n\n`)
                )
                continue
              }
              if (json.usage) {
                tokensIn = json.usage.prompt_tokens || tokensIn
                tokensOut = json.usage.completion_tokens || tokensOut
              }
              const choice = json.choices?.[0]
              const delta = choice?.delta?.content
              if (delta) {
                fullResponse += delta
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`)
                )
              }
              if (choice?.finish_reason || choice?.native_finish_reason) {
                upstreamFinishReason = choice.finish_reason || choice.native_finish_reason || null
              }
            } catch {
              // Игнорируем некорректные SSE-фрагменты — OpenRouter иногда шлёт служебные строки
            }
          }
        }

        // Если модель завершилась но ничего не прислала — сообщаем явно
        if (!fullResponse.trim() && !upstreamError) {
          const hint = upstreamFinishReason
            ? `Модель вернула пустой ответ (причина: ${upstreamFinishReason}). Попробуйте другую модель или повторите запрос.`
            : "Модель не вернула содержимого. Возможно, она недоступна, перегружена или превысила таймаут. Попробуйте другую модель — например, Claude Sonnet 4.6 или GPT-5."
          upstreamError = hint
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: hint })}\n\n`))
        }

        // Финальное событие для клиента
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true, tokensIn, tokensOut })}\n\n`)
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : "stream error"
        upstreamError = msg
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`))
      } finally {
        // Сохранить ответ ассистента в БД (даже если поток оборвался — пишем то, что успели)
        if (fullResponse.trim()) {
          const totalCost = calculateChatCost(tokensIn, tokensOut, model.pricing)
          await db.insert(chatMessages).values({
            chatId,
            role: "assistant",
            content: fullResponse,
            model: chat.model,
            tokensIn: tokensIn || null,
            tokensOut: tokensOut || null,
            cost: totalCost.toFixed(6),
          })
          await db.update(chats).set({ updatedAt: new Date() }).where(eq(chats.id, chatId))

          // Учёт расхода в общем бюджете пользователя — тот же `totalSpent`,
          // что и для генерации/edit. Админ от этого не страдает (его лимиты не проверяются),
          // но мы всё равно фиксируем расход — для аналитики и истории.
          if (totalCost > 0) {
            await db
              .update(user)
              .set({
                totalSpent: sql`${user.totalSpent}::numeric + ${totalCost.toFixed(6)}::numeric`,
              })
              .where(eq(user.id, session.user.id))
          }

          // Авто-название для первого диалога. Не блокируем долго —
          // ставим внутренний таймаут на 5с и продолжаем закрывать стрим.
          if (isFirstMessage && chat.title === "Новый чат") {
            const titlePromise = generateChatTitle(apiKey, userMessage, fullResponse)
            const timeoutPromise = new Promise<null>((resolve) =>
              setTimeout(() => resolve(null), 5000)
            )
            const newTitle = await Promise.race([titlePromise, timeoutPromise])
            if (newTitle) {
              await db
                .update(chats)
                .set({ title: newTitle, updatedAt: new Date() })
                .where(eq(chats.id, chatId))
              try {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ title: newTitle })}\n\n`)
                )
              } catch {
                // контроллер уже мог быть закрыт — игнорируем
              }
            }
          }
        }

        try {
          controller.close()
        } catch {
          // уже закрыт
        }
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
