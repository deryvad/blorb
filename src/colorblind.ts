// Colorblind mode: an opt-in accessibility toggle. When on, each bubble shows a
// distinct tier SHAPE (a colour-independent channel) by swapping to a second
// texture set. Default off, so the standard look is untouched.
//
// Tiny pub/sub so any scene showing bubbles can re-skin its live objects the
// instant the toggle flips, without event wiring through Phaser.

import { loadColorblind, saveColorblind } from './storage'

let on = loadColorblind()
const subscribers = new Set<() => void>()

export function isColorblind(): boolean {
  return on
}

export function setColorblind(value: boolean): void {
  if (value === on) return
  on = value
  saveColorblind(value)
  for (const fn of subscribers) fn()
}

// Subscribe to toggle changes; returns an unsubscribe function (call on shutdown).
export function onColorblindChange(fn: () => void): () => void {
  subscribers.add(fn)
  return () => {
    subscribers.delete(fn)
  }
}
