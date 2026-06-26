// Local persistence for the high score.
//
// Uses localStorage, which persists across runs in BOTH a plain browser AND the
// Tauri desktop webview (Tauri v2 gives the webview a persistent data store), so
// the game code stays wrapper-agnostic per the build plan. If you later want
// file-based persistence on desktop specifically, swap just these two functions
// to the Tauri store plugin — nothing else in the game changes.

const HIGH_SCORE_KEY = 'merge-puzzle:highScore'
const MUTED_KEY = 'merge-puzzle:muted'
const VOLUME_KEY = 'merge-puzzle:volume'

export function loadHighScore(): number {
  try {
    const raw = localStorage.getItem(HIGH_SCORE_KEY)
    const n = raw ? parseInt(raw, 10) : 0
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

export function saveHighScore(score: number): void {
  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(score))
  } catch {
    // storage unavailable (e.g. private mode) — fail silently
  }
}

export function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === '1'
  } catch {
    return false
  }
}

export function saveMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTED_KEY, muted ? '1' : '0')
  } catch {
    // fail silently
  }
}

// Returns the saved master volume in [0,1], or -1 if none is stored.
export function loadVolume(): number {
  try {
    const v = parseFloat(localStorage.getItem(VOLUME_KEY) ?? '')
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : -1
  } catch {
    return -1
  }
}

export function saveVolume(volume: number): void {
  try {
    localStorage.setItem(VOLUME_KEY, String(volume))
  } catch {
    // fail silently
  }
}

const COLORBLIND_KEY = 'merge-puzzle:colorblind'

export function loadColorblind(): boolean {
  try {
    return localStorage.getItem(COLORBLIND_KEY) === '1'
  } catch {
    return false
  }
}

export function saveColorblind(on: boolean): void {
  try {
    localStorage.setItem(COLORBLIND_KEY, on ? '1' : '0')
  } catch {
    // fail silently
  }
}
