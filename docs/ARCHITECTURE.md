# MediaGenerator - Архитектура

## Обзор

Веб-приложение для генерации изображений через API нейросетей (OpenAI, xAI, OpenRouter).
Запускается локально через Docker Compose + Cloudflare Tunnel.

---

## Стек технологий

| Слой | Технология | Версия | Назначение |
|------|-----------|--------|------------|
| Фреймворк | Next.js (App Router) | 16.x | Fullstack: SSR, RSC, Server Actions, API routes |
| UI | React | 19.x | Компоненты интерфейса |
| Стили | Tailwind CSS | 4.x | Утилитарные стили, тёмная тема |
| UI-библиотека | shadcn/ui | latest | Компоненты: кнопки, модалки, формы, таблицы |
| БД | PostgreSQL | 16.x | Основная база данных |
| ORM | Drizzle ORM | latest | Type-safe запросы, миграции |
| Аутентификация | Better Auth | latest | Логин, регистрация, роли, сессии |
| Хранилище файлов | MinIO (S3) | latest | Хранение сгенерированных изображений |
| Фоновые задачи | Docker cron (alpine) | — | Ежедневная проверка обновлений моделей |
| Язык | TypeScript | 5.x | End-to-end типизация |
| Контейнеризация | Docker Compose | latest | PostgreSQL + MinIO + App + Cron |

---

## Почему именно этот стек

### Next.js 16 + React 19
- Fullstack в одном пакете: фронтенд, API, SSR
- Server Actions для мутаций без отдельных API-эндпоинтов
- React Server Components для быстрой загрузки страниц
- `output: 'standalone'` — один Docker-контейнер

### PostgreSQL + Drizzle ORM
- **PostgreSQL vs SQLite:** конкурентные записи от нескольких пользователей, JSONB для хранения параметров генерации и схем моделей, мощные индексы для поиска по библиотеке
- **Drizzle vs Prisma:** ~7KB бандл (vs ~2MB у Prisma), нет шага code generation, SQL-подобный API, мгновенное обновление типов

### shadcn/ui + Tailwind 4
- Полный контроль над стилями (код компонентов внутри проекта)
- Тёмная тема из коробки через CSS переменные
- Все нужные компоненты: Dialog, DataTable, Command, Toast, Tabs

### Better Auth
- Database-first (работает напрямую с Drizzle + PostgreSQL)
- Плагин ролей (admin/user) из коробки
- Не требует внешних сервисов (в отличие от Auth0, Clerk)
- Lucia Auth — deprecated с марта 2025

### MinIO (S3-совместимое хранилище)
- Локальный S3 в Docker, идентичный API с AWS S3
- В будущем можно перейти на AWS S3 / Cloudflare R2 без изменения кода
- Веб-консоль для просмотра файлов (порт 9001)

---

## Структура проекта

```
MediaGenerator/
├── docs/                        # Документация проекта
│   ├── ARCHITECTURE.md          # Этот файл
│   ├── ROADMAP.md               # Фазы реализации
│   ├── PROVIDERS.md             # Описание API провайдеров
│   └── PROGRESS.md              # Трекер выполнения
│
├── docker-compose.yml           # PostgreSQL + MinIO + App
├── Dockerfile                   # Multi-stage build для Next.js
├── .env.example                 # Шаблон переменных окружения
│
├── drizzle.config.ts            # Конфигурация Drizzle ORM
├── next.config.ts               # Конфигурация Next.js
├── tailwind.config.ts           # Tailwind + тёмная тема
├── package.json
├── tsconfig.json
│
├── src/
│   ├── app/                     # Next.js App Router (страницы)
│   │   ├── layout.tsx           # Root layout: тёмная тема, шрифты, провайдеры
│   │   ├── page.tsx             # Редирект на /generate
│   │   │
│   │   ├── (auth)/              # Группа авторизации (отдельный layout)
│   │   │   ├── login/
│   │   │   │   └── page.tsx     # Страница входа
│   │   │   └── register/
│   │   │       └── page.tsx     # Страница регистрации
│   │   │
│   │   ├── (dashboard)/         # Основной интерфейс (sidebar + header)
│   │   │   ├── layout.tsx       # Dashboard layout с навигацией
│   │   │   ├── generate/
│   │   │   │   └── page.tsx     # Генерация изображений
│   │   │   ├── library/
│   │   │   │   └── page.tsx     # Библиотека (папки, сетка)
│   │   │   ├── history/
│   │   │   │   └── page.tsx     # История генераций
│   │   │   └── settings/
│   │   │       ├── page.tsx     # API ключи
│   │   │       ├── users/
│   │   │       │   └── page.tsx # Управление пользователями (админ)
│   │   │       └── notifications/
│   │   │           └── page.tsx # Уведомления об обновлениях моделей
│   │   │
│   │   └── api/                 # API routes
│   │       ├── auth/
│   │       │   └── [...all]/
│   │       │       └── route.ts # Better Auth catch-all handler
│   │       ├── generate/
│   │       │   └── route.ts     # POST — запуск генерации
│   │       ├── images/
│   │       │   └── [id]/
│   │       │       └── route.ts # GET — проксирование изображения из S3
│   │       └── cron/
│   │           └── check-models/
│   │               └── route.ts # Ручной триггер проверки моделей
│   │
│   ├── components/              # React компоненты
│   │   ├── ui/                  # shadcn/ui (генерируемые)
│   │   │   ├── button.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── input.tsx
│   │   │   └── ...
│   │   ├── layout/              # Компоненты макета
│   │   │   ├── sidebar.tsx      # Боковая навигация
│   │   │   ├── header.tsx       # Верхняя панель
│   │   │   └── theme-provider.tsx
│   │   ├── generate/            # Компоненты страницы генерации
│   │   │   ├── model-selector.tsx   # Выбор провайдера и модели
│   │   │   ├── param-panel.tsx      # Панель параметров
│   │   │   ├── prompt-input.tsx     # Ввод промпта
│   │   │   ├── generation-grid.tsx  # Сетка результатов
│   │   │   └── image-lightbox.tsx   # Полноэкранный просмотр
│   │   ├── library/             # Компоненты библиотеки
│   │   │   ├── folder-tree.tsx      # Дерево папок
│   │   │   ├── image-grid.tsx       # Сетка изображений
│   │   │   └── image-card.tsx       # Карточка изображения
│   │   └── settings/            # Компоненты настроек
│   │       ├── api-key-form.tsx     # Форма API ключей
│   │       └── user-management.tsx  # Управление пользователями
│   │
│   ├── lib/                     # Серверная логика и утилиты
│   │   ├── auth.ts              # Конфигурация Better Auth
│   │   ├── auth-client.ts       # Клиент Better Auth (для фронта)
│   │   ├── db/
│   │   │   ├── index.ts         # Drizzle клиент (подключение к PostgreSQL)
│   │   │   ├── schema/          # Схема базы данных (по таблицам)
│   │   │   │   ├── index.ts     # Реэкспорт всех таблиц
│   │   │   │   ├── users.ts     # Таблица пользователей (Better Auth)
│   │   │   │   ├── api-keys.ts  # Зашифрованные API ключи
│   │   │   │   ├── generations.ts # Запросы на генерацию
│   │   │   │   ├── images.ts    # Сгенерированные изображения
│   │   │   │   ├── folders.ts   # Папки библиотеки
│   │   │   │   ├── model-registry.ts # Реестр моделей
│   │   │   │   └── notifications.ts  # Уведомления
│   │   │   └── migrations/      # Drizzle миграции
│   │   ├── storage/
│   │   │   └── s3.ts            # MinIO/S3 клиент (upload, download, delete)
│   │   ├── providers/           # Адаптеры AI-провайдеров
│   │   │   ├── types.ts         # Общие типы (GenerateRequest, GenerateResult)
│   │   │   ├── registry.ts      # Реестр провайдеров и их моделей
│   │   │   ├── openai.ts        # OpenAI адаптер
│   │   │   ├── xai.ts           # xAI адаптер
│   │   │   └── openrouter.ts    # OpenRouter адаптер
│   │   ├── cron/
│   │   │   └── model-checker.ts # Логика проверки обновлений моделей
│   │   └── utils/
│   │       ├── crypto.ts        # AES-256 шифрование API ключей
│   │       └── cost-calculator.ts # Расчёт стоимости генерации
│   │
│   └── hooks/                   # React хуки (клиентская сторона)
│       ├── use-generation.ts    # Хук генерации с прогрессом/статусом
│       └── use-models.ts        # Хук получения списка моделей
│
└── public/                      # Статика (иконки, шрифты)
```

---

## Схема базы данных

### users (управляется Better Auth + расширения)
| Поле | Тип | Описание |
|------|-----|----------|
| id | text PK | UUID пользователя |
| email | text UNIQUE | Email |
| name | text | Имя пользователя |
| role | text | `admin` / `user` |
| daily_limit | integer | Лимит генераций в день (0 = заблокирован) |
| created_at | timestamp | Дата регистрации |
| updated_at | timestamp | Дата обновления |

> Better Auth также создаёт таблицы `session` и `account` для управления сессиями.

### api_keys
| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | ID ключа |
| provider | text | `openai` / `xai` / `openrouter` |
| encrypted_key | text | Зашифрованный AES-256 ключ |
| key_hint | text | Последние 4 символа (для отображения) |
| is_active | boolean | Активен ли ключ |
| created_by | text FK → users | Кто добавил |
| created_at | timestamp | Когда добавлен |

### generations
| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | ID генерации |
| user_id | text FK → users | Кто запросил |
| provider | text | Провайдер (openai/xai/openrouter) |
| model | text | ID модели (gpt-image-1.5 и т.д.) |
| prompt | text | Текст промпта |
| params | jsonb | Параметры генерации (size, quality и т.д.) |
| status | text | `pending` / `processing` / `done` / `error` |
| images_count | integer | Запрошенное количество изображений |
| cost | decimal | Расчётная стоимость |
| error_message | text | Сообщение об ошибке (если есть) |
| created_at | timestamp | Когда запрошено |
| completed_at | timestamp | Когда завершено |

### images
| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | ID изображения |
| generation_id | uuid FK → generations | К какой генерации относится |
| folder_id | uuid FK → folders (nullable) | В какой папке (null = корень) |
| s3_key | text | Путь в S3/MinIO |
| s3_url | text | Полный URL для доступа |
| width | integer | Ширина в пикселях |
| height | integer | Высота в пикселях |
| format | text | png / jpeg / webp |
| size_bytes | integer | Размер файла |
| metadata | jsonb | Доп. метаданные от API |
| created_at | timestamp | Когда создано |

### video_generations (раздел «Видео»)
Асинхронный провайдер (OpenRouter) — хранится `provider_job_id` для опроса.
| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | ID генерации видео |
| user_id | text FK → users | Владелец |
| provider | text | Всегда `openrouter` |
| model | text | ID видеомодели (напр. `bytedance/seedance-2.0`) |
| prompt | text | Текстовый промпт |
| mode | text | `t2v` / `i2v` |
| params | jsonb | duration, resolution, aspect_ratio, generate_audio |
| status | text | pending / processing / saving / done / error |
| provider_job_id | text | ID задачи на стороне OpenRouter |
| cost | numeric(10,4) | Факт после генерации (`usage.cost`) |
| error_message | text | Текст ошибки |
| hidden | boolean | Скрыто из истории |
| created_at / completed_at | timestamp | Время |

### videos
Готовые mp4-файлы (зеркало `images`).
| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | ID видео |
| video_generation_id | uuid FK → video_generations | К какой генерации относится |
| folder_id | uuid FK → folders (nullable) | Папка (задел под библиотеку) |
| s3_key / s3_url | text | Путь/URL в S3/MinIO |
| duration_seconds | integer | Длительность клипа |
| width / height | integer | Размеры (из resolution + aspect) |
| format | text | mp4 |
| has_audio | boolean | Со звуком ли |
| size_bytes | integer | Размер файла |
| metadata | jsonb | Доп. метаданные |
| created_at | timestamp | Когда создано |

### folders
| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | ID папки |
| name | text | Название |
| parent_id | uuid FK → folders (nullable) | Родительская папка (null = корень) |
| user_id | text FK → users | Владелец |
| created_at | timestamp | Когда создана |

### model_registry
| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | ID записи |
| provider | text | Провайдер |
| model_id | text | ID модели в API |
| display_name | text | Название для отображения |
| description | text | Описание модели |
| params_schema | jsonb | Схема допустимых параметров |
| pricing | jsonb | Ценообразование |
| is_active | boolean | Доступна ли модель |
| last_checked_at | timestamp | Последняя проверка |
| added_at | timestamp | Когда добавлена |

### notifications
| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | ID уведомления |
| type | text | `model_update` / `system` |
| title | text | Заголовок |
| message | text | Текст уведомления |
| is_read | boolean | Прочитано ли |
| created_at | timestamp | Когда создано |

### user_preferences
| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | ID записи |
| user_id | text FK → users | Пользователь |
| model_id | text | Для какой модели |
| params | jsonb | Сохранённые параметры по умолчанию |
| updated_at | timestamp | Когда обновлено |

### content_rubrics (раздел «Публикации»)
| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | ID рубрики |
| slug | text UNIQUE | Стабильный ключ (`base_real_work`, …) |
| title | text | Название для UI |
| description | text | Краткое описание |
| is_active | boolean | Видна ли пользователям |
| is_builtin | boolean | Системная рубрика — нельзя удалить |
| settings | jsonb | Модели и параметры pipeline |
| prompts | jsonb | Шаблоны промптов (Perplexity / Reddit / writer) |
| created_at / updated_at | timestamp | |

### content_settings
Глобальные системные промпты (key/value): `topic_selection_system`,
`web_context_compression_system`. Редактируются админом в UI рубрик.

### content_runs
Запуски pipeline. Все артефакты по шагам — в `artifacts` (jsonb),
расход по этапам — в `costs` (jsonb), статус идёт по `status`/`stage`
(`perplexity → reddit → topic → compression → writing → done` или `error`).

### content_topics
История сгенерированных тем для topic-guard. При `published=true` тема
попадает в «запретный список» для следующих запусков (окно настраивается).

### monitoring_templates (раздел «Мониторинг»)
| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | |
| slug | text UNIQUE? | NULL для пользовательских, `olga` для builtin |
| title / description | text | |
| is_builtin / is_active | boolean | |
| mode | text | `feed` (без AI) или `topics` (AI-классификация) |
| sources | jsonb | Массив `{id, type: telegram|website, url, label, feedUrl?, disabled?}` |
| topics | jsonb | Массив `{id, name, description}` для mode=topics |
| classifier | jsonb | `{model, batchSize, keepNonMatches}` — OpenRouter (default: `anthropic/claude-sonnet-4.6`) |
| default_interval_days | int | По умолчанию собирать за N дней |
| tg_max_pages | int | Глубина Telegram-пагинации (default 5 = ~100 постов/канал, max 15) |
| schedule | jsonb | `{enabled, intervalHours (≥24), hourUtc}` |
| last_run_at / next_run_at | timestamp | Авто-расчёт для cron-tick. Manual run НЕ двигает `next_run_at`. |
| created_by | text FK → user | |

### monitoring_runs
| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | |
| template_id | uuid FK → monitoring_templates | |
| user_id | text FK → user | |
| trigger | text | `manual` / `scheduled` |
| status | text | `pending → fetching → classifying → done` или `error` |
| mode | text | Снимок mode на момент запуска |
| period_from / period_to | timestamp | Окно поиска |
| sources_total / succeeded / failed | int | |
| items_found / items_matched | int | |
| cost | numeric | $ за классификацию |
| artifacts | jsonb | `sourceLog` (журнал по каждому источнику) + `classifierLog` |
| viewed_at | timestamp | Для сброса badge сайдбара |

### monitoring_items
| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | |
| run_id | uuid FK → monitoring_runs | |
| source_id / source_type / source_url / source_label | text | Снимок источника |
| post_url | text | Прямая ссылка на пост / статью |
| source_post_id | text | Для дедупа между запусками |
| published_at | timestamp | Из RSS `pubDate`, или из URL `/YYYY/MM/DD/`, или DD.MM.YYYY в title/description. NULL → UI «дата неизвестна» |
| title / content / excerpt | text | |
| images | jsonb | `[{url, width?, height?}]` (для TG — `cdn4.telesco.pe`, имеют TTL ~24-48ч) |
| match_type | text | `close` / `indirect` / `none` для topics-режима, NULL для feed |
| match_topic_id / match_topic_name / match_reason | text | Решение классификатора |
| is_favorite / favorited_at | boolean / timestamp | Помечено пользователем в избранное (страница `/monitoring/favorites`) |
| engagement | jsonb | `{views?, reactionsTotal?, reactions?: [{emoji,count}], comments?, forwards?}`. TG отдаёт всё, RSS обычно только `comments` (через `slash:comments`). Пусто для большинства сайтов. |
| engagement_score | int | Численный показатель «горячести»: `views + reactions*15 + forwards*20 + comments*30`. Индекс `(run_id, engagement_score)` — для сортировки «по вовлечённости». Порог 1500 = бейдж «горячее». |

---

## Docker Compose

```
┌─────────────────────────────────────────────┐
│              Docker Compose                  │
│                                              │
│  ┌─────────────┐  ┌──────────┐  ┌────────┐ │
│  │   Next.js   │  │PostgreSQL│  │ MinIO  │ │
│  │   :3000     │──│  :5432   │  │ :9000  │ │
│  │             │  └──────────┘  │ :9001  │ │
│  │             │────────────────│(console)│ │
│  └──────┬──────┘                └────────┘ │
│         │                                    │
└─────────┼────────────────────────────────────┘
          │
    Cloudflare Tunnel
          │
      Internet
```

**Порты:**
- `3000` — Next.js (веб-интерфейс + API)
- `5432` — PostgreSQL
- `9000` — MinIO S3 API
- `9001` — MinIO Web Console

**Volumes:**
- `postgres_data` — данные PostgreSQL
- `minio_data` — хранилище изображений MinIO

---

## Безопасность API ключей

```
Пользователь вводит ключ в UI
         │
         ▼
   [Маскированное поле ввода]
         │
         ▼
   Server Action (HTTPS)
         │
         ▼
   AES-256-GCM шифрование
   (ключ шифрования из .env ENCRYPTION_KEY)
         │
         ▼
   Сохранение в БД:
   - encrypted_key: зашифрованный ключ
   - key_hint: "...xF4k" (последние 4 символа)
         │
         ▼
   При генерации:
   - Расшифровка только на сервере
   - Ключ никогда не передаётся на клиент
   - Нет API для получения полного ключа
```

---

## Потоки данных

### Генерация изображения

```
Пользователь
    │
    ▼ POST /api/generate
    │ {provider, model, prompt, params, count}
    │
    ▼ Server:
    1. Проверка авторизации и лимита
    2. Создание записи в generations (status: pending)
    3. Расшифровка API ключа провайдера
    4. Вызов API провайдера
    5. Получение изображений (base64/url)
    6. Загрузка в MinIO S3
    7. Создание записей в images
    8. Обновление generation (status: done, cost)
    │
    ▼ Response:
    {generation_id, images: [{id, url, width, height}]}
```

### Генерация видео (async)

```
Пользователь
    │
    ▼ POST /api/video/generate {model, prompt, params, uploadId?}
    │ Server: auth + бюджет/лимиты + ключ OpenRouter
    │         → video_generations (status: processing) → submit job в OpenRouter
    │         → возврат {videoGenerationId}
    │
    ▼ Клиент опрашивает GET /api/video/[id]/status каждые ~3с
    │ Server: poll OpenRouter
    │   completed → скачать mp4 → S3 (videos/{genId}/0.mp4) → запись videos
    │            → status: done, списать usage.cost в user.total_spent
    │   failed    → status: error
    │
    ▼ <video controls src="/api/videos/[id]">  (Range/206 для перемотки)
```

### Мониторинг

```
Пользователь → POST /api/monitoring/runs {templateId, intervalDays}
    │
    ▼ Server:
    1. Создание monitoring_runs (status: pending)
    2. safeRunPipeline() — асинхронно, без ожидания клиентом
    │
    ▼ Pipeline (status: fetching):
    3. Параллельный fetch всех активных источников:
       - telegram → t.me/s/{handle} (HTML, до 5 страниц через ?before),
         параллельно вытаскиваются views/reactions/forwards/comments
       - website  → discoverFeedUrl() → RSS/Atom + parseFeed(),
         комментарии берутся из `slash:comments` если есть
    4. Дедуп постов по (sourceId + sourcePostId)
    5. sourceLog в artifacts — статус каждого источника
    6. computeEngagementScore() считает «горячесть» для сортировки
    │
    ▼ Если mode=topics (status: classifying):
    6. classifyPosts() — батчи по 8 через OpenRouter Haiku 4.5
       JSON-output: [{index, match_type, topic_id, reason}]
    7. Считаем cost, добавляем в user.totalSpent
    │
    ▼ Сохранение:
    8. INSERT в monitoring_items
    9. UPDATE monitoring_runs (status: done, items_found, items_matched)
   10. UPDATE monitoring_templates (last_run_at, next_run_at)

cron-tick (каждые 15 минут):
    GET monitoring_templates WHERE is_active AND next_run_at <= now()
    → стартует новый run с trigger=scheduled
```

### Проверка обновлений моделей (cron, ежедневно)

```
node-cron (06:00 UTC)
    │
    ▼ Для каждого провайдера:
    1. Запрос списка актуальных моделей через API
       - OpenAI: GET /v1/models
       - xAI: GET /v1/models
       - OpenRouter: GET /api/v1/models?output_modalities=image
    2. Сравнение с model_registry в БД
    3. Если найдена новая модель:
       - Добавить в model_registry
       - Создать notification (type: model_update)
    4. Если модель удалена:
       - Пометить is_active: false
       - Создать notification
```

---

## Язык интерфейса

Весь UI на **русском языке**. Строки захардкожены в компонентах (не i18n),
но сгруппированы в объекты-словари для удобства будущей локализации, если понадобится.
