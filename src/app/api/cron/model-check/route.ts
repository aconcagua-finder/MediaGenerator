import { NextRequest, NextResponse } from "next/server"
import { checkModelsForUpdates } from "@/lib/cron/model-checker"
import { runRegistryAudit } from "@/lib/cron/registry-audit"

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Два независимых слоя: DB-чекер image-провайдеров и аудит статических
  // реестров (text/video/openrouter-image) против живого OpenRouter.
  // Падение одного не должно ронять другой.
  let registry: Awaited<ReturnType<typeof checkModelsForUpdates>> | { error: string }
  let audit: Awaited<ReturnType<typeof runRegistryAudit>> | { error: string }

  try {
    registry = await checkModelsForUpdates()
  } catch (err) {
    console.error("[cron/model-check] model-checker error:", err)
    registry = { error: "model-checker failed" }
  }

  try {
    audit = await runRegistryAudit()
  } catch (err) {
    console.error("[cron/model-check] registry-audit error:", err)
    audit = { error: "registry-audit failed" }
  }

  return NextResponse.json({ registry, audit })
}
