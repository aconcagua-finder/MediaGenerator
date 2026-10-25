"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Loader2, Pause, Play, Search } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  VOICE_CATALOG_PAGE_SIZE,
  isRuVerifiedFor,
  voiceChips,
  type CatalogVoice,
  type VoiceCatalogAge,
  type VoiceCatalogGender,
  type VoiceCatalogPage,
  type VoiceCatalogScope,
} from "@/lib/providers/elevenlabs-voices"
import type { PreviewPlayer } from "./voice-prefs"

interface VoiceCatalogDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedId: string
  onSelect: (voice: CatalogVoice) => void
  player: PreviewPlayer
  /** Модель, для которой показываем «русский проверен» (по умолчанию — замены голоса) */
  modelId?: string
}

const SCOPES: { value: VoiceCatalogScope; label: string }[] = [
  { value: "ru", label: "Русские голоса" },
  { value: "library", label: "Все языки библиотеки" },
  { value: "standard", label: "Стандартные ElevenLabs" },
]
const GENDERS: { value: VoiceCatalogGender | ""; label: string }[] = [
  { value: "", label: "Все" },
  { value: "female", label: "Женский" },
  { value: "male", label: "Мужской" },
]
const AGES: { value: VoiceCatalogAge | ""; label: string }[] = [
  { value: "", label: "Все" },
  { value: "young", label: "Молодой" },
  { value: "middle_aged", label: "Средний" },
  { value: "old", label: "Пожилой" },
]

type LoadState = { kind: "idle" | "loading" | "more" } | { kind: "error"; message: string; noKey?: boolean }

/**
 * Каталог голосов ElevenLabs: язык (русские / вся библиотека / стандартные),
 * пол, возраст, поиск; строки с превью, сортировка по популярности, «Показать ещё».
 */
export function VoiceCatalogDialog({
  open,
  onOpenChange,
  selectedId,
  onSelect,
  player,
  modelId,
}: VoiceCatalogDialogProps) {
  const [scope, setScope] = useState<VoiceCatalogScope>("ru")
  const [gender, setGender] = useState<VoiceCatalogGender | "">("")
  const [age, setAge] = useState<VoiceCatalogAge | "">("")
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [voices, setVoices] = useState<CatalogVoice[]>([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [state, setState] = useState<LoadState>({ kind: "idle" })
  // Ответ на устаревший запрос (фильтр успели сменить) игнорируем
  const requestRef = useRef(0)

  // Поиск — с паузой, чтобы не дёргать каталог на каждую букву
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 400)
    return () => clearTimeout(t)
  }, [searchInput])

  async function load(nextPage: number) {
    const reqId = ++requestRef.current
    setState({ kind: nextPage === 0 ? "loading" : "more" })
    const sp = new URLSearchParams({ scope, page: String(nextPage), pageSize: String(VOICE_CATALOG_PAGE_SIZE) })
    if (gender) sp.set("gender", gender)
    if (age) sp.set("age", age)
    if (search) sp.set("search", search)
    try {
      const res = await fetch(`/api/video/voice-change/voices?${sp.toString()}`)
      const data = (await res.json().catch(() => ({}))) as Partial<VoiceCatalogPage> & { error?: string; code?: string }
      if (reqId !== requestRef.current) return
      if (!res.ok) {
        setState({ kind: "error", message: data.error || `Ошибка сервера (${res.status})`, noKey: data.code === "no_key" })
        return
      }
      const list = data.voices ?? []
      setVoices((prev) => {
        if (nextPage === 0) return list
        const seen = new Set(prev.map((v) => v.id))
        return [...prev, ...list.filter((v) => !seen.has(v.id))]
      })
      setPage(nextPage)
      setHasMore(Boolean(data.hasMore))
      setState({ kind: "idle" })
    } catch {
      if (reqId !== requestRef.current) return
      setState({ kind: "error", message: "Не удалось загрузить голоса. Проверьте соединение и повторите." })
    }
  }

  useEffect(() => {
    if (!open) return
    void load(0)
    // load читает фильтры из замыкания текущего рендера
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scope, gender, age, search])

  function handleOpenChange(next: boolean) {
    if (!next) player.stop()
    onOpenChange(next)
  }

  const loading = state.kind === "loading"

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[min(92vh,760px)] flex-col gap-3 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Голоса ElevenLabs</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <Segmented value={scope} options={SCOPES} onChange={setScope} />
          <div className="space-y-1.5">
            <FilterRow label="Пол" value={gender} options={GENDERS} onChange={setGender} />
            <FilterRow label="Возраст" value={age} options={AGES} onChange={setAge} />
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-neutral-500" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Поиск по имени или описанию"
              className="h-8 border-white/[0.12] bg-white/[0.02] pl-8 text-sm"
            />
          </div>
        </div>

        <div className="-mx-4 min-h-[200px] flex-1 overflow-y-auto border-t border-white/[0.08] px-4 pt-2">
          {state.kind === "error" ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <p className="max-w-sm text-xs leading-snug text-neutral-400">{state.message}</p>
              {!state.noKey && (
                <button
                  type="button"
                  onClick={() => void load(0)}
                  className="rounded-full border border-white/[0.12] px-3 py-1 text-xs text-neutral-300 hover:text-white"
                >
                  Повторить
                </button>
              )}
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-neutral-500">
              <Loader2 className="size-4 animate-spin" />
              Загружаем голоса…
            </div>
          ) : voices.length === 0 ? (
            <p className="py-10 text-center text-xs text-neutral-500">
              Ничего не нашлось. Смягчите фильтры или измените поиск.
            </p>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {voices.map((v) => (
                <CatalogRow
                  key={v.id}
                  voice={v}
                  ruVerified={isRuVerifiedFor(v, modelId)}
                  selected={v.id === selectedId}
                  playing={Boolean(v.previewUrl) && player.playingUrl === v.previewUrl}
                  onPlay={() => player.toggle(v.previewUrl)}
                  onSelect={() => {
                    player.stop()
                    onSelect(v)
                  }}
                />
              ))}
            </ul>
          )}
          {hasMore && !loading && state.kind !== "error" && (
            <div className="flex justify-center py-3">
              <button
                type="button"
                disabled={state.kind === "more"}
                onClick={() => void load(page + 1)}
                className="flex h-8 items-center gap-1.5 rounded-full border border-white/[0.12] bg-white/[0.02] px-4 text-xs text-neutral-300 transition-colors hover:text-white disabled:opacity-60"
              >
                {state.kind === "more" && <Loader2 className="size-3.5 animate-spin" />}
                Показать ещё
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CatalogRow({
  voice,
  ruVerified,
  selected,
  playing,
  onPlay,
  onSelect,
}: {
  voice: CatalogVoice
  ruVerified: boolean
  selected: boolean
  playing: boolean
  onPlay: () => void
  onSelect: () => void
}) {
  const chips = voiceChips(voice)
  return (
    <li className="flex items-center gap-2.5 py-2">
      <PlayButton disabled={!voice.previewUrl} playing={playing} onClick={onPlay} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-medium text-white">
          <span className="truncate">{voice.title}</span>
          {ruVerified && (
            <span className="rounded-full bg-emerald-500/[0.12] px-1.5 py-px text-[10px] font-normal text-emerald-300">
              русский проверен
            </span>
          )}
          {voice.language && voice.language !== "ru" && (
            <span className="rounded-full bg-white/[0.06] px-1.5 py-px text-[10px] font-normal uppercase text-neutral-400">
              {voice.language}
            </span>
          )}
        </p>
        {voice.description && <p className="truncate text-[11px] text-neutral-400">{voice.description}</p>}
        {chips.length > 0 && <p className="truncate text-[11px] text-neutral-500">{chips.join(" · ")}</p>}
      </div>
      <button
        type="button"
        onClick={onSelect}
        className={`flex h-7 shrink-0 items-center gap-1 rounded-md border px-2.5 text-xs font-medium transition-colors ${
          selected
            ? "border-x-blue/50 bg-x-blue/[0.12] text-x-blue"
            : "border-white/[0.12] bg-white/[0.02] text-neutral-200 hover:border-x-blue/40 hover:text-white"
        }`}
      >
        {selected && <Check className="size-3.5" />}
        {selected ? "Выбран" : "Выбрать"}
      </button>
    </li>
  )
}

export function PlayButton({
  playing,
  disabled,
  onClick,
  size = "md",
}: {
  playing: boolean
  disabled?: boolean
  onClick: () => void
  size?: "sm" | "md"
}) {
  const dim = size === "sm" ? "size-6" : "size-8"
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={playing ? "Остановить пример" : "Послушать пример"}
      title={disabled ? "Примера нет" : playing ? "Остановить" : "Послушать"}
      className={`flex ${dim} shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-30 ${
        playing
          ? "border-x-blue/50 bg-x-blue/[0.15] text-x-blue"
          : "border-white/[0.12] bg-white/[0.03] text-neutral-300 hover:text-white"
      }`}
    >
      {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
    </button>
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`h-7 rounded-full border px-3 text-xs transition-colors ${
            value === o.value
              ? "border-x-blue/50 bg-x-blue/[0.12] text-x-blue"
              : "border-white/[0.12] bg-white/[0.02] text-neutral-400 hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function FilterRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-[11px] text-neutral-500">{label}</span>
      <div className="flex flex-1 flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o.value || "all"}
            type="button"
            onClick={() => onChange(o.value)}
            className={`h-6 rounded-md border px-2 text-[11px] transition-colors ${
              value === o.value
                ? "border-x-blue/50 bg-x-blue/[0.12] text-x-blue"
                : "border-white/[0.1] text-neutral-400 hover:text-white"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
