import Phaser from 'phaser'
import { TIERS, PHYSICS } from '../config/tuning'
import { isColorblind } from '../colorblind'

// Monotonic id so every fruit is uniquely identifiable (used by the Phase 3
// merge guard to process each collision pair exactly once).
let nextFruitId = 1

// One distinct shape per tier (index === tier). Used only by the Colorblind
// texture set as a colour-independent way to tell tiers apart.
const TIER_SHAPES = [
  'dot', 'ring', 'triangle', 'square', 'diamond', 'hexagon', 'star', 'plus', 'heart', 'flower', 'sun',
] as const

// --- shape geometry, in a 100x100 design space (centred on 50,50) ---
type Pt = { x: number; y: number }
function regularPoly(n: number, cx: number, cy: number, rad: number, rot: number): Pt[] {
  const p: Pt[] = []
  for (let i = 0; i < n; i++) {
    const a = rot + (i * 2 * Math.PI) / n
    p.push({ x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) })
  }
  return p
}
function starPoly(n: number, cx: number, cy: number, ro: number, ri: number): Pt[] {
  const p: Pt[] = []
  for (let i = 0; i < 2 * n; i++) {
    const r = i % 2 === 0 ? ro : ri
    const a = -Math.PI / 2 + (i * Math.PI) / n
    p.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
  }
  return p
}
const PLUS_PTS: Pt[] = [
  { x: 43, y: 24 }, { x: 57, y: 24 }, { x: 57, y: 43 }, { x: 76, y: 43 },
  { x: 76, y: 57 }, { x: 57, y: 57 }, { x: 57, y: 76 }, { x: 43, y: 76 },
  { x: 43, y: 57 }, { x: 24, y: 57 }, { x: 24, y: 43 }, { x: 43, y: 43 },
]

// A Fruit owns a Matter circle body and its visual. Phaser's Matter integration
// keeps the image locked to the body's position + rotation every frame, so we
// never sync transforms by hand.
export class Fruit {
  readonly id: number
  readonly tier: number
  readonly image: Phaser.Physics.Matter.Image

  // Phase 3 guard: set the instant this fruit is consumed by a merge so a second
  // collision callback in the same step can't double-process it.
  merging = false

  // Phase 5: ms its top has stayed continuously above the lose line (resets when
  // it drops back below). Sustained overflow past the grace period ends the run.
  aboveMs = 0

  constructor(scene: Phaser.Scene, x: number, y: number, tier: number) {
    this.id = nextFruitId++
    this.tier = tier

    const def = TIERS[tier]
    this.image = scene.matter.add.image(x, y, Fruit.textureKey(tier), undefined, {
      shape: { type: 'circle', radius: def.radius },
      restitution: PHYSICS.restitution,
      friction: PHYSICS.friction,
      frictionStatic: PHYSICS.frictionStatic,
      frictionAir: PHYSICS.frictionAir,
      density: PHYSICS.density,
      sleepThreshold: PHYSICS.sleepThreshold,
    })

    // Back-references so a Matter body can be resolved back to its Fruit during
    // collision handling (body.gameObject -> getData('fruit')).
    this.image.setData('fruit', this)
    this.image.setName(`fruit-${this.id}`)
  }

  get x(): number {
    return this.image.x
  }

  get y(): number {
    return this.image.y
  }

  get body(): MatterJS.BodyType {
    return this.image.body as MatterJS.BodyType
  }

  // Remove the physics body and the visual together.
  destroy(): void {
    this.image.destroy()
  }

  // The texture for `tier` in the CURRENT colour mode. Colorblind mode swaps to
  // the shaped set; callers re-resolve this (and setTexture) when it toggles.
  static textureKey(tier: number): string {
    return (isColorblind() ? 'fruit-cb-' : 'fruit-') + tier
  }

  // Pre-generate BOTH texture sets per tier (plain + shaped) once during boot, so
  // toggling Colorblind mode is a free texture swap with no regeneration.
  static makeTextures(scene: Phaser.Scene): void {
    TIERS.forEach((def, tier) => {
      const key = `fruit-${tier}`
      if (!scene.textures.exists(key)) {
        const d = def.radius * 2
        const g = scene.add.graphics()
        g.fillStyle(def.color, 1)
        g.fillCircle(def.radius, def.radius, def.radius)
        // Soft highlight for depth + a subtle dark rim for tier readability.
        g.fillStyle(0xffffff, 0.18)
        g.fillCircle(def.radius * 0.68, def.radius * 0.68, def.radius * 0.32)
        g.lineStyle(2, 0x000000, 0.22)
        g.strokeCircle(def.radius, def.radius, def.radius - 1)
        g.generateTexture(key, d, d)
        g.destroy()
      }
      Fruit.makeShapedTexture(scene, tier, def.radius, def.color)
    })
  }

  // The Colorblind variant: the same bubble, plus a translucent + outlined tier
  // shape (so the bubble shows through — it reads as an emblem, not a hole).
  private static makeShapedTexture(scene: Phaser.Scene, tier: number, radius: number, color: number): void {
    const key = `fruit-cb-${tier}`
    if (scene.textures.exists(key)) return
    const r = radius
    const d = r * 2
    const tex = scene.textures.createCanvas(key, d, d)
    if (!tex) return
    const ctx = tex.context

    // Bubble body + highlight + rim — mirrors the plain texture.
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0')
    ctx.beginPath()
    ctx.arc(r, r, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.beginPath()
    ctx.arc(r * 0.68, r * 0.68, r * 0.32, 0, Math.PI * 2)
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'
    ctx.beginPath()
    ctx.arc(r, r, r - 1, 0, Math.PI * 2)
    ctx.stroke()

    Fruit.drawShape(ctx, TIER_SHAPES[tier], color, r)
    tex.refresh()
  }

  // Draw one tier shape into the bubble canvas, in a tone that contrasts with the
  // bubble (dark on light bubbles, white on dark), translucent + outlined.
  private static drawShape(ctx: CanvasRenderingContext2D, kind: string, bubbleColor: number, r: number): void {
    const cr = (bubbleColor >> 16) & 0xff
    const cg = (bubbleColor >> 8) & 0xff
    const cb = bubbleColor & 0xff
    const base = 0.2126 * cr + 0.7152 * cg + 0.0722 * cb > 150 ? '18,20,28' : '255,255,255'
    const fill = `rgba(${base},0.40)`
    const stroke = `rgba(${base},0.85)`
    const d = r * 2

    ctx.save()
    ctx.translate(0.2 * d, 0.2 * d) // shape occupies the centre ~60% of the bubble
    ctx.scale((0.6 * d) / 100, (0.6 * d) / 100)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.lineWidth = 6
    ctx.fillStyle = fill
    ctx.strokeStyle = stroke

    const poly = (pts: Pt[]): void => {
      ctx.beginPath()
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }
    const disc = (x: number, y: number, rad: number): void => {
      ctx.beginPath()
      ctx.arc(x, y, rad, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }

    switch (kind) {
      case 'dot':
        ctx.fillStyle = stroke
        ctx.beginPath()
        ctx.arc(50, 50, 21, 0, Math.PI * 2)
        ctx.fill()
        break
      case 'ring':
        ctx.lineWidth = 11
        ctx.beginPath()
        ctx.arc(50, 50, 25, 0, Math.PI * 2)
        ctx.stroke()
        break
      case 'triangle':
        poly([{ x: 50, y: 23 }, { x: 77, y: 71 }, { x: 23, y: 71 }])
        break
      case 'square':
        ctx.beginPath()
        ctx.rect(28, 28, 44, 44)
        ctx.fill()
        ctx.stroke()
        break
      case 'diamond':
        poly([{ x: 50, y: 20 }, { x: 78, y: 50 }, { x: 50, y: 80 }, { x: 22, y: 50 }])
        break
      case 'hexagon':
        poly(regularPoly(6, 50, 50, 28, Math.PI / 6))
        break
      case 'star':
        poly(starPoly(5, 50, 50, 30, 14))
        break
      case 'plus':
        poly(PLUS_PTS)
        break
      case 'heart': {
        const p = new Path2D('M50 75 C20 52 24 28 41 30 C49 31 50 38 50 40 C50 38 51 31 59 30 C76 28 80 52 50 75 Z')
        ctx.fill(p)
        ctx.stroke(p)
        break
      }
      case 'flower':
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3
          disc(50 + 16 * Math.cos(a), 50 + 16 * Math.sin(a), 12)
        }
        disc(50, 50, 12)
        break
      case 'sun':
        disc(50, 50, 15)
        ctx.lineWidth = 7
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4
          ctx.beginPath()
          ctx.moveTo(50 + 19 * Math.cos(a), 50 + 19 * Math.sin(a))
          ctx.lineTo(50 + 30 * Math.cos(a), 50 + 30 * Math.sin(a))
          ctx.stroke()
        }
        break
    }
    ctx.restore()
  }
}
