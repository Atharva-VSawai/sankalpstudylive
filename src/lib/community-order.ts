// Single source of truth for the product's community order.
// Keep slugs and display names together so API and UI sorting cannot drift.
export const COMMUNITY_ORDER = [
  { slug: "general", name: "General Study" },
  { slug: "gate", name: "GATE" },
  { slug: "jee", name: "JEE" },
  { slug: "neet", name: "NEET" },
  { slug: "upsc", name: "UPSC" },
  { slug: "neet-pg", name: "NEET PG" },
  { slug: "cat", name: "CAT" },
  { slug: "ssc", name: "SSC" },
  { slug: "banking", name: "Banking" },
  { slug: "mpsc", name: "MPSC" },
  { slug: "placements", name: "Placements" },
  { slug: "dsa", name: "DSA" },
] as const

export const COMMUNITY_ORDER_INDEX = new Map(
  COMMUNITY_ORDER.map((community, index) => [community.slug, index])
)

export function communityOrderIndex(slug: string | null | undefined) {
  return slug ? (COMMUNITY_ORDER_INDEX.get(slug as (typeof COMMUNITY_ORDER)[number]["slug"]) ?? COMMUNITY_ORDER.length) : 0
}
