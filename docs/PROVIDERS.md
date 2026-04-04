# MediaGenerator — Провайдеры и модели

> Актуально на: апрель 2026

---

## 1. OpenAI

**Endpoint:** `POST https://api.openai.com/v1/images/generations`

### Модели

| Модель | ID | Цена (1024x1024, medium) |
|--------|----|--------------------------|
| GPT Image 1.5 | `gpt-image-1.5` | $0.034 |
| GPT Image 1 | `gpt-image-1` | $0.042 |
| GPT Image 1 Mini | `gpt-image-1-mini` | $0.011 |

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
| Grok Imagine Pro | `grok-imagine-image-pro` | $0.07/изобр. |

### Параметры

| Параметр | Значения |
|----------|----------|
| `aspect_ratio` | 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 2:1, 1:2 |
| `resolution` | 1k, 2k |
| `n` | 1-10 |
| `response_format` | b64_json, url |

---

## 3. OpenRouter (агрегатор)

**Endpoint:** `POST https://openrouter.ai/api/v1/chat/completions`

Использует chat completions формат с `modalities: ["image"]`.

### Модели

| Модель | ID | Цена ~  |
|--------|----|---------|
| Gemini 3.1 Flash Image | `google/gemini-3.1-flash-image-preview` | $0.04 |
| Gemini 3 Pro Image | `google/gemini-3-pro-image-preview` | $0.08 |
| Gemini 2.5 Flash Image | `google/gemini-2.5-flash-image` | $0.039 |
| GPT-5 Image | `openai/gpt-5-image` | $0.10 |
| GPT-5 Image Mini | `openai/gpt-5-image-mini` | $0.04 |
| FLUX.2 Pro | `black-forest-labs/flux.2-pro` | $0.03 |
| FLUX.2 Max | `black-forest-labs/flux.2-max` | $0.06 |
| FLUX.2 Flex | `black-forest-labs/flux.2-flex` | $0.02 |
| Seedream 4.5 | `bytedance-seed/seedream-4.5` | $0.04 |

### Параметры

| Параметр | Значения |
|----------|----------|
| `aspect_ratio` | 1:1, 2:3, 3:2, 3:4, 4:3, 9:16, 16:9 |
| `image_size` | 0.5K, 1K, 2K, 4K |

### Автообнаружение моделей

```
GET https://openrouter.ai/api/v1/models?output_modalities=image
```

Cron-сервис автоматически проверяет новые модели раз в сутки.

---

## Сравнение цен (1024x1024, стандарт)

| Модель | Цена |
|--------|------|
| OpenAI gpt-image-1-mini (low) | $0.005 |
| OpenAI gpt-image-1-mini (medium) | $0.011 |
| xAI Grok Imagine | $0.020 |
| FLUX.2 Flex | $0.020 |
| FLUX.2 Pro | $0.030 |
| OpenAI gpt-image-1.5 (medium) | $0.034 |
| Gemini 2.5 Flash | $0.039 |
| Seedream 4.5 | $0.040 |
| xAI Grok Imagine Pro | $0.070 |
| Gemini 3 Pro | $0.080 |
| GPT-5 Image (OpenRouter) | $0.100 |
| OpenAI gpt-image-1.5 (high) | $0.133 |

---

## Безопасность API ключей

- Ключи шифруются AES-256-GCM перед сохранением в БД
- Клиент видит только hint (последние 4 символа)
- Расшифровка происходит только на сервере при генерации
- При регистрации новый юзер получает копии ключей админа (зашифрованные)
- Fallback: если у юзера нет ключа — используется ключ админа
