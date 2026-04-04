import { createCipheriv, createDecipheriv, randomBytes } from "crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 16
const TAG_LENGTH = 16

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key) {
    throw new Error("ENCRYPTION_KEY не задан в переменных окружения")
  }
  return Buffer.from(key, "hex")
}

/**
 * Зашифровать строку AES-256-GCM.
 * Возвращает строку формата: iv:encrypted:tag (hex)
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(plaintext, "utf8", "hex")
  encrypted += cipher.final("hex")

  const tag = cipher.getAuthTag()

  return `${iv.toString("hex")}:${encrypted}:${tag.toString("hex")}`
}

/**
 * Расшифровать строку AES-256-GCM.
 * Принимает строку формата: iv:encrypted:tag (hex)
 */
export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey()
  const [ivHex, encrypted, tagHex] = ciphertext.split(":")

  if (!ivHex || !encrypted || !tagHex) {
    throw new Error("Неверный формат зашифрованных данных")
  }

  const iv = Buffer.from(ivHex, "hex")
  const tag = Buffer.from(tagHex, "hex")
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  let decrypted = decipher.update(encrypted, "hex", "utf8")
  decrypted += decipher.final("utf8")

  return decrypted
}

/**
 * Получить подсказку ключа (последние 4 символа)
 */
export function getKeyHint(key: string): string {
  if (key.length <= 4) return key
  return `...${key.slice(-4)}`
}
