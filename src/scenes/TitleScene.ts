import Phaser from 'phaser'
import { GAME, TIERS, TOP_TIER } from '../config/tuning'
import { Fruit } from '../objects/Fruit'
import { isMuted, setMuted, getMasterVolume, setMasterVolume } from '../audio/sfx'
import { loadHighScore, saveMuted, saveVolume } from '../storage'
import { openLeaderboard, leaderboardEnabled } from '../leaderboardUI'

// Title screen. Built at a fixed 540×960 "design" size inside a container, then
// centered + scaled to fit any window (responsive) in applyLayout().
export class TitleScene extends Phaser.Scene {
  private menu!: Phaser.GameObjects.Container

  constructor() {
    super('TitleScene')
  }

  create(): void {
    const cx = GAME.width / 2
    const items: Phaser.GameObjects.GameObject[] = []

    items.push(
      this.add.image(cx, 158, 'wordmark').setDisplaySize(470, 470 * (1140 / 3663)).setOrigin(0.5),
    )

    items.push(
      this.add
        .text(cx, 268, 'Drop matching bubbles to merge them into bigger ones!', {
          fontFamily: 'sans-serif',
          fontSize: '16px',
          color: '#cccccc',
          align: 'center',
          wordWrap: { width: GAME.width - 80 },
        })
        .setOrigin(0.5),
    )

    items.push(...this.buildLadder(cx, 360))

    items.push(
      this.add
        .text(cx, 462, 'Point & click where it should land\nKeys:  A / D  ·  ← →  ·  Space\nPause:  Esc', {
          fontFamily: 'sans-serif',
          fontSize: '15px',
          color: '#aaaaaa',
          align: 'center',
          lineSpacing: 7,
        })
        .setOrigin(0.5),
    )

    items.push(...this.buildPlayButton(cx, 600))
    items.push(...this.buildSettings(cx, 716))
    if (leaderboardEnabled()) items.push(...this.buildLeaderboardButton(cx, 792))

    const bestText = this.add
      .text(cx, 852, `BEST    ${loadHighScore()}`, {
        fontFamily: 'sans-serif',
        fontSize: '30px',
        color: '#ffd43b',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
    const badgeW = bestText.width + 56
    const badge = this.add.graphics().setPosition(cx, 852)
    badge.fillStyle(0xffd43b, 0.1)
    badge.fillRoundedRect(-badgeW / 2, -31, badgeW, 62, 31)
    badge.lineStyle(2, 0xffd43b, 0.55)
    badge.strokeRoundedRect(-badgeW / 2, -31, badgeW, 62, 31)
    items.push(badge, bestText)

    this.menu = this.add.container(0, 0, items)

    this.applyLayout()
    this.scale.on('resize', this.applyLayout, this)
    this.events.once('shutdown', () => this.scale.off('resize', this.applyLayout, this))
  }

  // Center + scale the fixed 540×960 menu design into the current window.
  private applyLayout(): void {
    const W = this.scale.width
    const H = this.scale.height
    const s = Math.min(W / GAME.width, H / GAME.height) * 0.98
    this.menu.setScale(s)
    this.menu.setPosition(W / 2 - (GAME.width / 2) * s, H / 2 - (GAME.height / 2) * s)
  }

  private buildLadder(cx: number, y: number): Phaser.GameObjects.GameObject[] {
    const out: Phaser.GameObjects.GameObject[] = []

    const minD = 14
    const maxD = 40
    const gap = 5
    const sizes = TIERS.map((_, t) => minD + (maxD - minD) * (t / TOP_TIER))
    const totalW = sizes.reduce((a, b) => a + b, 0) + gap * (TIERS.length - 1)

    let x = cx - totalW / 2
    TIERS.forEach((_, t) => {
      const d = sizes[t]
      out.push(this.add.image(x + d / 2, y, Fruit.textureKey(t)).setDisplaySize(d, d))
      x += d + gap
    })
    return out
  }

  private buildPlayButton(cx: number, y: number): Phaser.GameObjects.GameObject[] {
    const w = 250
    const h = 78
    const r = h / 2 // big bubbly pill
    const color = 0x1971c2
    const hover = Phaser.Display.Color.IntegerToColor(color).lighten(16).color

    const gfx = this.add.graphics().setPosition(cx, y)
    const paint = (c: number): void => {
      gfx.clear()
      gfx.fillStyle(0x000000, 0.25)
      gfx.fillRoundedRect(-w / 2, -h / 2 + 5, w, h, r)
      gfx.fillStyle(c, 1)
      gfx.fillRoundedRect(-w / 2, -h / 2, w, h, r)
      gfx.fillStyle(0xffffff, 0.22)
      gfx.fillRoundedRect(-w / 2 + 7, -h / 2 + 5, w - 14, h * 0.4, { tl: r - 5, tr: r - 5, bl: 12, br: 12 })
    }
    paint(color)

    const hit = this.add.rectangle(cx, y, w, h, 0x000000, 0.001).setInteractive({ useHandCursor: true })
    hit.on('pointerover', () => paint(hover))
    hit.on('pointerout', () => paint(color))
    hit.on('pointerup', () => this.scene.start('GameScene'))

    const label = this.add
      .text(cx, y, '▶  PLAY', { fontFamily: 'sans-serif', fontSize: '26px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5)

    return [gfx, hit, label]
  }

  private buildLeaderboardButton(cx: number, y: number): Phaser.GameObjects.GameObject[] {
    const w = 224
    const h = 52
    const r = h / 2
    const color = 0xe8a23d
    const hover = Phaser.Display.Color.IntegerToColor(color).lighten(14).color

    const gfx = this.add.graphics().setPosition(cx, y)
    const paint = (c: number): void => {
      gfx.clear()
      gfx.fillStyle(0x000000, 0.25)
      gfx.fillRoundedRect(-w / 2, -h / 2 + 4, w, h, r)
      gfx.fillStyle(c, 1)
      gfx.fillRoundedRect(-w / 2, -h / 2, w, h, r)
      gfx.fillStyle(0xffffff, 0.22)
      gfx.fillRoundedRect(-w / 2 + 6, -h / 2 + 4, w - 12, h * 0.4, { tl: r - 4, tr: r - 4, bl: 10, br: 10 })
    }
    paint(color)

    const hit = this.add.rectangle(cx, y, w, h, 0x000000, 0.001).setInteractive({ useHandCursor: true })
    hit.on('pointerover', () => paint(hover))
    hit.on('pointerout', () => paint(color))
    hit.on('pointerup', () => void openLeaderboard())

    const label = this.add
      .text(cx, y, '🏆  Leaderboard', { fontFamily: 'sans-serif', fontSize: '20px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5)

    return [gfx, hit, label]
  }

  private buildSettings(cx: number, y: number): Phaser.GameObjects.GameObject[] {
    const out: Phaser.GameObjects.GameObject[] = []

    // Sound toggle as a glossy pill, matching every other button.
    const soundX = cx - 96
    const w = 152
    const h = 44
    const r = h / 2
    const onColor = 0x2b8a3e
    const offColor = 0x4a4f5c
    const colorFor = () => (isMuted() ? offColor : onColor)

    const gfx = this.add.graphics().setPosition(soundX, y)
    const paint = (c: number): void => {
      gfx.clear()
      gfx.fillStyle(0x000000, 0.22)
      gfx.fillRoundedRect(-w / 2, -h / 2 + 4, w, h, r)
      gfx.fillStyle(c, 1)
      gfx.fillRoundedRect(-w / 2, -h / 2, w, h, r)
      gfx.fillStyle(0xffffff, 0.22)
      gfx.fillRoundedRect(-w / 2 + 6, -h / 2 + 4, w - 12, h * 0.4, { tl: r - 4, tr: r - 4, bl: 9, br: 9 })
    }
    paint(colorFor())
    out.push(gfx)

    const icon = this.add.image(soundX - w / 2 + 28, y, isMuted() ? 'ic-mute' : 'ic-sound').setDisplaySize(20, 20)
    const text = this.add
      .text(soundX - w / 2 + 50, y, isMuted() ? 'Sound off' : 'Sound on', {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5)
    const refresh = (): void => {
      icon.setTexture(isMuted() ? 'ic-mute' : 'ic-sound').setDisplaySize(20, 20)
      text.setText(isMuted() ? 'Sound off' : 'Sound on')
      paint(colorFor())
    }

    const hit = this.add.rectangle(soundX, y, w, h, 0x000000, 0.001).setInteractive({ useHandCursor: true })
    hit.on('pointerover', () => paint(Phaser.Display.Color.IntegerToColor(colorFor()).lighten(14).color))
    hit.on('pointerout', () => paint(colorFor()))
    hit.on('pointerup', () => {
      setMuted(!isMuted())
      saveMuted(isMuted())
      refresh()
    })
    out.push(hit, icon, text)

    // Volume slider (right of the sound pill).
    const trackW = 120
    const trackX = cx + 40
    out.push(
      this.add.text(trackX - 12, y, 'Vol', { fontFamily: 'sans-serif', fontSize: '12px', color: '#aaaaaa' }).setOrigin(1, 0.5),
    )
    out.push(this.add.rectangle(trackX, y, trackW, 6, 0x555555).setOrigin(0, 0.5))
    const fill = this.add.rectangle(trackX, y, trackW, 6, 0x4dabf7).setOrigin(0, 0.5)
    fill.scaleX = getMasterVolume()
    out.push(fill)

    const vhit = this.add
      .rectangle(trackX, y, trackW, 26, 0x000000, 0.001)
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
    out.push(vhit)
    const setVol = (px: number) => {
      const bounds = vhit.getBounds()
      const v = Phaser.Math.Clamp((px - bounds.x) / bounds.width, 0, 1)
      setMasterVolume(v)
      saveVolume(v)
      fill.scaleX = v
      if (v > 0 && isMuted()) {
        setMuted(false)
        saveMuted(false)
        refresh()
      }
    }
    vhit.on('pointerdown', (p: Phaser.Input.Pointer) => setVol(p.x))
    vhit.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.isDown) setVol(p.x)
    })

    return out
  }
}
