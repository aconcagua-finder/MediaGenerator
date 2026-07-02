import { NextRequest, NextResponse } from "next/server"
import { listTemplates, createTemplate, type CreateTemplateInput } from "@/lib/actions/monitoring"
import { getSession } from "@/lib/auth-server"

export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const templates = await listTemplates()
  return NextResponse.json({ templates })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: CreateTemplateInput
  try {
    body = (await request.json()) as CreateTemplateInput
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  try {
    const template = await createTemplate(body)
    return NextResponse.json({ template })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Не удалось создать шаблон"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
