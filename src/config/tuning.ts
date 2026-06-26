// =============================================================================
// tuning.ts — SINGLE SOURCE OF TRUTH for all gameplay numbers.
// Balance the game by editing values here and nowhere else.
// =============================================================================

export const GAME = {
  width: 640,
  height: 960,
  backgroundColor: '#202028',
  gravityY: 1.2, // Matter world gravity scale
  debugPhysics: false, // set true to see Matter bodies/wireframes
}

// Interior bounds of the container (where fruit can live), in canvas px.
export const CONTAINER = {
  marginX: 30, // gap from canvas left/right edges to the walls
  top: 180, // top of the container interior (open at the top)
  bottom: 920, // floor (inner surface)
  wallThickness: 24,
  loseLineY: 235, // fruit resting above this line ends the run (after grace)
  loseGraceMs: 2000, // how long a fruit may stay above the line before losing
}

export type TierDef = {
  radius: number // px
  color: number // hex fill
  score: number // points awarded when TWO of this tier merge
}

// Smallest -> largest. Array index === tier number.
export const TIERS: TierDef[] = [
  { radius: 18, color: 0xff6b6b, score: 1 }, // 0
  { radius: 26, color: 0xffa94d, score: 3 }, // 1
  { radius: 34, color: 0xffd43b, score: 6 }, // 2
  { radius: 44, color: 0xa9e34b, score: 10 }, // 3
  { radius: 54, color: 0x51cf66, score: 15 }, // 4
  { radius: 66, color: 0x22b8cf, score: 21 }, // 5
  { radius: 78, color: 0x4dabf7, score: 28 }, // 6
  { radius: 92, color: 0x748ffc, score: 36 }, // 7
  { radius: 108, color: 0x9775fa, score: 45 }, // 8
  { radius: 124, color: 0xda77f2, score: 55 }, // 9
  { radius: 142, color: 0xf783ac, score: 66 }, // 10 (top tier)
]

export const TOP_TIER = TIERS.length - 1

// What happens when two TOP_TIER fruits merge.
//  'vanish'   -> both removed, big score burst (default)
//  'capstone' -> they merge into a single persistent top-tier fruit
export const TOP_TIER_BEHAVIOR: 'vanish' | 'capstone' = 'vanish'
export const TOP_TIER_VANISH_SCORE = 200

// Per-fruit physics. Tuned for a weighty, jostly settle in Phase 4.
export const PHYSICS = {
  restitution: 0.08, // bounciness — low so fruits feel weighty, not rubbery
  friction: 0.45, // surface friction
  frictionStatic: 0.8, // resistance to start sliding — helps piles hold
  frictionAir: 0.014, // air drag — settles motion without feeling floaty
  density: 0.0014, // mass per area (bigger tiers get heavier via area)
  sleepThreshold: 50, // steps of near-rest before a body sleeps (anti-jitter)
}

// Engine-level solver settings. Higher iterations resolve overlaps/penetration
// more firmly (fewer fruits clipping into each other) for a small CPU cost.
export const WORLD = {
  positionIterations: 12, // default 6
  velocityIterations: 8, // default 4
  constraintIterations: 2,
}

// The dropper only ever spawns the lowest few tiers, weighted toward the
// smallest. Index === tier; value === relative weight. Tiers beyond this list
// never spawn from the dropper.
export const SPAWN_WEIGHTS: number[] = [5, 4, 3, 2, 1] // tiers 0..4

export const DROP = {
  cooldownMs: 380, // delay after a drop before the next fruit loads
  startY: 120, // y of the held fruit at the top of the container
}

export const SCORE = {
  multiplier: 1, // global score multiplier hook
}

// Visual/feel "juice" on merges.
export const JUICE = {
  popFrom: 0.65, // merged fruit scales up from this to 1.0 (a satisfying pop)
  popDuration: 220,
  popEase: 'Back.easeOut',
  burstParticles: 14, // colored spark burst per merge
  shakeFromTier: 5, // merges that PRODUCE a tier >= this shake the camera
  shakeDuration: 150,
  shakeIntensity: 0.006,
  floatScoreRise: 48, // px the floating "+score" drifts upward
  floatScoreDuration: 700,
  comboWindowMs: 350, // merges within this window of each other count as a combo
  comboPopupDuration: 800,
}

// Synthesized audio (no sound files — Web Audio tones, rising pitch by tier).
export const AUDIO = {
  masterVolume: 0.5,
  muted: false,
  baseFreq: 220, // Hz for the lowest merge
  tiersPerOctave: 6, // every N tiers raises the blip an octave
}
