# MediaGenerator

Веб-приложение для генерации изображений через API нейросетей (OpenAI, xAI, OpenRouter).

## Возможности

- Генерация изображений через множество моделей (GPT Image, Grok, FLUX, Gemini и др.)
- Библиотека изображений с папками и массовыми операциями
- История генераций с фильтрами и повторной генерацией
- Админ-панель: управление пользователями, лимитами, моделями
- Автоматическая проверка новых моделей у провайдеров
- Система уведомлений
- Шифрование API ключей (AES-256-GCM)
- Тёмная тема, русский интерфейс

## Стек

- **Next.js 15** (App Router) + React 19 + TypeScript
- **PostgreSQL 16** + Drizzle ORM
- **shadcn/ui** + Tailwind CSS 4
- **Better Auth** (email/пароль, роли admin/user)
- **MinIO** (S3-совместимое хранилище изображений)
- **Docker Compose**

---

## Быстрый старт (Docker)

### 1. Клонирование и настройка

```bash
git clone <repo-url> mediagenerator
cd mediagenerator
cp .env.example .env
```

### 2. Генерация секретов

Отредактируйте `.env`, заменив все `change_me_*` значения:

```bash
# Генерация ключей:
openssl rand -hex 32   # для ENCRYPTION_KEY и BETTER_AUTH_SECRET
openssl rand -hex 16   # для CRON_SECRET, POSTGRES_PASSWORD, MINIO_ROOT_PASSWORD
```

### 3. Запуск

```bash
docker compose up -d
```

Дождитесь запуска всех сервисов (~30 секунд):
- **Приложение**: http://localhost:3000
- **MinIO Console**: http://localhost:9001

### 4. Первый пользователь

Перейдите на http://localhost:3000/register. Первый зарегистрированный пользователь автоматически получает роль **admin**.

### 5. Миграции БД

Миграции применяются автоматически при первом запуске. Если нужно запустить вручную:

```bash
docker compose exec app npx drizzle-kit migrate
```

### 6. Настройка API ключей

Перейдите в **Настройки** и добавьте API ключи провайдеров:
- **OpenAI**: https://platform.openai.com/api-keys
- **xAI**: https://console.x.ai/
- **OpenRouter**: https://openrouter.ai/keys

---

## Cloudflare Tunnel (mediagenerator.sanktum.net)

Для доступа извне без открытия портов.

### Установка cloudflared

```bash
# macOS
brew install cloudflared

# Linux
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared
```

### Авторизация

```bash
cloudflared tunnel login
```

### Создание туннеля

```bash
cloudflared tunnel create mediagenerator
```

Запомните ID туннеля из вывода.

### Конфигурация

Создайте `~/.cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: mediagenerator.sanktum.net
    service: http://localhost:3000
  - service: http_status:404
```

### DNS запись

```bash
cloudflared tunnel route dns mediagenerator mediagenerator.sanktum.net
```

### Запуск туннеля

```bash
# Разово (для теста):
cloudflared tunnel run mediagenerator

# Как системный сервис:
cloudflared service install
```

### Обновление .env для продакшена

```env
NEXT_PUBLIC_APP_URL=https://mediagenerator.sanktum.net
BETTER_AUTH_URL=https://mediagenerator.sanktum.net
```

---

## Проверка обновлений моделей (Cron)

Автоматическая проверка новых моделей у провайдеров:

```bash
# Ручной запуск:
curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/model-check

# Автоматический (crontab -e):
0 6 * * * curl -s -X POST -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/model-check
```

Новые модели добавляются как неактивные. Активируйте их в **Настройки > Уведомления**.

---

## Бэкапы

### PostgreSQL

```bash
# Создать бэкап:
docker compose exec postgres pg_dump -U mediagen mediagenerator > backup_$(date +%Y%m%d).sql

# Восстановить:
cat backup_20260404.sql | docker compose exec -T postgres psql -U mediagen mediagenerator
```

### MinIO (изображения)

```bash
# Установить mc (MinIO Client):
brew install minio/stable/mc  # macOS

# Настроить:
mc alias set local http://localhost:9000 minioadmin YOUR_MINIO_PASSWORD

# Бэкап:
mc mirror local/mediagenerator ./backup_images/

# Восстановить:
mc mirror ./backup_images/ local/mediagenerator
```

---

## Обновление приложения

```bash
git pull
docker compose build app
docker compose up -d app
```

Если есть новые миграции:

```bash
docker compose exec app npx drizzle-kit migrate
```

---

## Разработка (без Docker)

```bash
npm install

# Убедитесь что PostgreSQL и MinIO запущены:
docker compose up -d postgres minio

# Миграции:
npx drizzle-kit migrate

# Dev сервер:
npm run dev
```

---

## Структура проекта

```
src/
├── app/           # Next.js App Router (страницы, API routes)
├── components/    # React компоненты по фичам
├── lib/
│   ├── actions/   # Server Actions (бизнес-логика)
│   ├── db/        # Drizzle ORM (схема, миграции)
│   ├── providers/ # Адаптеры провайдеров генерации
│   ├── cron/      # Логика периодических задач
│   └── utils/     # Утилиты (crypto, admin-guard)
└── hooks/         # React хуки
```

Подробнее: `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`
