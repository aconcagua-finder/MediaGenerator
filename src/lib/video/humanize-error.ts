/**
 * Преобразует сырое сообщение об ошибке провайдера видео в понятный пользователю
 * текст.
 *
 * Зачем: провайдер (Google Veo / OpenRouter) отдаёт причину фейла по-английски,
 * и она сбивает с толку — напр. «The service is currently experiencing high load»
 * читается пользователем как «наш сервер перегружен». Маппим известные
 * транзиентные/модерационные фразы в русские подсказки. Всё незнакомое
 * возвращаем как есть — неожиданные ошибки не прячем.
 *
 * Сырой текст при этом стоит писать в лог (для отладки), а человекочитаемый —
 * в БД/UI. См. использование в `finalize.ts` и `api/video/generate`.
 */

/** Транзиентная перегрузка/таймаут на стороне провайдера — стоит просто повторить */
const TRANSIENT =
  /high load|overload|experiencing high|deadline exceeded|timed?\s?out|try again|temporar|unavailable|too many requests|rate.?limit|resource exhausted|service is currently/i

/** Контент-фильтр / модерация модели */
const FILTERED =
  /content.{0,20}filter|filtered|safety|moderation|blocked|policy|prohibited|nsfw|inappropriate/i

export function humanizeVideoError(raw: string | null | undefined): string {
  const msg = (raw ?? "").trim()
  if (!msg) return "Генерация не удалась на стороне провайдера"

  if (TRANSIENT.test(msg)) {
    return "Провайдер модели временно перегружен и не смог обработать запрос — это нагрузка на стороне провайдера, не вашего сервера. Повторите через минуту или выберите другую модель (Seedance, Kling, Wan устойчивее)."
  }

  if (FILTERED.test(msg)) {
    return "Контент отклонён фильтром модели (часто срабатывает на фото реальных людей). Попробуйте другое изображение или промпт, либо модель помягче — Seedance, Kling, Wan."
  }

  return msg
}
