import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, notFound, badRequest, getAuth } from "@/lib/api"
import { deleteTimelapseFiles } from "@/lib/timelapse-storage"

// DELETE /api/timelapses/[id]
// Deletes the Timelapse: Storage files (video + thumbnail) AND the PostgreSQL
// metadata row. Only the owner can delete. If Storage deletion fails, we
// return an error rather than falsely claiming success — the caller can retry
// or the orphan can be cleaned up later by a retention job.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const { id } = await params
  const timelapse = await db.timelapse.findUnique({ where: { id } })
  if (!timelapse || timelapse.userId !== ctx.userId) return notFound("Timelapse not found")

  // 1. Delete Storage files (video + thumbnail). If this fails, do NOT delete
  // the metadata row — we'd rather have an orphan than silently lose the
  // association.
  const storageDeleted = await deleteTimelapseFiles(ctx.userId, id)
  if (!storageDeleted) {
    // Keep the metadata row so the user can retry the delete (or a future
    // retention job can clean it up). Return an error.
    return badRequest("Could not delete storage files; please try again", "STORAGE_DELETE_FAILED")
  }

  // 2. Delete the metadata row.
  await db.timelapse.delete({ where: { id } })
  return ok({ deleted: true })
}
