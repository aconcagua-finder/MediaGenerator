/**
 * Слияние задач вкладки /video с историей из БД: свежая задача, уже
 * показанная в этой вкладке, не дублируется (её состояние новее), новые сверху.
 * Без серверных зависимостей — годится для клиента.
 */
export function mergeJobsById<T extends { id: string; startedAt: number }>(current: T[], incoming: T[]): T[] {
  const ids = new Set(current.map((j) => j.id))
  return [...current, ...incoming.filter((j) => !ids.has(j.id))].sort((a, b) => b.startedAt - a.startedAt)
}
