"use client"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  VOICE_MODELS,
  VOICE_VENDOR_COLORS,
  RUSSIAN_SPEECH_INFO,
  type VoiceModel,
} from "@/lib/providers/voice-models"

interface VoiceModelSelectorProps {
  selectedModel: string
  onModelChange: (id: string) => void
  /** Модели без ключа провайдера: видны, но серые с подсказкой «нужен ключ …» */
  lockedIds?: Set<string>
}

/** Группы выпадашки: сначала лучший русский (ElevenLabs первым), затем остальные */
const GROUPS: { title: string; match: (m: VoiceModel) => boolean }[] = [
  { title: "Лучший русский", match: (m) => m.russianSpeech === "good" },
  { title: "Английский и другие языки", match: (m) => m.russianSpeech !== "good" },
]

/**
 * Селектор модели озвучки: одна выпадашка, модели сгруппированы по качеству
 * русской речи, у каждой — метка вендора. Бейджи: поддержка русского, цена за
 * 1к символов, голоса, недоступность или отсутствие ключа.
 */
export function VoiceModelSelector({ selectedModel, onModelChange, lockedIds }: VoiceModelSelectorProps) {
  const current = VOICE_MODELS.find((m) => m.id === selectedModel)
  const currentColors = current ? VOICE_VENDOR_COLORS[current.vendor] : null

  return (
    <Select value={selectedModel} onValueChange={(v) => v && onModelChange(v)}>
      <SelectTrigger className="h-auto w-full border-white/[0.12] bg-white/[0.02] py-2">
        <SelectValue placeholder="Выберите модель">
          {current && currentColors && (
            <div className="flex w-full items-center gap-2 text-left">
              <span className={`size-2 shrink-0 rounded-full ${currentColors.dot}`} />
              <span className="truncate text-sm font-medium text-white">{current.name}</span>
              <span className={`ml-auto shrink-0 text-[10px] uppercase tracking-wider ${currentColors.text}`}>
                {currentColors.label}
              </span>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="!w-auto w-[400px] max-w-[min(440px,92vw)] p-1">
        {GROUPS.map((group) => {
          const models = VOICE_MODELS.filter(group.match)
          return (
            <SelectGroup key={group.title}>
              <SelectLabel className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-neutral-500">
                {group.title}
              </SelectLabel>
              {models.map((m) => {
                const ru = RUSSIAN_SPEECH_INFO[m.russianSpeech]
                const colors = VOICE_VENDOR_COLORS[m.vendor]
                const locked = lockedIds?.has(m.id) ?? false
                return (
                  <SelectItem
                    key={m.id}
                    value={m.id}
                    disabled={!m.available || locked}
                    className="cursor-pointer rounded-md py-2 data-[disabled]:opacity-50 data-[highlighted]:bg-white/[0.04]"
                  >
                    <div className="flex w-full flex-col gap-1">
                      <div className="flex w-full items-center gap-1.5">
                        <span className={`size-2 shrink-0 rounded-full ${colors.dot}`} />
                        <span className="min-w-0 flex-1 truncate font-medium text-white">{m.name}</span>
                        {m.isNew && m.available && !locked && (
                          <span className="shrink-0 rounded-full bg-x-blue/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-x-blue">
                            Новинка
                          </span>
                        )}
                        {!m.available && (
                          <span className="shrink-0 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-400">
                            Недоступна
                          </span>
                        )}
                        {m.available && locked && (
                          <span className="shrink-0 rounded-full bg-white/[0.08] px-1.5 py-0.5 text-[9px] font-medium text-neutral-400">
                            нужен ключ {m.provider === "elevenlabs" ? "ElevenLabs" : "OpenRouter"}
                          </span>
                        )}
                        {!locked && (
                          <span className={`shrink-0 text-[10px] uppercase tracking-wider ${colors.text}`}>
                            {colors.label}
                          </span>
                        )}
                      </div>
                      {m.description && (
                        <span className="whitespace-normal text-xs leading-snug text-neutral-400">
                          {m.description}
                        </span>
                      )}
                      <div className="flex flex-wrap gap-1 text-[10px] text-neutral-500">
                        <span className={`rounded bg-white/[0.05] px-1.5 py-0.5 ${ru.text}`}>{ru.short}</span>
                        <span className="rounded bg-white/[0.05] px-1.5 py-0.5">
                          {m.dynamicVoices ? "вся библиотека голосов" : `${m.voices.length} голосов`}
                        </span>
                        {m.elevenlabs?.supportsAudioTags && (
                          <span className="rounded bg-white/[0.05] px-1.5 py-0.5">аудиотеги</span>
                        )}
                        <span className="rounded bg-white/[0.05] px-1.5 py-0.5">до {m.maxChars.toLocaleString("ru-RU")} симв.</span>
                        <span className="rounded bg-white/[0.05] px-1.5 py-0.5">
                          ≈${m.pricePer1kChars.toFixed(3)}/1к симв.
                        </span>
                      </div>
                    </div>
                  </SelectItem>
                )
              })}
            </SelectGroup>
          )
        })}
      </SelectContent>
    </Select>
  )
}
