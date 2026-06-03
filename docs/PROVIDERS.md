# MediaGenerator — Провайдеры и модели

> Актуально на: апрель 2026

---

## 1. OpenAI

**Endpoint:** `POST https://api.openai.com/v1/images/generations`

### Модели

| Модель | ID | Цена (1024x1024, medium) |
|--------|----|--------------------------|
| GPT Image 1.5 | `gpt-image-1.5` | $0.034 |
| GPT Image 1 | `gpt-image-1` | $0.042 |
| GPT Image 1 Mini | `gpt-image-1-mini` | $0.011 |

### Параметры

| Параметр | Значения |
|----------|----------|
| `size` | 1024x1024, 1536x1024, 1024x1536, 1792x1024, 1024x1792 |
| `quality` | low, medium, high |
| `output_format` | png, jpeg, webp |
| `background` | opaque, transparent |
| `n` | 1-10 |

**Важно:** GPT Image модели НЕ поддерживают `response_format: "b64_json"` — base64 возвращается по умолчанию. Параметр `response_format` нужен только для DALL-E.

### Ценообразование (за изображение)

| Модель | Low | Medium | High |
|--------|-----|--------|------|
| gpt-image-1.5 (1024) | $0.009 | $0.034 | $0.133 |
| gpt-image-1.5 (wide) | $0.013 | $0.050 | $0.200 |
| gpt-image-1 (1024) | $0.011 | $0.042 | $0.167 |
| gpt-image-1 (wide) | $0.016 | $0.063 | $0.250 |
| gpt-image-1-mini (1024) | $0.005 | $0.011 | $0.036 |
| gpt-image-1-mini (wide) | $0.006 | $0.015 | $0.052 |

---

## 2. xAI (Grok)

**Endpoint:** `POST https://api.x.ai/v1/images/generations`

### Модели

| Модель | ID | Цена |
|--------|----|------|
| Grok Imagine | `grok-imagine-image` | $0.02/изобр. |
| Grok Imagine Pro | `grok-imagine-image-pro` | $0.07/изобр. |

### Параметры

| Параметр | Значения |
|----------|----------|
| `aspect_ratio` | 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 2:1, 1:2 |
| `resolution` | 1k, 2k |
| `n` | 1-10 |
| `response_format` | b64_json, url |

---

## 3. OpenRouter (агрегатор)

**Endpoint:** `POST https://openrouter.ai/api/v1/chat/completions`

Использует chat completions формат с `modalities: ["image"]`.

### Модели

| Модель | ID | Цена ~  |
|--------|----|---------|
| Gemini 3.1 Flash Image | `google/gemini-3.1-flash-image-preview` | $0.04 |
| Gemini 3 Pro Image | `google/gemini-3-pro-image-preview` | $0.08 |
| Gemini 2.5 Flash Image | `google/gemini-2.5-flash-image` | $0.039 |
| GPT-5 Image | `openai/gpt-5-image` | $0.10 |
| GPT-5 Image Mini | `openai/gpt-5-image-mini` | $0.04 |
| FLUX.2 Pro | `black-forest-labs/flux.2-pro` | $0.03 |
| FLUX.2 Max | `black-forest-labs/flux.2-max` | $0.06 |
| FLUX.2 Flex | `black-forest-labs/flux.2-flex` | $0.02 |
| Seedream 4.5 | `bytedance-seed/seedream-4.5` | $0.04 |

### Параметры

| Параметр | Значения |
|----------|----------|
| `aspect_ratio` | 1:1, 2:3, 3:2, 3:4, 4:3, 9:16, 16:9 |
| `image_size` | 0.5K, 1K, 2K, 4K |

### Автообнаружение моделей

```
GET https://openrouter.ai/api/v1/models?output_modalities=image
```

Cron-сервис автоматически проверяет новые модели раз в сутки.

---

## Сравнение цен (1024x1024, стандарт)

| Модель | Цена |
|--------|------|
| OpenAI gpt-image-1-mini (low) | $0.005 |
| OpenAI gpt-image-1-mini (medium) | $0.011 |
| xAI Grok Imagine | $0.020 |
| FLUX.2 Flex | $0.020 |
| FLUX.2 Pro | $0.030 |
| OpenAI gpt-image-1.5 (medium) | $0.034 |
| Gemini 2.5 Flash | $0.039 |
| Seedream 4.5 | $0.040 |
| xAI Grok Imagine Pro | $0.070 |
| Gemini 3 Pro | $0.080 |
| GPT-5 Image (OpenRouter) | $0.100 |
| OpenAI gpt-image-1.5 (high) | $0.133 |

---

## 4. Perplexity (контент-pipeline)

**Endpoint:** `POST https://api.perplexity.ai/chat/completions` (streaming)

Используется только в разделе «Публикации» для шага Deep Research —
сбора свежего веб-контекста по рубрике.

### Модели

| Модель | ID | Назначение |
|--------|-----|-----------|
| Sonar Deep Research | `sonar-deep-research` | Глубокий веб-ресёрч за окно дней (по умолчанию) |
| Sonar Pro | `sonar-pro` | Быстрее и дешевле, ниже глубина |
| Sonar | `sonar` | Минимальный, для проверки ключа |

### Параметры

| Параметр | Значения |
|----------|----------|
| `reasoning_effort` | `low` / `medium` / `high` |
| `web_search_options.search_type` | `pro` |
| `web_search_options.search_context_size` | `low` / `medium` / `high` |
| `return_citations` | true (всегда) |
| `stream` | true (всегда, чтение SSE) |

Ценообразование считается грубо по prompt/completion-токенам (см.
`PERPLEXITY_PRICING` в `src/lib/content/perplexity-search.ts`) — учитывается
в `user.totalSpent` как и остальные провайдеры.

---

## 6. OpenRouter — классификатор «Мониторинга»

В разделе «Мониторинг» (режим `topics`) используется AI-классификатор: для
каждого собранного из Telegram/сайта поста определяет одно из трёх —
`close` (близкое совпадение с темой), `indirect` (косвенное), `none`.
С каждым ответом возвращает короткое обоснование («почему модель так решила»).

**Дефолт:** `anthropic/claude-sonnet-4.6` — выбран по итогам реальных тестов
на 487 постах с двумя темами:

| Модель | Время | Цена | Найдено | Точность close |
|--------|-------|------|---------|----------------|
| Haiku 4.5 | 6.8 мин | $0.48 | 72 | средняя (либеральный) |
| **Sonnet 4.6** | **10.5 мин** | **$1.15** | 46 | **высокая** |
| Gemini 3.1 Pro | 26 мин | $2.16 | 36 | очень высокая, но дорого/медленно |

Пользователь может переключить модель в настройках шаблона на любую из
доступных (Haiku 4.5, Sonnet 4.6, Opus 4.7, GPT-5-mini, GPT-5.4, GPT-5.5,
Gemini 3 Flash, Gemini 3.5 Flash, Gemini 3.1 Pro, Grok 4.3, Grok 4.20).

- **Endpoint:** `POST https://openrouter.ai/api/v1/chat/completions`
- **Параметры:** `temperature: 0` (без `response_format` — несовместимо с Gemini через OpenRouter)
- **Батчи:** 8 постов на один запрос (`classifier.batchSize`)
- **Промпт:** строгий тематический фильтр, явный запрет расширять тему
  (страна/площадка/предмет должны совпадать со специфическим описанием темы)
- **Прогресс:** инкрементальные обновления `monitoring_runs.artifacts.classifierLog`
  после каждого батча для UI-прогресс-бара с оценкой оставшегося времени

## 5. OpenAI Responses API (Reddit-поиск)

**Endpoint:** `POST https://api.openai.com/v1/responses`

Используется в pipeline «Публикаций» для опционального шага сбора
Reddit-обсуждений: запускается web-search-tool, модель сама ходит
по тредам и возвращает структурированный отчёт.

Модели — те же, что используются в чате (`gpt-5.4`, `gpt-5.5`, `gpt-5-mini`).
Учёт стоимости — по `input_tokens` / `output_tokens` из ответа.

Шаг можно отключить per-рубрика в UI (вкладка «Параметры» → Reddit-поиск),
тогда OpenAI-ключ не требуется.

---

## Видео (OpenRouter)

Генерация видео идёт через OpenRouter **тем же API-ключом**, что картинки и чат
(`provider = "openrouter"`). Провайдер асинхронный (job → polling).

### API
- `POST /api/v1/videos` → `{ id, polling_url, status: "pending" }`
- `GET /api/v1/videos/{id}` → `{ status: pending|in_progress|completed|failed, unsigned_urls[], usage: { cost } }`
- `GET /api/v1/videos/{id}/content?index=0` → сырые байты mp4
- Заголовки те же: `Authorization: Bearer`, `HTTP-Referer`, `X-Title`
- Тело: `model`, `prompt`, `duration`, `resolution`, `aspect_ratio`, `generate_audio`, `frame_images` (i2v), `seed`
- ❗ `frame_images` — массив **объектов**, не строк. Каждый: `{ type: "image_url", image_url: { url }, frame_type: "first_frame" | "last_frame" }`. `url` принимает data:-URI или ссылку. Передача массива строк → 400 `expected object, received string` (i2v молча падает, t2v работает). См. `src/lib/providers/video/openrouter-video.ts`.

### Модели (курировано; цена ≈ за секунду, биллинг по факту `usage.cost`)
| Модель | t2v/i2v | Звук | Длит., сек | Разрешение | ≈$/сек |
|--------|---------|------|------------|------------|--------|
| `bytedance/seedance-2.0` | оба | да | 4/8/12 | 480p/720p/1080p | ~0.07 |
| `google/veo-3.1` | оба | да | 4/6/8 | 720p/1080p/4K | ~0.40 |
| `google/veo-3.1-fast` | оба | да | 4/6/8 | 720p/1080p/4K | ~0.15 |
| `kwaivgi/kling-v3.0-pro` | оба | да | 5/10 | 720p | ~0.112 |
| `kwaivgi/kling-v3.0-std` | оба | да | 5/10 | 720p | ~0.084 |
| `openai/sora-2-pro` | t2v | да | 4/8/12 | 720p/1080p | ~0.40 |
| `minimax/hailuo-2.3` | t2v | нет | 6/10 | 1080p | ~0.082 |
| `alibaba/wan-2.6` | t2v | да | 5/10 | 720p/1080p | ~0.10 |
| `x-ai/grok-imagine-video` | t2v | нет | 5/10 | 480p/720p | ~0.06 |

Источник правды — `src/lib/providers/video-models.ts`. Цены за секунду — ориентир для UI;
точная сумма берётся из ответа OpenRouter (`usage.cost`) после генерации.

### Поток
`POST /api/video/generate` (submit) → `GET /api/video/[id]/status` (polling, скачивание mp4 в S3 при `completed`)
→ `GET /api/videos/[id]` (раздача mp4 с Range). Подробнее — в `ARCHITECTURE.md`.

---

## Безопасность API ключей

- Ключи шифруются AES-256-GCM перед сохранением в БД
- Клиент видит только hint (последние 4 символа)
- Расшифровка происходит только на сервере при генерации
- При регистрации новый юзер получает копии ключей админа (зашифрованные)
- Fallback: если у юзера нет ключа — используется ключ админа
