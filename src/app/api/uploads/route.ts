import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { randomUUID } from "node:crypto"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { uploads } from "@/lib/db/schema"
import { upload as s3Upload, ensureBucket } from "@/lib/storage/s3"
import { validateUpload, MAX_UPLOAD_BYTES } from "@/lib/utils/validate-upload"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * Загрузка одной картинки из формы (paste/drop/picker).
 *
 * Принимает multipart/form-data с полями:
 * - file: File | Blob — собственно картинка
 * - source: "paste" | "drop" | "picker" (опционально, для аналитики)
 *
 * Возвращает { id, url, width, height, mimeType, sizeBytes }.
 * url — на наш собственный `/api/uploads/{id}` (S3-ключ не светим клиенту).
 */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }

  // Быстрый отсев слишком большого тела до парсинга multipart —
  // экономит память сервера, если клиент шлёт огромный файл.
  const contentLength = parseInt(request.headers.get("content-length") || "0", 10)
  if (contentLength > MAX_UPLOAD_BYTES * 1.1) {
    return NextResponse.json(
      { error: `Файл слишком большой. Лимит — ${MAX_UPLOAD_BYTES / 1024 / 1024} МБ.` },
      { status: 413 }
    )
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json(
      { error: "Ожидается multipart/form-data" },
      { status: 400 }
    )
  }

  const file = formData.get("file")
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json(
      { error: "Поле 'file' обязательно и должно быть Blob" },
      { status: 400 }
    )
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const validation = validateUpload(buffer)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.message }, { status: 400 })
  }

  const { meta } = validation
  const ext = meta.mimeType.split("/")[1] || "bin"
  const sourceRaw = formData.get("source")
  const source = typeof sourceRaw === "string" && sourceRaw.length < 16 ? sourceRaw : null

  // Генерируем id заранее, чтобы класть в S3 с предсказуемым ключом
  // и одной транзакцией писать БД.
  const id = randomUUID()
  const s3Key = `uploads/${session.user.id}/${id}.${ext}`

  try {
    await ensureBucket()
    await s3Upload(s3Key, buffer, meta.mimeType)
    await db.insert(uploads).values({
      id,
      userId: session.user.id,
      s3Key,
      mimeType: meta.mimeType,
      width: meta.width,
      height: meta.height,
      sizeBytes: buffer.length,
      source,
    })

    return NextResponse.json({
      id,
      url: `/api/uploads/${id}`,
      width: meta.width,
      height: meta.height,
      mimeType: meta.mimeType,
      sizeBytes: buffer.length,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Не удалось сохранить файл"
    // Если БД легла, а файл уже в S3 — оставим висеть.
    // S3-чистка по orphan-ключам делается отдельной задачей (вне MVP).
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
