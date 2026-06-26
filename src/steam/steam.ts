// =============================================================================
// Steam integration layer — STUBBED. Every function is a no-op until Steam is
// explicitly wired up (Phase 7). Keeping the game code calling these stubs means
// the same bundle runs in a plain browser with zero Steam dependency.
//
// STEAM INTEGRATION POINT
// =============================================================================

export function initSteam(): void {
  // no-op until steamworks.js is wired in
}

export function unlockAchievement(id: string): void {
  void id // no-op
}

export function submitScore(score: number): void {
  void score // no-op
}
