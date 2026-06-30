"use client"

import { useState } from "react"
import { ImagesIcon, VideoIcon, AudioLinesIcon } from "lucide-react"
import { LibraryView } from "./library-view"
import { VideoLibrary } from "./video-library"
import { AudioLibrary } from "./audio-library"
import type { ImageWithGeneration } from "@/lib/actions/images"
import type { FolderItem } from "@/lib/actions/folders"
import type { VideoLibraryItem } from "@/lib/actions/videos"
import type { AudioLibraryItem } from "@/lib/actions/audios"

interface LibraryTabsProps {
  initialImages: ImageWithGeneration[]
  initialTotal: number
  initialFolders: FolderItem[]
  hasOpenAIKey: boolean
  hasOpenRouterKey: boolean
  initialVideos: VideoLibraryItem[]
  initialVideoTotal: number
  initialAudios: AudioLibraryItem[]
  initialAudioTotal: number
}

export function LibraryTabs({
  initialImages,
  initialTotal,
  initialFolders,
  hasOpenAIKey,
  hasOpenRouterKey,
  initialVideos,
  initialVideoTotal,
  initialAudios,
  initialAudioTotal,
}: LibraryTabsProps) {
  const [tab, setTab] = useState<"photos" | "videos" | "audios">("photos")

  return (
    <div className="flex flex-col gap-4">
      {/* Переключатель Фото | Видео */}
      <div className="flex w-fit gap-1 rounded-lg border border-white/[0.12] bg-white/[0.02] p-1">
        <button
          type="button"
          onClick={() => setTab("photos")}
          className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === "photos"
              ? "bg-white/[0.08] text-white"
              : "text-neutral-400 hover:text-white"
          }`}
        >
          <ImagesIcon className="size-4" />
          Фото
          <span className="text-[11px] text-neutral-500">{initialTotal}</span>
        </button>
        <button
          type="button"
          onClick={() => setTab("videos")}
          className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === "videos"
              ? "bg-white/[0.08] text-white"
              : "text-neutral-400 hover:text-white"
          }`}
        >
          <VideoIcon className="size-4" />
          Видео
          <span className="text-[11px] text-neutral-500">{initialVideoTotal}</span>
        </button>
        <button
          type="button"
          onClick={() => setTab("audios")}
          className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === "audios"
              ? "bg-white/[0.08] text-white"
              : "text-neutral-400 hover:text-white"
          }`}
        >
          <AudioLinesIcon className="size-4" />
          Озвучка
          <span className="text-[11px] text-neutral-500">{initialAudioTotal}</span>
        </button>
      </div>

      {tab === "photos" ? (
        <LibraryView
          initialImages={initialImages}
          initialTotal={initialTotal}
          initialFolders={initialFolders}
          hasOpenAIKey={hasOpenAIKey}
          hasOpenRouterKey={hasOpenRouterKey}
        />
      ) : tab === "videos" ? (
        <VideoLibrary
          initialVideos={initialVideos}
          initialTotal={initialVideoTotal}
          initialFolders={initialFolders}
        />
      ) : (
        <AudioLibrary
          initialAudios={initialAudios}
          initialTotal={initialAudioTotal}
          initialFolders={initialFolders}
        />
      )}
    </div>
  )
}
