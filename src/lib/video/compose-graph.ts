/**
 * Чистый построитель ffmpeg-команды для склейки разнородных клипов.
 * Без БД/ФС/процессов — чтобы покрыть юнит-тестом (tests/compose-graph.test.ts).
 *
 * Главное правило: ВСЕГДА идём через `filter_complex ... concat` с полным
 * re-encode и нормализацией каждого сегмента к общему холсту. Быстрый
 * concat-демультиплексор (`-c copy`) на клипах от разных моделей (Veo, Kling,
 * Seedance, Wan) молча выдаёт битый выход (зелёные кадры, фризы, рассинхрон) —
 * не используем.
 *
 * Что нормализуется на каждом сегменте:
 *  - trim (обрезка) + setpts=PTS-STARTPTS (сброс таймстампов — иначе фризы/гэпы);
 *  - scale + pad к холсту W×H без искажений (вертикальные клипы не сплющиваются,
 *    добиваются чёрными полями);
 *  - setsar=1 (квадратные пиксели), fps, format=yuv420p (единственный pixfmt,
 *    который <video> играет везде).
 *
 * Звук: concat с a=1 требует аудиопоток в КАЖДОМ сегменте. Для немых клипов
 * (hasAudio=false) или замьюченных подмешиваем тишину из отдельного
 * lavfi-anullsrc-входа длиной ровно в обрезанную длительность сегмента (чтобы
 * аудио не уезжало от видео на стыках). Если звук в выводе выключен — аудио нет
 * вовсе (`-an`).
 */

export interface ComposeOutput {
  /** Чётные (кратны 2) — требование h264 */
  width: number
  height: number
  fps: number
  /** Есть ли звук в итоговом файле */
  audio: boolean
}

export interface ComposeGraphSegment {
  /** Индекс входного видеофайла в массиве inputPaths (0-based) */
  hasAudio: boolean
  mute: boolean
  /** Начало обрезки в секундах (0/undefined = с начала) */
  trimStart?: number | null
  /** Конец обрезки в секундах (undefined/null = до конца клипа) */
  trimEnd?: number | null
  /** Реальная длительность исходного файла в секундах (из ffprobe) */
  sourceDuration: number
}

export interface ComposeGraph {
  /** Аргументы для child_process.spawn('ffmpeg', args) — БЕЗ имени бинарника */
  args: string[]
  /** Ожидаемая длительность итога в секундах (для прогресс-бара и videos.durationSeconds) */
  totalDuration: number
}

/** Длительность сегмента после обрезки, в секундах (≥ 0). */
export function segmentDuration(seg: ComposeGraphSegment): number {
  const start = Math.max(0, seg.trimStart ?? 0)
  const end = seg.trimEnd != null ? Math.min(seg.trimEnd, seg.sourceDuration) : seg.sourceDuration
  return Math.max(0, end - start)
}

/** Выражение для фильтра trim/atrim: "start=..:end=.." (пусто, если без обрезки).
 *  Значения клампятся к [0, sourceDuration] — защита от точек обрезки за пределами
 *  клипа (end за EOF ffmpeg и так игнорит, но не плодим бессмысленный фильтр). */
function trimExpr(seg: ComposeGraphSegment): string {
  const dur = seg.sourceDuration
  const parts: string[] = []
  const start = Math.max(0, Math.min(seg.trimStart ?? 0, dur))
  if (start > 0) parts.push(`start=${round3(start)}`)
  if (seg.trimEnd != null) {
    const end = Math.min(seg.trimEnd, dur)
    if (end < dur) parts.push(`end=${round3(end)}`)
  }
  return parts.join(":")
}

function round3(n: number): string {
  return (Math.round(n * 1000) / 1000).toString()
}

/**
 * Строит полную ffmpeg-команду склейки.
 * @param inputPaths локальные пути к видеофайлам (параллельны segments)
 * @param segments   EDL сегментов в порядке проигрывания
 * @param output     параметры вывода (холст/fps/звук)
 * @param outputPath путь для итогового mp4
 */
export function buildComposeGraph(
  inputPaths: string[],
  segments: ComposeGraphSegment[],
  output: ComposeOutput,
  outputPath: string,
): ComposeGraph {
  if (segments.length === 0) throw new Error("Нужен хотя бы один сегмент")
  if (inputPaths.length !== segments.length) {
    throw new Error("Число входных файлов не совпадает с числом сегментов")
  }

  const W = ensureEven(output.width)
  const H = ensureEven(output.height)
  const FPS = clamp(Math.round(output.fps) || 30, 1, 60)
  const wantAudio = output.audio

  const args: string[] = ["-y", "-hide_banner"]

  // 1. Видеофайлы — входы 0..N-1
  for (const p of inputPaths) args.push("-i", p)

  // 2. Тишина для немых/замьюченных сегментов — отдельный lavfi-вход на каждый,
  //    длиной ровно в обрезанную длительность (чтобы аудио совпадало с видео).
  const silenceInputForSeg: Record<number, number> = {}
  let nextInput = segments.length
  if (wantAudio) {
    segments.forEach((seg, i) => {
      const silent = !seg.hasAudio || seg.mute
      if (silent) {
        const dur = segmentDuration(seg)
        args.push(
          "-f", "lavfi",
          "-t", round3(Math.max(0.05, dur)),
          "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
        )
        silenceInputForSeg[i] = nextInput++
      }
    })
  }

  // 3. filter_complex: нормализуем каждый сегмент, затем concat
  const parts: string[] = []
  const concatPads: string[] = []

  segments.forEach((seg, i) => {
    const te = trimExpr(seg)
    const vChain: string[] = []
    if (te) vChain.push(`trim=${te}`)
    vChain.push("setpts=PTS-STARTPTS")
    vChain.push(`scale=${W}:${H}:force_original_aspect_ratio=decrease`)
    vChain.push(`pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black`)
    vChain.push("setsar=1")
    vChain.push(`fps=${FPS}`)
    vChain.push("format=yuv420p")
    parts.push(`[${i}:v]${vChain.join(",")}[v${i}]`)
    concatPads.push(`[v${i}]`)

    if (wantAudio) {
      const realAudio = seg.hasAudio && !seg.mute
      const aChain: string[] = []
      if (realAudio) {
        const segDur = segmentDuration(seg)
        if (te) aChain.push(`atrim=${te}`)
        aChain.push("asetpts=PTS-STARTPTS")
        aChain.push("aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo")
        // Аудио ровно по длине видео сегмента: добиваем тишиной (apad) и режем по
        // segDur. Иначе клип, где звук короче картинки, даёт «дыру» в этом
        // сегменте и накапливающийся дрейф длины на стыках concat.
        aChain.push("apad")
        aChain.push(`atrim=end=${round3(segDur)}`)
        parts.push(`[${i}:a]${aChain.join(",")}[a${i}]`)
      } else {
        const si = silenceInputForSeg[i]
        parts.push(
          `[${si}:a]asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a${i}]`,
        )
      }
      concatPads.push(`[a${i}]`)
    }
  })

  const n = segments.length
  if (wantAudio) {
    parts.push(`${concatPads.join("")}concat=n=${n}:v=1:a=1[vout][aout]`)
  } else {
    parts.push(`${concatPads.join("")}concat=n=${n}:v=1:a=0[vout]`)
  }

  args.push("-filter_complex", parts.join(";"))
  args.push("-map", "[vout]")
  if (wantAudio) args.push("-map", "[aout]")

  // 4. Кодеки. -threads 1 — главный рычаг против OOM на 768М-контейнере
  //    (libx264 по умолчанию множит фрейм-буферы по числу ядер).
  args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p")
  if (wantAudio) {
    args.push("-c:a", "aac", "-b:a", "128k", "-ar", "44100")
  } else {
    args.push("-an")
  }
  args.push("-movflags", "+faststart", "-threads", "1")
  // Машиночитаемый прогресс на stdout
  args.push("-progress", "pipe:1", "-nostats")
  args.push(outputPath)

  const totalDuration = segments.reduce((sum, s) => sum + segmentDuration(s), 0)

  return { args, totalDuration }
}

function ensureEven(n: number): number {
  const v = Math.max(2, Math.round(n))
  return v % 2 === 0 ? v : v + 1
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}
