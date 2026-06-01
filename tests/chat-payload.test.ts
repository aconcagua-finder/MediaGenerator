import { describe, it, expect } from "vitest"
import { buildOpenRouterMessages } from "@/lib/chat-payload"

describe("buildOpenRouterMessages", () => {
  it("без вложений отправляет обычные string-сообщения", () => {
    const result = buildOpenRouterMessages({
      systemPrompt: "you are a helpful assistant",
      history: [
        { role: "user", content: "привет" },
        { role: "assistant", content: "здравствуйте!" },
      ],
      attachmentDataUrls: new Map(),
      modelSupportsVision: false,
    })

    expect(result).toEqual([
      { role: "system", content: "you are a helpful assistant" },
      { role: "user", content: "привет" },
      { role: "assistant", content: "здравствуйте!" },
    ])
  })

  it("пропускает system, если он пустой", () => {
    const result = buildOpenRouterMessages({
      systemPrompt: "   ",
      history: [{ role: "user", content: "hi" }],
      attachmentDataUrls: new Map(),
      modelSupportsVision: false,
    })
    expect(result).toEqual([{ role: "user", content: "hi" }])
  })

  it("для vision-модели вкладывает image_url в content user-сообщения", () => {
    const dataUrl = "data:image/png;base64,iVBORw0KG..."
    const result = buildOpenRouterMessages({
      systemPrompt: null,
      history: [
        {
          role: "user",
          content: "что на картинке?",
          attachments: [{ uploadId: "u-1", mimeType: "image/png" }],
        },
      ],
      attachmentDataUrls: new Map([["u-1", dataUrl]]),
      modelSupportsVision: true,
    })

    expect(result).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "что на картинке?" },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ])
  })

  it("игнорирует вложения, если модель НЕ vision (даже если они есть в истории)", () => {
    const result = buildOpenRouterMessages({
      systemPrompt: null,
      history: [
        {
          role: "user",
          content: "тут была картинка",
          attachments: [{ uploadId: "u-1", mimeType: "image/png" }],
        },
      ],
      attachmentDataUrls: new Map([["u-1", "data:image/png;base64,xxx"]]),
      modelSupportsVision: false,
    })

    expect(result).toEqual([
      { role: "user", content: "тут была картинка" },
    ])
  })

  it("вкладывает несколько картинок в правильном порядке", () => {
    const result = buildOpenRouterMessages({
      systemPrompt: null,
      history: [
        {
          role: "user",
          content: "сравни эти два кадра",
          attachments: [
            { uploadId: "a", mimeType: "image/png" },
            { uploadId: "b", mimeType: "image/jpeg" },
          ],
        },
      ],
      attachmentDataUrls: new Map([
        ["a", "data:image/png;base64,AAA"],
        ["b", "data:image/jpeg;base64,BBB"],
      ]),
      modelSupportsVision: true,
    })

    expect(result).toHaveLength(1)
    const content = result[0].content as Array<Record<string, unknown>>
    expect(content[0]).toEqual({ type: "text", text: "сравни эти два кадра" })
    expect(content[1]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/png;base64,AAA" },
    })
    expect(content[2]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/jpeg;base64,BBB" },
    })
  })

  it("если data-url не нашлось — НЕ ломает payload, оставляет текст", () => {
    const result = buildOpenRouterMessages({
      systemPrompt: null,
      history: [
        {
          role: "user",
          content: "куда-то делись картинки",
          attachments: [{ uploadId: "missing", mimeType: "image/png" }],
        },
      ],
      attachmentDataUrls: new Map(), // пусто!
      modelSupportsVision: true,
    })

    // Сообщение остаётся, но без image_url-частей
    expect(result).toHaveLength(1)
    const content = result[0].content as Array<Record<string, unknown>>
    // Только текстовая часть (картинку выкинули, потому что url нет)
    expect(content).toEqual([{ type: "text", text: "куда-то делись картинки" }])
  })

  it("если у user пустой текст и нет валидных url — отправляет content как пустую строку", () => {
    const result = buildOpenRouterMessages({
      systemPrompt: null,
      history: [
        {
          role: "user",
          content: "",
          attachments: [{ uploadId: "missing", mimeType: "image/png" }],
        },
      ],
      attachmentDataUrls: new Map(),
      modelSupportsVision: true,
    })
    expect(result).toEqual([{ role: "user", content: "" }])
  })

  it("вложения у роли assistant игнорируются (только user'ы прикладывают)", () => {
    const result = buildOpenRouterMessages({
      systemPrompt: null,
      history: [
        {
          role: "assistant",
          content: "вот моё мнение",
          // Странный случай — у ассистента нет вложений по нашей схеме,
          // но если они вдруг там окажутся, мы их не должны прокидывать.
          attachments: [{ uploadId: "u-1", mimeType: "image/png" }],
        },
      ],
      attachmentDataUrls: new Map([["u-1", "data:image/png;base64,xxx"]]),
      modelSupportsVision: true,
    })

    expect(result).toEqual([{ role: "assistant", content: "вот моё мнение" }])
  })
})
