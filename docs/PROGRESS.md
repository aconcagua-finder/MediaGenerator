# MediaGenerator — Прогресс выполнения

## Статус: Все фазы завершены + доработки + чат-блок + вложения + «Публикации» + «Мониторинг» + «Видео» + «Редактор склейки» (передан в тестирование SMM-щику)

### Доработки 2026-06-09 — редактор склейки видео (`/video/editor`)
| Задача | Статус |
|--------|--------|
| Базовый видеоредактор: выбор клипов, порядок ↑/↓, обрезка, склейка в один файл | ✅ |
| Локальный ffmpeg-рендер (бесплатно): `compose-graph.ts` (построитель команды) + `compose.ts` (воркер) | ✅ |
| `filter_complex` + re-encode + нормализация холста (scale+pad, setsar, fps, yuv420p) для разнородных клипов | ✅ |
| Звук: anullsrc на немые/мьютнутые сегменты; тумблер «со звуком/без»; per-clip mute | ✅ |
| Тумблер формата 16:9 / 9:16 (холст 720p задаёт сервер — контроль памяти `-threads 1`) | ✅ |
| Job-флоу зеркалит finalize: eager submit → поллинг `/api/video/compose/[id]/status` → cron `video-compose` | ✅ |
| Таблицы `video_compositions` + `video_composition_segments`, миграция `0015`; результат в `videos` через `composition_id` (XOR-CHECK) | ✅ |
| Интеграция в библиотеку (left-join обоих источников), вход «Склеить» из bulk-actions и результатов генерации | ✅ |
| UI: дорожка, диалог обрезки (превью + ползунки), пикер клипов, клиентский предпросмотр, прогресс-% | ✅ |
| `apk add ffmpeg` в Dockerfile + cron-строка `video-compose` (требует `--force-recreate cron`) | ✅ |
| Юнит-тест построителя графа `tests/compose-graph.test.ts` (13 кейсов) | ✅ |

### Доработки 2026-06-01 — вкладка «Видео» + актуализация моделей
| Задача | Статус |
|--------|--------|
| Новая вкладка «Видео»: генерация через OpenRouter (`POST /api/v1/videos`), тем же ключом что и картинки | ✅ |
| Async-флоу: submit → клиентский polling `/api/video/[id]/status` → скачивание mp4 в S3 → нативное `<video>` | ✅ |
| 9 курированных моделей (Seedance 2.0, Veo 3.1/Fast, Kling 3.0 Pro/Std, Sora 2 Pro, Hailuo 2.3, Wan 2.6, Grok) с per-model форматами | ✅ |
| Text-to-video + image-to-video (референс-кадр `frame_images`, переиспользует upload-флоу `useImageAttachments`) | ✅ |
| Биллинг по факту (`usage.cost`), оценка в UI (perSecond × duration), учёт в бюджете/дневном лимите | ✅ |
| Раздача mp4 с Range (HTTP 206) для перемотки — `downloadStream` в `s3.ts` | ✅ |
| Таблицы `video_generations` + `videos`, миграция `0014_video_generation` | ✅ |
| Актуализация: Claude Opus 4.7 → **4.8** (`text-models.ts` + `capabilities.ts`), контекст Anthropic 1.1M → 1M, косметика дат | ✅ |
| Проверено: остальные модели уже актуальны (Gemini 3.5 Flash, GPT-5.5, FLUX.2, GPT Image 2, Seedream 4.5, Grok 4.3) | ✅ |

### Доработки 2026-05-27 — engagement, сортировка, чистка ссылок
| Задача | Статус |
|--------|--------|
| Очистка URL в TG-постах: вырезаем `#:~:text=...` (scroll-to-text fragment) + `decodeURI` для процент-кодировки + обрезание длинных путей | ✅ |
| Убрали дублирование заголовка для TG-постов (title не заполняется — первая строка content и так показывается) | ✅ |
| В UI: скрытие title если он совпадает с началом content (для старых записей в БД и RSS, где description начинается с title) | ✅ |
| Проверка корректности последнего прогона: парсер тянет данные реально, не кэш (`reusedFromRunId` null, 7сек = заслуга concurrency=2/5) | ✅ |
| Парсинг Telegram views (`tgme_widget_message_views`) — поддержка «1.33K» / «2.5M» | ✅ |
| Парсинг Telegram reactions (массив `{emoji, count}` + сумма) | ✅ |
| Парсинг Telegram forwards и comments | ✅ |
| Парсинг RSS `slash:comments` (там где сайт отдаёт) | ✅ |
| Миграция `0013_monitoring_items_engagement`: jsonb `engagement` + int `engagement_score` + индекс `(run_id, engagement_score)` | ✅ |
| `computeEngagementScore = views + reactions*15 + forwards*20 + comments*30` — формула отдаёт приоритет активному отклику над пассивными просмотрами | ✅ |
| Sort-dropdown в run-detail: «Сначала новые / старые / горячие / По источникам» (по умолчанию — новые) | ✅ |
| Бейдж «горячее» (🔥) для постов с engagement_score ≥ 1500 | ✅ |
| Engagement-полоска в карточке: 👁 просмотры, ❤ реакции (+ топ-3 эмодзи), 💬 комменты, 🔁 репосты | ✅ |
| То же самое на странице «Избранное» | ✅ |

### Доработки 2026-05-26/27 — раздел «Мониторинг» (полный цикл от MVP до production)

#### Фундамент (миграции 0010-0013)
| Задача | Статус |
|--------|--------|
| Таблицы `monitoring_templates`, `monitoring_runs`, `monitoring_items` (миграция `0010`) | ✅ |
| Колонка `tg_max_pages` per-шаблон (миграция `0011`) | ✅ |
| Колонки `is_favorite` + `favorited_at` для избранного (миграция `0012`) | ✅ |
| Колонки `engagement` (jsonb) + `engagement_score` (int) + индекс `(run_id, engagement_score)` (миграция `0013`) | ✅ |
| Расширения `MonitoringRunArtifacts`: `reusedFromRunId`, `classifierLog.batchesProcessed/Total/avgBatchMs` | ✅ |
| Поле `MonitoringSource.feedUrl` для ручного указания RSS, `MonitoringSource.disabled` | ✅ |

#### Парсеры
| Задача | Статус |
|--------|--------|
| Telegram-парсер через публичную страницу `t.me/s/{handle}` — без авторизации, без зависимостей | ✅ |
| Авто-извлечение названия канала (3 источника: `tgme_channel_info_header_title` → `og:title` → `<title>`) | ✅ |
| Пагинация TG до `tg_max_pages` (default 5, max 15), retry с jitter при `fetch failed` | ✅ |
| Парсер сайтов: автодетект RSS/Atom через `<link rel="alternate">` + 13 стандартных путей (`/feed`, `/rss`, `/xml/index.xml`, `/rss/news/`, …) | ✅ |
| Поддержка windows-1251 для RSS российских сайтов (garant.ru) — `TextDecoder` + детект из `Content-Type` + XML-пролога | ✅ |
| Извлечение даты из URL (`/2026/05/26/`), DD.MM.YYYY и «26 мая 2026» в title/description когда RSS не отдал `pubDate` | ✅ |
| Параметр `feedUrl` per-источник — позволяет вручную задать ленту когда автодетект не работает | ✅ |

#### Pipeline
| Задача | Статус |
|--------|--------|
| Два режима шаблона: **сырая лента** (без AI) и **по темам** (классификация через OpenRouter) | ✅ |
| Concurrency: 2 для Telegram (один домен → лимиты), 5 для сайтов (разные домены) | ✅ |
| Переиспользование items предыдущего прогона (`reusedFromRunId`) — окно 6 часов, только для topics в рамках одного шаблона | ✅ |
| Дедуп по `(sourceId + sourcePostId)` между блоками одного источника | ✅ |
| Журнал по каждому источнику в `artifacts.sourceLog` (status: ok/empty/error + errorMessage + durationMs) | ✅ |
| Manual-запуск **не сбивает** scheduled `next_run_at` — расписание идёт независимо | ✅ |
| Расписание авто-подтягивается из cron-tick каждые 15 минут (retry при пропуске из-за выключенного docker) | ✅ |
| Авто-обновление label TG-источника если он выглядит как дефолт (handle / «Закрытый канал») | ✅ |

#### AI-классификатор
| Задача | Статус |
|--------|--------|
| OpenRouter chat completions, батчи по 8 постов, JSON-output, temperature 0 | ✅ |
| Промпт: «строгий тематический фильтр», явный запрет расширять тему (страна/площадка) | ✅ |
| Прогресс-индикатор: `batchesProcessed/batchesTotal/avgBatchMs` с оценкой оставшегося времени в UI | ✅ |
| **Дефолт = Claude Sonnet 4.6** ($1.15/500 постов, 10 минут, точность ~90%) | ✅ |
| Доступные модели: Haiku 4.5 (либеральный, дешёвый), Sonnet 4.6 (баланс), Gemini 3.1 Pro/3.5 Flash (точные, медленнее), Grok 4.3, GPT-5.5 — все из выпадающего списка | ✅ |
| Тестирование на 487 постах: Haiku 6.8м/$0.48, Sonnet 10.5м/$1.15, Gemini Pro 26м/$2.16 — Sonnet выбран как оптимум | ✅ |

#### UI/UX
| Задача | Статус |
|--------|--------|
| Единая компактная шапка: «🎯 Мониторинг» + табы шаблонов (со скроллом) + «+ Новый» + «♥ Избранное» в одну строку | ✅ |
| CSS-grid `auto auto minmax(0,1fr) auto auto` — гарантированный clip overflow без вытягивания viewport | ✅ |
| Шапка шаблона: имя + бейджи + период (пресеты + custom) + «Запустить» + iconBtn-настройки/удаление в одну строку | ✅ |
| Сворачивание шапки в полоску `▲ Свернуть` для максимума места под контент | ✅ |
| Селектор периода: 1д / 3д / неделя / 2 недели / месяц + custom days input | ✅ |
| **Категоризация источников**: SourceBadge с иконкой и цветом (💬 синий Telegram / 👥 фиолетовый VK / 🌐 зелёный Сайт) | ✅ |
| Фильтр-DropdownMenu сгруппирован по категориям («Мессенджеры», «Соцсети», «Сайты») с счётчиками | ✅ |
| Поиск по тексту/заголовку/источнику в выдаче (live-фильтр) | ✅ |
| Кнопка-сердечко в каждой карточке, страница `/monitoring/favorites` с поиском по избранному | ✅ |
| Группировка items при topics-режиме: «БЛИЗКОЕ СОВПАДЕНИЕ» / «КОСВЕННОЕ» / «БЕЗ СОВПАДЕНИЯ» | ✅ |
| 5 строк контента в карточке + кнопка «Показать полностью» + `break-all` для длинных URL | ✅ |
| Картинки TG (`cdn4.telesco.pe`) отображаются нативным `<img>` (lazy) | ✅ |
| Прогресс classifying: «Обработано X из Y · 75% · ~3 мин осталось» + полоса прогресса | ✅ |
| Журнал источников раскрывается под шапкой запуска (ok / empty / error) | ✅ |
| Дата «дата неизвестна» курсивом для items без `publishedAt` (вместо отбрасывания) | ✅ |
| Бейдж в сайдбаре «Мониторинг» с числом непросмотренных запусков (сбрасывается при открытии) | ✅ |

#### Тесты и качество
| Задача | Статус |
|--------|--------|
| 74 vitest-теста (включая `normalizeTelegramHandle`, `discoverFeedUrlInHtml`, `computeNextRunAt`) | ✅ |
| TypeScript: чисто (`tsc --noEmit` 0 ошибок) | ✅ |
| Реальное тестирование Ольги (28 источников): за день ~180 постов, за неделю ~500, за месяц ~1000 | ✅ |

### Известные ограничения раздела «Мониторинг»

- **ВКонтакте** (`m.vk.com/club…`) — нужен VK API service_token; пока источники с VK помечены `disabled: true`
- **БухОнлайн форум** — RSS не предоставляет, отключён
- **КонсультантПлюс legalnews** — RSS отдаёт 403 для ботов, отключён
- **TG-каналы могут банить** при серии запросов с одного IP; retry с jitter + concurrency=2 нивелирует
- **Старые TG-картинки протухают** — URL `cdn4.telesco.pe` имеют TTL ~24-48 часов, для архивирования нужно скачивать в S3

### Доработки 2026-05-18

| Задача | Статус |
|--------|--------|
| Новый раздел **Публикации** в сайдбаре (`/publications`) — контент-pipeline | ✅ |
| Перенос pipeline коллеги (legal_publisher) на TypeScript: Perplexity → OpenAI Responses → OpenRouter (3 стадии) | ✅ |
| Provider Perplexity в `api_keys` + `validateKey` через `chat/completions` ping | ✅ |
| Новые таблицы: `content_rubrics`, `content_settings`, `content_runs`, `content_topics` + миграция `0004_content_pipeline.sql` | ✅ |
| Seed 3 рубрик из конфига коллеги (`base_real_work`, `prompt_of_week`, `industry_news_trends`) + общие системные промпты | ✅ |
| Topic guard — нечёткое сравнение тем по Jaccard, окно 30 дней / 12 тем (настраивается) | ✅ |
| Учёт стоимости pipeline в `user.totalSpent` (Perplexity / OpenAI / OpenRouter — каждый шаг) | ✅ |
| API: `POST/GET /api/content/runs`, `GET/DELETE /api/content/runs/[id]` + server actions для CRUD рубрик | ✅ |
| UI: список запусков + прогресс-степпер + раскрывающиеся артефакты pipeline + готовый пост + кнопка «опубликовано» | ✅ |
| UI: страница рубрик с табами «Промпты / Модели / Параметры», Reddit-поиск опционален per-рубрика | ✅ |
| Vitest: 21 тест на utils, similarityRatio, parseJsonFromMessage, buildTopicSimilarityWarning, prependTopicToPost | ✅ |

### Доработки 2026-05-11

| Задача | Статус |
|--------|--------|
| Загрузка картинок: новая таблица `uploads`, `POST/GET /api/uploads` с валидацией mime/размера/реального image-header | ✅ |
| Парсер размеров PNG/JPEG/WebP/GIF без внешних зависимостей (`src/lib/utils/image-meta.ts`) | ✅ |
| Capability-карты `VISION_TEXT_MODELS` и `IMAGE_INPUT_MODELS` как единый источник правды | ✅ |
| Хук `useImageAttachments` + компонент `AttachmentTray` для paste/drop/picker | ✅ |
| Чат: paste/drop/picker → автоприкрепление к сообщению, drop-overlay, рендер картинок в истории | ✅ |
| Чат: проверка vision на бэке и фронте, понятная ошибка при не-vision модели | ✅ |
| Расширение `/api/chat` под `attachmentIds[]` и `image_url`-части в OpenRouter messages | ✅ |
| Колонка `chat_messages.attachments` (JSONB) для трекинга вложений | ✅ |
| Форма генерации: paste/drop референс-картинки → автоматический image-to-image через `/api/edit` | ✅ |
| Расширение `/api/edit`: принимает либо `imageId` (библиотека), либо `uploadId` (свежий upload) | ✅ |
| vitest + 29 юнит-тестов: image-meta, validate-upload, capabilities, chat-payload | ✅ |
| SQL-миграция `0003_uploads_and_chat_attachments.sql` (push-friendly, IF NOT EXISTS) | ✅ |

### Доработки 2026-05-10

| Задача | Статус |
|--------|--------|
| Cloudflare Tunnel `mediagenerator` восстановлен и поставлен в автозапуск (launchd) | ✅ |
| Добавлена модель `gpt-image-2` (новейшая, апр 2026): seed, цены, UI | ✅ |
| Редактирование изображений: `/api/edit`, OpenAI `images/edits`, диалог в лайтбоксе | ✅ |
| Лайнидж правок: `parent_image_id` и `edit_prompt` в таблице `images` | ✅ |
| Большой блок чата с текстовыми моделями `/chat` (Claude/GPT/Gemini/Grok/DeepSeek через OpenRouter) | ✅ |
| Markdown-рендер ответов (react-markdown + remark-gfm + highlight.js) | ✅ |
| Streaming SSE через `/api/chat`, копирование, шаблоны ролей | ✅ |
| Таблицы `chats` и `chat_messages` + drizzle-схема | ✅ |
| Иконка "Чат" в сайдбаре | ✅ |
| **UX-итерация чата:** auto-title через Haiku после первого ответа, нет накопления пустых чатов | ✅ |
| Сворачиваемый сайдбар чатов (localStorage) | ✅ |
| Селектор модели прямо в шапке чата (мгновенное переключение) | ✅ |
| **Edit изображений в UI:** hover-кнопки на карточках результатов, в лайтбоксе библиотеки, в контекст-меню сетки библиотеки; правки наследуют папку оригинала | ✅ |
| Унифицированный селектор моделей генерации (одна выпадашка с группировкой) | ✅ |

## Статус: Все фазы завершены + доработки

### Фазы из ROADMAP.md

| Фаза | Задачи | Статус |
|------|--------|--------|
| 1. Фундамент | 6/6 | ✅ |
| 2. Генерация | 6/6 | ✅ |
| 3. Библиотека и история | 4/4 | ✅ |
| 4. Админ и уведомления | 3/3 | ✅ |
| 5. Полировка | 5/5 | ✅ |

### Доработки после завершения фаз (2026-04-04)

| Задача | Статус |
|--------|--------|
| Редизайн UI в стиле X.com / Grok (чёрный фон, синий акцент) | ✅ |
| Фоновые градиенты на дашборде и сайдбаре | ✅ |
| Логотип — сгенерированная AI иконка (logo.webp) | ✅ |
| Fix OpenAI gpt-image-1.5 (убрать response_format) | ✅ |
| Fix SQL ошибка в истории (inArray вместо ANY) | ✅ |
| Masonry layout для библиотеки и результатов генерации | ✅ |
| Раскрывающийся промпт в таблице истории | ✅ |
| Fix чекбокс выделения изображений (ContextMenu перехват) | ✅ |
| Кнопки переименования/удаления папок при ховере | ✅ |
| Fix профиль — замена DropdownMenu на простое меню | ✅ |
| Fix красный цвет в сайдбаре (oklch vs hsl конфликт) | ✅ |
| deploymentId для авто-обновления клиента | ✅ |
| Система ролей и лимитов (costLimit, totalSpent, maxGenerations) | ✅ |
| Наследование API ключей от админа к новым юзерам | ✅ |
| Fallback на ключ админа при отсутствии своего | ✅ |
| Админ видит историю всех пользователей | ✅ |
| UI управления лимитами (прогресс-бар бюджета) | ✅ |
| Обновление OpenRouter моделей (9 моделей вместо 3) | ✅ |
| Cron-сервис в Docker для проверки моделей (раз в 24ч) | ✅ |

### Известные особенности

- Первый пользователь НЕ становится автоматически админом — назначить вручную через БД
- costLimit по умолчанию $0.10 для новых пользователей
- Админ не ограничен лимитами
- Cron-проверка моделей не тратит токены (только GET /v1/models)
