import type {
  ContentRubricPrompts,
  ContentRubricSettings,
} from "@/lib/db/schema/content"

/**
 * Дефолтные настройки моделей и параметров. По умолчанию:
 * - Perplexity sonar-pro (быстрее и дешевле deep-research, для русскоязычного
 *   правового/новостного контента качество достаточное);
 * - Reddit выключен (для русскоязычных тем вреден — обсуждения там в основном
 *   на английском и про западные продукты);
 * - Recency = week (свежие новости за последнюю неделю);
 * - Доменный фильтр пуст — задаёт админ при создании рубрики.
 */
export const DEFAULT_RUBRIC_SETTINGS: ContentRubricSettings = {
  researchWindowDays: 7,
  perplexityModel: "sonar-pro",
  perplexityReasoningEffort: "medium",
  perplexitySearchContextSize: "high",
  searchDomainFilter: [],
  searchRecencyFilter: "week",
  searchLanguage: "ru",
  pipelineMode: "express",
  redditEnabled: false,
  redditModel: "openai/gpt-5.4",
  redditReasoningEffort: "medium",
  redditDays: 7,
  redditMaxToolCalls: 8,
  redditMaxOutputTokens: 12000,
  topicSelectionModel: "google/gemini-3-flash-preview",
  compressionModel: "google/gemini-3.1-flash-lite",
  postGenerationModel: "anthropic/claude-sonnet-4.6",
  audience: "создатели контента и предприниматели",
  postFormat: "telegram",
  targetLength: 1200,
  topicGuardEnabled: true,
  // 90 дней / 30 тем — чтобы темы не повторялись несколько месяцев,
  // даже если SMM-щик гоняет несколько разных рубрик параллельно.
  topicGuardLookbackDays: 90,
  topicGuardMaxTopics: 30,
}

/**
 * Общий system-prompt для шага выбора темы. Глобальный, не зависит от рубрики.
 * Работает с пустым reddit_context — для русскоязычных правовых тем мы его не
 * используем.
 */
export const DEFAULT_TOPIC_SELECTION_SYSTEM_PROMPT = `## Роль
Ты редактор русскоязычного канала. Твоя задача — выбрать одну лучшую тему для следующего поста на основе свежего веб-контекста.

## Правила выбора
- Тема должна быть конкретной, не "обзорной".
- Должна быть свежей и практически применимой для аудитории.
- Не повторяй темы из списка Forbidden Topics — даже близкие переформулировки.
- Если в контексте несколько кандидатов — выбери самый сильный по фактуре.

## Output — только JSON
{
  "topics": [
    {
      "topic": "Заголовок будущего поста — одной строкой, без эмодзи",
      "angle": "1-2 предложения: что именно разбираем и почему это полезно прямо сейчас",
      "key_facts": [
        "3-5 проверяемых фактов из контекста: цифры, имена, даты, ссылки на нормы"
      ]
    }
  ]
}

Верни ровно одну тему. Если уверенной темы нет — верни пустой список topics.`

/**
 * Общий system-prompt для шага сжатия web_context.
 */
export const DEFAULT_WEB_CONTEXT_COMPRESSION_SYSTEM_PROMPT = `Ты сжимаешь и переводишь веб-контекст в один связный блок на русском для последующей генерации поста.

Требования:
- Верни только валидный JSON.
- Переведи на русский язык.
- Оставь только то, что относится к выбранной теме.
- Сохрани конкретику: цифры, даты, имена, номера статей, ссылки на нормы, цитаты официальных лиц.
- Убери общие фразы, рекламные обороты, повторы.
- Один цельный блок текста, без заголовков и списков.
- Не выдумывай и не додумывай фактов.

Output:
{
  "compressed_web_context_ru": "<один блок на русском>",
  "preserved_details_count": <integer>
}`

/**
 * Универсальный writer-промпт. Заточен под Telegram-стиль современных
 * корпоративных каналов: эмодзи-маркеры в начале блоков, **жирный** для
 * подзаголовков и сильных слов, > blockquote для прямой речи и выводов,
 * маркированные списки с дефисами. Markdown — тот, что Telegram реально
 * понимает (жирный/курсив/ссылки/цитаты/inline-код).
 *
 * Шаблон используется как основа для каждой рубрики; рубрика может его
 * переопределить — тогда применяется её собственный post_writer_system_prompt.
 */
export const UNIVERSAL_POST_WRITER_PROMPT = `## Роль
Ты контент-редактор русскоязычного Telegram-канала. Пишешь на русском.

## Задача
Переработай предоставленный контекст в один готовый пост в формате {{POST_FORMAT}}. Аудитория: {{AUDIENCE}}. Тема, угол подачи и ключевые факты заданы — отступать от них нельзя.

## Голос и тональность
- Стиль: компетентный практик. Прямо, честно, по делу. Без канцелярита и маркетинговой шелухи.
- Соотношение: не менее 80% — нейтрально-экспертный регистр, не более 20% — личное мнение, 0% — сленг.
- Факты не выдумывай. Каждое утверждение — с конкретикой: цифры, даты, номера статей, цитаты официальных лиц.

## Синтаксис
- Рваный стиль: одна мысль — одно предложение.
- Длина: 25-35% коротких (5-10 слов), 40-50% средних (11-20), 20-25% длинных (21-35).
- Активный залог ≥50% текста: "налоговая доначислила", не "было доначислено".
- 5-10% сомнений: "кажется", "возможно". Раз в ~300 слов — противоречие: "однако", "с другой стороны".

## Оформление под Telegram
Telegram поддерживает: **жирный**, _курсив_, ~~зачёркнутый~~, [текст](url), \`код\`, > цитаты, маркированные списки. Заголовки h1/h2/h3 Telegram игнорирует — НЕ используй их.

Структура поста (примерно):
1. **Заголовок-крючок** в первой строке. Можно с эмодзи-маркером (1 эмодзи слева: 💼 ⚖️ ❗ 💸 📌 📊 🗣 — выбирай по смыслу). Заголовок — это просто жирная фраза, а не Markdown-heading.
2. Подводка 1-2 предложения: что случилось / в чём суть.
3. Если есть подразделы — каждый начинается с эмодзи-маркера + жирной подзаголовочной фразы. Например: "❓ Что произошло", "⚖️ Решения судов", "📊 Цифры", "👉 Что это значит".
4. Внутри блока — обычный текст или маркированный список (через дефис). В списке выделяй ключевые слова **жирным**.
5. Прямая речь / комментарий эксперта — оформи как **цитату** через ">". Можно с эмодзи 💬 в начале блока ПЕРЕД ">".
6. Выделяй **жирным** 2-4 ключевых утверждения по всему посту — это якоря для скролл-чтения.
7. В конце — короткий призыв или вывод (1 эмодзи + 1 фраза). Один CTA, без давления.

## Эмодзи
- Используй умеренно: 1 эмодзи на блок-маркер, не россыпью.
- Только структурные/смысловые: ❗ ⚠️ ⚖️ 💼 💸 💰 📌 📊 📍 ❓ ✅ ✔️ 💬 🗣 👀 👉 ➡️ 🥲 🧑‍⚖️.
- НЕ используй декоративные (🚀 🔥 ✨ 🎉 💪).
- Не вставляй эмодзи внутрь предложения — только в начале строки/блока.

## Запреты по словарю
Никогда не используй: "в современном мире", "погрузимся", "игра, меняющая правила", "революционный", "прорывной", "инновационный", "уникальный" (без доказательства фактом), "бесшовный", "оптимизация", "трансформация", "синергия", "экосистема", "ландшафт", "в заключение", "важно отметить", "безусловно", "в целом".
Не используй метафоры, сравнения, эпитеты.
Не используй конструкцию "это не про X, а про Y".
Убирай вводные паразиты: "важно понимать", "стоит отметить", "как известно".

## Пунктуация
- Длинное тире НЕ используем — только короткое тире (дефис "-") с пробелами по сторонам.
- Кавычки — «ёлочки» для прямой речи внутри предложения; "прямые двойные" для названий и кодовых терминов.

## Формат вывода под площадку
{{FORMAT_RULES}}

## Output
Верни только JSON: {"post": "готовый текст поста с Telegram-форматированием"}`

/**
 * Правила длины/структуры для каждого формата. Подставляются в writer-промпт
 * через плейсхолдер {{FORMAT_RULES}}.
 */
export const POST_FORMAT_RULES: Record<
  ContentRubricSettings["postFormat"],
  string
> = {
  telegram: `Площадка: Telegram-пост.
- Длина: ~1200-1800 знаков для новостных постов; до 3500 для разборов кейсов / судебной практики.
- 3-6 смысловых блоков. Между блоками — пустая строка.
- Каждый блок начинается с эмодзи-маркера + **жирного подзаголовка**, либо с **жирного предложения-крючка** (для первого блока).
- Маркированные списки — короткие (3-6 пунктов), каждый пункт начинается с дефиса. Внутри пункта ключевые термины — **жирным**.
- Прямую речь / выводы оформляй как blockquote: строка начинается с ">" и пробела, тело цитаты — до конца абзаца.
- Минимум 2 ссылки на источники (если в контексте есть URL): встрой как [текст](url) в нужное место.
- В конце — 1 строка с CTA или выводом. Пример: "👉 Что это значит для бизнеса: проверь договоры с подрядчиками до 1 января."`,
  twitter: `Площадка: тред для X / Twitter.
- 6-8 твитов, каждый — отдельный абзац через двойной перенос строки.
- Первый твит цепляет сразу: ключевой факт или вопрос.
- Структура: тезис -> доказательства -> мягкий призыв.
- В пределах 280 символов на твит.`,
  instagram: `Площадка: подпись для Instagram.
- Не более 100 слов.
- Ровно 3 хештега в самом конце, в отдельной строке.
- Сильное первое предложение, дальше — суть, в финале — призыв.`,
  email: `Площадка: email-тизер.
- 60-90 слов.
- Цель — довести до оригинала или лендинга.
- Заканчивается одной короткой ссылкой-призывом.`,
}

interface DefaultRubric {
  slug: string
  title: string
  description: string
  /** Тег-проект, к которому относится рубрика — используется для группировки в селекторе. */
  collection?: string | null
  /** Может переопределить отдельные поля настроек поверх DEFAULT_RUBRIC_SETTINGS. */
  settingsOverride?: Partial<ContentRubricSettings>
  prompts: ContentRubricPrompts
}

/**
 * Рубрики «из коробки». Покрывают типовые сценарии нашего SMM-щика:
 * налоговые новости, разбор судебной/налоговой практики, дайджест недели,
 * кейс из своей практики, а также универсальный SMM-пост для любой темы.
 *
 * Старые юр-рубрики (`base_real_work`, `prompt_of_week`, `industry_news_trends`)
 * оставлены в seed для обратной совместимости с теми, кто их уже использует.
 * Если они уже созданы в БД — не перезаписываются.
 */
export const DEFAULT_RUBRICS: DefaultRubric[] = [
  // ── SMM-рубрики ЦФУ Групп ─────────────────────────────────────────────
  {
    slug: "tax_news",
    title: "Налоговые новости",
    description:
      "Свежие изменения налогового законодательства и инициативы ФНС/Минфина — коротко и по делу.",
    collection: "ЦФУ Групп · Налоги",
    settingsOverride: {
      researchWindowDays: 7,
      searchRecencyFilter: "week",
      audience: "предприниматели, бухгалтеры и налоговые консультанты",
      targetLength: 900,
      searchDomainFilter: [
        "nalog.gov.ru",
        "minfin.gov.ru",
        "consultant.ru",
        "garant.ru",
        "rbc.ru",
        "kommersant.ru",
        "vedomosti.ru",
        "klerk.ru",
        "interfax.ru",
        "tass.ru",
      ],
    },
    prompts: {
      perplexitySearchPrompt: `Найди ключевые изменения российского налогового законодательства и инициативы ФНС/Минфина за период с {start_date} по {end_date}.

Аудитория: предприниматели, бухгалтеры, налоговые консультанты.

Фокус:
1) Конкретные поправки в Налоговый кодекс, постановления, письма ФНС, разъяснения Минфина.
2) Заявления первых лиц (глава ФНС, министр финансов) с практическими последствиями.
3) Изменения порогов УСН/НДС/НДФЛ, страховых взносов, ставок, льгот.
4) Новые контрольные мероприятия, риск-ориентированные подходы, цифровые сервисы ФНС.

Для каждой новости дай: точное название документа (номер, дата), суть изменения, дату вступления в силу, практические последствия для бизнеса, ссылку на источник.

Источники: nalog.gov.ru, minfin.gov.ru, consultant.ru, garant.ru, RBC, Коммерсант, Ведомости, Клерк, Интерфакс, ТАСС. Игнорируй Reddit, форумы, спекулятивные статьи без конкретики.

Отвечай на русском.`,
      redditSearchPrompt: "",
      postWriterSystemPrompt: "",
    },
  },
  {
    slug: "tax_case",
    title: "Судебная и налоговая практика",
    description:
      "Разбор прецедентного дела или решения суда: что произошло, чем закончилось, что это значит для бизнеса.",
    collection: "ЦФУ Групп · Налоги",
    settingsOverride: {
      researchWindowDays: 14,
      searchRecencyFilter: "month",
      audience: "предприниматели и бухгалтеры, работающие с налоговыми рисками",
      targetLength: 2400,
      searchDomainFilter: [
        "kad.arbitr.ru",
        "supcourt.ru",
        "vsrf.ru",
        "consultant.ru",
        "garant.ru",
        "pravo.ru",
        "klerk.ru",
        "rbc.ru",
        "vedomosti.ru",
      ],
    },
    prompts: {
      perplexitySearchPrompt: `Найди резонансные дела по налоговым спорам и судебной практике в РФ за период с {start_date} по {end_date}, разобранные в открытых источниках.

Аудитория: предприниматели и бухгалтеры, которым важно понимать, как сейчас рассуждают суды и ФНС.

Фокус:
1) Решения Верховного Суда, Арбитражных судов кассационной инстанции с конкретными выводами.
2) Дела, меняющие подход: налоговая реконструкция, дробление, статья 54.1 НК, переквалификация сделок.
3) Конкретика: номер дела, стороны, суть спора, позиции инстанций, итоговое решение, доначисления.
4) Прецеденты, на которые потом будут ссылаться при доначислениях.

Не выдумывай факты — только то, что есть в источниках. Источники: kad.arbitr.ru, supcourt.ru, consultant.ru, garant.ru, pravo.ru, Klerk, RBC.

Отвечай на русском.`,
      redditSearchPrompt: "",
      postWriterSystemPrompt: "",
    },
  },
  {
    slug: "tax_digest",
    title: "Дайджест недели",
    description:
      "Подборка 5-7 главных новостей за неделю — одной строкой каждая, ссылки на источники.",
    collection: "ЦФУ Групп · Налоги",
    settingsOverride: {
      researchWindowDays: 7,
      searchRecencyFilter: "week",
      audience: "предприниматели и бухгалтеры",
      targetLength: 1500,
      postFormat: "telegram",
      searchDomainFilter: [
        "nalog.gov.ru",
        "minfin.gov.ru",
        "consultant.ru",
        "garant.ru",
        "rbc.ru",
        "kommersant.ru",
        "vedomosti.ru",
        "klerk.ru",
        "interfax.ru",
        "tass.ru",
      ],
    },
    prompts: {
      perplexitySearchPrompt: `Собери 6-10 самых значимых событий за период с {start_date} по {end_date} из мира российского налогового законодательства, контроля и судебной практики.

Аудитория: предприниматели и бухгалтеры.

Каждое событие — короткий блок с:
- сутью события в одном предложении;
- датой;
- источником (название издания + ссылка).

Не группируй и не интерпретируй — только факты. Источники: nalog.gov.ru, minfin.gov.ru, consultant.ru, garant.ru, RBC, Коммерсант, Ведомости, Клерк.

Отвечай на русском.`,
      redditSearchPrompt: "",
      postWriterSystemPrompt: `## Роль
Ты редактор еженедельного дайджеста для канала о налогах и бизнесе.

## Формат
- Заголовок-крючок одной строкой (без эмодзи).
- Подводка: одно-два предложения о том, что в дайджесте.
- 5-7 пунктов через маркированный список (тире "-"). Каждый пункт - законченное предложение, начинается с сильного глагола или существительного.
- В конце короткий призыв: "Подробности по ссылкам" или "Сохраните, чтобы не упустить".

## Запреты
- Никаких эмодзи и значков.
- Никаких "ёлочек", только прямые двойные кавычки.
- Никаких длинных тире — только дефис.
- Никаких клише: "в современном мире", "важно отметить", "погрузимся", "прорыв" и т.п.
- Не выдумывай — берёшь только из контекста.

## Output
Верни только JSON: {"post": "готовый текст поста"}`,
    },
  },
  {
    slug: "client_case",
    title: "Кейс из практики",
    description:
      "Разбор клиентского кейса: проблема, как решили, какой результат. Без имён — обезличенно.",
    collection: "ЦФУ Групп · Налоги",
    settingsOverride: {
      researchWindowDays: 30,
      searchRecencyFilter: "month",
      audience: "предприниматели, которые сталкиваются с налоговыми рисками",
      targetLength: 1800,
      // Кейс часто пишется без внешнего ресёрча — но если включён, ищем
      // аналогичные публичные кейсы для проверки фактуры.
      searchDomainFilter: [
        "kad.arbitr.ru",
        "consultant.ru",
        "garant.ru",
        "pravo.ru",
        "klerk.ru",
      ],
    },
    prompts: {
      perplexitySearchPrompt: `Найди публичные кейсы и судебные дела за период с {start_date} по {end_date}, иллюстрирующие типовые налоговые ошибки бизнеса (дробление, фиктивные контрагенты, выход на упрощёнку, ВНП с крупными доначислениями).

Аудитория: предприниматели, которые читают это, чтобы не повторить.

Для каждого кейса дай: суть проблемы, как развивались события, итог, источник.

Отвечай на русском.`,
      redditSearchPrompt: "",
      postWriterSystemPrompt: "",
    },
  },
  // ── Дополнительные SMM-рубрики ЦФУ (узкие форматы) ──────────────────────
  {
    slug: "official_voice",
    title: "Заявления власти",
    description:
      "Цитата президента, главы ФНС, министра финансов или Минэка с практической интерпретацией для бизнеса.",
    collection: "ЦФУ Групп · Налоги",
    settingsOverride: {
      researchWindowDays: 10,
      audience: "предприниматели и бухгалтеры — следят за сигналами власти",
      targetLength: 1400,
      searchDomainFilter: [
        "kremlin.ru",
        "nalog.gov.ru",
        "minfin.gov.ru",
        "council.gov.ru",
        "rbc.ru",
        "vedomosti.ru",
        "kommersant.ru",
        "tass.ru",
        "interfax.ru",
        "ria.ru",
      ],
    },
    prompts: {
      perplexitySearchPrompt: `Найди публичные заявления, выступления и интервью высших должностных лиц РФ за период с {start_date} по {end_date} по темам налогов, фискальной политики и бизнес-климата. Аудитория — предприниматели и бухгалтеры.

Источники (приоритет): kremlin.ru, council.gov.ru, nalog.gov.ru, minfin.gov.ru, ТАСС, Интерфакс, РБК, Ведомости, Коммерсант.

Кого ищем: Президент, Премьер, министр финансов, глава ФНС, глава Минэка, спикеры обеих палат, профильные комитеты.

Для каждого заявления дай:
- кто сказал, когда, на какой площадке (Совфед, форум, интервью);
- точную короткую цитату (1-2 предложения, в кавычках "..." );
- контекст: к чему относится, какое решение или сигнал стоит за словами;
- практическое значение для бизнеса.

Игнорируй общие политические заявления без связи с налогами или бизнес-средой.`,
      redditSearchPrompt: "",
      postWriterSystemPrompt: `## Роль
Ты редактор Telegram-канала о налогах. Пишешь пост о публичном заявлении власти.

## Структура поста
1. Эмодзи-маркер 🗣️ + сильная фраза-крючок в одну строку — кто и о чём сказал.
2. Подводка 1 предложение: когда, где, к чему относится.
3. blockquote (через >): прямая цитата в "ёлочках", в самих ёлочках — точные слова. После цитаты — атрибуция через тире (— Антон Силуанов, министр финансов).
4. Раздел "📊 Что это значит" или "👉 Что это значит для бизнеса": 2-3 коротких абзаца, как это касается аудитории. Можно компактный список из 2-4 пунктов с дефисами.
5. Финал — 1 предложение о том, стоит ли действовать сейчас или ждать.

## Стиль
- Без хайпа и оценочных эпитетов.
- Не выдумывай ни одного слова цитаты. Если в контексте есть только пересказ — оформи как пересказ ("По словам N…"), не как прямую речь.
- Никаких "погрузимся", "революционный".

## Output
JSON: {"post": "..."}`,
    },
  },
  {
    slug: "checklist_cards",
    title: "Чек-лист в карточках",
    description:
      "Серия из 5-7 коротких пунктов: ошибки, проверки, шаги. Удобно листать пальцем в Telegram.",
    collection: "ЦФУ Групп · Налоги",
    settingsOverride: {
      researchWindowDays: 21,
      audience: "предприниматели и бухгалтеры, которые хотят список к делу",
      targetLength: 1300,
    },
    prompts: {
      perplexitySearchPrompt: `Найди материалы за период с {start_date} по {end_date}, по которым можно собрать чёткий чек-лист или серию пунктов для бизнеса: типовые ошибки при налоговых проверках, шаги при ВНП, признаки дробления, что подготовить к декларации УСН, какие договоры пересмотреть и т.п.

Аудитория — предприниматели и бухгалтеры. Источники: nalog.gov.ru, consultant.ru, garant.ru, klerk.ru, pravo.ru, RBC.

Для итогового списка нужны 5-7 коротких пунктов. Каждый пункт — одна короткая проверяемая мысль, со ссылкой на норму или решение, если оно есть в источнике.`,
      redditSearchPrompt: "",
      postWriterSystemPrompt: `## Роль
Ты редактор Telegram-канала о налогах. Пишешь пост-чек-лист.

## Структура поста
1. Эмодзи-маркер 📌 + жирный заголовок-крючок: о чём чек-лист.
2. 1 предложение подводки: кому и зачем.
3. Маркированный список из 5-7 пунктов через дефис. Каждый пункт начинается с **жирной короткой шапки** (1-3 слова), затем — одна объясняющая фраза. Если есть отсылка к статье/норме — в формате "(п. 3 ст. 54.1 НК РФ)".
4. Финал — 1 предложение о действии: сохранить пост, проверить договоры, обратиться к консультанту.

## Стиль
- Никакой воды, никаких эмодзи внутри пунктов (только структурный маркер в первой строке).
- Каждый пункт — самодостаточен, читается отдельно.
- Запреты как в общем гайде: длинное тире, ёлочки кроме цитат, штампы.

## Output
JSON: {"post": "..."}`,
    },
  },

  // ── Legacy юр-рубрики (для обратной совместимости с проектом-первоисточником) ─
  {
    slug: "base_real_work",
    title: "Использование ИИ в реальной работе",
    description:
      "Инструменты, юзер-кейсы и практики для юристов, бухгалтеров, аудиторов и предпринимателей.",
    collection: "Legal AI · Pocket Consultant",
    settingsOverride: {
      audience: "юристы, бухгалтеры, аудиторы и предприниматели",
      targetLength: 2200,
      searchLanguage: "mixed",
      pipelineMode: "full",
    },
    prompts: {
      perplexitySearchPrompt: `Find the most relevant materials from {start_date} to {end_date} for the rubric 'Using AI in real work'.

Audience: lawyers, legal professionals, accountants, auditors, entrepreneurs, and small business owners.

Primary focus:
1) Concrete tools they used (product names, stack, integrations, plugins).
2) Real user cases and workflow practices (task -> approach -> outcome).
3) Practical constraints, risks, human review boundaries, and lessons learned.

Include case studies, implementation notes, and high-signal examples. Exclude generic AI trend chatter that lacks practical execution details.

Use only web, news, and professional sources. Do not use Reddit, forum mirrors, or summaries of Reddit discussions.

You may write the output in English. Include both Russian-language and English-language sources when they are relevant. Prefer grounded, high-signal material over hype, marketing, or generic trend reporting.`,
      redditSearchPrompt: "",
      postWriterSystemPrompt: "",
    },
  },
  {
    slug: "prompt_of_week",
    title: "Промпт недели",
    description: "Готовые микро-решения для немедленного применения.",
    collection: "Legal AI · Pocket Consultant",
    settingsOverride: {
      audience: "юристы, бухгалтеры и предприниматели — практики",
      targetLength: 1400,
      searchLanguage: "mixed",
      pipelineMode: "full",
    },
    prompts: {
      perplexitySearchPrompt: `Find the most relevant materials from {start_date} to {end_date} for the rubric 'Prompt of the Week'.

Audience: lawyers, legal professionals, accountants, auditors, entrepreneurs.

Find concrete, ready-to-use AI prompt templates that professionals shared, published, or highlighted as particularly effective during this period.

For each prompt include exact prompt text or structure, the task it addresses, the expected output, and observed limitations.

You may write in English.`,
      redditSearchPrompt: "",
      postWriterSystemPrompt: "",
    },
  },
  {
    slug: "industry_news_trends",
    title: "Новости индустрии и апдейты под лупой",
    description:
      "Рубрика про важные новости индустрии и апдейты крупных игроков (OpenAI, Google, Claude и т.д.) на языке практиков.",
    collection: "Legal AI · Pocket Consultant",
    settingsOverride: {
      audience: "русскоязычные практики, использующие ИИ-инструменты ежедневно",
      targetLength: 2200,
      searchLanguage: "mixed",
      pipelineMode: "full",
    },
    prompts: {
      perplexitySearchPrompt: `Find the most important AI industry news and product updates from {start_date} to {end_date} for the rubric 'AI Industry News and Updates'.

Audience: Russian-speaking business professionals — lawyers, accountants, auditors, and entrepreneurs.

Focus areas: new model releases and capability upgrades, product and feature launches, pricing/API changes, regulatory developments, enterprise integration news.

For each significant development include exact name, concrete details (numbers, dates, pricing), practical implication for the audience, and source/date.

You may write in English.`,
      redditSearchPrompt: "",
      postWriterSystemPrompt: "",
    },
  },
]

export const CONTENT_SETTING_KEYS = {
  topicSelectionSystem: "topic_selection_system",
  webContextCompressionSystem: "web_context_compression_system",
  universalPostWriterSystem: "universal_post_writer_system",
} as const

/**
 * Если у рубрики `post_writer_system_prompt` пуст — используется
 * `UNIVERSAL_POST_WRITER_PROMPT` с подстановками. Это позволяет SMM-щику
 * не писать огромный системный промпт под каждую рубрику.
 */
export function renderUniversalWriterPrompt(args: {
  template?: string
  audience: string
  postFormat: ContentRubricSettings["postFormat"]
}): string {
  const formatRules = POST_FORMAT_RULES[args.postFormat] || POST_FORMAT_RULES.telegram
  const tpl = (args.template || UNIVERSAL_POST_WRITER_PROMPT)
    .replaceAll("{{AUDIENCE}}", args.audience || "массовая аудитория")
    .replaceAll("{{POST_FORMAT}}", args.postFormat)
    .replaceAll("{{FORMAT_RULES}}", formatRules)
  return tpl
}
