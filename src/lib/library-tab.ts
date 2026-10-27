/**
 * Вкладка Библиотеки из `?tab=videos|audios` (ссылки «Все видео в Библиотеке» с
 * /video и /history). Отдельно от клиентского library-tabs.tsx: страница
 * Библиотеки — серверный компонент и вызывает это сама.
 */
export type LibraryTab = "photos" | "videos" | "audios"

export function parseLibraryTab(value: string | string[] | undefined): LibraryTab {
  const v = Array.isArray(value) ? value[0] : value
  return v === "videos" || v === "audios" ? v : "photos"
}
