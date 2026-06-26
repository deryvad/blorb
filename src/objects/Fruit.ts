import Phaser from 'phaser'
import { TIERS, PHYSICS } from '../config/tuning'

// Monotonic id so every fruit is uniquely identifiable (used by the Phase 3
// merge guard to process each collision pair exactly once).
let nextFruitId = 1

// One distinct shape per tier, baked into the bubble. This is a colour-blind
// accessibility aid: tiers stay readable by SHAPE even when colour is lost (and
// it gives the bubbles a bit of Suika-style character). Index === tier.
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

  static textureKey(tier: number): string {
    return `fruit-${tier}`
  }

  // Pre-generate one circle texture per tier. Call once during boot.
  static makeTextures(scene: Phaser.Scene): void {
    TIERS.forEach((def, tier) => {
      const key = Fruit.textureKey(tier)
      if (scene.textures.exists(key)) return

      const d = def.radius * 2
      const g = scene.add.graphics()
      g.fillStyle(def.color, 1)
      g.fillCircle(def.radius, def.radius, def.radius)
      // Soft highlight for depth + a subtle dark rim for tier readability.
      g.fillStyle(0xffffff, 0.18)
      g.fillCircle(def.radius * 0.68, def.radius * 0.68, def.radius * 0.32)
      g.lineStyle(2, 0x000000, 0.22)
      g.strokeCircle(def.radius, def.radius, def.radius - 1)

      // Tier shape — a colour-independent channel. Drawn in a tone that
      // contrasts with the bubble (dark on light bubbles, white on dark).
      const kind = TIER_SHAPES[tier]
      if (kind) {
        const r = (def.color >> 16) & 0xff
        const gg = (def.color >> 8) & 0xff
        const b = def.color & 0xff
        const light = 0.2126 * r + 0.7152 * gg + 0.0722 * b > 150
        Fruit.drawShape(g, kind, def.radius, def.radius, def.radius * 0.52, light ? 0x141620 : 0xffffff, light ? 0.82 : 0.92)
      }

      g.generateTexture(key, d, d)
      g.destroy()
    })
  }

  // --- Tier shapes ------------------------------------------------------------

  private static regularPoly(cx: number, cy: number, n: number, r: number, rot: number): Phaser.Types.Math.Vector2Like[] {
    const pts: Phaser.Types.Math.Vector2Like[] = []
    for (let i = 0; i < n; i++) {
      const a = rot + (i * 2 * Math.PI) / n
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
    }
    return pts
  }

  private static starPoly(cx: number, cy: number, n: number, ro: number, ri: number): Phaser.Types.Math.Vector2Like[] {
    const pts: Phaser.Types.Math.Vector2Like[] = []
    for (let i = 0; i < 2 * n; i++) {
      const r = i % 2 === 0 ? ro : ri
      const a = -Math.PI / 2 + (i * Math.PI) / n
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
    }
    return pts
  }

  // Draw one tier shape centred at (cx, cy), sized to extent `s`, into `g`.
  private static drawShape(
    g: Phaser.GameObjects.Graphics,
    kind: string,
    cx: number,
    cy: number,
    s: number,
    color: number,
    alpha: number,
  ): void {
    g.fillStyle(color, alpha)
    switch (kind) {
      case 'dot':
        g.fillCircle(cx, cy, s * 0.9)
        break
      case 'ring':
        g.lineStyle(s * 0.42, color, alpha)
        g.strokeCircle(cx, cy, s * 0.72)
        break
      case 'triangle':
        g.fillPoints(Fruit.regularPoly(cx, cy, 3, s, -Math.PI / 2), true)
        break
      case 'square': {
        const w = s * 1.46
        g.fillRoundedRect(cx - w / 2, cy - w / 2, w, w, s * 0.2)
        break
      }
      case 'diamond':
        g.fillPoints(Fruit.regularPoly(cx, cy, 4, s * 1.08, -Math.PI / 2), true)
        break
      case 'hexagon':
        g.fillPoints(Fruit.regularPoly(cx, cy, 6, s, Math.PI / 6), true)
        break
      case 'star':
        g.fillPoints(Fruit.starPoly(cx, cy, 5, s, s * 0.44), true)
        break
      case 'plus': {
        const a = s * 0.38
        const b = s
        g.fillPoints(
          [
            { x: cx - a, y: cy - b }, { x: cx + a, y: cy - b }, { x: cx + a, y: cy - a }, { x: cx + b, y: cy - a },
            { x: cx + b, y: cy + a }, { x: cx + a, y: cy + a }, { x: cx + a, y: cy + b }, { x: cx - a, y: cy + b },
            { x: cx - a, y: cy + a }, { x: cx - b, y: cy + a }, { x: cx - b, y: cy - a }, { x: cx - a, y: cy - a },
          ],
          true,
        )
        break
      }
      case 'heart': {
        const lobe = s * 0.5
        const ly = cy - s * 0.16
        g.fillCircle(cx - lobe * 0.72, ly, lobe)
        g.fillCircle(cx + lobe * 0.72, ly, lobe)
        g.fillTriangle(cx - s * 0.96, ly + lobe * 0.2, cx + s * 0.96, ly + lobe * 0.2, cx, cy + s)
        break
      }
      case 'flower': {
        const petal = s * 0.46
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3
          g.fillCircle(cx + Math.cos(a) * s * 0.6, cy + Math.sin(a) * s * 0.6, petal)
        }
        g.fillCircle(cx, cy, petal)
        break
      }
      case 'sun': {
        g.fillCircle(cx, cy, s * 0.56)
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4
          g.fillTriangle(
            cx + Math.cos(a) * s * 1.06, cy + Math.sin(a) * s * 1.06,
            cx + Math.cos(a - 0.22) * s * 0.6, cy + Math.sin(a - 0.22) * s * 0.6,
            cx + Math.cos(a + 0.22) * s * 0.6, cy + Math.sin(a + 0.22) * s * 0.6,
          )
        }
        break
      }
    }
  }
}
