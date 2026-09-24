import { LiveKitAPI } from "livekit-server-sdk"

// Server-only LiveKit room administration. Never import this module from a
// client component; it holds the API secret through the SDK configuration.
export async function closeLiveKitRoom(roomName: string): Promise<void> {
  const configuredUrl = process.env.LIVEKIT_URL
  const apiKey = process.env.LIVEKIT_API_KEY
  const secret = process.env.LIVEKIT_API_SECRET
  if (!configuredUrl || !apiKey || !secret) return

  const host = configuredUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:")
  const api = new LiveKitAPI({ host, apiKey, secret, requestTimeout: 3, failover: false })
  await api.room.deleteRoom(roomName)
}
