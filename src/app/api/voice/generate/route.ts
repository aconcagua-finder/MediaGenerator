import { NextRequest, NextResponse } from "next/server"
import { eq, and, gte, sql } from "drizzle-orm"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { voiceGenerations, user } from "@/lib/db/schema"
import { getDecryptedApiKey } from "@/lib/actions/api-keys"
import {
  getVoiceModel,
  resolveVoice,
  clampSpeed,
  estimateVoiceCost,
  sanitizeTtsSettings,
  voiceLabel,
} from "@/lib/providers/voice-models"
import { runVoiceGeneration } from "@/lib/voice/generate"

interface GenerateVoiceBody {
  model: string
  text: string
  voice?: string
  speed?: number
  /** ElevenLabs: имя голоса из каталога (подпись в библиотеке) */
  voiceName?: string
  /** ElevenLabs: тонкие настройки (санитизируются по модели) */
  settings?: unknown
}

export async function POST(request: NextRequest) {
  try {
    // 1. Авторизация
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
    }

    // 2. Парсинг и валидация
    const body = (await request.json()) as GenerateVoiceBody
    const { model } = body
    const text = (body.text || "").trim()

    if (!model || !text) {
      return NextResponse.json({ error: "Модель и текст обязательны" }, { status: 400 })
    }

    const voiceModel = getVoiceModel(model)
    if (!voiceModel) {
      return NextResponse.json({ error: `Неизвестная модель озвучки: ${model}` }, { status: 400 })
    }
    if (!voiceModel.available) {
      return NextResponse.json(
        { error: `Модель «${voiceModel.name}» сейчас недоступна. Выберите другую.` },
        { status: 400 },
      )
    }
    if (text.length > voiceModel.maxChars) {
      return NextResponse.json(
        { error: `Слишком длинный текст: ${text.length}/${voiceModel.maxChars} символов.` },
        { status: 400 },
      )
    }

    // Санитизация параметров по возможностям модели. ElevenLabs: скорость и
    // прочее — внутри settings (voice_settings), имя голоса — для подписи.
    const voice = resolveVoice(voiceModel, body.voice)
    const isElevenLabs = voiceModel.provider === "elevenlabs"
    const params: Record<string, unknown> = isElevenLabs
      ? {
          voice_name: voiceLabel(voiceModel, voice, body.voiceName),
          settings: sanitizeTtsSettings(voiceModel, body.settings),
        }
      : { speed: clampSpeed(voiceModel, body.speed) }

    const isAdmin = session.user.role === "admin"
    const estimate = estimateVoiceCost(voiceModel, text.length)

    // 3. Лимиты пользователя (как у видео)
    const [userData] = await db
      .select({
        dailyLimit: user.dailyLimit,
        costLimit: user.costLimit,
        totalSpent: user.totalSpent,
        maxGenerations: user.maxGenerations,
        banned: user.banned,
        banReason: user.banReason,
      })
      .from(user)
      .where(eq(user.id, session.user.id))

    if (userData?.banned) {
      return NextResponse.json(
        { error: userData.banReason ? `Аккаунт заблокирован: ${userData.banReason}` : "Аккаунт заблокирован" },
        { status: 403 },
      )
    }

    if (!isAdmin && userData) {
      // 3a. Бюджет
      const spent = parseFloat(userData.totalSpent) || 0
      const limit = parseFloat(userData.costLimit) || 0
      if (limit > 0 && spent + estimate > limit) {
        return NextResponse.json(
          { error: `Лимит бюджета исчерпан ($${limit.toFixed(2)}). Сократите текст или выберите модель дешевле.` },
          { status: 429 },
        )
      }

      // 3b. Дневной лимит — по таблице voice_generations
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const [todayCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(voiceGenerations)
        .where(
          and(
            eq(voiceGenerations.userId, session.user.id),
            gte(voiceGenerations.createdAt, todayStart),
          ),
        )
      if (todayCount.count >= userData.dailyLimit) {
        return NextResponse.json(
          { error: `Дневной лимит озвучки исчерпан (${userData.dailyLimit})` },
          { status: 429 },
        )
      }

      // 3c. Общий лимит генераций
      if (userData.maxGenerations !== null) {
        const [totalCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(voiceGenerations)
          .where(eq(voiceGenerations.userId, session.user.id))
        if (totalCount.count >= userData.maxGenerations) {
          return NextResponse.json(
            { error: `Общий лимит генераций исчерпан (${userData.maxGenerations})` },
            { status: 429 },
          )
        }
      }
    }

    // 4. Ключ провайдера модели (OpenRouter — тот же, что у картинок/видео; ElevenLabs — свой)
    const apiKey = await getDecryptedApiKey(session.user.id, voiceModel.provider)
    if (!apiKey) {
      return NextResponse.json(
        {
          error: isElevenLabs
            ? "Нужен ключ ElevenLabs. Администратор добавляет его в Настройках."
            : "API ключ OpenRouter не настроен. Добавьте его в Настройках.",
        },
        { status: 400 },
      )
    }

    // 5. Создаём запись (processing)
    const [generation] = await db
      .insert(voiceGenerations)
      .values({
        userId: session.user.id,
        provider: voiceModel.provider,
        model,
        text,
        voice,
        format: voiceModel.outputFormat,
        params,
        status: "processing",
      })
      .returning({ id: voiceGenerations.id })

    // 6. Синхронный синтез: сразу синтезируем, кладём в S3 и списываем по факту
    const outcome = await runVoiceGeneration(generation.id, apiKey)

    if (outcome.status === "done") {
      return NextResponse.json({
        voiceGenerationId: generation.id,
        status: "done",
        audio: outcome.audio,
        cost: outcome.cost,
      })
    }

    const errMsg = outcome.status === "error" ? outcome.error : "Не удалось синтезировать речь"
    return NextResponse.json({ error: errMsg }, { status: 502 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Внутренняя ошибка сервера"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
