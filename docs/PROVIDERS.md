# MediaGenerator — Провайдеры и модели

> Актуально на: август 2026 (аудит 2026-W33)

---

## 1. OpenAI

**Endpoint:** `POST https://api.openai.com/v1/images/generations`

### Модели

| Модель | ID | Цена (1024x1024, medium) |
|--------|----|--------------------------|
| GPT Image 2 | `gpt-image-2` | $0.053 |
| GPT Image 1.5 | `gpt-image-1.5` | $0.034 |
| GPT Image 1 | `gpt-image-1` | $0.042 |
| GPT Image 1 Mini | `gpt-image-1-mini` | $0.011 |

> `gpt-image-2` (флагман, апр 2026) — лучшее качество и кириллица, но **не**
> поддерживает прозрачный фон (только opaque/auto). Для прозрачного фона —
> `gpt-image-1.5` / `gpt-image-1`.
>
> ⚠️ **Все три старые image-модели OpenAI отключаются в этом году** (уточнено в
> аудите 2026-W30 по developers.openai.com/api/docs/deprecations):
>
> | Модель | Отключение | Замена |
> |--------|-----------|--------|
> | `gpt-image-1` | **23.10.2026** | `gpt-image-2` |
> | `gpt-image-1.5` | **01.12.2026** | `gpt-image-2` |
> | `gpt-image-1-mini` | **01.12.2026** | `gpt-image-2` |
>
> `gpt-image-2` — единственная без даты отключения. ❗ Но она НЕ умеет прозрачный
> фон, а `gpt-image-1.5`/`gpt-image-1` умеют — то есть после 01.12.2026 у нас
> **пропадёт прозрачный фон** как возможность (сверено: `background:
> ["opaque","transparent"]` есть ровно у этих трёх и ни у кого больше).
> Нужно заранее решить: искать замену среди других провайдеров или убирать
> опцию из UI. Даты продублированы в `description`
> моделей в `seed-models.ts`, чтобы их видел пользователь в селекторе.
> `dall-e-2`/`dall-e-3` уже отключены (12.05.2026) — в реестре их нет.

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
| gpt-image-2 (1024) | $0.006 | $0.053 | $0.211 |
| gpt-image-2 (wide) | $0.009 | $0.080 | $0.317 |
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
| Grok Imagine Quality | `grok-imagine-image-quality` | $0.05/изобр. |

> `grok-imagine-image-pro` выведен из эксплуатации 15.05.2026 — теперь это
> просто алиас на `grok-imagine-image-quality` (запросы авто-редиректятся).

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
| Gemini 3.1 Flash Image (Nano Banana 2) | `google/gemini-3.1-flash-image` | $0.067 |
| Gemini 3.1 Flash Lite Image (Nano Banana 2 Lite) | `google/gemini-3.1-flash-lite-image` | $0.034 |
| Gemini 3 Pro Image | `google/gemini-3-pro-image` | $0.08 |
| Gemini 2.5 Flash Image | `google/gemini-2.5-flash-image` | $0.039 |
| GPT-5 Image | `openai/gpt-5-image` | $0.10 |
| GPT-5 Image Mini | `openai/gpt-5-image-mini` | $0.04 |
| GPT-5.4 Image 2 | `openai/gpt-5.4-image-2` | $0.12 |
| FLUX.2 Pro | `black-forest-labs/flux.2-pro` | $0.03 |
| FLUX.2 Max | `black-forest-labs/flux.2-max` | $0.07 |
| FLUX.2 Flex | `black-forest-labs/flux.2-flex` | $0.06 |
| Seedream 4.5 | `bytedance-seed/seedream-4.5` | $0.04 |

> ⚠️ FLUX.2 (`black-forest-labs/flux.2-*`) и Seedream (`bytedance-seed/seedream-4.5`)
> работают на OpenRouter по прямому slug, но **не входят** в дефолтный список
> `?output_modalities=image` (его дёргает `listModels` / авто-обнаружение), поэтому
> зафиксированы в `seed-models.ts` вручную. Проверено через
> `GET /api/v1/models/{slug}/endpoints` (HTTP 200, status 0) — июнь 2026.
> FLUX.2 также доступен напрямую через провайдер BFL (раздел ниже).

> 🔎 **Аудит 2026-W33: FLUX 3 частично открылась — видео поехало, картинка ещё нет.**
> BFL анонсировала FLUX 3 (23.07.2026, W32) как закрытый ранний доступ. К W33
> **видеочасть уже живёт на OpenRouter** — `black-forest-labs/flux-3-video`
> (канонический слаг `-20260804`, в `/videos/models`), добавлена в `video-models.ts`
> (см. раздел «Видео»). А вот **image-часть FLUX 3 всё ещё без публичного API**:
> `GET /models/black-forest-labs/flux.3-pro|flux.3/endpoints` → 404 (проверено W33).
> Поэтому в image-реестре (`seed-models.ts`) по-прежнему только FLUX.2
> (pro/max/flex/klein) — без дат отключения. Вернуться к FLUX.3 image, когда откроют.

> ⚠️ **Gemini image — preview → GA (миграция завершена):** OpenRouter-записи
> `seed-models.ts` **полностью на GA-id** — `google/gemini-3.1-flash-image` (Nano
> Banana 2) и `google/gemini-3-pro-image` (Nano Banana Pro). Flash мигрировали
> раньше, Pro — последним (задача из аудита W29, применена поверх main отдельным
> коммитом). У **прямого Google API** (провайдер `google`) записи и так на GA-id
> (GA с 28.05.2026). Старые `-preview`-строки в `model_registry` деактивируются
> идемпотентно при сидинге через `RETIRED_OPENROUTER_MODELS` (см. `actions/models.ts`).
>
> Preview-slug'и у прямого Google API отключены **25.06.2026**; на OpenRouter они
> ещё отвечали 200 на 20.07.2026 (проверено `endpoints`), но зависеть от них
> незачем — в реестре не используются. Ключи `*-preview` в таблицах цен
> (`cost-calculator.ts`, `google.ts`) оставлены как безвредный фолбэк для старых
> строк registry. `gemini-2.5-flash-image` (GA) жив на обоих — дедлайн отключения
> **02.10.2026** (мигрировать на 3.1-flash); дата перепроверена в W30, не изменилась.
> ❗ В таблице депрекейшенов Google заменой всё ещё указан `gemini-3.1-flash-image-preview`,
> который сам отключён 25.06.2026 — строка у Google протухла, реальная цель — GA
> `gemini-3.1-flash-image` (у нас уже он). Imagen (`imagen-4.0-*`, отключение
> 17.08.2026) в проекте не используется — проверено grep'ом.

### Параметры

| Параметр | Значения |
|----------|----------|
| `aspect_ratio` | 1:1, 2:3, 3:2, 3:4, 4:3, 9:16, 16:9 |
| `image_size` | 0.5K, 1K, 2K, 4K |

### Автообнаружение и аудит моделей (раз в сутки)

`POST /api/cron/model-check` дёргается cron-контейнером раз в сутки и запускает
**два независимых слоя**:

1. **`checkModelsForUpdates()`** (`model-checker.ts`) — DB-чекер image-провайдеров.
   По `listModels` каждого провайдера сверяет `model_registry`, добавляет новые
   модели (неактивными) и шлёт уведомления о новых/удалённых.
   ```
   GET https://openrouter.ai/api/v1/models?output_modalities=image
   ```
2. **`runRegistryAudit()`** (`registry-audit.ts`) — аудит СТАТИЧЕСКИХ реестров
   (`text-models.ts`, `video-models.ts`, openrouter-image в `seed-models.ts`)
   против живого OpenRouter. Ловит: дрейф цены текстовых моделей (>5% и ≥$0.01),
   их пропажу; новые/исчезнувшие видеомодели; недоступность image-slug'ов —
   причём FLUX/Seedream проверяет точечно через `/models/{slug}/endpoints`
   (они не попадают в дефолтный `?output_modalities=image`).

> ❗ Оба слоя ловят только **механику** (id, цена за токен). «Суждение» —
> описания, русская озвучка, форматы/длительности, даты deprecation из
> changelog'ов провайдеров (как отключение Gemini-preview 25.06.2026, которого
> нет ни в одном API) — это задача периодического **облачного аудит-роутинга**
> (`/schedule`), а не крона.

---

## Recraft (прямой API) — вектор

В реестре одна модель: `recraft-v3-vector` (SVG, $0.08/изобр.).

> 🔎 **Аудит 2026-W30:** у Recraft вышла линейка **V4.1**, и она дешевле V4 при
> том же назначении: V4.1 Vector $0.08 (= V3), V4.1 растр $0.035 против $0.04 у V4,
> V4.1 Pro растр $0.21 против $0.25 у V4 Pro. Депрекейшенов **нет вообще** — всё
> от V2 до V4.1 продолжает работать, так что `recraft-v3-vector` не горит.
> Апгрейд на `recraft-v4.1-vector` — по желанию владельца (цена та же, качество
> новее); не делаем автоматически, т.к. точный id модели в API не подтверждён
> живым вызовом (нужен ключ recraft.ai).

---

## Сравнение цен (1024x1024, стандарт)

| Модель | Цена |
|--------|------|
| OpenAI gpt-image-1-mini (low) | $0.005 |
| OpenAI gpt-image-1-mini (medium) | $0.011 |
| xAI Grok Imagine | $0.020 |
| FLUX.2 Pro | $0.030 |
| OpenAI gpt-image-1.5 (medium) | $0.034 |
| Gemini 2.5 Flash | $0.039 |
| Seedream 4.5 | $0.040 |
| xAI Grok Imagine Quality | $0.050 |
| FLUX.2 Flex | $0.060 |
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

> 🔎 **Аудит 2026-W32.** Цены трёх наших моделей у Perplexity не изменились
> (sonar $1/$1, sonar-pro $3/$15, sonar-deep-research $2 in / $8 out + reasoning $3/M
> — совпадает с `PERPLEXITY_PRICING`). В прайсе появился **новый тир
> `sonar-reasoning-pro` ($2 in / $8 out)** — reasoning-модель между pro и
> deep-research; в реестр (`perplexity.ts` listModels + `PERPLEXITY_PRICING`)
> **не добавлен** — расширение выбора моделей в UI это продуктовое решение владельца.
> Также Perplexity переименовала «Chat Completions» → **Agent API** (миграция
> интерфейса, не отключение). Наш `POST /chat/completions` пока работает — следить,
> не появится ли дата отключения старого пути.

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

> 🔎 **Кандидат на смену дефолта (аудит 2026-W30):** вышла `anthropic/claude-sonnet-5`
> — на OpenRouter $2/$10 против $3/$15 у Sonnet 4.6, то есть новее И дешевле
> (вводная цена до 31.08.2026, потом возврат к $3/$15). Дефолт классификатора
> **намеренно не меняли**: таблица выше — результат замеров на 487 постах, и
> переключать модель без повторного замера значит потерять это обоснование.
> Прогнать тот же бенчмарк на Sonnet 5 и решить по цифрам.

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

> ⏳ **`gpt-5-mini` — на исходе.** Датированный снапшот `gpt-5-mini-2025-08-07`
> отключается **11.12.2026**. ❗ Замена в таблице депрекейшенов OpenAI теперь —
> **`gpt-5.6-terra`** (в W31 значилась `gpt-5.4-mini`; сверено W32: вся базовая
> линейка gpt-5 / -mini / -nano / -pro уходит на GPT-5.6 Sol/Terra/Luna).
> Покрыт ли тем же сроком голый алиас `gpt-5-mini` (а мы пиним именно его), OpenAI
> явно не пишет — считаем, что резолвится в отключаемый снапшот, и мигрируем заранее.
> Цены в `OPENAI_PRICING` (`reddit-search.ts`) сверены с `text-models.ts` —
> расхождений нет. У `gpt-5.4`/`gpt-5.5` дат отключения не объявлено, но
> обе съехали в legacy: актуальная линейка — GPT-5.6 (Sol $5/$30, Terra $2.5/$15,
> Luna $1/$6, все на OpenRouter). Кураторское решение по 5.6 — за владельцем.

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
| `bytedance/seedance-2.0` | оба | да | 4/8/12 | 480p/720p/1080p/4K | ~0.07 |
| `alibaba/happyhorse-1.1` | оба | нет¹ | 4/8/12 | 720p/1080p | ~0.099 |
| `google/veo-3.1` | оба | да | 4/6/8 | 720p/1080p/4K | ~0.40 |
| `kwaivgi/kling-v3.0-pro` | оба | да | 5/10 | 720p | ~0.168 |
| `kwaivgi/kling-video-o1` | оба | да | 5/10 | 720p | ~0.112 |
| `openai/sora-2-pro` | t2v | да | 4/8/12/16/20 | 720p/1080p | ~0.30 |
| `google/veo-3.1-fast` | оба | да | 4/6/8 | 720p/1080p/4K | ~0.12 |
| `google/veo-3.1-lite` | оба | да | 4/6/8 | 720p/1080p | ~0.05 |
| `kwaivgi/kling-v3.0-std` | оба | да | 5/10 | 720p | ~0.126 |
| `minimax/hailuo-3` | оба | да³ | 5/10 | 2K | ~0.13 |
| `runway/gen-4.5` | оба | нет | 5/10 | 720p | ~0.12 |
| `black-forest-labs/flux-3-video` | оба | да⁴ | 5/10/15/20 | 720p/1080p | ~0.17 |
| `minimax/hailuo-2.3` | оба | нет | 6/10 | 1080p | ~0.082 |
| `alibaba/wan-2.6` | оба | да | 5/10 | 720p/1080p | ~0.10 |
| `alibaba/wan-2.7` | оба | да | 5/10 | 720p/1080p | ~0.10 |
| `bytedance/seedance-2.0-fast` | оба | да | 4/8/12 | 480p/720p | ~0.05 |
| `bytedance/seedance-1-5-pro` | оба | да | 4/8/12 | 480p/720p/1080p | ~0.02 |
| `x-ai/grok-imagine-video` | оба | нет | 5/10 | 480p/720p | ~0.06 |
| `x-ai/grok-imagine-video-1.5` | **только i2v** | нет² | 5/10 | 480p/720p/1080p | ~0.08 |

Источник правды — `src/lib/providers/video-models.ts`. Цены за секунду — ориентир для UI;
точная сумма берётся из ответа OpenRouter (`usage.cost`) после генерации.

> ³ **Новинки аудита 2026-W32:** `minimax/hailuo-3` (MiniMax H3 — 2K-only, длит. 5–15,
> `generate_audio:true`, i2v по first/last-кадру; SKU `duration_seconds` $0.13 + `reference_images`
> $0.04 за i2v-кадр) и `runway/gen-4.5` (Runway, t2v+i2v по первому кадру, 720p, без звука,
> `cents_per_second_output` 12 → $0.12/сек). У hailuo-3 звук есть, но **русская озвучка не
> подтверждена** (`russianSpeech:"partial"`).
>
> ⁴ **Новинка аудита 2026-W33: `black-forest-labs/flux-3-video`** (BFL, канонический слаг
> `-20260804`) — первая видеомодель линейки FLUX. t2v + i2v по опорным кадрам (первый/последний)
> + продолжение клипа, 720p/1080p, длит. 5–20 сек, `generate_audio:true`. Цена по SKU
> `cents_per_second_output`: 720p 17¢ → $0.17/сек, 1080p 29¢ → $0.29/сек (продолжение клипа
> дороже — 41/53¢, в оценку за секунду не входит). Звук есть, но **русская речь не подтверждена**
> (`russianSpeech:"partial"`). Это делает нашу же пометку W32 «FLUX 3 без публичного API»
> частично устаревшей — видеочасть открылась (image-часть FLUX 3 всё ещё 404, см. раздел
> OpenRouter выше).
>
> ⏭️ **Намеренно НЕ добавлен `runway/aleph-2`** — это модель *редактирования существующего
> видео* (in-context video editing по тексту/кейфреймам поверх входного клипа), а наш пайплайн
> умеет только t2v/i2v через `frame_images` и не принимает входное видео. Крон `model-check` будет
> еженедельно показывать её как «новую» — это ожидаемо, добавлять её нельзя без video-input флоу.
>
> ⏭️ **`bytedance/seedance-2.5` (07.08.2026) — новая, но пока НЕ добавлена (решение владельца).**
> Появилась в `/videos/models` (канонический слаг `-20260807`). Это t2v/i2v (first/last-кадр),
> но **сайдгрейд к нашему дефолту `seedance-2.0`, а не апгрейд**: максимум 720p (у 2.0 — до 4K)
> и дороже за секунду (`video_tokens` $0.0000107 → 720p ≈ $0.23/сек против $0.15 у 2.0). Плюс —
> длинный формат (до 30 сек), мультиреференс, редактирование и продолжение видео. Добавлять
> имеет смысл только если нужен именно long-form/editing; иначе плодит путаницу («2.5» хуже «2.0»
> по разрешению). Крон `model-check` будет показывать её как «новую» — это ожидаемо.

> ❗ **Звук влияет на цену.** У моделей со звуком цена в таблице — с включённым
> звуком (он включён по умолчанию): Kling 3.0 Pro $0.112→$0.168, Std $0.084→$0.126.
> Seedance/Wan за звук берут столько же; Veo и Sora считают звук по отдельному тарифу.
> `alibaba/wan-2.6` теперь **генерирует звук** (`generate_audio:true` в API — раньше было
> `false`; обновлено в аудите 2026-W27), но русская озвучка не гарантирована.
>
> ¹ `alibaba/happyhorse-1.1` (лидер слепых тестов арены, ~июнь 2026) у вендора заявлен
> с нативным звуком/lip-sync, но на OpenRouter `generate_audio` не выставляется
> (`null`), а i2v принимает только первый кадр — поэтому в реестре `supportsAudio:false`.

> ² **Grok Imagine Video 1.5** — появилась на OpenRouter 19.07.2026 (канонический слаг
> `x-ai/grok-imagine-video-1.5-20260719`) и добавлена в реестр в аудите 2026-W30.
> ❗ Это **image-to-video ONLY**: карточка модели на docs.x.ai описывает её как «оживить
> кадр по текстовому промпту», а reference-to-video прямо не поддерживается («requires
> `grok-imagine-video`»). Поэтому `modes: ["i2v"]`, а в `/api/video/generate` есть
> зеркальная проверка: запрос без картинки → 400 с понятным текстом (иначе ушёл бы
> как t2v и упал у провайдера).
>
> Звук: xAI в официальных доках про звук у 1.5 **молчит**, OpenRouter отдаёт
> `generate_audio: null` и не имеет audio-SKU → в реестре `supportsAudio: false`
> (как у happyhorse-1.1). Сторонние агрегаторы заявляют нативный lip-sync, но
> противоречат друг другу — не кодируем как факт без живой проверки.
>
> `supported_aspect_ratios` у 1.5 — `null` (формат наследуется от стартового кадра),
> поэтому `aspectRatios: []` и параметр `aspect_ratio` в API не отправляется.
> Цена по SKU OpenRouter: 480p $0.08 / 720p $0.14 / 1080p $0.25 за секунду
> (прямой прайс xAI — плоские $0.080/сек).

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
