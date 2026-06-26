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

  // The Colorblind variant: the same bubble, plus a tier shape DEBOSSED into it
  // (shadow on the top edge, highlight on the bottom, transparent centre, no
  // border) — so it reads as pressed in, not stuck on.
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

    Fruit.drawDebossedShape(ctx, TIER_SHAPES[tier], r)
    tex.refresh()
  }

  // Trace one tier shape as a filled silhouette in a 100x100 design space
  // (centred on 50,50). Caller supplies the transform + fill.
  private static traceShape(o: CanvasRenderingContext2D, kind: string): void {
    const P = Math.PI
    o.beginPath()
    switch (kind) {
      case 'ring':
        o.arc(50, 50, 26, 0, 2 * P, false)
        o.arc(50, 50, 15, 0, 2 * P, true) // inner hole (annulus)
        break
      case 'triangle':
        o.moveTo(50, 23)
        o.lineTo(77, 71)
        o.lineTo(23, 71)
        o.closePath()
        break
      case 'square':
        o.rect(28, 28, 44, 44)
        break
      case 'diamond':
        o.moveTo(50, 20)
        o.lineTo(78, 50)
        o.lineTo(50, 80)
        o.lineTo(22, 50)
        o.closePath()
        break
      case 'hexagon':
        for (let i = 0; i < 6; i++) {
          const a = P / 6 + (i * 2 * P) / 6
          const x = 50 + 28 * Math.cos(a)
          const y = 50 + 28 * Math.sin(a)
          i ? o.lineTo(x, y) : o.moveTo(x, y)
        }
        o.closePath()
        break
      case 'star':
        for (let i = 0; i < 10; i++) {
          const rad = i % 2 === 0 ? 31 : 14
          const a = -P / 2 + (i * P) / 5
          const x = 50 + rad * Math.cos(a)
          const y = 50 + rad * Math.sin(a)
          i ? o.lineTo(x, y) : o.moveTo(x, y)
        }
        o.closePath()
        break
      case 'plus': {
        const pts = [
          [43, 24], [57, 24], [57, 43], [76, 43], [76, 57], [57, 57],
          [57, 76], [43, 76], [43, 57], [24, 57], [24, 43], [43, 43],
        ]
        pts.forEach((p, i) => (i ? o.lineTo(p[0], p[1]) : o.moveTo(p[0], p[1])))
        o.closePath()
        break
      }
      case 'heart':
        o.moveTo(50, 75)
        o.bezierCurveTo(20, 52, 24, 28, 41, 30)
        o.bezierCurveTo(49, 31, 50, 38, 50, 40)
        o.bezierCurveTo(50, 38, 51, 31, 59, 30)
        o.bezierCurveTo(76, 28, 80, 52, 50, 75)
        o.closePath()
        break
      case 'flower':
        for (let i = 0; i < 6; i++) {
          const a = (i * P) / 3
          const cx = 50 + 16 * Math.cos(a)
          const cy = 50 + 16 * Math.sin(a)
          o.moveTo(cx + 12, cy)
          o.arc(cx, cy, 12, 0, 2 * P)
        }
        o.moveTo(62, 50)
        o.arc(50, 50, 12, 0, 2 * P)
        break
      case 'sun':
        o.moveTo(65, 50)
        o.arc(50, 50, 15, 0, 2 * P)
        for (let i = 0; i < 8; i++) {
          const a = (i * P) / 4
          o.moveTo(50 + 30 * Math.cos(a), 50 + 30 * Math.sin(a))
          o.lineTo(50 + 18 * Math.cos(a - 0.25), 50 + 18 * Math.sin(a - 0.25))
          o.lineTo(50 + 18 * Math.cos(a + 0.25), 50 + 18 * Math.sin(a + 0.25))
          o.closePath()
        }
        break
    }
  }

  // Composite a debossed shape onto the bubble: build it on a separate layer
  // (so the centre-erase doesn't cut into the bubble), then stamp it on.
  private static drawDebossedShape(ctx: CanvasRenderingContext2D, kind: string, r: number): void {
    const d = r * 2
    const layer = document.createElement('canvas')
    layer.width = d
    layer.height = d
    const o = layer.getContext('2d')
    if (!o) return

    o.translate(0.2 * d, 0.2 * d) // shape occupies the centre ~60% of the bubble
    o.scale((0.6 * d) / 100, (0.6 * d) / 100)
    o.lineJoin = 'round'
    o.lineCap = 'round'

    if (kind === 'dot') {
      // Solid recessed disc (kept solid so it stays distinct from the ring).
      o.fillStyle = 'rgba(0,0,0,0.13)'
      o.beginPath()
      o.arc(50, 50, 23, 0, Math.PI * 2)
      o.fill()
      o.lineWidth = 7
      o.strokeStyle = 'rgba(0,0,0,0.42)'
      o.beginPath()
      o.arc(50, 50, 21, Math.PI * 1.12, Math.PI * 1.88) // shadowed top rim
      o.stroke()
      o.strokeStyle = 'rgba(255,255,255,0.6)'
      o.beginPath()
      o.arc(50, 50, 21, Math.PI * 0.12, Math.PI * 0.88) // lit bottom rim
      o.stroke()
    } else {
      // Highlight (bottom-right) + shadow (top-left) offset copies, then erase the
      // centre so only the bevelled edges remain — a pressed-in groove, no border.
      const off = 6
      o.save()
      o.translate(off, off)
      o.fillStyle = 'rgba(255,255,255,0.75)'
      Fruit.traceShape(o, kind)
      o.fill()
      o.restore()
      o.save()
      o.translate(-off, -off)
      o.fillStyle = 'rgba(0,0,0,0.55)'
      Fruit.traceShape(o, kind)
      o.fill()
      o.restore()
      o.globalCompositeOperation = 'destination-out'
      Fruit.traceShape(o, kind)
      o.fill()
      o.globalCompositeOperation = 'source-over'
    }

    ctx.drawImage(layer, 0, 0)
  }
}
