import Phaser from 'phaser'
import { TIERS, PHYSICS } from '../config/tuning'

// Monotonic id so every fruit is uniquely identifiable (used by the Phase 3
// merge guard to process each collision pair exactly once).
let nextFruitId = 1

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
      g.generateTexture(key, d, d)
      g.destroy()
    })
  }
}
