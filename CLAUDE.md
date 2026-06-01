@AGENTS.md

# MediaGenerator

Веб-приложение для генерации изображений через API нейросетей.
Подробности в `docs/`.

## Ключевые файлы документации

- `docs/ARCHITECTURE.md` — стек, структура проекта, схема БД, потоки данных
- `docs/ROADMAP.md` — фазы реализации с задачами и критериями проверки
- `docs/PROVIDERS.md` — описание API провайдеров, модели, параметры, цены
- `docs/PROGRESS.md` — трекер выполнения (обновлять после каждой задачи!)

## Правила для сессий разработки

1. **Перед началом работы** — прочитай `docs/PROGRESS.md` чтобы понять что уже сделано
2. **Выбери задачу** из `docs/ROADMAP.md` (идти по порядку фаз)
3. **После завершения задачи** — обнови `docs/PROGRESS.md` (поставь [x] и добавь строку в таблицу завершённых)
4. **Коммить** после каждой логически завершённой задачи
5. **Тестируй** — каждая фаза имеет секцию "Проверка" в ROADMAP.md

## Стек (кратко)

- Next.js 15 (App Router) + React 19 + TypeScript
- PostgreSQL 16 + Drizzle ORM
- shadcn/ui + Tailwind CSS 4 (тёмная тема)
- Better Auth (роли: admin/user)
- MinIO S3 (хранилище изображений)
- Docker Compose (деплой)

## Язык интерфейса

Русский. Все тексты в UI на русском языке.

## Подсказки по разделам

### Мониторинг (`/monitoring`)

Раздел собирает посты из Telegram-каналов и сайтов по интервалам,
опционально классифицирует их AI-моделью.

**Ключевые файлы:**
- `src/lib/monitoring/pipeline.ts` — оркестратор, `safeRunPipeline`, `computeNextRunAt`
- `src/lib/monitoring/sources/telegram.ts` — парсер `t.me/s/{handle}` (без авторизации)
- `src/lib/monitoring/sources/website.ts` — RSS/Atom + windows-1251 + извлечение дат из URL
- `src/lib/monitoring/sources/infer-date.ts` — fallback-парсинг дат когда RSS не отдал
- `src/lib/monitoring/classifier.ts` — батч-классификация через OpenRouter
- `src/lib/monitoring/seed.ts` — встроенный шаблон «Ольга»
- `src/lib/monitoring/categorize-source.ts` — мессенджер/соцсеть/сайт
- `src/components/monitoring/*` — UI (shell, run-detail, sources/topics/schedule панели, фильтры, избранное)

**Архитектурные принципы:**
1. **Manual «Запустить сейчас» НЕ двигает `next_run_at`** — иначе пользователь сбивает scheduled
2. **Cron-tick каждые 15 минут** — догоняет пропущенные scheduled-запуски (после выключения docker)
3. **Concurrency: 2 для Telegram, 5 для website** — TG банит при множественном TLS handshake с одного IP
4. **Кэш items** — при topics-прогоне в течение 6 часов после feed-прогона ТОГО ЖЕ шаблона не делается повторный fetch (`reusedFromRunId`)
5. **Layout overflow** — используем CSS-grid `minmax(0,1fr)` + `overflow-x-hidden` на корне страницы. Чистый flex с `flex-wrap` нестабилен в Tailwind 4 с длинным контентом
6. **TZ**: drizzle хранит timestamp без TZ, передаёт JS Date в UTC. При выводе через `AT TIME ZONE` нужны явные преобразования
7. **Engagement-score** = `views + reactions*15 + forwards*20 + comments*30`. Подобрано чтобы активный отклик весил в десятки раз больше пассивных просмотров. Порог «горячее» = 1500. Хранится отдельной колонкой `engagement_score` (int) для индекса по `(run_id, engagement_score)` — клиентская сортировка по этому полю работает за O(1).
8. **Reactions из TG**: парсятся из `<span class="tgme_reaction"><b>EMOJI</b>1</span>`. ❗ Важно: после `replace(/<[^>]+>/g, "")` число оказывается ПОСЛЕ эмодзи, поэтому `parseCompactNumber` нужно применять к **хвосту** строки (regex `/([\d.,]+\s*[KMBkmb]?)\s*$/`), не к началу.
9. **URL в TG-постах** содержат `#:~:text=%D0%A2...` (scroll-to-text fragment с процент-кодировкой кириллицы). `cleanUrlForDisplay()` в `telegram.ts` срезает этот фрагмент через `replace(/[#&]:~:text=[^#&]*/i, "")` и декодирует через `decodeURI`. Применяется в `htmlToPlainText` при разборе тега `<a href>`.
10. **Title для TG-постов НЕ заполняется** — у TG нет понятия заголовка, первая строка content и так выводится сверху карточки. Раньше парсер ставил `title = b.text.split("\n")[0].slice(0, 200)` → визуальный дубль. UI ещё дополнительно скрывает title если он совпадает с началом content (`titleDuplicatesContent`) — для старых записей в БД и RSS-постов с дубль-описанием.
11. **`computeNextRunAt` — «следующий день в hourUtc», не «через interval после now»**. Если scheduled-запуск опоздал (cron подвис, запустился в 08:47 вместо 06:00), старый алгоритм отдавал `+2 дня`, пропуская сутки. Новый: «ближайший момент в hourUtc, который ≥ baseTime», с шагом `ceil(interval/24)` дней. Покрыто `tests/monitoring-pipeline.test.ts`. Принимает опциональный `baseTime` для детерминированных тестов.
12. **Cron-контейнер в docker-compose**: `command` зашит inline через `entrypoint: /bin/sh; command: -c "..."`. ❗ Важно: при изменении этой команды `docker compose up -d` НЕ пересоздаёт контейнер (он привязан к image, а image не поменялся). Нужно явно `docker compose up -d --force-recreate cron`. Иначе шаблоны со scheduled расписанием будут молча не запускаться.

**Дефолтная модель классификатора:** `anthropic/claude-sonnet-4.6` ($1.15 на 500 постов, ~10 минут). Менять в `DEFAULT_CLASSIFIER` (см. classifier.ts) если решения по моделям меняются.

**ВКонтакте парсинг** не реализован — нужен VK API service_token. VK-источники в шаблонах помечаются `disabled: true`.

**Telegram CDN-картинки** (`cdn4.telesco.pe/...`) имеют TTL ~24-48 часов — для долгосрочного архива нужно скачивать в S3 при сборе.
