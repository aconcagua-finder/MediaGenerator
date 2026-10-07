/**
 * Аудит СТАТИЧЕСКИХ реестров моделей (text / video / openrouter-image) против
 * живого API OpenRouter. Дополняет `model-checker.ts`, который покрывает только
 * image-провайдеры в БД (`model_registry`) и не видит ни text/video, ни цены.
 *
 * Что ловит (по факту, не по «суждению»):
 *  - text: модель пропала из OpenRouter ИЛИ её цена (за токен) уехала >порога;
 *  - video: появилась новая / пропала наша модель;
 *  - openrouter-image: наша модель реально отдаёт 404 (с учётом того, что
 *    FLUX/Seedream НЕ попадают в дефолтный `?output_modalities=image`, поэтому
 *    их проверяем точечно через `/models/{slug}/endpoints`).
 *
 * Глубокая курация (описания, русская озвучка, форматы, даты deprecation из
 * changelog'ов провайдеров) — НЕ дело этого крона; это делает периодический
 * облачный аудит-роутинг. Здесь — дешёвая «растяжка» с уведомлением админу.
 *
 * Чистое ядро (`auditTextPricing`, `auditModelSet`) покрыто
 * `tests/registry-audit.test.ts`.
 */

import { eq } from "drizzle-orm"
import { db } from "../db"
import { user } from "../db/schema"
import { getDecryptedApiKey } from "../actions/api-keys"
import { createNotification } from "../actions/notifications"
import { TEXT_MODELS } from "../providers/text-models"
import { VIDEO_MODELS, VIDEO_PRICING_SKUS } from "../providers/video-models"
import { VOICE_MODELS } from "../providers/voice-models"
import { SEED_MODELS } from "../providers/seed-models"

const OPENROUTER_BASE = "https://openrouter.ai/api/v1"

// ---------- Чистое ядро (без I/O, тестируемое) ----------

export interface TextPriceRow {
  id: string
  name: string
  input: number
  output: number
}

export interface LiveTextPrice {
  input: number
  output: number
}

export interface TextDrift {
  id: string
  name: string
  field: "input" | "output"
  was: number
  now: number
}

/**
 * Сверяет цены наших текстовых моделей с живыми (обе стороны — за 1М токенов).
 * Алерт по дрейфу: относительное отклонение > relThreshold И абсолютное ≥ absMin
 * (чтобы не шуметь на округлениях вроде 0.43 ↔ 0.435).
 */
export function auditTextPricing(
  registry: TextPriceRow[],
  live: Map<string, LiveTextPrice>,
  relThreshold = 0.05,
  absMin = 0.01,
): { missing: { id: string; name: string }[]; drift: TextDrift[] } {
  const missing: { id: string; name: string }[] = []
  const drift: TextDrift[] = []

  for (const m of registry) {
    const l = live.get(m.id)
    if (!l) {
      missing.push({ id: m.id, name: m.name })
      continue
    }
    for (const field of ["input", "output"] as const) {
      const was = m[field]
      const now = l[field]
      if (!isFinite(now)) continue
      const absDiff = Math.abs(now - was)
      const relDiff = was > 0 ? absDiff / was : (now > 0 ? Infinity : 0)
      if (absDiff >= absMin && relDiff > relThreshold) {
        drift.push({ id: m.id, name: m.name, field, was, now })
      }
    }
  }
  return { missing, drift }
}

/**
 * Симметричная сверка множеств моделей (для video): что появилось у провайдера,
 * чего у нас нет (added) и что есть у нас, но пропало у провайдера (removed).
 */
export function auditModelSet(
  ourIds: string[],
  liveModels: { id: string; name?: string }[],
): { removed: string[]; added: { id: string; name: string }[] } {
  const ourSet = new Set(ourIds)
  const liveSet = new Set(liveModels.map((m) => m.id))
  const removed = ourIds.filter((id) => !liveSet.has(id))
  const added = liveModels
    .filter((m) => !ourSet.has(m.id))
    .map((m) => ({ id: m.id, name: m.name || m.id }))
  return { removed, added }
}

export interface SkuDrift {
  id: string
  /** человекочитаемые изменения по каждому уехавшему/новому/пропавшему SKU */
  changes: string[]
}

/**
 * Сверяет сырые `pricing_skus` видеомоделей со снимком, из которого выведены наши
 * цены (VIDEO_PRICING_SKUS). Флагует изменившиеся значения (>relThreshold), новые и
 * пропавшие SKU-ключи. Модель, вовсе исчезнувшую с провайдера, не трогаем — её ловит
 * auditModelSet. Это закрывает слепую зону: раньше дрейф цен видео не отслеживался,
 * из-за чего оценка Seedance молча разошлась с реальностью в 5 раз.
 */
export function auditVideoPricing(
  snapshot: Record<string, Record<string, number>>,
  live: Map<string, Record<string, number>>,
  relThreshold = 0.05,
): SkuDrift[] {
  const drift: SkuDrift[] = []
  for (const [id, refSkus] of Object.entries(snapshot)) {
    const liveSkus = live.get(id)
    if (!liveSkus) continue
    const changes: string[] = []
    for (const [k, was] of Object.entries(refSkus)) {
      const now = liveSkus[k]
      if (now == null) {
        changes.push(`${k}: пропал (был ${was})`)
        continue
      }
      const absDiff = Math.abs(now - was)
      const relDiff = was > 0 ? absDiff / was : now > 0 ? Infinity : 0
      if (relDiff > relThreshold) changes.push(`${k}: ${was}→${now}`)
    }
    for (const k of Object.keys(liveSkus)) {
      if (!(k in refSkus)) changes.push(`${k}: новый (${liveSkus[k]})`)
    }
    if (changes.length) drift.push({ id, changes })
  }
  return drift
}

// ---------- Оркестратор (с I/O) ----------

async function getOpenRouterKey(): Promise<string | null> {
  try {
    const [admin] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.role, "admin"))
      .limit(1)
    if (!admin) return null
    return await getDecryptedApiKey(admin.id, "openrouter")
  } catch {
    return null
  }
}

function authHeaders(key: string | null): Record<string, string> {
  return key ? { Authorization: `Bearer ${key}` } : {}
}

async function fetchJson(url: string, key: string | null): Promise<unknown | null> {
  try {
    const res = await fetch(url, { headers: authHeaders(key) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

const perMillion = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN
  return isFinite(n) ? n * 1_000_000 : NaN
}

/**
 * Пробует, жив ли конкретный slug на OpenRouter (для FLUX/Seedream, которых нет
 * в дефолтном списке). true — есть активный image-эндпоинт; false — 404/нет.
 */
async function isSlugLive(slug: string, key: string | null): Promise<boolean> {
  const data = (await fetchJson(`${OPENROUTER_BASE}/models/${slug}/endpoints`, key)) as
    | { data?: { endpoints?: Array<{ status?: number }> } }
    | null
  const eps = data?.data?.endpoints
  return Array.isArray(eps) && eps.length > 0
}

export interface RegistryAuditSummary {
  textMissing: number
  textDrift: number
  videoAdded: number
  videoRemoved: number
  videoPriceDrift: number
  voiceAdded: number
  voiceRemoved: number
  imageGone: number
  skipped?: string
}

export async function runRegistryAudit(): Promise<RegistryAuditSummary> {
  const key = await getOpenRouterKey()

  const summary: RegistryAuditSummary = {
    textMissing: 0,
    textDrift: 0,
    videoAdded: 0,
    videoRemoved: 0,
    videoPriceDrift: 0,
    voiceAdded: 0,
    voiceRemoved: 0,
    imageGone: 0,
  }

  // ---- TEXT: цены и наличие ----
  const modelsResp = (await fetchJson(`${OPENROUTER_BASE}/models`, key)) as
    | { data?: Array<{ id: string; pricing?: { prompt?: unknown; completion?: unknown } }> }
    | null

  if (modelsResp?.data) {
    const liveText = new Map<string, LiveTextPrice>()
    const liveIds = new Set<string>()
    for (const m of modelsResp.data) {
      liveIds.add(m.id)
      liveText.set(m.id, {
        input: perMillion(m.pricing?.prompt),
        output: perMillion(m.pricing?.completion),
      })
    }

    const { missing, drift } = auditTextPricing(
      TEXT_MODELS.map((t) => ({ id: t.id, name: t.name, input: t.pricing.input, output: t.pricing.output })),
      liveText,
    )
    summary.textMissing = missing.length
    summary.textDrift = drift.length

    if (missing.length) {
      await createNotification({
        type: "model_update",
        title: "Текстовые модели: пропали из OpenRouter",
        message: `Больше не отдаются API: ${missing.map((m) => m.name).join(", ")}. Проверьте text-models.ts.`,
      })
    }
    if (drift.length) {
      const lines = drift
        .map((d) => `${d.name} ${d.field === "input" ? "вход" : "выход"} $${d.was}→$${d.now.toFixed(2)}/1М`)
        .join("; ")
      await createNotification({
        type: "model_update",
        title: "Текстовые модели: изменились цены",
        message: `${lines}. Обновите pricing в text-models.ts.`,
      })
    }
  }

  // ---- VIDEO: появление/исчезновение + дрейф цен ----
  const videoResp = (await fetchJson(`${OPENROUTER_BASE}/videos/models`, key)) as
    | { data?: Array<{ id: string; name?: string; pricing_skus?: Record<string, unknown> }> }
    | null

  if (videoResp?.data) {
    // fal-модели (Kling Motion Control и т.п.) в списке OpenRouter не бывают —
    // сверяем только то, что реально вызывается через OpenRouter
    const { removed, added } = auditModelSet(
      VIDEO_MODELS.filter((v) => (v.provider ?? "openrouter") === "openrouter").map((v) => v.id),
      videoResp.data.map((m) => ({ id: m.id, name: m.name })),
    )
    summary.videoAdded = added.length
    summary.videoRemoved = removed.length

    if (added.length) {
      await createNotification({
        type: "model_update",
        title: "Видео: новые модели на OpenRouter",
        message: `Доступны новые: ${added.map((m) => `${m.name} (${m.id})`).join(", ")}. Добавьте в video-models.ts при необходимости.`,
      })
    }
    if (removed.length) {
      await createNotification({
        type: "model_update",
        title: "Видео: модели пропали с OpenRouter",
        message: `Больше не доступны: ${removed.join(", ")}. Уберите из video-models.ts.`,
      })
    }

    // Дрейф цен: сверяем живые pricing_skus со снимком, из которого выведены наши цены
    const liveSkus = new Map<string, Record<string, number>>()
    for (const m of videoResp.data) {
      if (!m.pricing_skus) continue
      const parsed: Record<string, number> = {}
      for (const [k, v] of Object.entries(m.pricing_skus)) {
        const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN
        if (isFinite(n)) parsed[k] = n
      }
      liveSkus.set(m.id, parsed)
    }
    const priceDrift = auditVideoPricing(VIDEO_PRICING_SKUS, liveSkus)
    summary.videoPriceDrift = priceDrift.length
    if (priceDrift.length) {
      const lines = priceDrift.map((d) => `${d.id} (${d.changes.join(", ")})`).join("; ")
      await createNotification({
        type: "model_update",
        title: "Видео: изменились цены у OpenRouter",
        message: `SKU разошлись со снимком: ${lines}. Пересчитайте price и обновите VIDEO_PRICING_SKUS в video-models.ts.`,
      })
    }
  }

  // ---- VOICE (TTS): появление/исчезновение speech-моделей ----
  const voiceResp = (await fetchJson(`${OPENROUTER_BASE}/models?output_modalities=speech`, key)) as
    | { data?: Array<{ id: string; name?: string }> }
    | null

  if (voiceResp?.data) {
    const { removed, added } = auditModelSet(
      VOICE_MODELS.map((v) => v.id),
      voiceResp.data.map((m) => ({ id: m.id, name: m.name })),
    )
    summary.voiceAdded = added.length
    summary.voiceRemoved = removed.length

    if (added.length) {
      await createNotification({
        type: "model_update",
        title: "Озвучка: новые TTS-модели на OpenRouter",
        message: `Доступны новые: ${added.map((m) => `${m.name} (${m.id})`).join(", ")}. Добавьте в voice-models.ts при необходимости.`,
      })
    }
    if (removed.length) {
      await createNotification({
        type: "model_update",
        title: "Озвучка: TTS-модели пропали с OpenRouter",
        message: `Больше не доступны: ${removed.join(", ")}. Уберите из voice-models.ts.`,
      })
    }
  }

  // ---- OPENROUTER-IMAGE: точечная проверка наличия (закрывает слепую зону) ----
  const imageIds = SEED_MODELS.filter((m) => m.provider === "openrouter").map((m) => m.modelId)
  const gone: string[] = []
  for (const id of imageIds) {
    const live = await isSlugLive(id, key)
    if (!live) gone.push(id)
  }
  summary.imageGone = gone.length
  if (gone.length) {
    await createNotification({
      type: "model_update",
      title: "Image (OpenRouter): модели недоступны",
      message: `Slug'и отдают 404/без эндпоинтов: ${gone.join(", ")}. Проверьте seed-models.ts.`,
    })
  }

  return summary
}
