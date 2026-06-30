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
  type VoiceVendor,
} from "@/lib/providers/voice-models"

interface VoiceModelSelectorProps {
  selectedModel: string
  onModelChange: (id: string) => void
}

/**
 * Селектор модели озвучки: одна выпадашка, модели сгруппированы по вендору.
 * Бейджи: поддержка русского, цена за 1к символов, число голосов, недоступность.
 */
export function VoiceModelSelector({ selectedModel, onModelChange }: VoiceModelSelectorProps) {
  const current = VOICE_MODELS.find((m) => m.id === selectedModel)
  const currentColors = current ? VOICE_VENDOR_COLORS[current.vendor] : null

  const vendors: VoiceVendor[] = []
  for (const m of VOICE_MODELS) {
    if (!vendors.includes(m.vendor)) vendors.push(m.vendor)
  }

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
        {vendors.map((vendor) => {
          const models = VOICE_MODELS.filter((m) => m.vendor === vendor)
          const colors = VOICE_VENDOR_COLORS[vendor]
          return (
            <SelectGroup key={vendor}>
              <SelectLabel className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-neutral-500">
                {colors.label}
              </SelectLabel>
              {models.map((m) => {
                const ru = RUSSIAN_SPEECH_INFO[m.russianSpeech]
                return (
                  <SelectItem
                    key={m.id}
                    value={m.id}
                    disabled={!m.available}
                    className="cursor-pointer rounded-md py-2 data-[disabled]:opacity-50 data-[highlighted]:bg-white/[0.04]"
                  >
                    <div className="flex w-full flex-col gap-1">
                      <div className="flex w-full items-center gap-1.5">
                        <span className={`size-2 shrink-0 rounded-full ${colors.dot}`} />
                        <span className="min-w-0 flex-1 truncate font-medium text-white">{m.name}</span>
                        {m.isNew && m.available && (
                          <span className="shrink-0 rounded-full bg-x-blue/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-x-blue">
                            Новинка
                          </span>
                        )}
                        {!m.available && (
                          <span className="shrink-0 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-400">
                            Недоступна
                          </span>
                        )}
                        <span className={`shrink-0 text-[10px] uppercase tracking-wider ${colors.text}`}>
                          {colors.label}
                        </span>
                      </div>
                      {m.description && (
                        <span className="whitespace-normal text-xs leading-snug text-neutral-400">
                          {m.description}
                        </span>
                      )}
                      <div className="flex flex-wrap gap-1 text-[10px] text-neutral-500">
                        <span className={`rounded bg-white/[0.05] px-1.5 py-0.5 ${ru.text}`}>{ru.short}</span>
                        <span className="rounded bg-white/[0.05] px-1.5 py-0.5">{m.voices.length} голосов</span>
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
