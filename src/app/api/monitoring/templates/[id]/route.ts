import { NextRequest, NextResponse } from "next/server"
import { deleteTemplate, updateTemplate, type UpdateTemplateInput } from "@/lib/actions/monitoring"
import { getSession } from "@/lib/auth-server"

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await context.params
  let body: Omit<UpdateTemplateInput, "id">
  try {
    body = (await request.json()) as Omit<UpdateTemplateInput, "id">
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  try {
    const template = await updateTemplate({ ...body, id })
    return NextResponse.json({ template })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Не удалось обновить шаблон"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await context.params
  try {
    await deleteTemplate(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Не удалось удалить шаблон"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
