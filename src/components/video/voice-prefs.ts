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
  }
}

/** Голос из подборки движка (Marina / Nikolay и т.п.) */
export function presetVoice(id: string): PickedVoice {
  const engine = getVoiceEngine("elevenlabs")!
  const p = engine.presets.find((x) => x.id === id) ?? engine.presets.find((x) => x.id === engine.defaultFemale)!
  return { id: p.id, name: p.label, description: p.hint, gender: p.gender, ruVerified: true }
}

// Общие с остальной формой видео ключи localStorage (`mg_` + имя, см. savePref
// в video-form.tsx): последний голос и настройки — одни и те же для автопереозвучки
// и ручной кнопки «Заменить голос».
const KEY_VOICE = "mg_video_voice_over_voice"
const KEY_META = "mg_video_voice_over_voice_meta"
const KEY_SETTINGS = "mg_video_voice_over_settings"

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
export function loadVoicePick(): PickedVoice {
  const engine = getVoiceEngine("elevenlabs")!
  const id = read(KEY_VOICE)
  if (!isElevenLabsVoiceId(id)) return presetVoice(engine.defaultFemale)
  let meta: Partial<PickedVoice> = {}
  try {
    const parsed = JSON.parse(read(KEY_META) || "{}")
    if (parsed && typeof parsed === "object" && parsed.id === id) meta = parsed
  } catch {
    // битый JSON — берём только id
  }
  const known = engine.presets.some((p) => p.id === id) ? presetVoice(id) : null
  const name = sanitizeVoiceName(meta.name) || known?.name || "Голос ElevenLabs"
  return { ...known, ...meta, id, name }
}

export function saveVoicePick(voice: PickedVoice) {
  write(KEY_VOICE, voice.id)
  write(KEY_META, JSON.stringify(voice))
}

export function loadVoiceSettings(): VoiceSettings {
  try {
    const raw = read(KEY_SETTINGS)
    return raw ? sanitizeVoiceSettings(JSON.parse(raw)) : { ...DEFAULT_VOICE_SETTINGS }
  } catch {
    return { ...DEFAULT_VOICE_SETTINGS }
  }
}

export function saveVoiceSettings(settings: VoiceSettings) {
  write(KEY_SETTINGS, JSON.stringify(settings))
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
