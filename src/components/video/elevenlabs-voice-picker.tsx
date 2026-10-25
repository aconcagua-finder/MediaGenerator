"use client"

import { getVoiceEngine, DEFAULT_VOICE_SETTINGS, voicePriceLabel, type VoiceSettings } from "@/lib/providers/voice-change-models"
import { ElevenLabsVoiceChooser } from "@/components/elevenlabs/voice-chooser"
import { VoiceSettingsPanel, percent, type VoiceSettingField } from "@/components/elevenlabs/voice-settings-panel"
import type { PickedVoice } from "@/components/elevenlabs/voice-prefs"

interface ElevenLabsVoicePickerProps {
  voice: PickedVoice
  onVoiceChange: (voice: PickedVoice) => void
  settings: VoiceSettings
  onSettingsChange: (settings: VoiceSettings) => void
  disabled?: boolean
}

const FIELDS: VoiceSettingField[] = [
  { kind: "slider", key: "stability", label: "Стабильность", hint: "Выше — ровнее и спокойнее, ниже — живее и эмоциональнее.", min: 0, max: 1, step: 0.05, format: percent },
  { kind: "slider", key: "similarity_boost", label: "Похожесть на голос", hint: "Насколько точно держаться тембра выбранного голоса.", min: 0, max: 1, step: 0.05, format: percent },
  { kind: "slider", key: "style", label: "Выразительность", hint: "Усиливает характерную манеру голоса; больше 0 — иногда менее стабильно.", min: 0, max: 1, step: 0.05, format: percent },
  { kind: "switch", key: "use_speaker_boost", label: "Усиление голоса", hint: "Делает тембр ближе к оригиналу голоса, чуть медленнее." },
  { kind: "switch", key: "remove_background_noise", label: "Убрать фоновый шум", hint: "Чистит музыку и шум исходника перед заменой голоса." },
]

/**
 * Голос для замены голоса (ElevenLabs STS): общий выбор голоса + тонкие
 * настройки замены и подсказка с ценой.
 */
export function ElevenLabsVoicePicker({
  voice,
  onVoiceChange,
  settings,
  onSettingsChange,
  disabled,
}: ElevenLabsVoicePickerProps) {
  const engine = getVoiceEngine("elevenlabs")!
  return (
    <div className="space-y-2.5">
      <ElevenLabsVoiceChooser voice={voice} onVoiceChange={onVoiceChange} disabled={disabled} />
      <VoiceSettingsPanel
        fields={FIELDS}
        values={settings}
        defaults={DEFAULT_VOICE_SETTINGS}
        onChange={onSettingsChange}
        disabled={disabled}
      />
      <p className="text-[11px] leading-snug text-neutral-500">
        Интонация, темп и эмоции берутся из вашей речи, меняется тембр. ≈ {voicePriceLabel(engine)} звука.
      </p>
    </div>
  )
}
