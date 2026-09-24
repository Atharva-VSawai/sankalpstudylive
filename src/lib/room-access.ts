type RoomForAccess = {
  name: string
  communityId: string | null
  isDefaultRoom: boolean
  community?: { slug: string } | null
}

// General Study is the only platform-wide room category. A legacy default
// room may still have communityId=null until the idempotent seed is run.
export function isGeneralStudyRoom(room: RoomForAccess) {
  return room.community?.slug === "general" || (
    room.communityId === null &&
    room.isDefaultRoom &&
    room.name === "General Study Focus Room"
  )
}

export function isUnassignedNonGeneralRoom(room: RoomForAccess) {
  return room.communityId === null && !isGeneralStudyRoom(room)
}
