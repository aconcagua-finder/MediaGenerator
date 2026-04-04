import { NextRequest, NextResponse } from "next/server"
import { checkModelsForUpdates } from "@/lib/cron/model-checker"

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await checkModelsForUpdates()
    return NextResponse.json(result)
  } catch (err) {
    console.error("[cron/model-check] Error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
