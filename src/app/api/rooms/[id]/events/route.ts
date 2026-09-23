import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, notFound, unauthorized, getAuth } from "@/lib/api"
import { subscribe, listParticipants, listMessages, getTimer, reapStale } from "@/lib/presence"

// GET /api/rooms/[id]/events  (Server-Sent Events)
// Streams presence + message + timer events to the room client.
// Client connects with EventSource; token passed as query param (EventSource can't set headers).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(req.url)
  const token = url.searchParams.get("token")

  // Lightweight token check (reuse auth)
  if (!token) return unauthorized()
  const ctx = await getAuth(reqWithAuth(req, token))
  if (!ctx) return unauthorized()

  const room = await db.room.findUnique({ where: { id } })
  if (!room) return notFound("Room not found")

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder()
      const send = (evt: any) => {
        controller.enqueue(enc.encode(`event: ${evt.type}\ndata: ${JSON.stringify(evt)}\n\n`))
      }

      // initial snapshot
      reapStale(id)
      send({ type: "presence", participants: listParticipants(id) })
      send({ type: "history", messages: listMessages(id, 50) })
      send({ type: "timer", timer: getTimer(id) })
      const { listReactions } = await import("@/lib/presence")
      send({ type: "reactions", reactions: listReactions(id) })

      const unsub = subscribe(id, send)

      // heartbeat to keep connection alive + reap stale participants
      const hb = setInterval(() => {
        controller.enqueue(enc.encode(`: hb\n\n`))
      }, 15000)

      const closer = () => {
        clearInterval(hb)
        unsub()
        try { controller.close() } catch {}
      }
      req.signal.addEventListener("abort", closer)
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}

// helper: clone request with Authorization header from query token (since EventSource can't set headers)
function reqWithAuth(req: NextRequest, token: string): NextRequest {
  const headers = new Headers(req.headers)
  headers.set("authorization", `Bearer ${token}`)
  return new NextRequest(req.url, { method: req.method, headers })
}
