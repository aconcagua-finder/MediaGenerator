# MediaGenerator - Провайдеры и модели

> Актуально на: апрель 2026

---

## Обзор провайдеров

| Провайдер | Тип | API ключ | Модели на старте |
|-----------|-----|----------|-----------------|
| OpenAI | Прямой | `OPENAI_API_KEY` | gpt-image-1.5, gpt-image-1, gpt-image-1-mini |
| xAI | Прямой | `XAI_API_KEY` | grok-imagine-image, grok-imagine-image-pro |
| OpenRouter | Агрегатор | `OPENROUTER_API_KEY` | Google Gemini, FLUX 2, Seedream и др. |

---

## 1. OpenAI

### Endpoint
```
POST https://api.openai.com/v1/images/generations
Authorization: Bearer $OPENAI_API_KEY
```

### Модели

| ID модели | Тип | Описание |
|-----------|-----|----------|
| `gpt-image-1.5` | Флагман | Лучшее качество, лучшее следование промпту |
| `gpt-image-1` | Предыдущее поколение | Хорошее качество, чуть дешевле |
| `gpt-image-1-mini` | Бюджетная | Самая дешёвая от OpenAI |

> `dall-e-3` и `dall-e-2` deprecated, поддержка до 12.05.2026

### Параметры

| Параметр | Значения | По умолчанию | Описание (для UI) |
|----------|----------|-------------|-------------------|
| `size` | `1024x1024`, `1536x1024`, `1024x1536`, `1792x1024`, `1024x1792` | `1024x1024` | Размер изображения. Квадрат, горизонтальный или вертикальный |
| `quality` | `low`, `medium`, `high` | `medium` | Качество. Влияет на детализацию и стоимость |
| `output_format` | `png`, `jpeg`, `webp` | `png` | Формат файла. PNG для прозрачности, JPEG для компактности |
| `background` | `opaque`, `transparent` | `opaque` | Фон. Прозрачный работает только с PNG/WebP |
| `n` | 1+ | 1 | Количество изображений за один запрос |
| `moderation` | `auto`, `low` | `auto` | Строгость фильтрации контента |

### Цены (за изображение)

**gpt-image-1.5:**
| Качество | 1024x1024 | 1536x1024 / 1024x1536 | 1792x1024 / 1024x1792 |
|----------|-----------|----------------------|----------------------|
| low | $0.009 | $0.013 | $0.013 |
| medium | $0.034 | $0.050 | $0.050 |
| high | $0.133 | $0.200 | $0.200 |

**gpt-image-1:**
| Качество | 1024x1024 | 1536x1024 / 1024x1536 |
|----------|-----------|----------------------|
| low | $0.011 | $0.016 |
| medium | $0.042 | $0.063 |
| high | $0.167 | $0.250 |

**gpt-image-1-mini:**
| Качество | 1024x1024 | 1536x1024 / 1024x1536 |
|----------|-----------|----------------------|
| low | $0.005 | $0.006 |
| medium | $0.011 | $0.015 |
| high | $0.036 | $0.052 |

### Формат ответа
```json
{
  "data": [
    {
      "b64_json": "...",
      "revised_prompt": "..."
    }
  ]
}
```

---

## 2. xAI (Grok)

### Endpoint
```
POST https://api.x.ai/v1/images/generations
Authorization: Bearer $XAI_API_KEY
```

### Модели

| ID модели | Цена/изображение | Rate limit | Описание |
|-----------|-----------------|------------|----------|
| `grok-imagine-image` | $0.02 | 300 RPM | Стандартное качество |
| `grok-imagine-image-pro` | $0.07 | 30 RPM | Высокое качество |

### Параметры

| Параметр | Значения | По умолчанию | Описание (для UI) |
|----------|----------|-------------|-------------------|
| `aspect_ratio` | `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3`, `2:1`, `1:2`, `auto` | `auto` | Соотношение сторон |
| `resolution` | `1k`, `2k` | `1k` | Разрешение. 2k — выше качество, но дольше |
| `n` | 1-10 | 1 | Количество изображений (макс. 10) |
| `response_format` | `url`, `b64_json` | `url` | Формат получения (всегда используем b64_json) |

### Формат ответа
```json
{
  "data": [
    {
      "url": "https://...",
      "b64_json": "..."
    }
  ]
}
```

### Особенности
- Совместим с OpenAI SDK (тот же формат запросов)
- Поддерживает редактирование (до 5 исходных изображений)
- Стиль-трансфер (реализм, аниме и т.д.)

---

## 3. OpenRouter (агрегатор)

### Endpoint
```
POST https://openrouter.ai/api/v1/chat/completions
Authorization: Bearer $OPENROUTER_API_KEY
```

### Как генерировать изображения
В отличие от OpenAI/xAI, OpenRouter использует chat completions формат с `modalities`:

```json
{
  "model": "google/gemini-2.5-flash-image",
  "messages": [{"role": "user", "content": "промпт"}],
  "modalities": ["image"],
  "image_config": {
    "aspect_ratio": "1:1",
    "image_size": "1K"
  }
}
```

### Модели (основные для генерации изображений)

| ID модели | Цена/изображение | Описание |
|-----------|-----------------|----------|
| `google/gemini-2.5-flash-image` | ~$0.039 | Google Nano Banana, стабильная |
| `google/gemini-3.1-flash-image-preview` | ~$0.067 | Nano Banana 2, preview |
| `google/gemini-3-pro-image-preview` | ~$0.134 | Nano Banana Pro, высокое качество |
| `openai/gpt-5-image` | varies | GPT-5 + генерация |
| `black-forest-labs/flux.2-pro` | ~$0.03 | FLUX 2 Pro |
| `bytedance/seedream-4.5` | $0.04 | ByteDance Seedream |

> Полный список: `GET /api/v1/models?output_modalities=image`

### Параметры (image_config)

| Параметр | Значения | По умолчанию | Описание (для UI) |
|----------|----------|-------------|-------------------|
| `aspect_ratio` | `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9` | `1:1` | Соотношение сторон |
| `image_size` | `0.5K`, `1K`, `2K`, `4K` | `1K` | Размер изображения. Больше = дороже |

### Формат ответа
```json
{
  "choices": [{
    "message": {
      "content": [
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/png;base64,..."
          }
        }
      ]
    }
  }]
}
```

### Обнаружение новых моделей
```
GET https://openrouter.ai/api/v1/models?output_modalities=image
```
Возвращает все доступные модели с `output_modalities: ["image"]`.
Используется для автоматической проверки обновлений.

---

## Сравнение цен (1024x1024, стандартное качество)

| Модель | Цена | Примечание |
|--------|------|-----------|
| OpenAI gpt-image-1-mini (low) | **$0.005** | Самая дешёвая |
| OpenAI gpt-image-1.5 (low) | $0.009 | Флагман, минимум |
| xAI grok-imagine-image | $0.020 | Фиксированная цена |
| OpenRouter FLUX 2 Pro | ~$0.030 | Open-source |
| OpenAI gpt-image-1.5 (medium) | $0.034 | Оптимальный баланс |
| OpenRouter Gemini 2.5 Flash | ~$0.039 | Google через OpenRouter |
| OpenRouter Seedream 4.5 | $0.040 | ByteDance |
| xAI grok-imagine-image-pro | $0.070 | Высокое качество |
| OpenRouter Gemini 3 Pro | ~$0.134 | Максимальное качество Google |
| OpenAI gpt-image-1.5 (high) | $0.133 | Максимальное качество OpenAI |

---

## Унифицированный интерфейс адаптера

Каждый провайдер реализует общий интерфейс:

```typescript
interface ImageProvider {
  // Идентификатор провайдера
  id: string; // 'openai' | 'xai' | 'openrouter'

  // Генерация изображений
  generate(request: GenerateRequest): Promise<GenerateResult>;

  // Список доступных моделей (для проверки обновлений)
  listModels(): Promise<ModelInfo[]>;

  // Проверка валидности API ключа
  validateKey(key: string): Promise<boolean>;
}

interface GenerateRequest {
  model: string;
  prompt: string;
  params: Record<string, unknown>; // Специфичные для модели
  count: number;
}

interface GenerateResult {
  images: {
    data: Buffer;       // Бинарные данные изображения
    format: string;     // png, jpeg, webp
    width: number;
    height: number;
  }[];
  cost: number;         // Расчётная стоимость
  raw_response?: unknown; // Оригинальный ответ API
}
```
