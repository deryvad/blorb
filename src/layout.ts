import { GAME } from './config/tuning'

// Responsive layout calculator. The play board is a fixed 540×960 world; given
// the current window size we compute where that board sits on screen (centered,
// fit to height) and whether there's enough horizontal room for side panels
// (landscape) or not (portrait — HUD overlays the board).

export type LayoutMode = 'portrait' | 'landscape'

export interface Layout {
  mode: LayoutMode
  scale: number
  board: { x: number; y: number; w: number; h: number }
  gutter: number // width of each side gutter in px (0-ish in portrait)
}

// A gutter at least this wide (px) earns a real side panel → landscape.
const LANDSCAPE_GUTTER = 170

export function computeLayout(winW: number, winH: number): Layout {
  const BW = GAME.width
  const BH = GAME.height

  // Fit the (tall) board to the window height, then clamp so it never exceeds
  // the window width.
  let scale = (winH * 0.96) / BH
  if (BW * scale > winW * 0.98) scale = (winW * 0.98) / BW

  const w = BW * scale
  const h = BH * scale
  const x = (winW - w) / 2
  const y = (winH - h) / 2
  const gutter = (winW - w) / 2

  const mode: LayoutMode = gutter >= LANDSCAPE_GUTTER ? 'landscape' : 'portrait'

  return { mode, scale, board: { x, y, w, h }, gutter }
}
