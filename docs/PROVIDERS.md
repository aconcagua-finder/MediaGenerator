# MediaGenerator — Провайдеры и модели

> Актуально на: сентябрь 2026 (аудит 2026-W40)

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

**Endpoints:**
- `POST https://openrouter.ai/api/v1/chat/completions` — chat completions с `modalities: ["image"]` (или `["image","text"]`). Так работают модели из таблицы «Модели» ниже (Gemini, GPT-5 Image, FLUX.2, Seedream 4.5).
- `POST https://openrouter.ai/api/v1/images` — выделенный Images API (окт 2026). Через него ходят **все остальные** модели (таблица «Images API» ниже): часть из них (FLUX.3, Recraft V4 и др.) через chat/completions отвечает 400 `is an image generation model and cannot be used with the chat/completions endpoint`.

Выбор эндпоинта — `usesImagesApi()` в `src/lib/providers/openrouter.ts`: модель из набора `CHAT_COMPLETIONS_MODELS` идёт в chat, всё остальное — в Images API.

### Модели

| Модель | ID | Цена ~  |
|--------|----|---------|
| Gemini 3.1 Flash Image (Nano Banana 2) | `google/gemini-3.1-flash-image` | $0.067 |
| Gemini 3.1 Flash Lite Image (Nano Banana 2 Lite) | `google/gemini-3.1-flash-lite-image` | $0.034 |
| Gemini 3 Pro Image | `google/gemini-3-pro-image` | $0.08 |
| Gemini 2.5 Flash Image ⚠️ off 02.10.2026 | `google/gemini-2.5-flash-image` | $0.039 |
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

> 🔎 **Аудит 2026-W35: дедлайн отключения `gemini-2.5-flash-image` — 02.10.2026.**
> Google подтвердил дату вывода (changelog Gemini API): 2 октября 2026 модель
> отключается, преемник — Nano Banana 2 / Lite (`gemini-3.1-flash-image[-lite]`).
> На дату аудита (24.08) модель ещё жива на OpenRouter и у прямого Google. В
> описания реестра (`seed-models.ts`, обе записи, и `cover-models.ts`) добавлена
> пометка ⚠️. После 02.10 крон `model-check` поймает её исчезновение из `/models`
> — тогда убрать записи из `seed-models.ts`, `cover-models.ts`, `capabilities.ts`
> и `image-edit-dialog.tsx`.

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

### Images API — модели, добавленные 2026-10-07

Источник правды — `src/lib/providers/openrouter-image-models.ts` (спецификации; из них строятся сид,
`cost-calculator.ts`, карта правок `capabilities.ts` и бейдж «Новинка»). Параметры и цены сверены с
`GET /api/v1/images/models` и `GET /api/v1/images/models/{slug}/endpoints`.

| Модель | ID | Цена за изобр. | Размеры | Референс (правка) |
|--------|----|----------------|---------|-------------------|
| GPT Image 2.5 Sunburst | `openai/gpt-image-2.5-sunburst` | $0.12 | — | да |
| GPT Image 2.5 Flare | `openai/gpt-image-2.5-flare` | $0.12 | — | да |
| FLUX.3 Image | `black-forest-labs/flux-3-image` | 1K $0.048 / 2K $0.1 / 4K $0.607 | 1K/2K/4K | да |
| Seedream 5.0 Pro | `bytedance-seed/seedream-5-0-pro` | 1K $0.045 / 2K $0.09 | 1K/2K | да |
| Seedream 5.0 Lite | `bytedance-seed/seedream-5-0-lite` | $0.035 | 2K/4K | да |
| Seedream 5.0 Flash | `bytedance-seed/seedream-5-0-flash` | $0.018 | 1K/2K | да |
| Grok Imagine Image 2.0 | `x-ai/grok-imagine-image-2.0` | 1K $0.06 / 2K $0.08 | 1K/2K | да |
| Nano Banana 2.1 | `google/gemini-nano-banana-2.1` | 1K $0.034 / 2K $0.051 / 4K $0.076 | 1K/2K/4K | да |
| Qwen Image 3 | `qwen/qwen-image-3` | 1K $0.03 / 2K $0.03 | 1K/2K | да |
| Qwen Image 3 Pro | `qwen/qwen-image-3-pro` | 1K $0.04 / 2K $0.075 | 1K/2K | да |
| Recraft V4 | `recraft/recraft-v4` | $0.04 | — | да |
| Recraft V4 Pro | `recraft/recraft-v4-pro` | $0.25 | — | да |
| Recraft V4 Вектор (SVG) | `recraft/recraft-v4-vector` | $0.08 | — | да |
| Recraft V4 Pro Вектор (SVG) | `recraft/recraft-v4-pro-vector` | $0.3 | — | да |
| Recraft V4.1 | `recraft/recraft-v4.1` | $0.035 | — | да |
| Recraft V4.1 Flash | `recraft/recraft-v4.1-flash` | $0.007 | — | нет |
| Recraft V4.1 Pro | `recraft/recraft-v4.1-pro` | $0.21 | — | да |
| Recraft V4.1 Utility | `recraft/recraft-v4.1-utility` | $0.035 | — | да |
| Recraft V4.1 Utility Pro | `recraft/recraft-v4.1-utility-pro` | $0.21 | — | да |
| Recraft V4.1 Вектор (SVG) | `recraft/recraft-v4.1-vector` | $0.08 | — | да |
| Recraft V4.1 Pro Вектор (SVG) | `recraft/recraft-v4.1-pro-vector` | $0.3 | — | да |
| MAI-Image 2.5 | `microsoft/mai-image-2.5` | $0.048 | — | да |
| MAI-Image 2.5 Pro | `microsoft/mai-image-2.5-pro` | $0.111 | — | да |
| MAI-Image 2.6 | `microsoft/mai-image-2.6` | $0.039 | — | да |
| MAI-Image 2.6 Flash | `microsoft/mai-image-2.6-flash` | $0.0195 | — | да |
| Krea 2 Large | `krea/krea-2-large` | $0.06 | — | да |
| Krea 2 Medium | `krea/krea-2-medium` | $0.03 | — | да |
| Krea 2 Medium Turbo | `krea/krea-2-medium-turbo` | $0.015 | — | да |
| Meta Muse Image | `meta/muse-image` | $0.01 | — | да |
| Hy Image 3.5 (preview) | `tencent/hy-image-v3.5-preview` | 1K $0.024 / 2K $0.096 | 1K/2K | да |
| Ming Image 0.1 Design | `inclusionai/ming-image-0.1-design` | бесплатно | — | нет |
| Riverflow V2 Fast | `sourceful/riverflow-v2-fast` | 1K $0.02 / 2K $0.04 | 1K/2K | да |
| Riverflow V2 Pro | `sourceful/riverflow-v2-pro` | 1K $0.15 / 2K $0.15 / 4K $0.33 | 1K/2K/4K | да |
| Riverflow V2.5 Fast | `sourceful/riverflow-v2.5-fast` | 1K $0.019 / 2K $0.021 | 1K/2K | да |
| Riverflow V2.5 Pro | `sourceful/riverflow-v2.5-pro` | 1K $0.13 / 2K $0.15 / 4K $0.17 | 1K/2K/4K | да |

Запрос: `{ model, prompt, n: 1, aspect_ratio?, resolution?, quality?, output_format?, input_references? }`
(`image_size` формы → `resolution`, `0.5K` → `512`). Ответ: `data[].b64_json` + `media_type`, `usage.cost`.
- Адаптер делает **`count` параллельных запросов с `n=1`** (многие модели принимают только 1 и режут `n>1`),
  при частичном отказе возвращает удавшиеся и считает деньги только за них.
- Сумма списания берётся из `usage.cost`; цена реестра — оценка для формы и лимитов.
  Если `usage.cost` нет — оценка реестра.
- Векторные модели (`*-vector`) получают `output_format: "svg"`, результат хранится как SVG.
- Правка (`/api/edit` и вложение в форме генерации) идёт в `input_references` как data-URI.
- Реальные размеры берутся из заголовка файла (`image-meta.ts`).

Живая проверка 07.10.2026 (Images API, 1:1): Seedream 5.0 Lite $0.035 (2048×2048 даже при `1K` —
у модели минимум 2K), Krea 2 Medium Turbo $0.015, Hy Image 3.5 1K $0.024 (15000 токенов),
MAI-Image 2.6 Flash $0.0195 (1024 токена на изображение), FLUX.3 Image 1K списал **$0.024** при прайсе
$0.048 (OpenRouter сейчас даёт скидку 50%). Цены Gemini-подобных (`Nano Banana 2.1`), `Hy 2K`, `GPT Image 2.5`,
`MAI 2.5/2.5 Pro` и `Krea Large/Medium`, `Meta Muse` — оценка по токенному тарифу.

Не добавлены намеренно:
- `recraft/recraft-v4-styles`, `-styles-pro`, `-styles-vector`, `-styles-pro-vector` — требуют **минимум 1
  референс-картинку** (`input_references.min = 1`), в text-to-image форме их не вызвать;
- `inclusionai/ming-image-0.1-design-layer` — тоже обязательный входной файл;
- `openai/gpt-image-2`, `gpt-image-1`, `gpt-image-1-mini`, `x-ai/grok-imagine-image-quality`,
  `black-forest-labs/flux.2-klein-4b`, `recraft/recraft-v3` — уже есть как прямые провайдеры;
- `google/gemini-3-pro-image-preview`, `google/gemini-3.1-flash-image-preview` — есть GA;
- `openrouter/auto`, `openrouter/auto-beta` — роутеры, не модель.

⚠️ `meta/muse-image` отвечает 403 «18+ age confirmation», пока в настройках аккаунта OpenRouter
(`/settings/preferences`) не подтверждён возраст — это действие владельца аккаунта.

> ❗ **Заглушки крона `model-check`.** Все эти модели крон уже успел вставить в `model_registry`
> как `is_active=false` с пустыми `params_schema`/`pricing`; insert-only сид их пропускал.
> `seedModels()` теперь «оживляет» такие заглушки (`planSeeding` в `seed-plan.ts`: неактивная строка
> с пустыми схемой И ценой → обновить данными сида и включить). Вручную отключённые админом модели
> (цена заполнена) не трогаются. То же коснулось `google/gemini-3-pro-image` и
> `openai/gpt-5.4-image-2`, которые сейчас стоят заглушками — после сидирования они станут активными.

> 🔎 **2026-10-07: FLUX 3 image открыта** — `black-forest-labs/flux-3-image` (флагман, до 10 референсов).
> Это снимает заметку W33 «image-часть FLUX 3 без публичного API».

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

> 🔎 **Аудит 2026-W35: дефолтный роут DeepSeek снова упал.** `/models` дефолт
> сместился на реселлера StreamLake — нативный DeepSeek-endpoint ушёл из топа.
> `deepseek-v4-pro` $0.66/$1.98 → **$0.53/$1.05**, `deepseek-v4-flash` $0.14/$0.28
> → **$0.057/$0.115** (−20-45%; сверено с живым `/models`). Обновлён `pricing` в
> `text-models.ts` — держим политику «совпадать с дефолтным роутом = источником
> правды cron-аудита». Реселлеры волатильны, следующий аудит сверит снова.
> Остальные текстовые/видео-цены совпали с живым API. Из новых видеомоделей
> `/videos/models` — `black-forest-labs/flux-video-upscale` (апскейлер, не t2v/i2v:
> нет `supported_frame_images`/`durations`/`resolutions`) — **не добавляем**, не
> вписывается в generate-флоу; крон покажет её «новой» — это ожидаемо (как и уже
> отклонённые `seedance-2.5`, `seedance-2.0-mini`, `runway/aleph-2`).

> 🔎 **Аудит 2026-W37 (сверка с живым OpenRouter).**
> - **DeepSeek V4 Pro — снова дрейф вниз.** Дефолтный роут `/models`
>   $1.04226/$2.08452 (W36) → **$0.95526/$1.91052** (−8%). Обновлён `pricing` в
>   `text-models.ts` (0.955/1.911). `deepseek-v4-flash` совпал (0.088606/0.177212 ≈
>   0.089/0.177). Реселлеры волатильны — держим политику «= дефолтный роут».
> - **Claude Sonnet 5 — интро $2/$10 не откатилось.** Ранее анонсировался возврат к
>   $3/$15 после 31.08.2026; срок прошёл, но на 07.09.2026 цена всё ещё $2/$10 (живой
>   `/models`). Комментарий в `text-models.ts` обновлён; цена не меняется.
> - **Все остальные текстовые цены/контексты и ВСЕ video `pricing_skus` совпали** с
>   живым API (снимок `VIDEO_PRICING_SKUS` актуален, drift-аудит не молчит ложно).
> - **Даты deprecation подтверждены по changelog'ам:** OpenAI `gpt-image-1` 23.10.2026,
>   `gpt-image-1.5`/`gpt-image-1-mini` 01.12.2026; Google `gemini-2.5-flash-image`
>   02.10.2026 (модель ещё жива в `/models` — дедлайн в будущем). Правок не требуют.
> - **Картинки:** новых image-output моделей на OpenRouter нет; все slug'и реестра
>   (Nano Banana 2/Lite GA, Gemini 3 Pro GA, GPT-5 Image/Mini, GPT-5.4 Image 2,
>   FLUX.2, Seedream 4.5) живы. Preview-slug'и Gemini (`*-preview`) ещё отвечают, но
>   мы уже на GA — трогать нечего.
> - ⏭️ **`minimax/hailuo-3-max` (H3 Max) — новая в `/videos/models`, НЕ добавлена.**
>   i2v (first/last-кадр), но **без звука** (`generate_audio:false`) и максимум 768p —
>   это сайдгрейд к нашему `minimax/hailuo-3` (2K + звук), а не апгрейд. Цена SKU
>   `duration_seconds` 480p $0.05 / 768p $0.08. Оставлена на усмотрение владельца;
>   крон `model-check` покажет её «новой» — ожидаемо (как и ранее отклонённые
>   `seedance-2.5/2.0-mini`, `wan-3.0-prime`, `runway/aleph-2`, `flux-video-upscale`).
> - 💡 **Появились более свежие текстовые модели, чем в курируемом списке чата**
>   (список — продуктовое решение владельца, автоматически не меняем): Google
>   `gemini-3.8-flash` **$0.75/$3.75** — новее и **вдвое дешевле** нашей «новейшей»
>   `gemini-3.5-flash` ($1.5/$9) при том же 1M-контексте (есть и 3.6/3.7-flash по той
>   же цене); OpenAI `gpt-5.6-luna` $0.20/$1.20 (очень дёшево, 1M) и `gpt-5.6-sol`
>   $2/$10 — новее `gpt-5.5`; `gpt-5.4-mini` $0.75/$4.5. Рекомендация: обновить набор
>   чата (в первую очередь `gemini-3.5-flash` → `gemini-3.8-flash`) — но это меняет
>   UX/тарифы, поэтому оставлено владельцу.
> - **Классификатор мониторинга:** дефолт `anthropic/claude-sonnet-4.6`. Sonnet 5
>   сейчас дешевле (2/10 против 3/15) и умнее — есть смысл перебенчмаркить и, если
>   цифры сойдутся, переключить `DEFAULT_CLASSIFIER`. Не меняем без замера (промпт
>   тюнился под 4.6). Цены-дубли `reddit-search.ts`/`cover-models.ts` совпали с
>   `text-models.ts`/`seed-models.ts` — рассинхрона нет.

> 🔎 **Аудит 2026-W38 (сверка с живым OpenRouter).**
> - **DeepSeek V4 Pro — крупный дрейф вверх.** Дефолтный роут `/models`
>   $0.95526/$1.91052 (W37) → **$1.6/$3.2** (+67%). Обновлён `pricing` в
>   `text-models.ts` (1.6/3.2). `deepseek-v4-flash` совпал (0.0886/0.1772 ≈
>   0.089/0.177 — без изменений). Реселлеры сильно волатильны — держим политику
>   «= дефолтный роут = источник правды cron-аудита».
> - **Все остальные текстовые цены/контексты совпали** с живым API (Sonnet 5 всё
>   ещё $2/$10; Opus 5, GPT-5.4/5.5, Gemini 3.x, Grok 4.x — без изменений).
> - **ВСЕ video `pricing_skus` совпали** с живым `/videos/models` (21 модель,
>   снимок `VIDEO_PRICING_SKUS` актуален, drift-аудит не молчит ложно).
> - **Картинки:** новых image-output моделей на OpenRouter нет; все slug'и реестра
>   живы (Nano Banana 2/Lite GA, Gemini 3 Pro GA, GPT-5 Image/Mini, GPT-5.4 Image 2;
>   FLUX.2 pro/max/flex и Seedream 4.5 — точечно через `/endpoints`, HTTP 200 status 0).
>   `gemini-2.5-flash-image` ещё жива в `/models` (дедлайн 02.10.2026 в будущем).
>   **FLUX.3 image по-прежнему без публичного API** (`/models/flux.3-*/endpoints` → 404).
> - **Даты deprecation** (OpenAI gpt-image-1 23.10.2026, gpt-image-1.5/mini 01.12.2026;
>   Google gemini-2.5-flash-image 02.10.2026) — без изменений, правок не требуют.
> - 💡 **Ещё более свежие текстовые модели** (список чата — продуктовое решение
>   владельца, автоматически не меняем): новая **`deepseek/deepseek-v4.1-flash`
>   $0.15/$0.60** (новее нашей `deepseek-v4-flash`); Google `gemini-3.6/3.7/3.8-flash`
>   всё те же $0.75/$3.75 (вдвое дешевле нашей `gemini-3.5-flash` $1.5/$9); OpenAI
>   `gpt-5.6` Sol/Terra/Luna ($2/$10, $2/$12, $0.2/$1.2). Рекомендация W37 (обновить
>   набор чата) в силе — оставлено владельцу.
> - **Классификатор/Публикации:** дефолт `anthropic/claude-sonnet-4.6` без изменений;
>   цены-дубли `reddit-search.ts` (gpt-5.4/5.5/5-mini) и `cover-models.ts` совпадают с
>   `text-models.ts`/`seed-models.ts` — рассинхрона нет.
> - ⏭️ **Новые в `/videos/models`, НЕ добавлены** (не вписываются в t2v/i2v-флоу):
>   `black-forest-labs/flux-video-edit` (редактирование входного **видео** по промпту —
>   как `runway/aleph-2`, нужен video-input, `cents_per_second_output` 3) и
>   `heygen/avatar-iv` (image-to-video говорящая голова с lip-sync **по аудио**: нужен
>   голосовой вход, наш флоу шлёт только `frame_images`+текст; `duration_seconds` $0.05,
>   720p/1080p). Крон `model-check` покажет их «новыми» — это ожидаемо (как и ранее
>   отклонённые `seedance-2.5/2.0-mini`, `wan-3.0-prime`, `runway/aleph-2`,
>   `minimax/hailuo-3-max`, `flux-video-upscale`).

> 🔎 **Аудит 2026-W39 (сверка с живым OpenRouter).**
> - **DeepSeek V4 Pro — дрейф вниз, откат прошлонедельного всплеска.** Дефолтный роут
>   `/models` $1.6/$3.2 (W38) → **$0.95526/$1.91052** (−40%, ровно уровень W37).
>   Обновлён `pricing` в `text-models.ts` (0.955/1.911). `deepseek-v4-flash` совпал
>   (0.088606/0.177212 ≈ 0.089/0.177 — без изменений). Реселлеры сильно волатильны —
>   держим политику «= дефолтный роут = источник правды cron-аудита».
> - **Все остальные текстовые цены/контексты совпали** с живым API (Sonnet 5 всё ещё
>   $2/$10; Sonnet 4.6, Opus 5/4.8, GPT-5.4/5.5/mini, Gemini 3.x, Grok 4.x — без изменений).
> - **ВСЕ video-модели реестра (21) присутствуют** в живом `/videos/models` (29 всего);
>   `pricing_skus` совпали, снимок `VIDEO_PRICING_SKUS` актуален.
> - **Картинки:** новых image-output моделей на OpenRouter нет; все slug'и реестра живы
>   (Nano Banana 2/Lite GA, Gemini 3 Pro GA, GPT-5 Image/Mini, GPT-5.4 Image 2; FLUX.2
>   pro/max/flex и Seedream 4.5 — точечно через `/endpoints`, HTTP 200 status 0).
>   `gemini-2.5-flash-image` **ещё жива** в `/models` (дедлайн 02.10.2026 — ~11 дней,
>   следующий аудит проверит отключение). Даты deprecation OpenAI без изменений.
> - **Классификатор/Публикации:** дефолт `anthropic/claude-sonnet-4.6` без изменений;
>   цены-дубли `reddit-search.ts` (gpt-5.4/5.5/5-mini) и `cover-models.ts` совпадают с
>   `text-models.ts`/`seed-models.ts` — рассинхрона нет.
> - ⏭️ **Новые в `/videos/models`, стоящие решения прежние, НЕ добавлены:**
>   `seedance-2.5` (720p-потолок и дороже за токен, чем 4K-способная `seedance-2.0`),
>   `seedance-2.0-mini`, `wan-3.0-prime` (премиум-вариант `wan-3.0`), `minimax/hailuo-3-max`
>   (сайдгрейд: 768p, без звука), `runway/aleph-2` + `flux-video-edit` (video-input
>   редактирование), `flux-video-upscale` (апскейл), `heygen/avatar-iv` (lip-sync по аудио).
>   Крон `model-check` покажет их «новыми» — ожидаемо.
> - 💡 **Рекомендация W37/W38 по обновлению набора чата** (свежие/дешёвые текстовые:
>   `gemini-3.8-flash` $0.75/$3.75, `deepseek-v4.1-flash` $0.15/$0.60, `gpt-5.6`) **в силе** —
>   продуктовое решение владельца, автоматически не меняем.

> 🔎 **Аудит 2026-W40 (сверка с живым OpenRouter + changelog'и).**
> - **Новая модель чата: `anthropic/claude-opus-5.5`** (релиз Anthropic 22.09.2026, 1M ctx,
>   vision, **$4/$20** — на 20% дешевле Opus 5). Добавлена в `text-models.ts` (категория
>   smart, `isNew`) и в `VISION_TEXT_MODELS`. Opus 5 → «прошлое поколение» (снят `isNew`),
>   Opus 4.8 → «позапрошлое». В разделе smart теперь три Opus — кандидат на чистку
>   (4.8 retirement у Anthropic не раньше 28.05.2027, работает).
> - **DeepSeek V4 Flash — дрейф вверх:** дефолтный роут $0.0886/$0.1772 → **$0.14/$0.28**
>   (+58%, обратно к уровню W34). Обновлён `pricing`. `deepseek-v4-pro` совпал ($0.95526/$1.91052).
>   Остальные текстовые цены/контексты совпали.
> - ⚠️ **Perplexity: Sonar Chat Completions поддерживается «до 27.09.2026»** (docs.perplexity.ai
>   pricing + гайд migrate-from-sonar), замена — **Agent API** (`POST /v1/agent`, `input`
>   вместо `messages`, ответ — типизированный массив `output`; пресеты: sonar/sonar-pro →
>   `fast`, sonar-reasoning-pro → `low`, sonar-deep-research → `high`, новый `xhigh`).
>   На 28.09.2026 наш `POST /chat/completions` (sonar) ещё отвечает **200** — но дата
>   поддержки прошла, отключение может случиться без предупреждения. Нужна миграция
>   `perplexity-search.ts` + `providers/perplexity.ts` (отдельная задача, не «безопасная правка»).
> - **Видео:** все 21 модель реестра живы, `pricing_skus` совпали со снимком. Изменение
>   метаданных: у `x-ai/grok-imagine-video-1.5` OpenRouter теперь отдаёт
>   `supported_aspect_ratios` (16:9/9:16/1:1/4:3/3:4/3:2/2:3; раньше `null`), а описание
>   модели говорит «из текста, с опциональной стартовой картинкой» — возможно, появился t2v.
>   В реестре оставлено i2v-only + `aspectRatios: []`, пока не проверено живым вызовом
>   (платный тест, ~$0.08). `supported_durations` у многих моделей шире нашего
>   курированного набора (1–15 с) — это осознанный выбор UI, не дрейф.
> - **Картинки:** новых image-output моделей нет; все slug'и живы, FLUX.2 pro/max/flex и
>   Seedream 4.5 — HTTP 200 status 0 через `/endpoints`. `gemini-2.5-flash-image` **ещё жива**
>   (дедлайн 02.10.2026 — через 4 дня). ❗ Аудит W41 должен проверить отключение и убрать
>   модель из `seed-models.ts`/`cover-models.ts`/`image-edit-dialog.tsx`/`capabilities.ts`.
>   OpenAI: даты отключения `gpt-image-1.5`/`gpt-image-1-mini` 01.12.2026 без изменений.
> - **Anthropic (классификатор):** дефолт `claude-sonnet-4.6` активен (retirement не раньше
>   17.02.2027). `claude-haiku-4.5` — «не раньше 15.10.2026» (пока без объявленной даты).
> - **Дубли цен:** `reddit-search.ts` OPENAI_PRICING и `cover-models.ts` совпадают с
>   `text-models.ts`/`seed-models.ts`; `PERPLEXITY_PRICING` совпадает с прайсом.
> - 💡 **Новые текстовые на OpenRouter (не добавлены — продуктовое решение):**
>   `openai/gpt-6-sol` ($2/$10, 1.05M, vision — дешевле GPT-5.4/5.5), `openai/gpt-6-luna`
>   ($0.10/$0.50 — дешевле gpt-5-mini в 2.5–4×), их `-pro` варианты (reasoning.mode=pro),
>   `x-ai/grok-4.7` ($1.6/$4.8, 500K). Рекомендация W37/W38 в силе.

> **Аудит 2026-W41 (05.10.2026).**
> - **Чат:** добавлена `anthropic/claude-sonnet-5.5` (28.09.2026, 1M ctx, vision, $2/$10 —
>   та же цена, что у Sonnet 5; в `VISION_TEXT_MODELS`). Sonnet 5 → прошлое поколение.
>   Дрейф OpenRouter: `deepseek-v4-pro` $0.955/$1.911 → $0.209/$0.418 (−78%);
>   `deepseek-v4-flash` $0.14/$0.28 → $0.03/$1.28 (вход −79%, выход ×4.6 — перекос реселлера).
>   Остальные текстовые цены/контексты совпали.
> - 💡 **Не добавлены (продуктовое решение):** вся линейка GPT-6 (`gpt-6-luna` $0.10/$0.50,
>   `gpt-6-sol`/`6.1-sol` $2/$10, `gpt-6-astra`, `-pro` варианты), `grok-4.5/4.6/4.7`,
>   `gemini-3.5-flash-lite/3.6/3.7/3.8-flash`. Рекомендация: GPT-6 Luna/Sol — самые
>   интересные кандидаты (дешевле gpt-5-mini / gpt-5.4 при vision и 1.05M ctx).
> - **Видео:** все 21 модель реестра живы, цены `pricing_skus` совпадают. Новые на OpenRouter
>   (не добавлены): `bytedance/seedance-2.5` и `-2.0-mini`, `alibaba/wan-3.0-prime`,
>   `minimax/hailuo-3-max`, `runway/aleph-2`, `black-forest-labs/flux-video-edit|upscale`,
>   `heygen/*`. `grok-imagine-video-1.5`: t2v по-прежнему не проверен живым вызовом
>   (`supported_frame_images=["first_frame"]`, описание «из текста, с опциональной картинкой»).
> - **Картинки:** новых image-моделей нет; FLUX.2/Seedream/Gemini-слаги живы.
>   ⚠️ `gemini-2.5-flash-image`: официальная дата отключения Google — **02.10.2026**
>   (замена `gemini-3.1-flash-image`), дата прошла, но на OpenRouter модель ещё в листинге
>   и `/endpoints` отдаёт status 0 (Google, uptime 100%). Не удалена — удалить, когда
>   начнёт отдавать ошибки (затрагивает `seed-models.ts`, `cover-models.ts`,
>   `image-edit-dialog.tsx`, `capabilities.ts`, `google.ts`, `cost-calculator.ts`).
>   Также Gemini 2.5 Flash/Flash-Lite (текст) отключаются 16.10.2026 — в нашем реестре их нет.
> - **Perplexity:** `POST /chat/completions` на 05.10 всё ещё маршрутизируется (401 без ключа,
>   не 404/410), хотя официальная дата Sonar — 27.09.2026. Миграция на Agent API
>   по-прежнему нужна (`sonar-pro` Agent API не принимает) — отдельная задача.
> - **Дубли цен:** `reddit-search.ts` OPENAI_PRICING совпадает с `text-models.ts`.
> - Бэклог невлитых аудит-PR (W36–W40) растёт — владельцу стоит смёржить цепочку.

---

## Recraft (прямой API) — вектор

В реестре одна модель: `recraft-v3-vector` (SVG, $0.08/изобр.).

> 🔎 **Обновление 2026-10-07 (тексты, сверка с живым `/models`).**
> - **Добавлены флагманы:** `openai/gpt-6.1-sol` ($2/$10, 1.05M), `openai/gpt-6-astra` ($10/$50),
>   `openai/gpt-6-luna` ($0.1/$0.5), `anthropic/claude-fable-5.1` ($10/$50, 1M), `google/gemini-3.8-flash`
>   ($0.75/$3.75), `x-ai/grok-4.7` ($2/$6, 500K), `deepseek/deepseek-v4.1-flash` ($0.05/$1.2, vision),
>   `qwen/qwen3.8-max-0902` ($2/$6, 1M) и `qwen/qwen3.8-flash` ($0.15/$0.47) — новый вендор `qwen` в
>   `text-models.ts`. `-pro`-варианты GPT-6 (`reasoning.mode: pro`, «тратит заметно больше») не добавлены.
>   Qwen 3.8 Max взят в dated-слаге `-0902` (стабильного `qwen3.8-max` в списке нет; `max-prime` — отдельный
>   дорогой SKU $4/$12): если слаг уберут, аудит покажет `missing`.
> - **Дрейф цены:** `deepseek/deepseek-v4-pro` $0.955/$1.911 → **$0.209/$0.418** (в W41 дрейф был
>   отмечен в заметке, но `pricing` не обновили). После правки `auditTextPricing` по всему реестру пуст.
> - Описания GPT-5.4/5.5, Gemini 3.5 Flash, Grok 4.3 больше не называют себя «новейшими».
> - `reddit-search.ts` `OPENAI_PRICING` дополнен `gpt-6.1-sol`, `gpt-6-sol`, `gpt-6-astra`, `gpt-6-luna`;
>   `cover-models.ts` без изменений (все его slug'и живы, цены совпадают).
> - Не менялось (продуктовые решения): `DEFAULT_TEXT_MODEL` остаётся `claude-sonnet-4.6`
>   (Sonnet 5.5 сейчас дешевле и новее), дефолт классификатора мониторинга.

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
>
> ⚠️ **Аудит 2026-W40: дата появилась — Sonar Chat Completions поддерживается до
> 27.09.2026.** На 28.09 путь ещё отвечает 200, но нужна миграция на Agent API
> (`/v1/agent`, пресеты `fast`/`low`/`high`) — см. заметку аудита W40 выше.

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
| `google/veo-3.1-fast` | оба | да | 4/6/8 | 720p/1080p/4K | ~0.12 |
| `google/veo-3.1-lite` | оба | да | 4/6/8 | 720p/1080p | ~0.05 |
| `kwaivgi/kling-v3.0-std` | оба | да | 5/10 | 720p | ~0.126 |
| `minimax/hailuo-3` | оба | да³ | 5/10 | 2K | ~0.13 |
| `runway/gen-4.5` | оба | нет | 5/10 | 720p | ~0.12 |
| `black-forest-labs/flux-3-video` | оба | да⁴ | 5/10/15/20 | 720p/1080p | ~0.17 |
| `minimax/hailuo-3-max` | оба | нет | 5/10/15 | 480p/768p | ~0.05–0.08 |
| `minimax/hailuo-2.3` | оба | нет | 6/10 | 1080p | ~0.082 |
| `alibaba/wan-3.0` | оба | да | 5–30 | 480p/720p/1080p | ~0.10 |
| `alibaba/wan-3.0-prime` | оба | да | 5–30 | 480p/720p/1080p | ~0.14 |
| `alibaba/wan-2.6` | оба | да | 5/10 | 720p/1080p | ~0.10 |
| `alibaba/wan-2.7` | оба | да | 5/10 | 720p/1080p | ~0.10 |
| `bytedance/seedance-2.5` | оба | да | 4–30 | 480p/720p | ~0.10–0.23 |
| `bytedance/seedance-2.0-fast` | оба | да | 4/8/12 | 480p/720p | ~0.04 |
| `bytedance/seedance-2.0-mini` | оба | да | 4/8/12 | 480p/720p | ~0.034–0.076 |
| `bytedance/seedance-1-5-pro` | оба | да | 4/8/12 | 480p/720p/1080p | ~0.02 |
| `x-ai/grok-imagine-video` | оба | нет | 5/10 | 480p/720p | ~0.06 |
| `x-ai/grok-imagine-video-1.5` | оба² | нет² | 5/10 | 480p/720p/1080p | ~0.08–0.25 |
| `x-ai/grok-imagine-video-1.5-lite` | оба | нет | 5/10/15 | 480p/720p/1080p | ~0.02–0.14 |
| `heygen/heygen-video-1` | оба | встроен⁵ | 5/10/15 | 480p/768p/2K | ~0.02–0.09 |

Источник правды — `src/lib/providers/video-models.ts`. Цены за секунду — ориентир для UI;
точная сумма берётся из ответа OpenRouter (`usage.cost`) после генерации.

> 🆕 **Обновление 2026-10-07 (по запросу владельца, сверка с живым `GET /videos/models`, 30 моделей).**
> - **Добавлены:** `x-ai/grok-imagine-video-1.5-lite` (480p $0.02 / 720p $0.03 / 1080p $0.14, 1–15 сек, t2v+i2v),
>   `minimax/hailuo-3-max` (480p $0.05 / 768p $0.08, 5–15 сек, first/last-кадр, без звука),
>   `alibaba/wan-3.0-prime` (480p $0.068 / 720p $0.14 / 1080p $0.28, 2–30 сек, звук),
>   `bytedance/seedance-2.0-mini` ($0.0000035/токен → 480p $0.0336 / 720p $0.0756),
>   `bytedance/seedance-2.5` ($0.0000107/токен → 480p $0.1028 / 720p $0.2311, 4–30 сек),
>   `heygen/heygen-video-1` (480p $0.02 / 768p $0.03 / 2K $0.09, 5–15 сек; новый вендор `heygen`).
>   Seedance считается по формуле из `video-models.ts` (ширина × высота × 0.0234375 × цена токена).
>   Это отменяет заметки выше «НЕ добавлена» для `seedance-2.5`, `seedance-2.0-mini`, `wan-3.0-prime`
>   и `hailuo-3-max` (там — историческое обоснование; решение владельца изменилось).
> - **Удалена:** `openai/sora-2-pro` — исчезла из `/videos/models`, `GET /models/openai/sora-2-pro/endpoints` → `endpoints: []`.
> - **Исправлено:** `x-ai/grok-imagine-video-1.5` теперь отдаёт `supported_aspect_ratios` (16:9, 9:16, 1:1, 4:3, 3:4, 3:2, 2:3),
>   а его описание на OpenRouter — «из текстовых промптов, с опциональным стартовым кадром», поэтому режим расширен
>   до t2v+i2v (ниже примечание ² про «только i2v» устарело). ⚠️ Реальной генерацией t2v не проверялось.
>   Описание `alibaba/wan-3.0`: Prime — «быстрый режим» (по описанию OpenRouter), а не «премиум».
> - Остальные записи сверены с живыми capabilities (длительности/разрешения/форматы — подмножества живых,
>   `pricing_skus` совпали со снимком, дрейф `auditVideoPricing` пуст).
> - **Не добавлены (нужен входной ВИДЕО-файл):** `runway/aleph-2`, `black-forest-labs/flux-video-edit`,
>   `black-forest-labs/flux-video-upscale` — отдельная фича. `heygen/avatar-iv` — фото → говорящая голова:
>   нет `supported_frame_images`/длительностей, цена `duration_seconds` $0.05, параметры только
>   `voice_id`/`voice_settings`/`motion_prompt`/… — не вписывается в форму `prompt + frame_images`
>   (нужен звук/голос на входе). Крон `model-check` будет показывать эти четыре как «новые» — ожидаемо.
> - ⁵ `heygen/heygen-video-1`: звук (диалоги, фон, эффекты) генерируется всегда, `generate_audio:false`
>   (параметра нет), поэтому `supportsAudio:false`, `builtInAudio:true` — в UI «Звук встроен и не отключается».
>   Отдельные SKU `reference_duration_seconds_*` ($0.04/$0.06/$0.18) — тариф с референсами, в оценку не входит.

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
>
> 🔎 **Аудит 2026-W34: дрейф цены ByteDance-семейства (правка `price` + снимок SKU).**
> ByteDance пересобрал токенные тарифы Seedance (сверено живым `GET /videos/models`):
> `seedance-2.0-fast` подешевел `video_tokens` $0.0000056 → $0.0000042 (−25%; 720p оценка
> $0.121 → $0.0907, 480p $0.0538 → $0.0404); у дефолтного `seedance-2.0` появился
> поресольюшн-тариф — 1080p $0.0000077, 4K $0.000004, из-за чего **4K подешевел почти
> вдвое** ($1.36 → $0.78/сек), 1080p чуть подрос ($0.34 → $0.37). Обновлены `price` и снимок
> `VIDEO_PRICING_SKUS` (иначе drift-аудит молчал бы ложно). База 480p/720p ($0.000007) не менялась.
>
> ⏭️ **`bytedance/seedance-2.0-mini` (W34) — новая, но НЕ добавлена.** Появилась в `/videos/models`:
> t2v/i2v (first/last-кадр), звук, до 720p, длит. 4–15 сек, `video_tokens` $0.0000035 (720p ≈ $0.076,
> 480p ≈ $0.034). Дешевле `seedance-2.0-fast` лишь на ~17% и ниже качеством; ультрабюджетную нишу
> уже держит `seedance-1-5-pro` (~$0.01–0.06). Добавление плодит дубли в списке — оставлено на
> владельца. Крон `model-check` будет показывать её как «новую» — это ожидаемо.

> 🆕 **Аудит 2026-W36: добавлена `alibaba/wan-3.0`** (канонический слаг `-20260824`) — новейшее
> поколение Wan и прямой апгрейд к нашим `wan-2.6`/`wan-2.7`. Проверено живым `GET /videos/models`:
> t2v/i2v (только `first_frame`), `generate_audio:true`, разрешения **480p/720p/1080p** (добавился
> дешёвый 480p), длительности **2–30 сек** (в реестре курировано `5/10/15/20/30` — длинный формат),
> aspect 16:9/9:16/1:1/4:3/3:4. Цена по SKU `duration_seconds_Xp`: 480p $0.05, 720p $0.10, 1080p $0.20
> (1080p вдвое дороже плоских $0.10 у 2.7 — на высоком разрешении оценка выше). Звук отдельного SKU
> не имеет → в цену включён; русская речь не подтверждена (`russianSpeech:"partial"`). Снимок SKU
> добавлен в `VIDEO_PRICING_SKUS` для drift-аудита.
>
> ⏭️ **`alibaba/wan-3.0-prime` (27.08.2026) — НЕ добавлена (премиум-вариант).** Те же форматы и
> длительности, что у `wan-3.0`, но дороже: 480p $0.068 / 720p $0.14 / 1080p $0.28. Оставлена на
> усмотрение владельца, чтобы не плодить дубли Wan (уже 2.6/2.7/3.0); документирована здесь как
> ожидаемая «новая» в кроне `model-check`.

> ❗ **Звук влияет на цену.** У моделей со звуком цена в таблице — с включённым
> звуком (он включён по умолчанию): Kling 3.0 Pro $0.112→$0.168, Std $0.084→$0.126.
> Seedance/Wan за звук берут столько же; Veo считает звук по отдельному тарифу.
> `alibaba/wan-2.6` теперь **генерирует звук** (`generate_audio:true` в API — раньше было
> `false`; обновлено в аудите 2026-W27), но русская озвучка не гарантирована.
>
> ¹ `alibaba/happyhorse-1.1` (лидер слепых тестов арены, ~июнь 2026) у вендора заявлен
> с нативным звуком/lip-sync, но на OpenRouter `generate_audio` не выставляется
> (`null`), а i2v принимает только первый кадр — поэтому в реестре `supportsAudio:false`.

> ² **Grok Imagine Video 1.5** (исторически: на момент W30 — «только i2v»; с 07.10.2026 в реестре t2v+i2v, см. выше) — появилась на OpenRouter 19.07.2026 (канонический слаг
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
