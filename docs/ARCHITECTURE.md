# MediaGenerator - Архитектура

## Обзор

Веб-приложение для генерации изображений через API нейросетей (OpenAI, xAI, OpenRouter).
Запускается локально через Docker Compose + Cloudflare Tunnel.

---

## Стек технологий

| Слой | Технология | Версия | Назначение |
|------|-----------|--------|------------|
| Фреймворк | Next.js (App Router) | 15.x | Fullstack: SSR, RSC, Server Actions, API routes |
| UI | React | 19.x | Компоненты интерфейса |
| Стили | Tailwind CSS | 4.x | Утилитарные стили, тёмная тема |
| UI-библиотека | shadcn/ui | latest | Компоненты: кнопки, модалки, формы, таблицы |
| БД | PostgreSQL | 16.x | Основная база данных |
| ORM | Drizzle ORM | latest | Type-safe запросы, миграции |
| Аутентификация | Better Auth | latest | Логин, регистрация, роли, сессии |
| Хранилище файлов | MinIO (S3) | latest | Хранение сгенерированных изображений |
| Фоновые задачи | node-cron | latest | Ежедневная проверка обновлений моделей |
| Язык | TypeScript | 5.x | End-to-end типизация |
| Контейнеризация | Docker Compose | latest | PostgreSQL + MinIO + App |

---

## Почему именно этот стек

### Next.js 15 + React 19
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
