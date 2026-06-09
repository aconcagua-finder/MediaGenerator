import { spawn } from "node:child_process"
import { mkdir, writeFile, readFile, rm, stat, readdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { and, asc, eq, lt } from "drizzle-orm"
import { db } from "@/lib/db"
import { videoCompositions, videoCompositionSegments, videos } from "@/lib/db/schema"
import { downloadBuffer, upload, ensureBucket } from "@/lib/storage/s3"
import {
  buildComposeGraph,
  segmentDuration,
  type ComposeGraphSegment,
  type ComposeOutput,
} from "./compose-graph"

/**
 * Воркер склейки видео. Локальная ffmpeg-задача, зеркалит job-флоу
 * `finalize.ts`: claim `processing → saving` (race-safe), скачивание исходников
 * из S3 в /tmp, ffmpeg-рендер, выгрузка mp4 в S3, вставка строки в `videos`
 * (через `composition_id`) — после чего склейка появляется в библиотеке как
 * обычное видео. Стоимости нет (рендер локальный), `user.totalSpent` не трогаем.
 *
 * Рендер запускается СРАЗУ из submit-роута (`void runComposeJob(id)`), клиент
 * лишь опрашивает статус. Если процесс умер посреди рендера — зависшую задачу
 * добивает cron (`reconcileStaleCompositions`).
 *
 * Глобальный лимит «один ffmpeg за раз» обеспечивается in-process мьютексом
 * (деплой — один app-контейнер) плюс DB-claim от двойной обработки.
 */

const FFMPEG_BIN = process.env.FFMPEG_PATH || "ffmpeg"
const FFPROBE_BIN = process.env.FFPROBE_PATH || "ffprobe"

export const MAX_SEGMENTS = 12
export const MAX_TOTAL_DURATION_SEC = 600 // 10 минут — потолок против бесконечного рендера

// ---- Параметры вывода ----

export type Orientation = "landscape" | "portrait"

/** Холст 720-класса по ориентации (чётные стороны для h264). */
export function deriveCanvas(orientation: Orientation): { width: number; height: number } {
  return orientation === "portrait" ? { width: 720, height: 1280 } : { width: 1280, height: 720 }
}

/** Привести произвольный jsonb params к валидным настройкам вывода. */
export function normalizeOutput(params: unknown): ComposeOutput & { orientation: Orientation } {
  const p = (params || {}) as Record<string, unknown>
  const orientation: Orientation = p.orientation === "portrait" ? "portrait" : "landscape"
  const canvas = deriveCanvas(orientation)
  const width = typeof p.width === "number" && p.width > 0 ? p.width : canvas.width
  const height = typeof p.height === "number" && p.height > 0 ? p.height : canvas.height
  const fps = typeof p.fps === "number" ? Math.min(60, Math.max(1, Math.round(p.fps))) : 30
  const audio = p.audio !== false // по умолчанию со звуком
  return { orientation, width, height, fps, audio }
}

// ---- In-process сериализация: один ffmpeg за раз ----

let chain: Promise<unknown> = Promise.resolve()
const inFlight = new Set<string>()

function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const result = chain.then(fn, fn)
  chain = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

/**
 * Поставить задачу склейки в очередь рендера. Идемпотентно: повторный вызов для
 * той же задачи (eager submit + поллинг + cron) игнорируется, пока она в работе.
 */
export function runComposeJob(compositionId: string): Promise<void> {
  if (inFlight.has(compositionId)) return Promise.resolve()
  inFlight.add(compositionId)
  return runExclusive(() => processComposition(compositionId))
    .catch((err) => {
      console.error(`[video/compose] ${compositionId}:`, err instanceof Error ? err.message : err)
    })
    .finally(() => inFlight.delete(compositionId))
}

// ---- Основной процесс одной склейки ----

interface SegRow {
  sourceVideoId: string | null
  s3Key: string | null
  dbDuration: number | null
  hasAudio: boolean | null
  trimStart: number | null
  trimEnd: number | null
  mute: boolean
}

async function processComposition(id: string): Promise<void> {
  const [comp] = await db
    .select({ status: videoCompositions.status, params: videoCompositions.params })
    .from(videoCompositions)
    .where(eq(videoCompositions.id, id))

  if (!comp || comp.status === "done" || comp.status === "error") return

  // Claim: processing → saving. Пусто → задачу уже забрали (другой опрос/cron).
  const claimed = await db
    .update(videoCompositions)
    .set({ status: "saving", progress: 0 })
    .where(and(eq(videoCompositions.id, id), eq(videoCompositions.status, "processing")))
    .returning({ id: videoCompositions.id })
  if (claimed.length === 0) return

  const workDir = join(tmpdir(), "mg-compose", id)

  try {
    const segRows = (await db
      .select({
        sourceVideoId: videoCompositionSegments.sourceVideoId,
        s3Key: videos.s3Key,
        dbDuration: videos.durationSeconds,
        hasAudio: videos.hasAudio,
        trimStart: videoCompositionSegments.trimStartSeconds,
        trimEnd: videoCompositionSegments.trimEndSeconds,
        mute: videoCompositionSegments.mute,
      })
      .from(videoCompositionSegments)
      .leftJoin(videos, eq(videoCompositionSegments.sourceVideoId, videos.id))
      .where(eq(videoCompositionSegments.compositionId, id))
      .orderBy(asc(videoCompositionSegments.position))) as SegRow[]

    if (segRows.length === 0) throw new Error("В склейке нет сегментов")
    if (segRows.some((s) => !s.sourceVideoId || !s.s3Key)) {
      throw new Error("Один из исходных клипов был удалён — пересоберите склейку")
    }

    await mkdir(workDir, { recursive: true })

    // Скачиваем исходники последовательно (экономим память на 768М-контейнере)
    const inputPaths: string[] = []
    for (let i = 0; i < segRows.length; i++) {
      const { buffer } = await downloadBuffer(segRows[i].s3Key!)
      const p = join(workDir, `in${i}.mp4`)
      await writeFile(p, buffer)
      inputPaths.push(p)
    }

    // Реальные параметры каждого файла (ffprobe): длительность + наличие
    // аудиопотока. hasAudio берём ИЗ ФАЙЛА, не из БД: БД-флаг выставлен из
    // запрошенного generate_audio и может расходиться с реальной дорожкой —
    // тогда `[i:a]` не к чему привязать и весь рендер падает с opaque-ошибкой.
    const graphSegs: ComposeGraphSegment[] = []
    for (let i = 0; i < segRows.length; i++) {
      const s = segRows[i]
      const probed = await probeMedia(inputPaths[i])
      const sourceDuration = probed.duration || s.dbDuration || 0
      if (sourceDuration <= 0) {
        throw new Error("Не удалось определить длительность одного из клипов")
      }
      graphSegs.push({
        hasAudio: probed.hasAudio ?? Boolean(s.hasAudio),
        mute: s.mute,
        trimStart: s.trimStart,
        trimEnd: s.trimEnd,
        sourceDuration,
      })
    }

    // Отбрасываем сегменты с нулевой длиной после обрезки (напр. trimStart за
    // концом клипа) — пустой поток ломает concat невнятной ошибкой ffmpeg.
    const kept = graphSegs
      .map((g, i) => ({ g, path: inputPaths[i] }))
      .filter((x) => segmentDuration(x.g) > 0)
    if (kept.length === 0) {
      throw new Error("После обрезки не осталось видео — проверьте точки обрезки")
    }
    const finalSegs = kept.map((x) => x.g)
    const finalPaths = kept.map((x) => x.path)

    const output = normalizeOutput(comp.params)
    const totalDuration = finalSegs.reduce((sum, g) => sum + segmentDuration(g), 0)
    if (totalDuration <= 0) throw new Error("Суммарная длительность склейки равна нулю")
    if (totalDuration > MAX_TOTAL_DURATION_SEC) {
      throw new Error(`Слишком длинная склейка (${Math.round(totalDuration)} сек, максимум ${MAX_TOTAL_DURATION_SEC})`)
    }

    const outPath = join(workDir, "output.mp4")
    const { args } = buildComposeGraph(finalPaths, finalSegs, output, outPath)

    await runFfmpeg(args, totalDuration, id)

    // Выгрузка результата в S3 + строка в videos (попадает в библиотеку)
    const fileStat = await stat(outPath)
    const outBuf = await readFile(outPath)
    await ensureBucket()
    const s3Key = `compositions/${id}/output.mp4`
    await upload(s3Key, outBuf, "video/mp4")

    await db.insert(videos).values({
      compositionId: id,
      s3Key,
      s3Url: s3Key,
      durationSeconds: Math.round(totalDuration),
      width: output.width,
      height: output.height,
      format: "mp4",
      hasAudio: output.audio,
      sizeBytes: fileStat.size,
    })

    await db
      .update(videoCompositions)
      .set({ status: "done", progress: 100, completedAt: new Date() })
      .where(eq(videoCompositions.id, id))
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ошибка склейки"
    console.error(`[video/compose] render ${id}:`, msg)
    await db
      .update(videoCompositions)
      .set({ status: "error", errorMessage: humanizeComposeError(msg), completedAt: new Date() })
      .where(eq(videoCompositions.id, id))
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

// ---- ffmpeg / ffprobe ----

function runFfmpeg(args: string[], totalDuration: number, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, args, { stdio: ["ignore", "pipe", "pipe"] })
    let stderrTail = ""
    let stdoutBuf = ""
    let lastWrite = 0
    let lastPct = 0

    proc.stderr.on("data", (d: Buffer) => {
      stderrTail = (stderrTail + d.toString()).slice(-4000)
    })

    proc.stdout.on("data", (d: Buffer) => {
      stdoutBuf += d.toString()
      // -progress пишет блоки key=value. Берём только out_time_us (микросекунды);
      // out_time_ms у ffmpeg тоже в µs (мислейбл) и дублировал бы апдейт.
      const lines = stdoutBuf.split("\n")
      stdoutBuf = lines.pop() || ""
      for (const line of lines) {
        const m = line.match(/^out_time_us=(\d+)/)
        if (!m) continue
        const seconds = parseInt(m[1], 10) / 1_000_000
        const pct = Math.min(99, Math.max(0, Math.round((seconds / totalDuration) * 100)))
        const now = Date.now()
        if (pct - lastPct >= 2 && now - lastWrite > 1500) {
          lastWrite = now
          lastPct = pct
          void db
            .update(videoCompositions)
            .set({ progress: pct })
            .where(eq(videoCompositions.id, id))
            .catch(() => {})
        }
      }
    })

    proc.on("error", (e: NodeJS.ErrnoException) => {
      if (e.code === "ENOENT") {
        reject(new Error("ffmpeg не установлен на сервере"))
      } else {
        reject(e)
      }
    })

    proc.on("close", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg завершился с кодом ${code}: ${stderrTail.split("\n").slice(-3).join(" ")}`))
    })
  })
}

interface ProbedMedia {
  /** Длительность в секундах (0 если не удалось определить) */
  duration: number
  /** Есть ли аудиопоток (null = ffprobe не отработал, решаем по БД) */
  hasAudio: boolean | null
}

/** Один вызов ffprobe: длительность + наличие реального аудиопотока. */
function probeMedia(path: string): Promise<ProbedMedia> {
  return new Promise((resolve) => {
    const proc = spawn(FFPROBE_BIN, [
      "-v", "error",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      path,
    ])
    let out = ""
    proc.stdout.on("data", (d: Buffer) => {
      out += d.toString()
    })
    proc.on("error", () => resolve({ duration: 0, hasAudio: null }))
    proc.on("close", () => {
      try {
        const json = JSON.parse(out) as {
          format?: { duration?: string }
          streams?: { codec_type?: string }[]
        }
        const dur = parseFloat(json.format?.duration ?? "")
        const hasAudio = Array.isArray(json.streams)
          ? json.streams.some((s) => s.codec_type === "audio")
          : null
        resolve({ duration: Number.isFinite(dur) && dur > 0 ? dur : 0, hasAudio })
      } catch {
        resolve({ duration: 0, hasAudio: null })
      }
    })
  })
}

function humanizeComposeError(msg: string): string {
  if (/ffmpeg не установлен/i.test(msg)) {
    return "Сервер не готов к склейке: не установлен ffmpeg. Сообщите администратору."
  }
  if (/исходн|удал/i.test(msg)) return msg
  if (/длинн|длительн/i.test(msg)) return msg
  return `Не удалось склеить видео. ${msg}`
}

// ---- Cron-дореконсиляция зависших задач ----

export interface ComposeReconcileSummary {
  resumed: number
  failedStale: number
  cleanedTemp: number
}

/**
 * Добивает зависшие склейки (страховка на случай смерти контейнера посреди
 * рендера — внешнего провайдера для re-poll тут нет, работа чисто локальная):
 *  - `saving`, которого НЕТ в `inFlight` этого процесса → живого воркера нет
 *    (процесс перезапускался посреди рендера) → помечаем ошибкой. Активные
 *    рендеры защищены: их id всегда в `inFlight`, сколько бы ни длился рендер,
 *    поэтому долгую (но живую) склейку мы по таймауту НЕ роняем;
 *  - `processing` старше `minAgeMs` → перезапускаем рендер (eager-старт мог не
 *    случиться, если процесс рестартовал сразу после submit);
 *  - чистим осиротевшие /tmp/mg-compose/* старше 1 ч.
 */
export async function reconcileStaleCompositions(minAgeMs = 2 * 60 * 1000): Promise<ComposeReconcileSummary> {
  const now = Date.now()
  const procCutoff = new Date(now - minAgeMs)
  const saveCutoff = new Date(now - minAgeMs)

  // 1. Прерванные на этапе saving — только те, у кого нет живого воркера в этом
  //    процессе (inFlight). Возраст-гард отсекает только что заклеймленные строки.
  const savingRows = await db
    .select({ id: videoCompositions.id })
    .from(videoCompositions)
    .where(and(eq(videoCompositions.status, "saving"), lt(videoCompositions.createdAt, saveCutoff)))
    .limit(50)

  const failed: { id: string }[] = []
  for (const row of savingRows) {
    if (inFlight.has(row.id)) continue // живой рендер — не трогаем
    const marked = await db
      .update(videoCompositions)
      .set({
        status: "error",
        errorMessage: "Рендер был прерван (перезапуск сервера). Запустите склейку заново.",
        completedAt: new Date(),
      })
      .where(and(eq(videoCompositions.id, row.id), eq(videoCompositions.status, "saving")))
      .returning({ id: videoCompositions.id })
    if (marked.length > 0) failed.push(marked[0])
  }

  // 2. Зависшие processing — перезапустить рендер
  const stale = await db
    .select({ id: videoCompositions.id })
    .from(videoCompositions)
    .where(and(eq(videoCompositions.status, "processing"), lt(videoCompositions.createdAt, procCutoff)))
    .limit(20)

  for (const row of stale) void runComposeJob(row.id)

  // 3. Осиротевшие временные папки
  let cleanedTemp = 0
  const baseTmp = join(tmpdir(), "mg-compose")
  try {
    const entries = await readdir(baseTmp)
    for (const name of entries) {
      const dir = join(baseTmp, name)
      try {
        const st = await stat(dir)
        if (now - st.mtimeMs > 60 * 60 * 1000) {
          await rm(dir, { recursive: true, force: true })
          cleanedTemp++
        }
      } catch {
        // гонка/удалили — игнор
      }
    }
  } catch {
    // папки ещё нет — ок
  }

  return { resumed: stale.length, failedStale: failed.length, cleanedTemp }
}
