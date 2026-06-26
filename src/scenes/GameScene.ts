import Phaser from 'phaser'
import {
  GAME,
  CONTAINER,
  DROP,
  TIERS,
  TOP_TIER,
  TOP_TIER_BEHAVIOR,
  TOP_TIER_VANISH_SCORE,
  SCORE,
  JUICE,
} from '../config/tuning'
import { Fruit } from '../objects/Fruit'
import { Dropper } from '../objects/Dropper'
import { playMerge, playDrop, playJackpot, playGameOver } from '../audio/sfx'
import { loadHighScore, saveHighScore } from '../storage'
import { computeLayout } from '../layout'

// The playfield: container, dropper, fruit, the merge loop, and the lose/restart
// game loop. The HUD and overlays live in UIScene, which reads this scene's
// state through the public getters below (a simple per-frame pull, no event
// wiring to leak).
export class GameScene extends Phaser.Scene {
  private fruits = new Set<Fruit>()
  private dropper!: Dropper

  private pendingMerges: Array<{ a: Fruit; b: Fruit }> = []

  private score = 0
  private highScore = 0
  private biggestTier = 0 // highest tier reached this run
  private comboCount = 0
  private comboTimer = 0

  private gameOver = false
  private paused = false
  private loseLine!: Phaser.GameObjects.Graphics

  constructor() {
    super('GameScene')
  }

  create(): void {
    this.highScore = loadHighScore()
    this.score = 0
    this.biggestTier = 0
    this.comboCount = 0
    this.comboTimer = 0
    this.gameOver = false
    this.paused = false

    // Phaser reuses the scene instance + its Matter world across restarts (e.g.
    // Home → Play), and class-field initializers only run once at construction.
    // Explicitly clear anything left from a previous game: stale Fruit refs
    // (their images are already destroyed → null bodies), queued merges, leftover
    // physics bodies, and the collision listener.
    this.fruits.clear()
    this.pendingMerges = []
    this.matter.world.off('collisionstart', this.onCollisionStart, this)
    for (const body of this.matter.getMatterBodies()) {
      this.matter.world.remove(body)
    }

    // Board backdrop filling the fixed 540×960 world the camera frames.
    this.add.rectangle(0, 0, GAME.width, GAME.height, 0x202028).setOrigin(0).setDepth(-1000)

    this.buildContainer()
    this.drawLoseLine()

    this.dropper = new Dropper(this, (x, tier) => this.releaseFruit(x, tier))

    this.matter.world.on('collisionstart', this.onCollisionStart, this)

    this.input.keyboard?.on('keydown-R', () => this.restartGame())
    this.input.keyboard?.on('keydown-ESC', () => this.togglePause())

    // Layer the HUD/overlay scene on top.
    this.scene.launch('UIScene')

    this.applyLayout()
    this.scale.on('resize', this.applyLayout, this)
    this.events.once('shutdown', () => this.scale.off('resize', this.applyLayout, this))
  }

  // Frame the fixed 540×960 world into the centered board rect for the current
  // window size (camera viewport + zoom). The physics world itself never moves.
  private applyLayout(): void {
    const layout = computeLayout(this.scale.width, this.scale.height)
    const cam = this.cameras.main
    cam.setViewport(layout.board.x, layout.board.y, layout.board.w, layout.board.h)
    cam.setZoom(layout.scale)
    cam.centerOn(GAME.width / 2, GAME.height / 2)
  }

  update(time: number, delta: number): void {
    if (this.gameOver || this.paused) return
    this.dropper.update(time, delta)
    if (this.pendingMerges.length > 0) this.processMerges()
    this.checkLose(delta)
    if (this.comboTimer > 0) {
      this.comboTimer -= delta
      if (this.comboTimer <= 0) this.comboCount = 0
    }
  }

  // --- Public state for the UI scene ----------------------------------------

  getScore(): number {
    return this.score
  }

  getBest(): number {
    return this.highScore
  }

  getNextTier(): number {
    return this.dropper ? this.dropper.getNextTier() : 0
  }

  getBiggest(): number {
    return this.biggestTier
  }

  isPaused(): boolean {
    return this.paused
  }

  isGameOver(): boolean {
    return this.gameOver
  }

  togglePause(): void {
    if (this.gameOver) return
    this.paused = !this.paused
    if (this.paused) {
      this.matter.world.pause()
      this.dropper.setEnabled(false)
    } else {
      this.matter.world.resume()
      this.dropper.setEnabled(true)
    }
  }

  // Clear the board, score, and dropper in place (no scene restart, so the
  // collision listener is never re-registered — avoids leaks/double-merges).
  restartGame(): void {
    this.gameOver = false
    this.paused = false
    this.loseLine.setAlpha(0.4)
    this.matter.world.resume()

    this.pendingMerges = []
    for (const fruit of this.fruits) {
      this.tweens.killTweensOf(fruit.image)
      fruit.destroy()
    }
    this.fruits.clear()

    this.score = 0
    this.biggestTier = 0
    this.comboCount = 0
    this.comboTimer = 0
    this.dropper.setEnabled(true)
    this.dropper.reset()
  }

  // Return to the title screen, preserving a new high score if quitting mid-run.
  goHome(): void {
    if (this.score > this.highScore) {
      this.highScore = this.score
      saveHighScore(this.highScore)
    }
    this.scene.stop('UIScene')
    this.scene.start('TitleScene')
  }

  // --- Merge mechanic -------------------------------------------------------

  private onCollisionStart(event: Phaser.Physics.Matter.Events.CollisionStartEvent): void {
    if (this.gameOver || this.paused) return
    for (const pair of event.pairs) {
      const a = this.fruitFromBody(pair.bodyA)
      const b = this.fruitFromBody(pair.bodyB)

      // Both must be fruits, distinct, same tier, and neither already claimed by
      // a merge this frame. The `merging` flag is the double-processing guard.
      if (!a || !b || a === b) continue
      if (a.merging || b.merging) continue
      if (a.tier !== b.tier) continue

      a.merging = true
      b.merging = true
      this.pendingMerges.push({ a, b })
    }
  }

  private processMerges(): void {
    const merges = this.pendingMerges
    this.pendingMerges = []
    let lastMx = 0
    let lastMy = 0

    for (const { a, b } of merges) {
      const mx = (a.x + b.x) / 2
      const my = (a.y + b.y) / 2
      const tier = a.tier
      lastMx = mx
      lastMy = my

      this.removeFruit(a)
      this.removeFruit(b)

      let producedTier: number
      let points: number
      let jackpot = false

      if (tier >= TOP_TIER) {
        producedTier = TOP_TIER
        if (TOP_TIER_BEHAVIOR === 'capstone') {
          this.spawnFruit(mx, my, TOP_TIER)
          points = TIERS[TOP_TIER].score
        } else {
          points = TOP_TIER_VANISH_SCORE
          jackpot = true
        }
      } else {
        producedTier = tier + 1
        this.spawnFruit(mx, my, producedTier)
        points = TIERS[tier].score
      }

      this.addScore(points)
      try {
        this.mergeFx(mx, my, producedTier, points, jackpot)
      } catch (err) {
        console.error('mergeFx error', err)
      }
    }

    // Combo: chained merges from one drop ramp a counter; show a popup once it's
    // a real chain (2+). It resets after a quiet window (see update()).
    if (merges.length > 0) {
      this.comboCount += merges.length
      this.comboTimer = JUICE.comboWindowMs
      if (this.comboCount >= 2) this.comboPopup(lastMx, lastMy, this.comboCount)
    }

    // Removing bodies can leave asleep neighbours unsupported (floating) or
    // overlapping; wake everything so the pile re-settles cleanly.
    this.wakeAll()
  }

  private comboPopup(x: number, y: number, count: number): void {
    const label = this.add
      .text(x, y - 30, `Combo ×${count}!`, {
        fontFamily: 'sans-serif',
        fontSize: `${20 + count * 4}px`,
        color: '#ffe066',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(1100)
    this.tweens.add({
      targets: label,
      y: y - 80,
      alpha: { from: 1, to: 0 },
      scale: { from: 0.8, to: 1.2 },
      duration: JUICE.comboPopupDuration,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy(),
    })
  }

  private fruitFromBody(body: MatterJS.BodyType): Fruit | null {
    const go = (body as unknown as { gameObject?: Phaser.GameObjects.GameObject }).gameObject
    if (!go) return null
    return (go.getData('fruit') as Fruit) ?? null
  }

  private addScore(points: number): void {
    this.score += points * SCORE.multiplier
  }

  // --- Lose condition -------------------------------------------------------

  private drawLoseLine(): void {
    const { marginX, loseLineY } = CONTAINER
    const g = this.add.graphics().setDepth(50)
    g.lineStyle(3, 0xff5555, 1)
    const x0 = marginX
    const x1 = GAME.width - marginX
    const dash = 12
    const gap = 8
    for (let x = x0; x < x1; x += dash + gap) {
      g.lineBetween(x, loseLineY, Math.min(x + dash, x1), loseLineY)
    }
    g.setAlpha(0.4)
    this.loseLine = g
  }

  // A fruit "overflows" when its top pokes above the lose line AND it has nearly
  // settled there (so a fast bounce or a freshly dropped fruit doesn't count).
  // Only sustained overflow past the grace period ends the run.
  // Each fruit accumulates the time its top stays above the lose line, resetting
  // only when it drops back below. Motion no longer matters, so an overflowing
  // pile triggers reliably even while merges keep it jostling — and a fast
  // dropped fruit (above the line only briefly) stays safe.
  private checkLose(deltaMs: number): void {
    const line = CONTAINER.loseLineY
    let worst = 0

    for (const fruit of this.fruits) {
      const r = TIERS[fruit.tier].radius
      if (fruit.y - r < line) {
        fruit.aboveMs += deltaMs
      } else {
        fruit.aboveMs = 0
      }
      if (fruit.aboveMs > worst) worst = fruit.aboveMs
    }

    this.loseLine.setAlpha(0.4 + 0.6 * Math.min(1, worst / CONTAINER.loseGraceMs))
    if (worst >= CONTAINER.loseGraceMs) this.triggerGameOver()
  }

  private triggerGameOver(): void {
    if (this.gameOver) return
    this.gameOver = true
    this.dropper.setEnabled(false)
    this.matter.world.pause()
    playGameOver()

    if (this.score > this.highScore) {
      this.highScore = this.score
      saveHighScore(this.highScore)
    }
  }

  // --- Juice ----------------------------------------------------------------

  private mergeFx(x: number, y: number, producedTier: number, points: number, jackpot = false): void {
    const color = TIERS[producedTier].color
    this.popFlash(x, y, producedTier)
    this.burst(x, y, color)
    this.floatScore(x, y, points, color)
    if (jackpot) {
      playJackpot()
      this.cameras.main.shake(JUICE.shakeDuration * 2, JUICE.shakeIntensity * 1.8)
    } else {
      playMerge(producedTier)
      if (producedTier >= JUICE.shakeFromTier) {
        this.cameras.main.shake(JUICE.shakeDuration, JUICE.shakeIntensity)
      }
    }
  }

  private popFlash(x: number, y: number, tier: number): void {
    const flash = this.add
      .image(x, y, Fruit.textureKey(tier))
      .setTint(0xffffff)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(900)
      .setScale(JUICE.popFrom)
    this.tweens.add({
      targets: flash,
      scale: 1.35,
      alpha: { from: 0.9, to: 0 },
      duration: JUICE.popDuration + 80,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    })
  }

  private burst(x: number, y: number, color: number): void {
    const emitter = this.add.particles(x, y, 'spark', {
      speed: { min: 70, max: 210 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.7, end: 0 },
      lifespan: { min: 250, max: 460 },
      tint: color,
      blendMode: 'ADD',
      emitting: false,
    })
    emitter.explode(JUICE.burstParticles, x, y)
    this.time.delayedCall(520, () => emitter.destroy())
  }

  private floatScore(x: number, y: number, points: number, color: number): void {
    const hex = `#${color.toString(16).padStart(6, '0')}`
    const label = this.add
      .text(x, y, `+${points}`, {
        fontFamily: 'sans-serif',
        fontSize: '22px',
        color: hex,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(1000)
    this.tweens.add({
      targets: label,
      y: y - JUICE.floatScoreRise,
      alpha: { from: 1, to: 0 },
      duration: JUICE.floatScoreDuration,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy(),
    })
  }

  // --- Container + spawning -------------------------------------------------

  private buildContainer(): void {
    const { marginX, top, bottom, wallThickness } = CONTAINER
    const leftX = marginX - wallThickness / 2
    const rightX = GAME.width - marginX + wallThickness / 2
    const wallCY = (top + bottom) / 2
    const wallH = bottom - top + 400
    const floorY = bottom + wallThickness / 2
    const floorW = rightX - leftX + wallThickness

    this.matter.add.rectangle(leftX, wallCY, wallThickness, wallH, { isStatic: true })
    this.matter.add.rectangle(rightX, wallCY, wallThickness, wallH, { isStatic: true })
    this.matter.add.rectangle(GAME.width / 2, floorY, floorW, wallThickness, { isStatic: true })

    const g = this.add.graphics()
    g.fillStyle(0x3a3a48, 1)
    g.fillRect(leftX - wallThickness / 2, top, wallThickness, bottom - top)
    g.fillRect(rightX - wallThickness / 2, top, wallThickness, bottom - top)
    g.fillRect(leftX - wallThickness / 2, bottom, floorW, wallThickness)
  }

  private releaseFruit(x: number, tier: number): void {
    playDrop()
    this.spawnFruit(x, DROP.startY, tier)
  }

  private spawnFruit(x: number, y: number, tier: number): Fruit {
    const fruit = new Fruit(this, x, y, tier)
    this.fruits.add(fruit)
    if (tier > this.biggestTier) this.biggestTier = tier
    return fruit
  }

  private removeFruit(fruit: Fruit): void {
    this.fruits.delete(fruit)
    this.tweens.killTweensOf(fruit.image)
    fruit.destroy()
  }

  private wakeAll(): void {
    for (const fruit of this.fruits) {
      fruit.image.setAwake()
    }
  }
}
