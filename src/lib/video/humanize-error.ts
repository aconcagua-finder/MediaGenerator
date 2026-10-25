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

/**
 * Модерация Runway (Aleph): «Runway video generation was rejected by content
 * moderation: SAFETY.INPUT.MULTIMODAL...». Срабатывает на откровенные формулировки
 * про фигуру/одежду («busty», «curvy», «low-cut»); нейтральные проходят. Упавшая
 * задача не тарифицируется.
 */
const RUNWAY_MODERATION = /runway.{0,60}(moderation|rejected)|SAFETY\.INPUT/i

/** fal.ai: кончились деньги на предоплаченном балансе / ключ заблокирован */
const FAL_BALANCE = /exhausted balance|insufficient (balance|funds|credits)|user is locked|payment required/i

/**
 * ElevenLabs (замена голоса напрямую): `ElevenLabs <http> <код>: <текст>`
 * (см. `ElevenLabsError`). Разбираем по коду, а не по тексту: тексты у них
 * меняются, коды стабильны.
 */
const ELEVENLABS = /^ElevenLabs (\d{3}) ([a-z_]+): ?([\s\S]*)$/

function humanizeElevenLabs(http: number, code: string, detail: string): string {
  if (code === "invalid_api_key" || (http === 401 && code === "error")) {
    return "Ключ ElevenLabs недействителен или отозван. Администратор обновляет его в Настройках."
  }
  if (code === "missing_permissions" || code === "needs_authorization") {
    return "У ключа ElevenLabs не хватает прав: включите для него Voice Changer и Voices (чтение) в кабинете ElevenLabs."
  }
  if (/quota|credit|payment|subscription|limit_exceeded/.test(code) || /quota|credits?|insufficient/i.test(detail)) {
    return "На аккаунте ElevenLabs закончились кредиты. Пополните тариф на elevenlabs.io или дождитесь обновления лимита и повторите."
  }
  if (/voice_(not|unavailable|removed|deleted|access|private)/.test(code) || (http === 404 && /voice/i.test(detail))) {
    return "Этот голос ElevenLabs недоступен: автор удалил или скрыл его. Выберите другой голос."
  }
  if (/too_long|duration|length/.test(code) || /too long|duration|exceed/i.test(detail)) {
    return "Звук слишком длинный: ElevenLabs меняет голос максимум в 5-минутном отрезке. Обрежьте видео и повторите."
  }
  if (code === "timeout") {
    return "ElevenLabs не ответил за 2 минуты. Повторите чуть позже."
  }
  if (http === 429 || http >= 500 || /busy|concurrent|rate|unusual_activity/.test(code)) {
    return "ElevenLabs сейчас перегружен и не принял запрос. Повторите через минуту."
  }
  return `ElevenLabs вернул ошибку: ${detail || `HTTP ${http}`}`
}

export function humanizeVideoError(raw: string | null | undefined): string {
  const msg = (raw ?? "").trim()
  if (!msg) return "Генерация не удалась на стороне провайдера"

  const eleven = msg.match(ELEVENLABS)
  if (eleven) {
    return humanizeElevenLabs(Number(eleven[1]), eleven[2], eleven[3])
  }

  if (RUNWAY_MODERATION.test(msg)) {
    return "Модерация Runway отклонила запрос: уберите откровенные формулировки про фигуру и одежду (например, «busty», «curvy», «low-cut») и опишите образ нейтрально — например, «элегантное вечернее платье». За отклонённую задачу деньги не списываются."
  }

  if (FAL_BALANCE.test(msg)) {
    return "На балансе fal.ai закончились деньги (он предоплаченный) или ключ заблокирован. Пополните баланс на fal.ai/dashboard/billing и повторите."
  }

  if (TRANSIENT.test(msg)) {
    return "Провайдер модели временно перегружен и не смог обработать запрос — это нагрузка на стороне провайдера, не вашего сервера. Повторите через минуту или выберите другую модель (Seedance, Kling, Wan устойчивее)."
  }

  if (FILTERED.test(msg)) {
    return "Контент отклонён фильтром модели (часто срабатывает на фото реальных людей). Попробуйте другое изображение или промпт, либо модель помягче — Seedance, Kling, Wan."
  }

  return msg
}
