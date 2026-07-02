"use client"

import { RectangleHorizontal, RectangleVertical, Volume2, VolumeX } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import type { OutputSettings } from "./types"

interface Props {
  output: OutputSettings
  onChange: (next: OutputSettings) => void
  title: string
  onTitleChange: (v: string) => void
}

export function OutputPanel({ output, onChange, title, onTitleChange }: Props) {
  return (
    <div className="rounded-lg border border-white/[0.12] bg-white/[0.02] p-5">
      <h3 className="mb-4 text-sm font-bold text-white">Параметры вывода</h3>

      <div className="space-y-4">
        {/* Ориентация */}
        <div className="space-y-1.5">
          <Label className="block text-sm font-medium text-neutral-400">Формат кадра</Label>
          <div className="grid grid-cols-2 gap-2">
            <OrientationButton
              active={output.orientation === "landscape"}
              onClick={() => onChange({ ...output, orientation: "landscape" })}
              icon={<RectangleHorizontal className="size-4" />}
              label="16:9"
              hint="720p"
            />
            <OrientationButton
              active={output.orientation === "portrait"}
              onClick={() => onChange({ ...output, orientation: "portrait" })}
              icon={<RectangleVertical className="size-4" />}
              label="9:16"
              hint="720p"
            />
          </div>
          <p className="text-[11px] leading-snug text-neutral-600">
            Клипы другого формата впишутся в кадр с чёрными полями (без искажений).
          </p>
        </div>

        {/* Звук */}
        <div className="space-y-1.5">
          <Label className="block text-sm font-medium text-neutral-400">Звук</Label>
          <button
            type="button"
            onClick={() => onChange({ ...output, audio: !output.audio })}
            className={`flex h-9 w-full items-center justify-center gap-1.5 rounded-md border text-sm font-medium transition-colors ${
              output.audio
                ? "border-x-blue/40 bg-x-blue/[0.12] text-x-blue"
                : "border-white/[0.12] bg-white/[0.02] text-neutral-400 hover:text-white"
            }`}
          >
            {output.audio ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            {output.audio ? "Со звуком" : "Без звука"}
          </button>
        </div>

        {/* Имя файла */}
        <div className="space-y-1.5">
          <Label className="block text-sm font-medium text-neutral-400">Название (необязательно)</Label>
          <Input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Моя склейка"
            maxLength={120}
            className="border-white/[0.12] bg-white/[0.02]"
          />
        </div>
      </div>
    </div>
  )
}

function OrientationButton({
  active,
  onClick,
  icon,
  label,
  hint,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  hint: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-16 flex-col items-center justify-center gap-1 rounded-md border text-sm font-medium transition-colors ${
        active
          ? "border-x-blue/40 bg-x-blue/[0.12] text-x-blue"
          : "border-white/[0.12] bg-white/[0.02] text-neutral-400 hover:text-white"
      }`}
    >
      {icon}
      <span>{label}</span>
      <span className="text-[10px] text-neutral-500">{hint}</span>
    </button>
  )
}
