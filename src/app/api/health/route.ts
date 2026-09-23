import { NextRequest } from "next/server"
import { ok } from "@/lib/api"

// GET /api/health
export async function GET() {
  return ok({
    status: "ok",
    service: "sankalp-web",
    time: new Date().toISOString(),
    // Not a load-test claim; just a liveness probe.
  })
}
