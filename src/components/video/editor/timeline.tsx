"use client"

import type { EditorSegment } from "./types"
import { TimelineSegment } from "./timeline-segment"

interface TimelineProps {
  segments: EditorSegment[]
  audioEnabled: boolean
  onMove: (uid: string, dir: -1 | 1) => void
  onRemove: (uid: string) => void
  onTrim: (uid: string) => void
  onToggleMute: (uid: string, mute: boolean) => void
}

export function Timeline({ segments, audioEnabled, onMove, onRemove, onTrim, onToggleMute }: TimelineProps) {
  return (
    <ul className="space-y-2">
      {segments.map((seg, i) => (
        <TimelineSegment
          key={seg.uid}
          segment={seg}
          index={i}
          isFirst={i === 0}
          isLast={i === segments.length - 1}
          audioEnabled={audioEnabled}
          onMoveUp={() => onMove(seg.uid, -1)}
          onMoveDown={() => onMove(seg.uid, 1)}
          onRemove={() => onRemove(seg.uid)}
          onTrim={() => onTrim(seg.uid)}
          onToggleMute={() => onToggleMute(seg.uid, !seg.mute)}
        />
      ))}
    </ul>
  )
}
