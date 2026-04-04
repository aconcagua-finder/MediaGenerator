"use server"

import { eq, and, isNull, asc } from "drizzle-orm"
import { db } from "../db"
import { folders, images } from "../db/schema"
import { auth } from "../auth"
import { headers } from "next/headers"

export interface FolderItem {
  id: string
  name: string
  parentId: string | null
  createdAt: Date
}

/**
 * Получить все папки пользователя
 */
export async function getFolders(): Promise<FolderItem[]> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Не авторизован")

  const result = await db
    .select({
      id: folders.id,
      name: folders.name,
      parentId: folders.parentId,
      createdAt: folders.createdAt,
    })
    .from(folders)
    .where(eq(folders.userId, session.user.id))
    .orderBy(asc(folders.name))

  return result
}

/**
 * Создать папку
 */
export async function createFolder(name: string, parentId?: string | null) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Не авторизован")

  const [folder] = await db
    .insert(folders)
    .values({
      name: name.trim(),
      parentId: parentId || null,
      userId: session.user.id,
    })
    .returning({
      id: folders.id,
      name: folders.name,
      parentId: folders.parentId,
      createdAt: folders.createdAt,
    })

  return folder
}

/**
 * Переименовать папку
 */
export async function renameFolder(folderId: string, newName: string) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Не авторизован")

  await db
    .update(folders)
    .set({ name: newName.trim() })
    .where(
      and(
        eq(folders.id, folderId),
        eq(folders.userId, session.user.id)
      )
    )

  return { success: true }
}

/**
 * Удалить папку (изображения перемещаются в корень)
 */
export async function deleteFolder(folderId: string) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Не авторизован")

  // Перемещаем изображения из удаляемой папки в корень
  await db
    .update(images)
    .set({ folderId: null })
    .where(eq(images.folderId, folderId))

  // Перемещаем дочерние папки в корень
  await db
    .update(folders)
    .set({ parentId: null })
    .where(
      and(
        eq(folders.parentId, folderId),
        eq(folders.userId, session.user.id)
      )
    )

  // Удаляем папку
  await db
    .delete(folders)
    .where(
      and(
        eq(folders.id, folderId),
        eq(folders.userId, session.user.id)
      )
    )

  return { success: true }
}
