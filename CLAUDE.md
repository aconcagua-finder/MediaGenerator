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

## Эксплуатация (деплой и типовые сбои)

Проект работает в Docker **локально на маке**, наружу торчит через cloudflared-туннель
(`mediagenerator.sanktum.net` → `localhost:3001`). Никакого удалённого сервера нет -
`postgres`, `minio`, `app`, `cron` крутятся в Docker Desktop.

**Сбой: MinIO отдаёт "Storage backend has reached its minimum free drive threshold.
Please delete a few objects to proceed."**
Это НЕ про объём картинок в бакете (сам бакет обычно ~сотни МБ). MinIO живёт на диске
Docker-VM (`/dev/vda1`, потолок ~58 ГБ), и когда VM забивается до ~99%, MinIO включает
защиту минимального свободного места и отказывается писать. Совет из ошибки "удалите
объекты" вводит в заблуждение - удалять в бакете нечего.

Диагностика и фикс:
```sh
docker run --rm alpine df -h /                    # свободное место в Docker-VM
docker exec mediagenerator-minio-1 df -h /data    # то же глазами MinIO
docker system df                                  # кто занял: обычно Build Cache + Images
docker builder prune -af                          # регенерируемый кэш, данные не трогает
docker image prune -f                             # только висячие образы
```
Build cache легко нарастает до 30-40 ГБ от повторных сборок этого и соседних проектов
(mixbreaker, tilda, pc) - они делят один Docker-VM. НЕ делать `docker volume prune`
и `docker system prune -a`: снесёт тома/образы остановленных pc_* контейнеров.
Проверка фикса - тестовая запись в бакет через `mc` внутри контейнера minio.

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

### Видео (`/video`)

Генерация видео через OpenRouter (`POST /api/v1/videos`, асинхронно: job → polling),
тем же ключом, что картинки/чат. Реестр моделей — `src/lib/providers/video-models.ts`.

**Ключевые файлы:**
- `src/lib/providers/video/openrouter-video.ts` — адаптер (submit/poll/fetchVideo)
- `src/lib/providers/video-models.ts` — реестр моделей (зеркалит `GET /api/v1/videos/models`)
- `src/lib/video/finalize.ts` — `finalizeVideoGeneration` + `reconcileStaleVideoJobs` (общий код)
- `src/app/api/video/[id]/status/route.ts` — клиентский поллинг (тонкий, зовёт finalize)
- `src/app/api/cron/video-reconcile/route.ts` — cron-дочистка зависших задач

**Архитектурные принципы:**
1. **i2v: `frame_images` — массив ОБЪЕКТОВ**, не строк: `{ type:"image_url", image_url:{ url }, frame_type:"first_frame"|"last_frame" }`. `url` принимает data:-URI. Массив строк → 400 `expected object, received string`. Текст-промпт уходит всегда (`{model,prompt}`), картинка — поверх.
2. **`poll()`: упавшая задача = `{ status:"failed", error:"<строка-причина>" }` при HTTP 200**. `error`-строка (часто контент-фильтр Veo: «content may have been filtered») — это ПРИЧИНА фейла, НЕ транспортная ошибка. ❗ Нельзя бросать исключение при `data.error` — иначе фейл ловится как транзиентный и задача крутится вечно, не финализируясь. Бросаем только если `!status && !response.ok`.
3. **Финализация — единый `finalize.ts`** для клиентского поллинга и cron. Claim `processing → saving` (UPDATE с `where status='processing'`) защищает от двойного скачивания при гонке клиент/cron.
4. **Поллинг статуса целиком клиентский** (браузер дёргает `/status`). Если вкладку закрыли — задачу дочищает cron `video-reconcile` (каждые 15 мин): опрашивает провайдера, скачивает mp4 в S3 при успехе или ставит `error`. Без него закрытая вкладка = вечный `processing`. ❗ Добавление в cron-команду требует `--force-recreate cron` (см. п.12 мониторинга).
5. **Биллинг — только за успех.** `user.totalSpent` растёт лишь в ветке `done`; упавшая задача → `cost = NULL`. OpenRouter за `failed` денег не берёт (нет `usage.cost`, политика Zero Completion Insurance).

#### Редактор склейки (`/video/editor`)

Базовый видеоредактор: выбрать несколько готовых клипов, задать порядок, подрезать,
склеить в один файл. Рендер — **локальный ffmpeg** (не провайдер), поэтому **бесплатно**.
Вход: «Склеить» в bulk-actions библиотеки (2+ выбранных), «Склеить готовые» в результатах
генерации, кнопка «Редактор склейки» на `/video`, или прямой переход.

**Ключевые файлы:**
- `src/lib/video/compose-graph.ts` — чистый построитель ffmpeg-команды (покрыт `tests/compose-graph.test.ts`)
- `src/lib/video/compose.ts` — воркер: `runComposeJob` + `reconcileStaleCompositions`, in-process мьютекс
- `src/app/api/video/compose/route.ts` — submit (валидация владения + eager-запуск рендера)
- `src/app/api/video/compose/[id]/status/route.ts` — поллинг (+подталкивает рендер)
- `src/app/api/cron/video-compose/route.ts` — дочистка зависших + осиротевших `/tmp`
- `src/components/video/editor/*` — UI (дорожка, обрезка, пикер, предпросмотр, карточка рендера)

**Архитектурные принципы:**
1. **ВСЕГДА `filter_complex` + полный re-encode + нормализация.** Клипы от разных моделей различаются по разрешению/fps/pixfmt/звуку. Быстрый concat-демультиплексор (`-c copy`) на них **молча выдаёт битый выход** (зелёные кадры, фризы, рассинхрон) — не используем. Нормализация каждого сегмента: `trim`→`setpts=PTS-STARTPTS`→`scale:force_original_aspect_ratio=decrease`+`pad`(чёрные поля, без искажений)→`setsar=1`→`fps`→`format=yuv420p`.
2. **Звук: anullsrc на каждый немой/мьютнутый сегмент.** `concat=...:a=1` требует аудиопоток в КАЖДОМ сегменте. Для клипов с `hasAudio=false` или `mute` подмешиваем отдельный lavfi-`anullsrc` вход длиной ровно в обрезанную длительность (иначе аудио уезжает на стыках). Ветка реальный-звук/тишина — по `videos.hasAudio` из БД. `audio=false` → вообще без аудио (`-an`).
3. **Память на 768М: `-threads 1` обязателен** (libx264 по умолчанию множит фрейм-буферы по ядрам, +400-600МБ) + `-preset veryfast` + потолок холста 720p. **Один ffmpeg за раз** — in-process мьютекс (деплой = один app-контейнер) + DB-claim `processing→saving`.
4. **Job-флоу зеркалит `finalize.ts`.** Рендер запускается eager из submit (`void runComposeJob`), клиент опрашивает статус. Зависшие добивает cron `video-compose` (перезапуск `processing`, ошибка для `saving` старше 15 мин). ❗ Cron-строка требует `--force-recreate cron` (см. п.12 мониторинга).
5. **Данные.** Job-таблица `video_compositions` + нормализованный EDL `video_composition_segments` (миграция `0015`). Результат кладётся в общую `videos` через `videos.composition_id` (FK + XOR-CHECK `videos_owner_xor`: ровно один из `video_generation_id`/`composition_id`), поэтому склейка появляется в библиотеке как обычное видео. `cost = NULL`, `totalSpent` не трогаем. ❗ **Любой запрос, определяющий владельца видео, обязан left-join'ить ОБА источника** (`video_generations` И `video_compositions`), а не inner-join только генерацию — иначе у склейки `video_generation_id IS NULL` и строка теряется. Это касается `getVideos`/`moveVideos`/`deleteVideos`, отдающего mp4 роута `/api/videos/[id]` (иначе плеер получает 404, видео «есть в библиотеке, но не играет») и пикера.
6. **Холст по ориентации задаёт сервер** (16:9 → 1280×720, 9:16 → 720×1280) — контроль памяти, клиент не диктует произвольный размер. S3-ключ результата: `compositions/{id}/output.mp4`.
7. **ffprobe для длительности.** Реальную длительность каждого входа берём из `ffprobe` (fallback на `videos.durationSeconds`), чтобы тишина точно совпадала с видео. Alpine-пакет `ffmpeg` ставит и `ffmpeg`, и `ffprobe` (`apk add ffmpeg` в Dockerfile).

### Озвучка (`/voice`)

Синтез речи из текста (TTS) через OpenRouter `POST /api/v1/audio/speech` (OpenAI-совместимый),
тем же ключом, что картинки/видео/чат. Реестр — `src/lib/providers/voice-models.ts` (9 моделей).

**Ключевые файлы:**
- `src/lib/providers/voice-models.ts` — реестр моделей/голосов + `estimateVoiceCost`, `resolveVoice`, `clampSpeed`
- `src/lib/providers/voice/openrouter-voice.ts` — адаптер (`synth` + `fetchCost`) + `pcmToWav`
- `src/lib/voice/generate.ts` — `runVoiceGeneration` (синтез→S3→запись→списание), claim `processing→saving`
- `src/app/api/voice/generate/route.ts` — submit (валидация/лимиты + СИНХРОННЫЙ синтез в том же запросе)
- `src/app/api/audios/[id]/route.ts` — отдача аудио из S3 (Range)
- `src/lib/actions/audios.ts` — `getAudios`/`moveAudios`/`deleteAudios` для библиотеки
- `src/components/voice/*` — UI (форма, селекторы модели и голоса)
- `src/components/library/audio-{grid,library}.tsx` — вкладка «Озвучка» в библиотеке

**Архитектурные принципы:**
1. **TTS СИНХРОННЫЙ — НЕТ job/poll/cron.** В отличие от видео, `/audio/speech` сразу отдаёт байты аудио. Поэтому `/api/voice/generate` синтезирует, кладёт в S3 и списывает стоимость прямо в обработчике POST; клиент получает готовый файл в ответе. Нет `provider_job_id`, нет реконсиляции, нет cron.
2. **Биллинг — только за успех, в одном месте** (`runVoiceGeneration`, ветка `done`, `cost>0`). Claim `processing→saving` (UPDATE с `where status='processing'`) защищает от двойного списания при повторном вызове. Submit-роут только гейтит оценку против `costLimit` (429), не списывает. Зеркалит `video/finalize.ts`.
3. **Цена TTS не приходит стабильно через `/generation`** (для TTS `total_cost` часто `null`). Поэтому биллинг — по **оценке из числа символов** (`estimateVoiceCost = символы/1000 × pricePer1kChars`); `fetchCost` пробуется best-effort, но обычно null. Суммы копеечные.
4. **Gemini TTS принимает ТОЛЬКО `response_format=pcm`** (на `mp3` отвечает 400). Сырой PCM (24кГц/моно/16-бит, без заголовка) заворачиваем в WAV (`pcmToWav`, 44-байтный заголовок) — иначе браузерный `<audio>` не играет. У модели `requestFormat:"pcm"`, `outputFormat:"wav"`; у остальных — mp3. Длительность для WAV считаем из размера PCM.
5. **Русский уверенно тянут 3 из 9** (`russianSpeech:"good"`): `microsoft/mai-voice-2` (родные голоса `ru-RU-Masha`/`ru-RU-Lev`, требуют суффикс `:MAI-Voice-2`), `google/gemini-3.1-flash-tts-preview`, `x-ai/grok-voice-tts-1.0` (авто-определение языка). Остальные — английский/др. языки (`none`).
6. **Голоса валидируются по реестру** (`resolveVoice` → дефолт при невалидном; `clampSpeed` зажимает скорость, 1 для моделей без скорости). Списки голосов подтверждены живым вызовом (см. `tests/voice-models.test.ts`), т.к. OpenRouter их не перечисляет.
7. **`mistralai/voxtral-mini-tts-2603` у провайдера сейчас отдаёт 404** → `available:false`, в селекторе отключена, submit-роут возвращает 400. Если провайдер починят — снять флаг.
8. **Данные.** `voice_generations` (job) + `audios` (файл), миграция `0016`. Источник ОДИН (озвучка), поэтому `audios.voice_generation_id` NOT NULL, без XOR — владелец берётся простым join'ом на `voice_generations.userId` (в отличие от видео). S3-ключ: `audios/{voiceGenerationId}/0.{mp3|wav}`.

**Картинки — Nano Banana 2 / 2 Lite:** `google/gemini-3.1-flash-image` (GA, Nano Banana 2) и `google/gemini-3.1-flash-lite-image` (Lite) добавлены в `seed-models.ts` (секция OpenRouter). Старый preview-слаг `google/gemini-3.1-flash-image-preview` мигрирован на GA везде (edit-диалог, cover-модели, capabilities) и деактивируется в `seedModels()` через `RETIRED_OPENROUTER_MODELS`. Цена в `cost-calculator.ts` — по размеру (flash 1K≈$0.067, lite 1K≈$0.034); ❗ ветка `flash-lite-image` идёт ПЕРЕД `flash-image`. Дефолтная модель картинок — Lite (`PREFERRED_DEFAULT` в `generate-form.tsx`; сохранённый выбор в localStorage имеет приоритет). ❗ **Готча:** крон `model-check` авто-обнаруживает новые image-модели OpenRouter и вставляет их в `model_registry` как `is_active=false` с пустыми `params_schema`/`pricing`. Если это случилось ДО `seedModels()`, наш insert-only сид их пропустит — модель останется скрытой с пустыми параметрами. `gemini-3.1-flash-image` так и «спрятался»; чинится UPDATE'ом строки (активация + правильные `params_schema`/`pricing`/`display_name`).
