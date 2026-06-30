/**
 * Перевод сырых ошибок TTS-провайдера в человекочитаемые русские сообщения.
 * Зеркалит подход video/humanize-error.ts.
 */
export function humanizeVoiceError(raw: string): string {
  const s = (raw || "").toLowerCase()

  if (s.includes("404") || s.includes("provider returned 404")) {
    return "Модель сейчас недоступна у провайдера. Попробуйте другую модель озвучки."
  }
  if (s.includes("response_format") && s.includes("pcm")) {
    // Подстраховка: эта модель принимает только pcm (мы должны были выбрать его сами)
    return "Эта модель отдаёт аудио только в формате PCM/WAV. Сообщите администратору."
  }
  if (s.includes("voice") && (s.includes("invalid") || s.includes("not found") || s.includes("unknown"))) {
    return "Выбранный голос не поддерживается этой моделью. Выберите другой голос."
  }
  if (s.includes("rate limit") || s.includes("429") || s.includes("too many requests")) {
    return "Слишком много запросов к провайдеру. Подождите немного и повторите."
  }
  if (s.includes("insufficient") || s.includes("credit") || s.includes("quota") || s.includes("402")) {
    return "Недостаточно средств на ключе OpenRouter. Пополните баланс."
  }
  if (s.includes("filter") || s.includes("safety") || s.includes("blocked")) {
    return "Текст отклонён фильтром безопасности провайдера. Измените формулировку."
  }
  if (s.includes("timeout") || s.includes("timed out") || s.includes("econnreset")) {
    return "Провайдер не ответил вовремя. Попробуйте ещё раз."
  }
  if (s.includes("too long") || s.includes("max") && s.includes("length")) {
    return "Текст слишком длинный для этой модели. Сократите его."
  }

  // По умолчанию — отдаём исходное сообщение (часто оно и так осмысленное)
  return raw || "Не удалось синтезировать речь"
}
