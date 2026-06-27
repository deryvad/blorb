import { AUDIO } from '../config/tuning'

// Sound layer. SFX are synthesized with the Web Audio API (merge "blorbs", a
// drop thunk, a top-tier jackpot, a game-over sting); background music is a
// looped audio file (public/fizzy.mp3) decoded into the same context. Browsers
// block audio until a user gesture, so we lazily create the context and resume
// it on the first interaction (see installAudioUnlock), which also starts music.

let ctx: AudioContext | null = null
let muted = AUDIO.muted
let masterVolume = AUDIO.masterVolume
let unlockInstalled = false

// --- Music state ---
let musicGain: GainNode | null = null
let musicStarted = false
let musicPaused = false
const MUSIC_LEVEL = 0.4 // looped-track level relative to master volume

function getCtx(): AudioContext | null {
  if (!ctx) {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
  }
  return ctx
}

function musicTarget(): number {
  return muted || musicPaused ? 0 : masterVolume * MUSIC_LEVEL
}

// Resume the audio context from within a real user-gesture handler so later
// playback is allowed, and start the music bed. Safe to call once at boot.
export function installAudioUnlock(): void {
  if (unlockInstalled) return
  unlockInstalled = true
  const unlock = (): void => {
    const c = getCtx()
    if (!c) return
    if (c.state === 'suspended') void c.resume().then(startMusic)
    else startMusic()
  }
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
    window.addEventListener(ev, unlock, { passive: true })
  }
}

// --- Background music ---------------------------------------------------------

// The looped track at public/fizzy.m4a (AAC ~96kbps — small so it doesn't hog
// mobile bandwidth on first tap). We fetch + decode it into our own AudioContext
// and route it through musicGain, so the existing mute toggle and volume slider
// control it for free.
function startMusic(): void {
  const c = getCtx()
  if (!c || c.state !== 'running' || musicStarted) return
  musicStarted = true
  musicGain = c.createGain()
  musicGain.gain.value = musicTarget()
  musicGain.connect(c.destination)

  fetch('fizzy.m4a')
    .then((r) => r.arrayBuffer())
    .then((buf) => c.decodeAudioData(buf))
    .then((audio) => {
      if (!musicGain) return
      const src = c.createBufferSource()
      src.buffer = audio
      src.loop = true
      src.connect(musicGain)
      src.start()
    })
    .catch(() => {
      // If the track can't load, the game just plays without music.
    })
}

// --- SFX ----------------------------------------------------------------------

// A short pitched "blorb" for a merge that produced `tier`.
export function playMerge(tier: number): void {
  if (muted) return
  const c = getCtx()
  if (!c || c.state !== 'running') return

  const now = c.currentTime
  const base = AUDIO.baseFreq * Math.pow(2, tier / AUDIO.tiersPerOctave)
  const vol = Math.max(0.0001, masterVolume * 0.7)

  const body = c.createOscillator()
  body.type = 'sine'
  body.frequency.setValueAtTime(base * 1.7, now)
  body.frequency.exponentialRampToValueAtTime(base * 0.85, now + 0.14)
  const bodyGain = c.createGain()
  bodyGain.gain.setValueAtTime(0.0001, now)
  bodyGain.gain.exponentialRampToValueAtTime(vol, now + 0.02)
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26)
  body.connect(bodyGain).connect(c.destination)
  body.start(now)
  body.stop(now + 0.3)

  const tick = c.createOscillator()
  tick.type = 'sine'
  tick.frequency.setValueAtTime(base * 2.6, now)
  tick.frequency.exponentialRampToValueAtTime(base * 1.6, now + 0.05)
  const tickGain = c.createGain()
  tickGain.gain.setValueAtTime(0.0001, now)
  tickGain.gain.exponentialRampToValueAtTime(vol * 0.5, now + 0.008)
  tickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07)
  tick.connect(tickGain).connect(c.destination)
  tick.start(now)
  tick.stop(now + 0.09)
}

// Soft, low thunk when a bubble is released.
export function playDrop(): void {
  if (muted) return
  const c = getCtx()
  if (!c || c.state !== 'running') return
  const now = c.currentTime
  const osc = c.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(190, now)
  osc.frequency.exponentialRampToValueAtTime(95, now + 0.12)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, now)
  g.gain.exponentialRampToValueAtTime(masterVolume * 0.35, now + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.16)
  osc.connect(g).connect(c.destination)
  osc.start(now)
  osc.stop(now + 0.18)
}

// Big chunky payoff when the two top-tier bubbles pop: rising sparkle + a boom.
export function playJackpot(): void {
  if (muted) return
  const c = getCtx()
  if (!c || c.state !== 'running') return
  const now = c.currentTime

  const arp = [523, 659, 784, 1047, 1319]
  arp.forEach((f, i) => {
    const t = now + i * 0.06
    const osc = c.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = f
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(masterVolume * 0.4, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
    osc.connect(g).connect(c.destination)
    osc.start(t)
    osc.stop(t + 0.22)
  })

  const boom = c.createOscillator()
  boom.type = 'sine'
  boom.frequency.setValueAtTime(170, now)
  boom.frequency.exponentialRampToValueAtTime(55, now + 0.35)
  const bg = c.createGain()
  bg.gain.setValueAtTime(0.0001, now)
  bg.gain.exponentialRampToValueAtTime(masterVolume * 0.5, now + 0.02)
  bg.gain.exponentialRampToValueAtTime(0.0001, now + 0.45)
  boom.connect(bg).connect(c.destination)
  boom.start(now)
  boom.stop(now + 0.47)
}

// Descending sting on game over.
export function playGameOver(): void {
  if (muted) return
  const c = getCtx()
  if (!c || c.state !== 'running') return
  const now = c.currentTime
  const notes = [392, 330, 294, 196]
  notes.forEach((f, i) => {
    const t = now + i * 0.16
    const osc = c.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = f
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(masterVolume * 0.4, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
    osc.connect(g).connect(c.destination)
    osc.start(t)
    osc.stop(t + 0.38)
  })
}

// --- Settings -----------------------------------------------------------------

export function setMuted(value: boolean): void {
  muted = value
  if (musicGain && ctx) musicGain.gain.setTargetAtTime(musicTarget(), ctx.currentTime, 0.05)
}

// Pause/resume the music bed alongside the game (smoothly ducks it to silence).
export function setMusicPaused(paused: boolean): void {
  musicPaused = paused
  if (musicGain && ctx) musicGain.gain.setTargetAtTime(musicTarget(), ctx.currentTime, 0.04)
}

export function isMuted(): boolean {
  return muted
}

export function setMasterVolume(value: number): void {
  masterVolume = Math.min(1, Math.max(0, value))
  if (musicGain && ctx) musicGain.gain.setTargetAtTime(musicTarget(), ctx.currentTime, 0.05)
}

export function getMasterVolume(): number {
  return masterVolume
}
