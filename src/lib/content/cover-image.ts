import { db } from "@/lib/db"
import { and, eq, sql } from "drizzle-orm"
import {
  contentRuns,
  generations,
  images,
  user,
} from "@/lib/db/schema"
import { getDecryptedApiKey } from "@/lib/actions/api-keys"
import { calculateChatCost } from "@/lib/utils/chat-cost"
import { getProvider } from "@/lib/providers/registry"
import { upload, ensureBucket } from "@/lib/storage/s3"
import { parseJsonFromMessage } from "./utils"

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
const PROMPT_HELPER_MODEL = "anthropic/claude-haiku-4.5"

/** Стилевые пресеты обложки — выбираются в UI. Влияют и на сам image-prompt, и на дефолтную модель. */
export type CoverStyle = "3d_with_text" | "minimalist" | "photo"

export const COVER_STYLE_LABELS: Record<CoverStyle, string> = {
  "3d_with_text": "3D-инфографика с русской подписью",
  minimalist: "Минималистичная редакторская иллюстрация",
  photo: "Фотореалистичная сцена",
}

interface StyleConfig {
  systemHint: string
  /** Хорошо работающая с этим стилем модель. */
  defaultProvider: string
  defaultModel: string
}

const STYLE_CONFIGS: Record<CoverStyle, StyleConfig> = {
  "3d_with_text": {
    systemHint: `Стиль обложки — стандарт телеграм-канала ЦФУ Групп (налоги/бизнес). Точно повторяй визуальный язык:

ФОН: насыщенный кобальтово-синий (#1f3aff – #2a44e0), однородный, без градиентов и текстур.

ОБЪЕКТЫ: 3D-иллюстрация в стиле клеймейшн / пластилина — мягкие матовые поверхности, лёгкие тени, чуть мультяшная стилизация. Один крупный центральный объект (документ, телефон, магазин, судья, конвейер и т.п.) плюс 1-3 поддерживающих элемента вокруг. Перспектива слегка изометричная.

ПАЛИТРА ОБЪЕКТОВ: лавандово-фиолетовый (#a6a8e6), мятно-зелёный (#9be38b), тёплый бежевый (#e8d8c4), белый, чёрный, редкие красные акценты (#e15a4f). Без металлик и градиентов внутри объектов — только матовый цвет и мягкая тень.

ВЕРХНИЙ ЛЕВЫЙ УГОЛ: оставь пустую область примерно 15% ширины × 15% высоты — туда вручную наложат логотип. Не рисуй ничего в этом углу.

ПЛАШКА С ЗАГОЛОВКОМ: внизу картинки тёмная капсула / прямоугольник со скруглёнными углами (#0e0e0e или #141414, 90% непрозрачности), занимает 35-40% высоты картинки. На ней — короткая русская фраза-заголовок (3-7 слов) белым sans-serif шрифтом (жирное начертание), плюс 1-2 ключевых слова в фразе выделены жёлтым (#f2e64d). По возможности — короткий бейдж-категория над заголовком: компактная капсула на жёлтом фоне с тёмным текстом ("Дайджест", "Судебная практика", "Новости" — что подходит к посту).

КОМПОЗИЦИЯ: квадратный формат 1:1. Центральный объект — в верхней половине, плашка с текстом — в нижней. Без рамок, без виньетирования, без водяных знаков.

ЗАПРЕТЫ: никаких реальных логотипов, кроме чистой пустой области под лого; никаких узнаваемых лиц, брендов, флагов государств (флаги допустимы только если они напрямую часть смысла поста — например карта Китая в новости про карго). Никакого английского текста на самой картинке (кроме случаев, когда конкретное английское слово — часть темы поста, например "Sale" в новости про вывески).

ТЕКСТ НА ПЛАШКЕ: только тот, что я укажу в russian_caption и russian_badge. Никаких других надписей нигде.`,
    // gpt-image-2 — самая свежая модель OpenAI, лучше всех справляется с кириллицей.
    defaultProvider: "openai",
    defaultModel: "gpt-image-2",
  },
  minimalist: {
    systemHint: `Стиль — минималистичная редакторская иллюстрация: одна большая визуальная метафора, мягкие градиенты, тёплая палитра, плоская графика, без текста, без логотипов, без реальных людей.`,
    defaultProvider: "openrouter",
    defaultModel: "google/gemini-3.1-flash-image-preview",
  },
  photo: {
    systemHint: `Стиль — фотореалистичная редакторская фотография: один объект-метафора, естественное освещение, неглубокая глубина резкости, без людей в кадре крупным планом, без текста, без логотипов.`,
    defaultProvider: "openrouter",
    defaultModel: "google/gemini-3-pro-image-preview",
  },
}

function buildCoverPromptSystem(style: CoverStyle): string {
  const cfg = STYLE_CONFIGS[style]
  const wantsRussianText = style === "3d_with_text"
  const aspect = style === "3d_with_text" ? "1:1 (square)" : "16:9"
  return `Ты помогаешь придумать промпт для генерации обложки к Telegram-посту канала ЦФУ Групп (налоги, бизнес, юриспруденция).

На входе — готовый русский пост. Верни только JSON:
{
  "prompt": "<image prompt на английском, описывающий сцену; русские надписи внутри prompt пиши в кавычках кириллицей>",
  "russian_caption": "<главный заголовок плашки 3-7 слов или пустая строка>",
  "russian_badge": "<категория-бейдж 1-2 слова: \\"Дайджест\\" / \\"Судебная практика\\" / \\"Новости\\" / \\"Кейс\\" / \\"Разбор\\" — или пустая строка>"
}

Правила:
- 60-120 слов в prompt.
- Описать конкретную визуальную метафору сути поста — НЕ дословную иллюстрацию.
- Один сильный центральный 3D-объект + 1-3 поддерживающих. Конкретно назови, что это за объекты (например: "a stylized 3D customs scanner with a parcel on conveyor, a checklist, and a map of China"; или "a 3D judge in a wig and a worried businessman with documents on a desk").
- Аспект ${aspect}. Edge-to-edge композиция.
- Без логотипов брендов, без узнаваемых лиц политиков/звёзд.
${wantsRussianText
  ? `- В prompt явно укажи: в нижней части кадра тёмная плашка-капсула с белым русским заголовком "<russian_caption>", где 1-2 ключевых слова окрашены жёлтым; если есть бейдж, опиши его как жёлтую капсулу-табличку над заголовком со словом "<russian_badge>".\n- В prompt укажи: верхний левый угол оставить пустым для последующего наложения логотипа (просто фоновый цвет, без объектов).\n- russian_caption формулируй сильно, в формате реальных постов канала: "ФНС представила результаты", "Когда уточнёнка — злоупотребление?", "Белый импорт по цене карго", "Москва запустила сервис проверки вывесок".\n- 1-2 слова в russian_caption должны быть смысловыми акцентами — это слова, которые на картинке будут жёлтыми.`
  : `- Текст на картинке отсутствует. russian_caption и russian_badge оставь пустыми.`}

Стилевые рамки этой обложки:
${cfg.systemHint}`
}

interface CoverImageInput {
  runId: string
  userId: string
  /** Опционально — пользовательский промпт. Если не задан, сгенерим из текста поста. */
  promptOverride?: string
  /** Стиль обложки — влияет на хелпер-промпт и дефолтную модель. */
  style?: CoverStyle
  /** Провайдер/модель для генерации картинки. По умолчанию подбирается по стилю. */
  provider?: string
  model?: string
}

interface CoverImageResult {
  imageId: string
  imageUrl: string
  prompt: string
  style: CoverStyle
  cost: number
  /** Полная история обложек этого run-а — UI рендерит миниатюры. */
  history: Array<{
    imageId: string
    prompt: string
    style?: string
    createdAt: string
  }>
  /** Обновлённая общая стоимость run-а — чтобы фронт не дёргал отдельный запрос. */
  totalCost: number
}

/** Через Claude Haiku превращаем русский пост в image-prompt подходящего стиля. */
async function buildCoverPrompt(args: {
  apiKey: string
  postText: string
  style: CoverStyle
}): Promise<{ prompt: string; cost: number }> {
  const truncated = args.postText.slice(0, 4000)
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: PROMPT_HELPER_MODEL,
      temperature: 0.5,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildCoverPromptSystem(args.style) },
        { role: "user", content: truncated },
      ],
    }),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`prompt-helper ${response.status}: ${body.slice(0, 240)}`)
  }
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
    error?: { message?: string }
  }
  if (data.error?.message) throw new Error(data.error.message)
  const raw = data.choices?.[0]?.message?.content || ""
  let prompt = ""
  let russianCaption = ""
  let russianBadge = ""
  try {
    // parseJsonFromMessage умеет разобрать JSON, даже если модель обернула
    // его в ```json fences или в пояснительный текст вокруг.
    const parsed = parseJsonFromMessage<{
      prompt?: string
      russian_caption?: string
      russian_badge?: string
    }>(raw)
    prompt = String(parsed.prompt || "").trim()
    russianCaption = String(parsed.russian_caption || "").trim()
    russianBadge = String(parsed.russian_badge || "").trim()
  } catch {
    // На крайний случай — снимем markdown-обёртки и используем как есть.
    prompt = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim()
  }
  if (!prompt) {
    throw new Error("Не удалось сформировать промпт обложки")
  }
  // Если хелпер забыл явно вписать caption/badge в prompt — дополним сами.
  if (args.style === "3d_with_text") {
    if (
      russianCaption &&
      !prompt.toLowerCase().includes(russianCaption.toLowerCase())
    ) {
      prompt = `${prompt} The dark rounded caption bar at the bottom contains the Russian headline "${russianCaption}" in bold white sans-serif Cyrillic; emphasize 1-2 key words in bright yellow #f2e64d.`
    }
    if (
      russianBadge &&
      !prompt.toLowerCase().includes(russianBadge.toLowerCase())
    ) {
      prompt = `${prompt} Above the caption bar there is a small yellow pill-badge with the Russian word "${russianBadge}" in dark text.`
    }
    if (!prompt.toLowerCase().includes("top-left") && !prompt.toLowerCase().includes("top left")) {
      prompt = `${prompt} Leave the top-left corner of the image visually empty (uniform cobalt blue background, no objects, no text) — that area is reserved for a logo placed later.`
    }
  }
  const cost = calculateChatCost(
    data.usage?.prompt_tokens || 0,
    data.usage?.completion_tokens || 0,
    { input: 1.0, output: 5.0 },
  )
  return { prompt, cost }
}

export async function generateCoverImage(input: CoverImageInput): Promise<CoverImageResult> {
  const [run] = await db
    .select()
    .from(contentRuns)
    .where(and(eq(contentRuns.id, input.runId), eq(contentRuns.userId, input.userId)))
    .limit(1)
  if (!run) throw new Error("Запуск не найден")
  if (!run.postText) throw new Error("Пост ещё не готов — обложка генерируется после поста")

  const style: CoverStyle = input.style || "3d_with_text"
  const styleCfg = STYLE_CONFIGS[style]
  const providerId = input.provider || styleCfg.defaultProvider
  const modelId = input.model || styleCfg.defaultModel

  const orKey = await getDecryptedApiKey(input.userId, "openrouter")
  if (!orKey) throw new Error("Нет ключа OpenRouter (нужен для помощника обложки)")

  // Шаг 1: построить промпт (или взять из override)
  let prompt = (input.promptOverride || "").trim()
  let helperCost = 0
  if (!prompt) {
    const helper = await buildCoverPrompt({ apiKey: orKey, postText: run.postText, style })
    prompt = helper.prompt
    helperCost = helper.cost
  }

  // Шаг 2: сгенерировать картинку через существующий провайдер
  const providerApiKey = await getDecryptedApiKey(input.userId, providerId)
  if (!providerApiKey) throw new Error(`Нет ключа для провайдера ${providerId}`)

  const provider = getProvider(providerId)
  // 3D-стиль идёт в квадрате (стандарт телеграм-каналов), остальные — 16:9.
  // OpenAI gpt-image принимает size/quality, OpenRouter — aspect_ratio/image_size.
  const isSquare = style === "3d_with_text"
  const params: Record<string, unknown> =
    providerId === "openai"
      ? {
          size: isSquare ? "1024x1024" : "1536x1024",
          quality: "medium",
          output_format: "png",
        }
      : {
          aspect_ratio: isSquare ? "1:1" : "16:9",
          image_size: "1K",
        }
  const result = await provider.generate({
    model: modelId,
    prompt,
    params,
    count: 1,
    apiKey: providerApiKey,
  })
  if (!result.images.length) {
    throw new Error("Провайдер не вернул картинку")
  }

  const img = result.images[0]
  await ensureBucket()

  // Создаём запись generation чтобы картинка попала в библиотеку/историю
  const [generationRow] = await db
    .insert(generations)
    .values({
      userId: input.userId,
      provider: providerId,
      model: modelId,
      prompt,
      params: { ...params, source: "content-cover", runId: input.runId },
      status: "done",
      imagesCount: 1,
      cost: result.cost.toFixed(4),
      completedAt: new Date(),
    })
    .returning({ id: generations.id })

  const s3Key = `users/${input.userId}/covers/${generationRow.id}-0.${img.format}`
  await upload(s3Key, img.data, `image/${img.format}`)

  const [imageRow] = await db
    .insert(images)
    .values({
      generationId: generationRow.id,
      s3Key,
      s3Url: `/api/images/${generationRow.id}-0`,
      width: img.width,
      height: img.height,
      format: img.format,
      sizeBytes: img.data.byteLength,
      metadata: { source: "content-cover", runId: input.runId },
    })
    .returning({ id: images.id })

  // Списываем helper + image cost и обновляем артефакты
  const stepCost = helperCost + result.cost
  const prevTotal = (run.costs?.total as number) || 0
  const newTotal = prevTotal + stepCost
  // Добавляем новую обложку в историю и делаем её активной.
  const prevHistory = Array.isArray(run.artifacts?.coverImages)
    ? run.artifacts.coverImages
    : []
  const newCoverEntry = {
    imageId: imageRow.id,
    prompt,
    style,
    createdAt: new Date().toISOString(),
  }
  const newHistory = [...prevHistory, newCoverEntry]
  await db
    .update(contentRuns)
    .set({
      artifacts: sql`${contentRuns.artifacts} || ${JSON.stringify({
        coverImageId: imageRow.id,
        coverImagePrompt: prompt,
        coverImages: newHistory,
      })}::jsonb`,
      costs: sql`${contentRuns.costs} || ${JSON.stringify({
        cover: ((run.costs?.cover as number) || 0) + stepCost,
        total: newTotal,
      })}::jsonb`,
    })
    .where(eq(contentRuns.id, input.runId))

  if (stepCost > 0) {
    await db
      .update(user)
      .set({
        totalSpent: sql`${user.totalSpent}::numeric + ${stepCost.toFixed(6)}::numeric`,
      })
      .where(eq(user.id, input.userId))
  }

  return {
    imageId: imageRow.id,
    imageUrl: `/api/images/${imageRow.id}`,
    prompt,
    style,
    cost: stepCost,
    history: newHistory,
    totalCost: newTotal,
  }
}

/**
 * Переключение активной обложки на одну из ранее сгенерированных.
 * Без затрат — просто меняем `coverImageId` в артефактах.
 */
export async function selectActiveCover(args: {
  runId: string
  userId: string
  imageId: string
}): Promise<{ ok: true }> {
  const [run] = await db
    .select()
    .from(contentRuns)
    .where(and(eq(contentRuns.id, args.runId), eq(contentRuns.userId, args.userId)))
    .limit(1)
  if (!run) throw new Error("Запуск не найден")
  const history = Array.isArray(run.artifacts?.coverImages) ? run.artifacts.coverImages : []
  const found = history.find((c) => c.imageId === args.imageId)
  if (!found) throw new Error("Этой обложки нет в истории запуска")
  await db
    .update(contentRuns)
    .set({
      artifacts: sql`${contentRuns.artifacts} || ${JSON.stringify({
        coverImageId: found.imageId,
        coverImagePrompt: found.prompt,
      })}::jsonb`,
    })
    .where(eq(contentRuns.id, args.runId))
  return { ok: true }
}
