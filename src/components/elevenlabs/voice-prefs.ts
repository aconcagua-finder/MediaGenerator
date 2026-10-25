"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  DEFAULT_VOICE_SETTINGS,
  getVoiceEngine,
  isElevenLabsVoiceId,
  sanitizeVoiceName,
  sanitizeVoiceSettings,
  type VoiceSettings,
} from "@/lib/providers/voice-change-models"
import type { CatalogVoice } from "@/lib/providers/elevenlabs-voices"

/**
 * Выбранный голос ElevenLabs: id и подпись обязательны, остальное — сведения
 * из каталога для карточки голоса (могут отсутствовать, например у голоса
 * по умолчанию до загрузки каталога).
 */
export interface PickedVoice {
  id: string
  name: string
  description?: string
  gender?: string | null
  age?: string | null
  useCase?: string | null
  previewUrl?: string | null
  ruVerified?: boolean
  ruModels?: string[]
}

export function pickedFromCatalog(v: CatalogVoice): PickedVoice {
  return {
    id: v.id,
    name: v.title || v.name,
    description: v.description,
    gender: v.gender,
    age: v.age,
    useCase: v.useCase,
    previewUrl: v.previewUrl,
    ruVerified: v.ruVerified,
    ruModels: v.ruModels,
  }
}

/** Голос из подборки движка (Marina / Nikolay и т.п.) */
export function presetVoice(id: string): PickedVoice {
  const engine = getVoiceEngine("elevenlabs")!
  const p = engine.presets.find((x) => x.id === id) ?? engine.presets.find((x) => x.id === engine.defaultFemale)!
  return { id: p.id, name: p.label, description: p.hint, gender: p.gender, ruVerified: true }
}

/**
 * Где запоминается выбор: `video_voice_over` — замена голоса (общий для
 * автопереозвучки v2v и кнопки «Заменить голос»), `voice_tts` — «Озвучка».
 * Ключи localStorage — `mg_` + имя, как у savePref форм.
 */
export type VoicePrefsScope = "video_voice_over" | "voice_tts"

const keys = (scope: VoicePrefsScope) => ({
  voice: `mg_${scope}_voice`,
  meta: `mg_${scope}_voice_meta`,
  settings: `mg_${scope}_settings`,
})

function read(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // приватный режим / переполнение — просто не запоминаем
  }
}

/**
 * Последний выбранный голос. Раньше здесь лежало имя пресета fal («Jessica»):
 * такое значение не voice_id — откатываемся на голос по умолчанию.
 */
export function loadVoicePick(scope: VoicePrefsScope = "video_voice_over"): PickedVoice {
  const engine = getVoiceEngine("elevenlabs")!
  const k = keys(scope)
  const id = read(k.voice)
  if (!isElevenLabsVoiceId(id)) return presetVoice(engine.defaultFemale)
  let meta: Partial<PickedVoice> = {}
  try {
    const parsed = JSON.parse(read(k.meta) || "{}")
    if (parsed && typeof parsed === "object" && parsed.id === id) meta = parsed
  } catch {
    // битый JSON — берём только id
  }
  const known = engine.presets.some((p) => p.id === id) ? presetVoice(id) : null
  const name = sanitizeVoiceName(meta.name) || known?.name || "Голос ElevenLabs"
  return { ...known, ...meta, id, name }
}

export function saveVoicePick(voice: PickedVoice, scope: VoicePrefsScope = "video_voice_over") {
  const k = keys(scope)
  write(k.voice, voice.id)
  write(k.meta, JSON.stringify(voice))
}

/** Сырые сохранённые настройки (санитизирует вызывающий — под свой движок/модель) */
export function loadRawVoiceSettings(scope: VoicePrefsScope): unknown {
  try {
    const raw = read(keys(scope).settings)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveRawVoiceSettings(scope: VoicePrefsScope, settings: object) {
  write(keys(scope).settings, JSON.stringify(settings))
}

/** Настройки замены голоса */
export function loadVoiceSettings(): VoiceSettings {
  const raw = loadRawVoiceSettings("video_voice_over")
  return raw ? sanitizeVoiceSettings(raw) : { ...DEFAULT_VOICE_SETTINGS }
}

export function saveVoiceSettings(settings: VoiceSettings) {
  saveRawVoiceSettings("video_voice_over", settings)
}

/**
 * Один плеер превью на весь выбор голоса: новый запуск глушит предыдущий,
 * `stop()` — при закрытии каталога, при размонтировании глушится сам.
 */
export function usePreviewPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playingUrl, setPlayingUrl] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      audioRef.current = null
    }
  }, [])

  const stop = useCallback(() => {
    audioRef.current?.pause()
    setPlayingUrl(null)
  }, [])

  const toggle = useCallback(
    (url: string | null | undefined) => {
      if (!url) return
      if (playingUrl === url) {
        stop()
        return
      }
      if (!audioRef.current) {
        audioRef.current = new Audio()
        audioRef.current.preload = "none"
        audioRef.current.onended = () => setPlayingUrl(null)
        audioRef.current.onerror = () => setPlayingUrl(null)
      }
      const audio = audioRef.current
      audio.pause()
      audio.src = url
      setPlayingUrl(url)
      audio.play().catch(() => setPlayingUrl(null))
    },
    [playingUrl, stop],
  )

  return { playingUrl, toggle, stop }
}

export type PreviewPlayer = ReturnType<typeof usePreviewPlayer>
