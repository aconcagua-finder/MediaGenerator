# MediaGenerator

Веб-приложение для генерации изображений через API нейросетей.
Дизайн в стиле X.com / Grok — чёрный фон, синие акценты, минимализм.

## Возможности

- **Мультипровайдер**: OpenAI (GPT Image 1/1.5), xAI (Grok Imagine), OpenRouter (Gemini, FLUX, Seedream, GPT-5)
- **Библиотека**: masonry-layout, папки, массовое выделение/удаление/перемещение
- **История**: фильтры, раскрывающиеся промпты, повторная генерация
- **Система ролей**: admin видит всё, user ограничен лимитами
- **Лимиты**: по бюджету ($0.10 по умолчанию), дневной, общий
- **Наследование ключей**: новые юзеры получают копии API ключей админа
- **Автопроверка моделей**: cron-сервис раз в сутки проверяет новые модели
- **Безопасность**: AES-256-GCM шифрование ключей, расшифровка только на сервере
- **UI**: тёмная тема, русский язык, фоновые градиенты

## Стек

- **Next.js 16** (App Router) + React 19 + TypeScript
- **PostgreSQL 16** + Drizzle ORM
- **shadcn/ui** (base-nova) + Tailwind CSS 4
- **Better Auth** (email/пароль, роли admin/user)
- **MinIO** (S3-совместимое хранилище)
- **Docker Compose** (app + postgres + minio + cron)

---

## Быстрый старт

### 1. Клонирование и настройка

```bash
git clone <repo-url> mediagenerator
cd mediagenerator
cp .env.example .env
```

### 2. Генерация секретов

Отредактируйте `.env`, заменив все `change_me_*`:

```bash
openssl rand -hex 32   # ENCRYPTION_KEY, BETTER_AUTH_SECRET
openssl rand -hex 16   # CRON_SECRET, POSTGRES_PASSWORD, MINIO_ROOT_PASSWORD
```

### 3. Запуск

```bash
docker compose up -d
```

Сервисы:
- **Приложение**: http://localhost:3001
- **MinIO Console**: http://localhost:9001

### 4. Назначение админа

Первый пользователь **не** становится админом автоматически. Назначьте вручную через БД:

```bash
docker compose exec postgres psql -U mediagen -d mediagenerator \
  -c "UPDATE \"user\" SET role = 'admin', cost_limit = 999999 WHERE email = 'ваш@email.com';"
```

### 5. API ключи

Админ добавляет ключи в **Настройки**:
- **OpenAI**: https://platform.openai.com/api-keys
- **xAI**: https://console.x.ai/
- **OpenRouter**: https://openrouter.ai/keys

Новые пользователи при регистрации автоматически получают копии ключей админа.

---

## Система лимитов

| Лимит | По умолчанию | Описание |
|-------|-------------|----------|
| `costLimit` | $0.10 | Максимальный бюджет пользователя |
| `dailyLimit` | 50 | Генераций в день |
| `maxGenerations` | ∞ | Общий лимит генераций |

Админ управляет лимитами в **Настройки > Пользователи**.
Админ не ограничен лимитами.

---

## Docker Compose сервисы

| Сервис | Назначение |
|--------|-----------|
| `app` | Next.js приложение (:3001 → :3000) |
| `postgres` | PostgreSQL 16 (:5432) |
| `minio` | S3-хранилище (:9000 API, :9001 console) |
| `cron` | Проверка моделей раз в 24ч (alpine) |

---

## Cloudflare Tunnel

Для доступа извне без открытия портов:

```bash
cloudflared tunnel login
cloudflared tunnel create mediagenerator
cloudflared tunnel route dns mediagenerator your.domain.com
cloudflared tunnel run mediagenerator
```

Обновите `.env`:
```env
NEXT_PUBLIC_APP_URL=https://your.domain.com
BETTER_AUTH_URL=https://your.domain.com
```

---

## Бэкапы

```bash
# PostgreSQL
docker compose exec postgres pg_dump -U mediagen mediagenerator > backup.sql

# MinIO
mc alias set local http://localhost:9000 minioadmin YOUR_MINIO_PASSWORD
mc mirror local/mediagenerator ./backup_images/
```

---

## Обновление

```bash
git pull
docker compose up -d --build
```

---

## Структура проекта

```
src/
├── app/              # Next.js страницы и API routes
│   ├── (auth)/       # Login, Register
│   ├── (dashboard)/  # Generate, Library, History, Settings
│   └── api/          # Generate, Images, Auth, Cron
├── components/       # React компоненты
│   ├── generate/     # Форма генерации, селекторы
│   ├── library/      # Masonry-сетка, папки, lightbox
│   ├── history/      # Таблица, фильтры, пагинация
│   └── settings/     # API ключи, пользователи
├── lib/
│   ├── actions/      # Server Actions
│   ├── db/schema/    # Drizzle ORM схема
│   ├── providers/    # OpenAI, xAI, OpenRouter адаптеры
│   ├── cron/         # Проверка моделей
│   └── utils/        # Crypto, admin guard, cost calculator
└── hooks/            # React хуки
```

Подробнее: `docs/ARCHITECTURE.md`
