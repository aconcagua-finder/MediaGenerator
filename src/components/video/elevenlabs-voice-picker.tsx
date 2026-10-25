"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronDown, ListMusic, Loader2, Pause, Play, RotateCcw } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Switch } from "@/components/ui/switch"
import {
  DEFAULT_VOICE_SETTINGS,
  getVoiceEngine,
  voicePriceLabel,
  type VoiceSettings,
} from "@/lib/providers/voice-change-models"
import { voiceChips, type CatalogVoice } from "@/lib/providers/elevenlabs-voices"
import { PlayButton, VoiceCatalogDialog } from "./voice-catalog-dialog"
import { pickedFromCatalog, presetVoice, usePreviewPlayer, type PickedVoice } from "./voice-prefs"

interface ElevenLabsVoicePickerProps {
  voice: PickedVoice
  onVoiceChange: (voice: PickedVoice) => void
  settings: VoiceSettings
  onSettingsChange: (settings: VoiceSettings) => void
  disabled?: boolean
}

interface PopularVoices {
  female: CatalogVoice[]
  male: CatalogVoice[]
}

type PopularState =
  | { kind: "loading" }
  | { kind: "ready"; data: PopularVoices }
  | { kind: "error"; message: string; noKey: boolean }

class PopularError extends Error {
  constructor(
    message: string,
    readonly noKey: boolean,
  ) {
    super(message)
  }
}

// Популярные голоса общие для всех пикеров страницы и не меняются за сессию
let popularCache: Promise<PopularVoices> | null = null

function loadPopular(): Promise<PopularVoices> {
  if (!popularCache) {
    popularCache = fetch("/api/video/voice-change/voices?popular=1").then(async (r) => {
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new PopularError(data.error || `Ошибка сервера (${r.status})`, data.code === "no_key")
      return { female: data.female ?? [], male: data.male ?? [] }
    })
    popularCache.catch(() => {
      popularCache = null
    })
  }
  return popularCache
}

const SLIDERS: { key: "stability" | "similarity_boost" | "style"; label: string; hint: string }[] = [
  { key: "stability", label: "Стабильность", hint: "Выше — ровнее и спокойнее, ниже — живее и эмоциональнее." },
  { key: "similarity_boost", label: "Похожесть на голос", hint: "Насколько точно держаться тембра выбранного голоса." },
  { key: "style", label: "Выразительность", hint: "Усиливает характерную манеру голоса; больше 0 — иногда менее стабильно." },
]

const SWITCHES: { key: "use_speaker_boost" | "remove_background_noise"; label: string; hint: string }[] = [
  { key: "use_speaker_boost", label: "Усиление голоса", hint: "Делает тембр ближе к оригиналу голоса, чуть медленнее." },
  { key: "remove_background_noise", label: "Убрать фоновый шум", hint: "Чистит музыку и шум исходника перед заменой голоса." },
]

/**
 * Выбор голоса ElevenLabs: быстрые «женский / мужской», карточка текущего
 * голоса, полоса «Популярные» (топ русских голосов, проверенных на STS),
 * полный каталог библиотеки в диалоге и тонкие настройки.
 */
export function ElevenLabsVoicePicker({
  voice,
  onVoiceChange,
  settings,
  onSettingsChange,
  disabled,
}: ElevenLabsVoicePickerProps) {
  const engine = getVoiceEngine("elevenlabs")!
  const player = usePreviewPlayer()
  const [popular, setPopular] = useState<PopularState>({ kind: "loading" })
  const [popularGender, setPopularGender] = useState<"female" | "male">(
    voice.gender === "male" ? "male" : "female",
  )
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadPopular()
      .then((data) => !cancelled && setPopular({ kind: "ready", data }))
      .catch((err: Error) => {
        if (cancelled) return
        const noKey = err instanceof PopularError && err.noKey
        setPopular({ kind: "error", message: err.message, noKey })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const popularById = useMemo(() => {
    const map = new Map<string, CatalogVoice>()
    if (popular.kind === "ready") for (const v of [...popular.data.female, ...popular.data.male]) map.set(v.id, v)
    return map
  }, [popular])

  // Сведения о голосе: сохранённые + свежие из каталога (превью, чипы)
  const current: PickedVoice = useMemo(() => {
    const fresh = popularById.get(voice.id)
    return fresh ? { ...voice, ...pickedFromCatalog(fresh), name: voice.name || fresh.title } : voice
  }, [voice, popularById])

  function select(next: PickedVoice) {
    player.stop()
    if (next.gender === "female" || next.gender === "male") setPopularGender(next.gender)
    onVoiceChange(next)
  }

  function quick(id: string) {
    const fresh = popularById.get(id)
    select(fresh ? pickedFromCatalog(fresh) : presetVoice(id))
  }

  const female = presetVoice(engine.defaultFemale)
  const male = presetVoice(engine.defaultMale)
  const chips = voiceChips({ gender: current.gender ?? null, age: current.age ?? null, useCase: current.useCase ?? null })
  const noKey = popular.kind === "error" && popular.noKey
  const currentPlaying = Boolean(current.previewUrl) && player.playingUrl === current.previewUrl

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-1.5">
        {[
          { v: female, label: "Женский" },
          { v: male, label: "Мужской" },
        ].map((d) => (
          <button
            key={d.v.id}
            type="button"
            disabled={disabled}
            onClick={() => quick(d.v.id)}
            className={`flex h-8 min-w-0 items-center justify-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors disabled:opacity-50 ${
              current.id === d.v.id
                ? "border-x-blue/50 bg-x-blue/[0.12] text-x-blue"
                : "border-white/[0.12] bg-white/[0.02] text-neutral-300 hover:text-white"
            }`}
          >
            {d.label}
            <span className="truncate font-normal text-neutral-500">· {d.v.name}</span>
          </button>
        ))}
      </div>

      {/* Текущий голос */}
      <div className="flex items-start gap-2.5 rounded-md border border-white/[0.12] bg-white/[0.03] p-2.5">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-1.5 text-sm font-medium text-white">
            <span className="truncate">{current.name}</span>
            {current.ruVerified && (
              <span className="rounded-full bg-emerald-500/[0.12] px-1.5 py-px text-[10px] font-normal text-emerald-300">
                русский проверен
              </span>
            )}
          </p>
          {current.description && <p className="truncate text-[11px] text-neutral-400">{current.description}</p>}
          {chips.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {chips.map((c) => (
                <span key={c} className="rounded-full bg-white/[0.06] px-1.5 py-px text-[10px] text-neutral-400">
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          disabled={!current.previewUrl}
          onClick={() => player.toggle(current.previewUrl)}
          title={current.previewUrl ? undefined : "Пример появится после загрузки каталога"}
          className={`flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[11px] transition-colors disabled:opacity-40 ${
            currentPlaying
              ? "border-x-blue/50 bg-x-blue/[0.12] text-x-blue"
              : "border-white/[0.12] bg-white/[0.02] text-neutral-300 hover:text-white"
          }`}
        >
          {currentPlaying ? <Pause className="size-3" /> : <Play className="size-3" />}
          {currentPlaying ? "Стоп" : "Послушать"}
        </button>
      </div>

      {/* Популярные русские голоса без открытия каталога */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium text-neutral-400">Популярные</p>
          <div className="flex gap-1">
            {(["female", "male"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setPopularGender(g)}
                className={`h-6 rounded-md border px-2 text-[11px] transition-colors ${
                  popularGender === g
                    ? "border-x-blue/50 bg-x-blue/[0.12] text-x-blue"
                    : "border-white/[0.1] text-neutral-400 hover:text-white"
                }`}
              >
                {g === "female" ? "Женские" : "Мужские"}
              </button>
            ))}
          </div>
        </div>
        {popular.kind === "loading" ? (
          <div className="flex h-16 items-center justify-center gap-2 text-[11px] text-neutral-500">
            <Loader2 className="size-3.5 animate-spin" />
            Загружаем голоса…
          </div>
        ) : popular.kind === "error" ? (
          <p className="text-[11px] leading-snug text-neutral-500">
            {noKey ? popular.message : "Популярные голоса не загрузились. Голоса «Женский» и «Мужской» выше работают."}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
            {popular.data[popularGender].map((v) => {
              const selected = v.id === current.id
              return (
                <div
                  key={v.id}
                  className={`flex min-w-0 items-center gap-1 rounded-md border py-1 pr-1.5 pl-1 transition-colors ${
                    selected ? "border-x-blue/50 bg-x-blue/[0.1]" : "border-white/[0.1] bg-white/[0.02]"
                  }`}
                >
                  <PlayButton
                    size="sm"
                    playing={Boolean(v.previewUrl) && player.playingUrl === v.previewUrl}
                    disabled={!v.previewUrl}
                    onClick={() => player.toggle(v.previewUrl)}
                  />
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => select(pickedFromCatalog(v))}
                    title={v.description ? `${v.title} — ${v.description}` : v.title}
                    className={`min-w-0 flex-1 truncate text-left text-xs disabled:opacity-50 ${
                      selected ? "text-x-blue" : "text-neutral-200 hover:text-white"
                    }`}
                  >
                    {v.title}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <button
        type="button"
        disabled={disabled || noKey}
        onClick={() => {
          player.stop()
          setCatalogOpen(true)
        }}
        className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-white/[0.12] bg-white/[0.02] text-xs font-medium text-neutral-200 transition-colors hover:border-x-blue/40 hover:text-white disabled:opacity-50"
      >
        <ListMusic className="size-3.5" />
        Выбрать другой голос
      </button>

      <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
        <CollapsibleTrigger className="flex w-full items-center gap-1 text-[11px] font-medium text-neutral-400 hover:text-white">
          <ChevronDown className={`size-3.5 transition-transform ${settingsOpen ? "rotate-180" : ""}`} />
          Тонкие настройки
        </CollapsibleTrigger>
        <CollapsibleContent>
          <VoiceSettingsPanel settings={settings} onChange={onSettingsChange} disabled={disabled} />
        </CollapsibleContent>
      </Collapsible>

      <p className="text-[11px] leading-snug text-neutral-500">
        Интонация, темп и эмоции берутся из вашей речи, меняется тембр. ≈ {voicePriceLabel(engine)} звука.
      </p>

      <VoiceCatalogDialog
        open={catalogOpen}
        onOpenChange={setCatalogOpen}
        selectedId={current.id}
        player={player}
        onSelect={(v) => {
          select(pickedFromCatalog(v))
          setCatalogOpen(false)
        }}
      />
    </div>
  )
}

function VoiceSettingsPanel({
  settings,
  onChange,
  disabled,
}: {
  settings: VoiceSettings
  onChange: (s: VoiceSettings) => void
  disabled?: boolean
}) {
  const isDefault = (Object.keys(DEFAULT_VOICE_SETTINGS) as (keyof VoiceSettings)[]).every(
    (k) => settings[k] === DEFAULT_VOICE_SETTINGS[k],
  )
  return (
    <div className="mt-2 space-y-3 rounded-md border border-white/[0.08] bg-white/[0.02] p-3">
      {SLIDERS.map((s) => (
        <div key={s.key} className="space-y-1">
          <div className="flex items-center justify-between text-xs text-neutral-300">
            <span>{s.label}</span>
            <span className="tabular-nums text-neutral-500">{Math.round(settings[s.key] * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={settings[s.key]}
            disabled={disabled}
            onChange={(e) => onChange({ ...settings, [s.key]: parseFloat(e.target.value) })}
            className="w-full accent-[#1D9BF0]"
          />
          <p className="text-[11px] leading-snug text-neutral-500">{s.hint}</p>
        </div>
      ))}
      {SWITCHES.map((s) => (
        <div key={s.key} className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-neutral-300">{s.label}</p>
            <p className="text-[11px] leading-snug text-neutral-500">{s.hint}</p>
          </div>
          <Switch
            checked={settings[s.key]}
            disabled={disabled}
            onCheckedChange={(checked) => onChange({ ...settings, [s.key]: checked })}
            className="mt-0.5"
          />
        </div>
      ))}
      <button
        type="button"
        disabled={disabled || isDefault}
        onClick={() => onChange({ ...DEFAULT_VOICE_SETTINGS })}
        className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-white disabled:opacity-40"
      >
        <RotateCcw className="size-3" />
        Сбросить
      </button>
    </div>
  )
}
