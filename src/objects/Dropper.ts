import Phaser from 'phaser'
import { GAME, CONTAINER, DROP, TIERS, SPAWN_WEIGHTS } from '../config/tuning'
import { Fruit } from './Fruit'

// The Dropper holds the "current" fruit at the top as a plain (non-simulated)
// image that follows keyboard/pointer input. On release it hands off to a
// callback that spawns a real dynamic Fruit, then — after a cooldown — loads the
// next fruit. It chooses tiers weighted toward the smallest and exposes the
// upcoming tier (the UI scene reads it for the NEXT preview).
export class Dropper {
  private static readonly MOVE_SPEED = 520 // px/sec for keyboard movement

  private readonly scene: Phaser.Scene
  private readonly onRelease: (x: number, tier: number) => void

  private held!: Phaser.GameObjects.Image
  private guide!: Phaser.GameObjects.Rectangle

  private heldTier = 0
  private nextTier = 0
  private posX: number
  private locked = true // true during cooldown / before the first fruit loads
  private enabled = true // false while paused or game over (input frozen)
  private cooldownTimer: Phaser.Time.TimerEvent | null = null

  private keys!: {
    left: Phaser.Input.Keyboard.Key
    right: Phaser.Input.Keyboard.Key
    a: Phaser.Input.Keyboard.Key
    d: Phaser.Input.Keyboard.Key
  }

  constructor(scene: Phaser.Scene, onRelease: (x: number, tier: number) => void) {
    this.scene = scene
    this.onRelease = onRelease
    this.posX = GAME.width / 2

    this.createVisuals()
    this.bindInput()
    this.loadNext(true)
  }

  getNextTier(): number {
    return this.nextTier
  }

  private createVisuals(): void {
    // Faint vertical guide showing the drop column.
    this.guide = this.scene.add
      .rectangle(
        this.posX,
        (DROP.startY + CONTAINER.bottom) / 2,
        2,
        CONTAINER.bottom - DROP.startY,
        0xffffff,
        0.08,
      )
      .setOrigin(0.5)

    // The held (non-simulated) fruit visual.
    this.held = this.scene.add.image(this.posX, DROP.startY, Fruit.textureKey(0)).setVisible(false)
  }

  private bindInput(): void {
    const kb = this.scene.input.keyboard!
    this.keys = {
      left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      a: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      d: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    }

    kb.on('keydown-SPACE', this.drop, this)
    kb.on('keydown-DOWN', this.drop, this)

    this.scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.posX = this.scene.cameras.main.getWorldPoint(p.x, p.y).x
    })
    this.scene.input.on('pointerdown', this.onPointerDown, this)
  }

  // A click drops only when it lands inside the board (not a side panel/gutter)
  // and not on a UI button in the overlay scene.
  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    const ui = this.scene.scene.get('UIScene')
    if (ui && ui.input && ui.input.hitTestPointer(pointer).length > 0) return
    const wx = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y).x
    if (wx < 0 || wx > GAME.width) return
    this.drop()
  }

  private clampX(): void {
    const r = TIERS[this.heldTier].radius
    const min = CONTAINER.marginX + r
    const max = GAME.width - CONTAINER.marginX - r
    this.posX = Phaser.Math.Clamp(this.posX, min, max)
  }

  update(_time: number, deltaMs: number): void {
    if (!this.enabled) return
    if (this.held.visible) {
      const dt = deltaMs / 1000
      const left = this.keys.left.isDown || this.keys.a.isDown
      const right = this.keys.right.isDown || this.keys.d.isDown
      if (left) this.posX -= Dropper.MOVE_SPEED * dt
      if (right) this.posX += Dropper.MOVE_SPEED * dt
    }
    this.clampX()
    this.held.setPosition(this.posX, DROP.startY)
    this.guide.setX(this.posX)
  }

  private drop(): void {
    if (!this.enabled || this.locked || !this.held.visible) return
    this.clampX()
    const x = this.posX
    const tier = this.heldTier

    this.held.setVisible(false)
    this.guide.setVisible(false)
    this.locked = true

    this.onRelease(x, tier)

    this.cooldownTimer = this.scene.time.delayedCall(DROP.cooldownMs, () => {
      this.cooldownTimer = null
      this.loadNext(false)
    })
  }

  // Reset to a fresh held + next fruit (used on game restart). Does NOT re-bind
  // input — those listeners live for the scene's lifetime.
  reset(): void {
    if (this.cooldownTimer) {
      this.cooldownTimer.remove(false)
      this.cooldownTimer = null
    }
    this.enabled = true
    this.posX = GAME.width / 2
    this.locked = true
    this.loadNext(true)
  }

  // Freeze/unfreeze player control (used on pause / game over). Visuals stay put
  // and are covered by the relevant overlay.
  setEnabled(value: boolean): void {
    this.enabled = value
  }

  private loadNext(first: boolean): void {
    this.heldTier = first ? Dropper.pickTier() : this.nextTier
    this.nextTier = Dropper.pickTier()

    this.held.setTexture(Fruit.textureKey(this.heldTier)).setVisible(true)
    this.guide.setVisible(true)

    this.clampX()
    this.held.setPosition(this.posX, DROP.startY)
    this.locked = false
  }

  // Weighted random tier, biased toward the smallest. Only tiers covered by
  // SPAWN_WEIGHTS can ever come from the dropper.
  private static pickTier(): number {
    const total = SPAWN_WEIGHTS.reduce((a, b) => a + b, 0)
    let r = Math.random() * total
    for (let t = 0; t < SPAWN_WEIGHTS.length; t++) {
      r -= SPAWN_WEIGHTS[t]
      if (r < 0) return t
    }
    return 0
  }
}
