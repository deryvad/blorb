// Global leaderboard via LootLocker (https://lootlocker.com).
//
// Honest caveat: a web game runs on the player's machine, so the score it sends
// can be faked. This is a casual, best-effort board — NOT anti-cheat. We keep it
// simple (guest sessions, an entered name) and accept that.
//
// SETUP — fill in CONFIG from your LootLocker console, then it goes live:
//   gameKey        → Game settings → API Keys → "Game API Key" (public, safe to ship)
//   gameVersion    → must match a Game Version configured in LootLocker (e.g. 1.0.0.0)
//   leaderboardKey → Leaderboards → your board → its "key"
// Until these are filled in, isConfigured() is false and the UI hides the board.

const CONFIG = {
  gameKey: 'dev_c0a46a0131cd414ca69a0c191e55dd85',
  gameVersion: '1.0.0.0',
  leaderboardKey: 'highscores',
  baseUrl: 'https://api.lootlocker.io/game',
}

export interface LeaderboardEntry {
  rank: number
  name: string
  score: number
}

interface LLItem {
  rank?: number
  score?: number
  member_id?: string
  metadata?: string | null
}

const ID_KEY = 'merge-puzzle:llid'
let sessionToken: string | null = null

export function isConfigured(): boolean {
  return !CONFIG.gameKey.startsWith('YOUR_') && !CONFIG.leaderboardKey.startsWith('YOUR_')
}

// A stable per-device guest identifier, so a returning player maps to the same
// LootLocker guest player instead of spawning a new one each session.
function playerIdentifier(): string {
  try {
    const existing = localStorage.getItem(ID_KEY)
    if (existing) return existing
    const id = `blorb-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
    localStorage.setItem(ID_KEY, id)
    return id
  } catch {
    return `blorb-${Math.random().toString(36).slice(2)}`
  }
}

async function session(): Promise<string | null> {
  if (sessionToken) return sessionToken
  try {
    const res = await fetch(`${CONFIG.baseUrl}/v2/session/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        game_key: CONFIG.gameKey,
        game_version: CONFIG.gameVersion,
        player_identifier: playerIdentifier(),
      }),
    })
    const data = (await res.json()) as { session_token?: string }
    sessionToken = data.session_token ?? null
    return sessionToken
  } catch {
    return null
  }
}

// Submit a score under `name`. The name is stored both as member_id (so a name
// keeps its best score, arcade-style) and in metadata (display fallback).
// Returns the achieved rank, or null on failure.
export async function submitScore(name: string, score: number): Promise<number | null> {
  if (!isConfigured()) return null
  const token = await session()
  if (!token) return null
  const member = name.trim().slice(0, 16) || 'YOU'
  try {
    const res = await fetch(`${CONFIG.baseUrl}/leaderboards/${CONFIG.leaderboardKey}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-token': token },
      body: JSON.stringify({ member_id: member, score, metadata: member }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { rank?: number }
    return data.rank ?? null
  } catch {
    return null
  }
}

// Fetch the top `count` ranked entries.
export async function topScores(count = 10): Promise<LeaderboardEntry[]> {
  if (!isConfigured()) return []
  const token = await session()
  if (!token) return []
  try {
    const res = await fetch(`${CONFIG.baseUrl}/leaderboards/${CONFIG.leaderboardKey}/list?count=${count}`, {
      headers: { 'x-session-token': token },
    })
    const data = (await res.json()) as { items?: LLItem[] }
    const items = Array.isArray(data.items) ? data.items : []
    return items.map((it) => ({
      rank: it.rank ?? 0,
      name: String(it.metadata || it.member_id || '???').slice(0, 16),
      score: it.score ?? 0,
    }))
  } catch {
    return []
  }
}

// Playful default leaderboard names (adjective + noun), e.g. "Fluffy Cat".
const NAME_ADJ = [
  'Fluffy', 'Mooing', 'Sleepy', 'Bouncy', 'Wiggly', 'Sneaky', 'Grumpy', 'Giggly', 'Sparkly',
  'Wobbly', 'Zippy', 'Cosmic', 'Salty', 'Cheeky', 'Dizzy', 'Jolly', 'Spicy', 'Fuzzy', 'Snappy',
  'Mighty', 'Soggy', 'Plucky', 'Derpy', 'Toasty',
]
const NAME_NOUN = [
  'Cat', 'Moon', 'Pickle', 'Waffle', 'Penguin', 'Noodle', 'Bubble', 'Potato', 'Otter', 'Muffin',
  'Comet', 'Llama', 'Toast', 'Pirate', 'Wizard', 'Dragon', 'Gnome', 'Taco', 'Cookie', 'Panda',
  'Sloth', 'Yeti', 'Goose', 'Donut',
]

export function randomName(): string {
  const a = NAME_ADJ[Math.floor(Math.random() * NAME_ADJ.length)]
  const n = NAME_NOUN[Math.floor(Math.random() * NAME_NOUN.length)]
  return `${a} ${n}`
}
