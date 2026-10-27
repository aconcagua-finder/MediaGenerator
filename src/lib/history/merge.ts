/**
 * Общие помощники лент истории («Мои генерации» на /video, «Мои озвучки» на
 * /voice, «Мои картинки» на /generate). Без серверных зависимостей — годятся и
 * для клиента, и для сборки карточек на сервере.
 */

export type FeedStatus = "processing" | "done" | "error"

/**
 * Слияние задач вкладки с историей из БД: задача, уже показанная в этой
 * вкладке, не дублируется (её состояние новее), новые сверху.
 */
export function mergeJobsById<T extends { id: string; startedAt: number }>(current: T[], incoming: T[]): T[] {
  const ids = new Set(current.map((j) => j.id))
  return [...current, ...incoming.filter((j) => !ids.has(j.id))].sort((a, b) => b.startedAt - a.startedAt)
}

/** processing / saving / pending → «в работе» */
export function mapFeedStatus(status: string): FeedStatus {
  if (status === "done") return "done"
  if (status === "error") return "error"
  return "processing"
}

/**
 * Синхронные задачи (озвучка, картинки) «в работе» дольше этого — процесс,
 * скорее всего, оборвался (перезапуск сервера), реконсилятора у них нет.
 */
export const STALE_SYNC_JOB_MS = 15 * 60 * 1000

/**
 * Статус синхронной задачи для истории: зависшая «в работе» показывается
 * ошибкой, чтобы карточка не крутилась вечно.
 */
export function syncJobStatus(status: string, createdAt: Date | string, now: number): FeedStatus {
  const mapped = mapFeedStatus(status)
  if (mapped !== "processing") return mapped
  return now - new Date(createdAt).getTime() > STALE_SYNC_JOB_MS ? "error" : "processing"
}

export const STALE_SYNC_JOB_ERROR = "Задача не завершилась (сервер перезапускался). Повторите её."
