/**
 * Ошибки ElevenLabs по-русски — общие для замены голоса и озвучки.
 * Формат сырого сообщения: `ElevenLabs <http> <код>: <текст>` (см. `ElevenLabsError`).
 * Разбираем по коду, а не по тексту: тексты у них меняются, коды стабильны.
 */

const ELEVENLABS = /^ElevenLabs (\d{3}) ([a-z_]+): ?([\s\S]*)$/

/** Где случилась ошибка: от этого зависят подсказки про права ключа и длину */
export type ElevenLabsErrorContext = "voice_change" | "tts"

/** Русский текст для ошибки ElevenLabs или null, если сообщение не от ElevenLabs */
export function humanizeElevenLabsMessage(raw: string, context: ElevenLabsErrorContext): string | null {
  const m = raw.trim().match(ELEVENLABS)
  if (!m) return null
  const http = Number(m[1])
  const code = m[2]
  const detail = m[3]

  if (code === "invalid_api_key" || (http === 401 && code === "error")) {
    return "Ключ ElevenLabs недействителен или отозван. Администратор обновляет его в Настройках."
  }
  if (code === "missing_permissions" || code === "needs_authorization") {
    return context === "tts"
      ? "У ключа ElevenLabs не хватает прав: включите для него Text to Speech и Voices (чтение) в кабинете ElevenLabs."
      : "У ключа ElevenLabs не хватает прав: включите для него Voice Changer и Voices (чтение) в кабинете ElevenLabs."
  }
  if (/quota|credit|payment|subscription/.test(code) || /quota|credits?|insufficient/i.test(detail)) {
    return "На аккаунте ElevenLabs закончились кредиты. Пополните тариф на elevenlabs.io или дождитесь обновления лимита и повторите."
  }
  if (/voice_(not|unavailable|removed|deleted|access|private)/.test(code) || (http === 404 && /voice/i.test(detail))) {
    return "Этот голос ElevenLabs недоступен: автор удалил или скрыл его. Выберите другой голос."
  }
  if (/too_long|duration|length|character_limit/.test(code) || /too long|duration|exceed/i.test(detail)) {
    return context === "tts"
      ? "Текст слишком длинный для этой модели ElevenLabs. Сократите его или выберите модель с большим лимитом."
      : "Звук слишком длинный: ElevenLabs меняет голос максимум в 5-минутном отрезке. Обрежьте видео и повторите."
  }
  if (code === "timeout") {
    return "ElevenLabs не ответил за 2 минуты. Повторите чуть позже."
  }
  if (http === 429 || http >= 500 || /busy|concurrent|rate|unusual_activity/.test(code)) {
    return "ElevenLabs сейчас перегружен и не принял запрос. Повторите через минуту."
  }
  return `ElevenLabs вернул ошибку: ${detail || `HTTP ${http}`}`
}
