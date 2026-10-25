"use client"

import {
  DEFAULT_TTS_SETTINGS,
  ELEVENLABS_AUDIO_TAGS,
  elevenLabsVerificationModel,
  type TtsVoiceSettings,
  type VoiceModel,
} from "@/lib/providers/voice-models"
import { ElevenLabsVoiceChooser } from "@/components/elevenlabs/voice-chooser"
import { VoiceSettingsPanel, percent, type VoiceSettingField } from "@/components/elevenlabs/voice-settings-panel"
import type { PickedVoice } from "@/components/elevenlabs/voice-prefs"

interface ElevenLabsTtsOptionsProps {
  model: VoiceModel
  voice: PickedVoice
  onVoiceChange: (voice: PickedVoice) => void
  settings: Required<TtsVoiceSettings>
  onSettingsChange: (settings: Required<TtsVoiceSettings>) => void
  disabled?: boolean
}

/** Поля «Тонких настроек» под возможности модели (style и speaker boost есть не у всех) */
export function ttsSettingFields(model: VoiceModel): VoiceSettingField[] {
  const caps = model.elevenlabs
  const [min, max] = model.speedRange ?? [0.7, 1.2]
  const fields: VoiceSettingField[] = [
    { kind: "slider", key: "stability", label: "Стабильность", hint: "Выше — ровнее и спокойнее, ниже — живее и эмоциональнее.", min: 0, max: 1, step: 0.05, format: percent },
    { kind: "slider", key: "similarity_boost", label: "Похожесть на голос", hint: "Насколько точно держаться тембра выбранного голоса.", min: 0, max: 1, step: 0.05, format: percent },
  ]
  if (caps?.supportsStyle) {
    fields.push({ kind: "slider", key: "style", label: "Выразительность", hint: "Усиливает характерную манеру голоса; больше 0 — иногда менее стабильно.", min: 0, max: 1, step: 0.05, format: percent })
  }
  if (caps?.supportsSpeakerBoost) {
    fields.push({ kind: "switch", key: "use_speaker_boost", label: "Усиление голоса", hint: "Делает тембр ближе к оригиналу голоса, чуть медленнее." })
  }
  if (model.supportsSpeed) {
    fields.push({ kind: "slider", key: "speed", label: "Скорость", hint: "1× — обычный темп; меньше — медленнее, больше — быстрее.", min, max, step: 0.05, format: (v) => `${v.toFixed(2)}×` })
  }
  return fields
}

/**
 * Голос и настройки ElevenLabs для «Озвучки»: общий выбор голоса (каталог,
 * «Популярные», карточка с превью) + тонкие настройки под модель.
 */
export function ElevenLabsTtsOptions({
  model,
  voice,
  onVoiceChange,
  settings,
  onSettingsChange,
  disabled,
}: ElevenLabsTtsOptionsProps) {
  return (
    <div className="space-y-2.5">
      <ElevenLabsVoiceChooser
        voice={voice}
        onVoiceChange={onVoiceChange}
        disabled={disabled}
        modelId={elevenLabsVerificationModel(model)}
      />
      <VoiceSettingsPanel
        fields={ttsSettingFields(model)}
        values={settings}
        defaults={DEFAULT_TTS_SETTINGS}
        onChange={onSettingsChange}
        disabled={disabled}
      />
    </div>
  )
}

/**
 * Кнопки аудиотегов (v3/v4): вставляют тег в текст. Теги задают подачу и не
 * произносятся.
 */
export function AudioTagChips({ onInsert, disabled }: { onInsert: (tag: string) => void; disabled?: boolean }) {
  return (
    <div className="mt-3 space-y-1.5">
      <p className="text-[11px] leading-snug text-neutral-500">
        Подача через аудиотеги: вставьте тег перед фразой. Теги не произносятся, но считаются в символах.
      </p>
      <div className="flex flex-wrap gap-1">
        {ELEVENLABS_AUDIO_TAGS.map((t) => (
          <button
            key={t.tag}
            type="button"
            disabled={disabled}
            onClick={() => onInsert(t.tag)}
            title={`Вставить ${t.tag}`}
            className="h-6 rounded-md border border-white/[0.1] bg-white/[0.02] px-2 text-[11px] text-neutral-300 transition-colors hover:border-x-blue/40 hover:text-white disabled:opacity-50"
          >
            <span className="font-mono text-neutral-400">{t.tag}</span> {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}
