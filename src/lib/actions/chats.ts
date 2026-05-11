"use server"

import { revalidatePath } from "next/cache"
import { eq, desc, and, sql } from "drizzle-orm"
import { db } from "../db"
import { chats, chatMessages } from "../db/schema"
import { getSession } from "../auth-server"
import { DEFAULT_TEXT_MODEL, DEFAULT_CHAT_SETTINGS } from "../providers/text-models"

export async function listChats() {
  const session = await getSession()
  if (!session?.user) throw new Error("Не авторизован")

  return db
    .select({
      id: chats.id,
      title: chats.title,
      model: chats.model,
      updatedAt: chats.updatedAt,
    })
    .from(chats)
    .where(eq(chats.userId, session.user.id))
    .orderBy(desc(chats.updatedAt))
}

export async function getChat(chatId: string) {
  const session = await getSession()
  if (!session?.user) throw new Error("Не авторизован")

  const [chat] = await db
    .select()
    .from(chats)
    .where(and(eq(chats.id, chatId), eq(chats.userId, session.user.id)))

  if (!chat) return null

  const messages = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.chatId, chatId))
    .orderBy(chatMessages.createdAt)

  return { chat, messages }
}

/**
 * Создать новый чат. Если у пользователя уже есть пустой чат
 * (без сообщений) — возвращаем его вместо создания нового,
 * чтобы пустышки не накапливались от повторных нажатий "+".
 */
export async function createChat(opts?: {
  title?: string
  model?: string
  systemPrompt?: string
  settings?: Record<string, unknown>
}) {
  const session = await getSession()
  if (!session?.user) throw new Error("Не авторизован")

  // Поиск существующего пустого чата
  const [existingEmpty] = await db
    .select()
    .from(chats)
    .where(and(
      eq(chats.userId, session.user.id),
      sql`NOT EXISTS (SELECT 1 FROM chat_messages WHERE chat_id = chats.id)`
    ))
    .orderBy(desc(chats.createdAt))
    .limit(1)

  if (existingEmpty) {
    // Если пользователь явно указал модель/систему — обновим существующий пустой чат
    const update: Record<string, unknown> = { updatedAt: new Date() }
    if (opts?.model) update.model = opts.model
    if (opts?.systemPrompt !== undefined) update.systemPrompt = opts.systemPrompt
    if (opts?.settings) update.settings = opts.settings
    if (Object.keys(update).length > 1) {
      await db.update(chats).set(update).where(eq(chats.id, existingEmpty.id))
    }
    revalidatePath("/chat")
    return { ...existingEmpty, ...update }
  }

  const [chat] = await db
    .insert(chats)
    .values({
      userId: session.user.id,
      title: opts?.title || "Новый чат",
      model: opts?.model || DEFAULT_TEXT_MODEL,
      systemPrompt: opts?.systemPrompt || null,
      settings: opts?.settings || DEFAULT_CHAT_SETTINGS,
    })
    .returning()

  revalidatePath("/chat")
  return chat
}

export async function renameChat(chatId: string, title: string) {
  const session = await getSession()
  if (!session?.user) throw new Error("Не авторизован")

  await db
    .update(chats)
    .set({ title, updatedAt: new Date() })
    .where(and(eq(chats.id, chatId), eq(chats.userId, session.user.id)))

  revalidatePath("/chat")
  revalidatePath(`/chat/${chatId}`)
}

export async function updateChatSettings(
  chatId: string,
  data: {
    model?: string
    systemPrompt?: string | null
    settings?: Record<string, unknown>
  }
) {
  const session = await getSession()
  if (!session?.user) throw new Error("Не авторизован")

  const update: Record<string, unknown> = { updatedAt: new Date() }
  if (data.model !== undefined) update.model = data.model
  if (data.systemPrompt !== undefined) update.systemPrompt = data.systemPrompt
  if (data.settings !== undefined) update.settings = data.settings

  await db
    .update(chats)
    .set(update)
    .where(and(eq(chats.id, chatId), eq(chats.userId, session.user.id)))

  revalidatePath(`/chat/${chatId}`)
}

export async function deleteChat(chatId: string) {
  const session = await getSession()
  if (!session?.user) throw new Error("Не авторизован")

  await db
    .delete(chats)
    .where(and(eq(chats.id, chatId), eq(chats.userId, session.user.id)))

  revalidatePath("/chat")
}
