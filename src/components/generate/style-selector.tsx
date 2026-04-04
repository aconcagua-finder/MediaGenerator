"use client"

import { Label } from "@/components/ui/label"

const STYLES = [
  { id: "none", label: "Без стиля", suffix: "" },
  { id: "photo", label: "Фото", suffix: ", photorealistic, high detail, professional photography" },
  { id: "anime", label: "Аниме", suffix: ", anime style, manga illustration, vibrant colors" },
  { id: "digital", label: "Диджитал-арт", suffix: ", digital art, vibrant, detailed illustration" },
  { id: "oil", label: "Масло", suffix: ", oil painting style, textured brushstrokes, classical art" },
  { id: "watercolor", label: "Акварель", suffix: ", watercolor painting, soft washes, delicate" },
  { id: "3d", label: "3D рендер", suffix: ", 3D render, octane render, highly detailed, volumetric lighting" },
  { id: "pixel", label: "Пиксель-арт", suffix: ", pixel art style, retro game aesthetic, 16-bit" },
  { id: "sketch", label: "Скетч", suffix: ", pencil sketch, hand drawn, black and white, detailed linework" },
  { id: "cinematic", label: "Кино", suffix: ", cinematic still, dramatic lighting, film grain, movie scene" },
  { id: "comic", label: "Комикс", suffix: ", comic book style, bold outlines, cel shading, graphic novel" },
  { id: "minimalist", label: "Минимализм", suffix: ", minimalist style, clean lines, simple shapes, flat design" },
]

interface StyleSelectorProps {
  value: string
  onChange: (styleId: string) => void
}

export function StyleSelector({ value, onChange }: StyleSelectorProps) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-neutral-400">Стиль</Label>
      <div className="flex flex-wrap gap-1.5">
        {STYLES.map((style) => (
          <button
            key={style.id}
            type="button"
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              value === style.id
                ? "border-x-blue bg-x-blue/20 text-x-blue"
                : "border-white/10 text-neutral-400 hover:border-white/20 hover:text-neutral-300"
            }`}
            onClick={() => onChange(style.id)}
          >
            {style.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function getStyleSuffix(styleId: string): string {
  return STYLES.find((s) => s.id === styleId)?.suffix || ""
}
