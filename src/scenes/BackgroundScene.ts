import Phaser from 'phaser'
import { Fruit } from '../objects/Fruit'

// Ambient backdrop that sits behind every other scene: a soft vertical gradient
// plus faint, slowly drifting bubbles, so the window (gutters included) feels
// alive instead of an empty void. Pure atmosphere — no interaction.
export class BackgroundScene extends Phaser.Scene {
  private bg!: Phaser.GameObjects.Graphics
  private bubbles: { img: Phaser.GameObjects.Image; vx: number; vy: number; spin: number }[] = []

  constructor() {
    super({ key: 'BackgroundScene', active: false })
  }

  create(): void {
    this.bg = this.add.graphics().setDepth(-100)
    this.drawGradient()
    this.spawnBubbles()
    this.scale.on('resize', () => this.drawGradient())
  }

  private drawGradient(): void {
    const W = this.scale.width
    const H = this.scale.height
    this.bg.clear()
    this.bg.fillGradientStyle(0x1b1b24, 0x1b1b24, 0x0e0e12, 0x0e0e12, 1)
    this.bg.fillRect(0, 0, W, H)
  }

  private spawnBubbles(): void {
    const W = this.scale.width
    const H = this.scale.height
    const count = 20
    for (let i = 0; i < count; i++) {
      const tier = Phaser.Math.Between(2, 8)
      const img = this.add
        .image(Phaser.Math.Between(0, W), Phaser.Math.Between(0, H), Fruit.textureKey(tier))
        .setAlpha(Phaser.Math.FloatBetween(0.03, 0.08))
        .setScale(Phaser.Math.FloatBetween(0.4, 1.1))
        .setDepth(-90)
      this.bubbles.push({
        img,
        vx: Phaser.Math.FloatBetween(-4, 4),
        vy: -Phaser.Math.FloatBetween(5, 16),
        spin: Phaser.Math.FloatBetween(-0.2, 0.2),
      })
    }
  }

  update(_time: number, deltaMs: number): void {
    const W = this.scale.width
    const H = this.scale.height
    const d = deltaMs / 1000
    for (const b of this.bubbles) {
      b.img.x += b.vx * d
      b.img.y += b.vy * d
      b.img.angle += b.spin
      if (b.img.y < -60) {
        b.img.y = H + 60
        b.img.x = Phaser.Math.Between(0, W)
      }
      if (b.img.x < -60) b.img.x = W + 60
      else if (b.img.x > W + 60) b.img.x = -60
    }
  }
}
