"use server"

import { eq, and, asc } from "drizzle-orm"
import { createHash } from "crypto"
import { db } from "../db"
import { folders, images } from "../db/schema"
import { auth } from "../auth"
import { headers } from "next/headers"

export interface FolderItem {
  id: string
  name: string
  parentId: string | null
  hasPassword: boolean
  createdAt: Date
}

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex")
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
      passwordHash: folders.passwordHash,
      createdAt: folders.createdAt,
    })
    .from(folders)
    .where(eq(folders.userId, session.user.id))
    .orderBy(asc(folders.name))

  return result.map((f) => ({
    id: f.id,
    name: f.name,
    parentId: f.parentId,
    hasPassword: !!f.passwordHash,
    createdAt: f.createdAt,
  }))
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
 * Установить пароль на папку
 */
export async function setFolderPassword(folderId: string, password: string) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Не авторизован")

  await db
    .update(folders)
    .set({ passwordHash: hashPassword(password) })
    .where(
      and(
        eq(folders.id, folderId),
        eq(folders.userId, session.user.id)
      )
    )

  return { success: true }
}

/**
 * Убрать пароль с папки (нужен текущий пароль)
 */
export async function removeFolderPassword(folderId: string, password: string) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Не авторизован")

  const [folder] = await db
    .select({ passwordHash: folders.passwordHash })
    .from(folders)
    .where(
      and(
        eq(folders.id, folderId),
        eq(folders.userId, session.user.id)
      )
    )

  if (!folder?.passwordHash) return { success: true }
  if (hashPassword(password) !== folder.passwordHash) {
    return { success: false, error: "Неверный пароль" }
  }

  await db
    .update(folders)
    .set({ passwordHash: null })
    .where(eq(folders.id, folderId))

  return { success: true }
}

/**
 * Проверить пароль папки
 */
export async function verifyFolderPassword(folderId: string, password: string) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Не авторизован")

  const [folder] = await db
    .select({ passwordHash: folders.passwordHash })
    .from(folders)
    .where(
      and(
        eq(folders.id, folderId),
        eq(folders.userId, session.user.id)
      )
    )

  if (!folder?.passwordHash) return { success: true }
  if (hashPassword(password) !== folder.passwordHash) {
    return { success: false, error: "Неверный пароль" }
  }

  return { success: true }
}

/**
 * Удалить папку (изображения перемещаются в корень)
 */
export async function deleteFolder(folderId: string) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Не авторизован")

  await db
    .update(images)
    .set({ folderId: null })
    .where(eq(images.folderId, folderId))

  await db
    .update(folders)
    .set({ parentId: null })
    .where(
      and(
        eq(folders.parentId, folderId),
        eq(folders.userId, session.user.id)
      )
    )

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
