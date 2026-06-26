import Phaser from 'phaser'
import { TIERS, TOP_TIER } from '../config/tuning'
import { Fruit } from '../objects/Fruit'
import { isMuted, setMuted } from '../audio/sfx'
import { saveMuted, loadPlayerName } from '../storage'
import { openLeaderboard, leaderboardEnabled, promptNameAndSubmit } from '../leaderboardUI'
import { submitScore } from '../leaderboard'
import { computeLayout, type Layout } from '../layout'
import type { GameScene } from './GameScene'

// Overlay scene over GameScene: the HUD (hero score + run stats, next preview,
// progress ladder, how-to, on-screen pause/mute) framed in side-panel cards,
// plus the pause and Game Over overlays. State is pulled from GameScene each
// frame; positions recompute responsively in applyLayout().
export class UIScene extends Phaser.Scene {
  private gameScene!: GameScene

  private leftCard!: Phaser.GameObjects.Graphics
  private rightCard!: Phaser.GameObjects.Graphics
  private wordmark!: Phaser.GameObjects.Image

  private scoreLabel!: Phaser.GameObjects.Text
  private scoreText!: Phaser.GameObjects.Text
  private bestText!: Phaser.GameObjects.Text

  private howtoLabel!: Phaser.GameObjects.Text
  private howtoText!: Phaser.GameObjects.Text

  private nextLabel!: Phaser.GameObjects.Text
  private nextImg!: Phaser.GameObjects.Image
  private nextDisplay = 40

  private ladderLabel!: Phaser.GameObjects.Text
  private ladderImgs: Phaser.GameObjects.Image[] = []
  private controlsText!: Phaser.GameObjects.Text

  private pauseBtn!: Phaser.GameObjects.Container
  private muteBtn!: Phaser.GameObjects.Container
  private homeBtn!: Phaser.GameObjects.Container
  private soundIcon!: Phaser.GameObjects.Image
  private soundText!: Phaser.GameObjects.Text
  private soundSetColor!: (c: number) => void
  private miniBtns: Phaser.GameObjects.Container[] = []
  private miniSoundIcon!: Phaser.GameObjects.Image
  private miniSoundCircle!: Phaser.GameObjects.Arc

  private pauseDim!: Phaser.GameObjects.Rectangle
  private pauseContent!: Phaser.GameObjects.Container
  private pauseButtons: Phaser.GameObjects.Rectangle[] = []
  private pauseSoundIcon!: Phaser.GameObjects.Image
  private pauseSoundText!: Phaser.GameObjects.Text
  private pauseSoundSetColor!: (c: number) => void

  private goDim!: Phaser.GameObjects.Rectangle
  private goContent!: Phaser.GameObjects.Container
  private goScore!: Phaser.GameObjects.Text
  private goBest!: Phaser.GameObjects.Text
  private goLbStatus!: Phaser.GameObjects.Text
  private goPillBgs: Phaser.GameObjects.Rectangle[] = []

  private shownScore = -1
  private shownBest = -1
  private shownNext = -1
  private shownBiggest = -1
  private shownPaused = false
  private shownGameOver = false

  constructor() {
    super({ key: 'UIScene', active: false })
  }

  create(): void {
    this.gameScene = this.scene.get('GameScene') as GameScene
    this.shownScore = -1
    this.shownBest = -1
    this.shownNext = -1
    this.shownBiggest = -1
    this.shownPaused = false
    this.shownGameOver = false

    const sans = 'sans-serif'

    this.leftCard = this.add.graphics().setDepth(-10)
    this.rightCard = this.add.graphics().setDepth(-10)
    this.wordmark = this.add.image(0, 0, 'wordmark').setOrigin(0.5).setVisible(false)

    this.scoreLabel = this.add.text(0, 0, 'SCORE', { fontFamily: sans, color: '#888888' }).setOrigin(0.5)
    this.scoreText = this.add.text(0, 0, '0', { fontFamily: sans, color: '#ffffff', fontStyle: 'bold' })
    this.bestText = this.add.text(0, 0, 'Best 0', { fontFamily: sans, color: '#ffd43b' })

    this.howtoLabel = this.add.text(0, 0, 'HOW TO PLAY', { fontFamily: sans, color: '#888888' }).setOrigin(0.5).setVisible(false)
    this.howtoText = this.add
      .text(0, 0, 'Point & click to drop\nA / D  ·  ← →  to aim\nmatch 2 → merge bigger\nEsc  to pause', { fontFamily: sans, color: '#aaaaaa', align: 'center', lineSpacing: 5 })
      .setOrigin(0.5)
      .setVisible(false)

    this.nextLabel = this.add.text(0, 0, 'NEXT', { fontFamily: sans, color: '#aaaaaa' }).setOrigin(0.5)
    this.nextImg = this.add.image(0, 0, Fruit.textureKey(0)).setDisplaySize(40, 40)

    this.ladderLabel = this.add.text(0, 0, 'LADDER', { fontFamily: sans, color: '#888888' }).setOrigin(0.5).setVisible(false)
    this.ladderImgs = TIERS.map((_, t) => this.add.image(0, 0, Fruit.textureKey(t)).setDisplaySize(24, 24).setVisible(false))

    this.controlsText = this.add
      .text(0, 0, 'A/D / ←→ move   ·   Space / click drop   ·   Esc pause   ·   R restart', { fontFamily: sans, color: '#888888' })
      .setOrigin(0.5)

    const pause = this.makeIconButton('ic-pause', 'Pause', 0x1971c2, () => this.gameScene.togglePause())
    this.pauseBtn = pause.container

    const sound = this.makeIconButton(
      isMuted() ? 'ic-mute' : 'ic-sound',
      isMuted() ? 'Sound off' : 'Sound on',
      isMuted() ? 0x4a4f5c : 0x2b8a3e,
      () => {
        this.toggleMute()
        this.refreshSoundButtons()
      },
    )
    this.muteBtn = sound.container
    this.soundIcon = sound.icon
    this.soundText = sound.text
    this.soundSetColor = sound.setColor

    const home = this.makeIconButton('ic-home', 'Home', 0x6741d9, () => this.gameScene.goHome())
    this.homeBtn = home.container

    // Compact icon-only buttons for portrait / mobile (the text pills are too big there).
    const mPause = this.makeMiniButton('ic-pause', 0x1971c2, () => this.gameScene.togglePause())
    const mSound = this.makeMiniButton(isMuted() ? 'ic-mute' : 'ic-sound', isMuted() ? 0x4a4f5c : 0x2b8a3e, () => {
      this.toggleMute()
      this.refreshSoundButtons()
    })
    const mHome = this.makeMiniButton('ic-home', 0x6741d9, () => this.gameScene.goHome())
    this.miniBtns = [mPause.container, mSound.container, mHome.container]
    this.miniSoundIcon = mSound.icon
    this.miniSoundCircle = mSound.circle
    this.miniBtns.forEach((c) => c.setVisible(false))

    this.buildPauseOverlay()
    this.buildGameOverOverlay()

    this.applyLayout()
    this.scale.on('resize', this.applyLayout, this)
    this.events.once('shutdown', () => this.scale.off('resize', this.applyLayout, this))
  }

  update(): void {
    const g = this.gameScene
    if (!g) return

    const score = g.getScore()
    if (score !== this.shownScore) {
      this.shownScore = score
      this.scoreText.setText(`${score}`)
    }
    const best = g.getBest()
    if (best !== this.shownBest) {
      this.shownBest = best
      this.bestText.setText(`Best ${best}`)
    }
    const biggest = g.getBiggest()
    if (biggest !== this.shownBiggest) {
      this.shownBiggest = biggest
      this.ladderImgs.forEach((img, t) => img.setAlpha(t <= biggest ? 1 : 0.22))
    }
    const next = g.getNextTier()
    if (next !== this.shownNext) {
      this.shownNext = next
      this.nextImg.setTexture(Fruit.textureKey(next)).setDisplaySize(this.nextDisplay, this.nextDisplay)
    }

    const paused = g.isPaused()
    if (paused !== this.shownPaused) {
      this.shownPaused = paused
      this.pauseDim.setVisible(paused)
      this.pauseContent.setVisible(paused)
      this.pauseButtons.forEach((b) =>
        paused ? b.setInteractive({ useHandCursor: true }) : b.disableInteractive(),
      )
    }

    const over = g.isGameOver()
    if (over !== this.shownGameOver) {
      this.shownGameOver = over
      if (over) {
        const finalScore = g.getScore()
        this.goScore.setText(`Score: ${finalScore}`)
        this.goBest.setText(`Best: ${g.getBest()}`)
        this.goPillBgs.forEach((bg) => bg.setInteractive({ useHandCursor: true }))
        this.handleGameOverLeaderboard(finalScore)
      } else {
        this.goPillBgs.forEach((bg) => bg.disableInteractive())
      }
      this.goDim.setVisible(over)
      this.goContent.setVisible(over)
    }
  }

  // --- Responsive positioning ----------------------------------------------

  private applyLayout(): void {
    const W = this.scale.width
    const H = this.scale.height
    const L = computeLayout(W, H)

    if (L.mode === 'landscape') this.layoutLandscape(L)
    else this.layoutPortrait(L)

    const oScale = Phaser.Math.Clamp(L.scale, 0.7, 1.6)
    this.pauseDim.setPosition(0, 0).setSize(W, H)
    this.pauseContent.setPosition(W / 2, H / 2).setScale(oScale)
    this.goDim.setPosition(0, 0).setSize(W, H)
    this.goContent.setPosition(W / 2, H / 2).setScale(oScale)
  }

  // Compact mobile HUD: logo top-left, score under it, icon buttons + next top-right.
  private layoutPortrait(L: Layout): void {
    const b = L.board
    const s = L.scale
    const pad = 14 * s

    this.leftCard.clear()
    this.rightCard.clear()

    // Blorb logo, top-left.
    this.wordmark
      .setVisible(true)
      .setPosition(b.x + pad + 58 * s, b.y + pad + 16 * s)
      .setDisplaySize(116 * s, 116 * s * (1140 / 3663))

    // Score + best, under the logo.
    this.scoreLabel.setOrigin(0, 0.5).setPosition(b.x + pad, b.y + pad + 46 * s).setFontSize(this.fs(11, s))
    this.scoreText.setOrigin(0, 0).setPosition(b.x + pad, b.y + pad + 54 * s).setFontSize(this.fs(26, s))
    this.bestText.setOrigin(0, 0).setPosition(b.x + pad, b.y + pad + 86 * s).setFontSize(this.fs(13, s))

    // Icon buttons, top-right row (pause · sound · home).
    const gap = 52 * s
    const startX = b.x + b.w - pad - 22 * s - (this.miniBtns.length - 1) * gap
    this.miniBtns.forEach((c, i) =>
      c.setVisible(true).setScale(s).setPosition(startX + i * gap, b.y + pad + 22 * s),
    )

    // Next, under the icons (right).
    this.nextLabel.setOrigin(0.5).setPosition(b.x + b.w - pad - 22 * s, b.y + pad + 60 * s).setFontSize(this.fs(11, s)).setVisible(true)
    this.nextDisplay = 38 * s
    this.nextImg.setPosition(b.x + b.w - pad - 22 * s, b.y + pad + 90 * s).setDisplaySize(this.nextDisplay, this.nextDisplay)

    // Hide landscape-only chrome.
    this.pauseBtn.setVisible(false)
    this.muteBtn.setVisible(false)
    this.homeBtn.setVisible(false)
    this.controlsText.setVisible(false)
    this.howtoLabel.setVisible(false)
    this.howtoText.setVisible(false)
    this.ladderLabel.setVisible(false)
    this.ladderImgs.forEach((img) => img.setVisible(false))
  }

  private layoutLandscape(L: Layout): void {
    const b = L.board
    const s = L.scale
    // Panels hug the board (capped gap) so the UI stays a tight composition even
    // on very wide windows, instead of floating in the middle of huge gutters.
    const cardW = Phaser.Math.Clamp(L.gutter - 36, 140, 230)
    const panelGap = 22
    const leftCx = b.x - panelGap - cardW / 2
    const rightCx = b.x + b.w + panelGap + cardW / 2

    this.drawCards(L, leftCx, rightCx, cardW)

    // Left panel: wordmark → how-to → buttons.
    this.wordmark.setPosition(leftCx, b.y + b.h * 0.2).setDisplaySize(150 * s, 150 * s * (1140 / 3663)).setVisible(true)

    this.howtoLabel.setPosition(leftCx, b.y + b.h * 0.4).setFontSize(this.fs(12, s)).setVisible(true)
    this.howtoText.setOrigin(0.5, 0).setPosition(leftCx, b.y + b.h * 0.4 + 34 * s).setFontSize(this.fs(13, s)).setLineSpacing(5 * s).setVisible(true)

    this.miniBtns.forEach((c) => c.setVisible(false))
    this.pauseBtn.setPosition(leftCx, b.y + b.h * 0.64).setScale(s).setVisible(true)
    this.muteBtn.setPosition(leftCx, b.y + b.h * 0.64 + 64 * s).setScale(s).setVisible(true)
    this.homeBtn.setPosition(leftCx, b.y + b.h * 0.64 + 128 * s).setScale(s).setVisible(true)

    // Right panel: next preview → score → progress ladder.
    // Aligned row-for-row with the left panel: NEXT↔wordmark, SCORE↔how-to,
    // LADDER↔buttons.
    this.nextLabel.setPosition(rightCx, b.y + b.h * 0.2 - 20 * s).setFontSize(this.fs(14, s)).setVisible(true)
    this.nextDisplay = 46 * s
    this.nextImg.setPosition(rightCx, b.y + b.h * 0.2 + 30 * s).setDisplaySize(this.nextDisplay, this.nextDisplay)

    this.scoreLabel.setOrigin(0.5).setPosition(rightCx, b.y + b.h * 0.4).setFontSize(this.fs(13, s))
    this.scoreText.setOrigin(0.5, 0).setPosition(rightCx, b.y + b.h * 0.4 + 26 * s).setFontSize(this.fs(40, s))
    this.bestText.setOrigin(0.5, 0).setPosition(rightCx, b.y + b.h * 0.4 + 78 * s).setFontSize(this.fs(16, s))

    this.controlsText.setVisible(false)

    this.ladderLabel.setPosition(rightCx, b.y + b.h * 0.62).setFontSize(this.fs(13, s)).setVisible(true)
    // Bubbles grow small → large down the ladder (like the title screen).
    const minD = Phaser.Math.Clamp(cardW * 0.07, 10, 14)
    const maxD = Phaser.Math.Clamp(cardW * 0.14, 16, 24)
    const gap = 4 * s
    let ly = b.y + b.h * 0.62 + 26 * s
    this.ladderImgs.forEach((img, i) => {
      const d = minD + (maxD - minD) * (i / TOP_TIER)
      img.setPosition(rightCx, ly + d / 2).setDisplaySize(d, d).setVisible(true)
      ly += d + gap
    })
  }

  private drawCards(L: Layout, leftCx: number, rightCx: number, cardW: number): void {
    const b = L.board
    const s = L.scale
    const r = 16 * s

    for (const [card, cx] of [
      [this.leftCard, leftCx],
      [this.rightCard, rightCx],
    ] as const) {
      card
        .clear()
        .fillStyle(0x1c1c26, 0.5)
        .fillRoundedRect(cx - cardW / 2, b.y, cardW, b.h, r)
        .lineStyle(1, 0xffffff, 0.06)
        .strokeRoundedRect(cx - cardW / 2, b.y, cardW, b.h, r)
    }
  }

  private fs(base: number, s: number): number {
    return Math.max(9, Math.round(base * s))
  }


  // --- Overlays -------------------------------------------------------------

  private buildPauseOverlay(): void {
    this.pauseDim = this.add.rectangle(0, 0, 10, 10, 0x000000, 0.84).setOrigin(0).setDepth(1999).setVisible(false)

    const title = this.add
      .text(0, -116, 'PAUSED', { fontFamily: 'sans-serif', fontSize: '40px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5)

    const resume = this.makeIconButton('ic-play', 'Resume', 0x1971c2, () => {
      if (this.gameScene.isPaused()) this.gameScene.togglePause()
    })
    resume.container.setPosition(0, -34)

    const muted = isMuted()
    const sound = this.makeIconButton(
      muted ? 'ic-mute' : 'ic-sound',
      muted ? 'Sound off' : 'Sound on',
      muted ? 0x4a4f5c : 0x2b8a3e,
      () => {
        this.toggleMute()
        this.refreshSoundButtons()
      },
    )
    sound.container.setPosition(0, 24)
    this.pauseSoundIcon = sound.icon
    this.pauseSoundText = sound.text
    this.pauseSoundSetColor = sound.setColor

    const menu = this.makeIconButton('ic-home', 'Menu', 0x6741d9, () => this.gameScene.goHome())
    menu.container.setPosition(0, 82)

    this.pauseButtons = [resume.bg, sound.bg, menu.bg]
    this.pauseButtons.forEach((b) => b.disableInteractive())

    this.pauseContent = this.add
      .container(0, 0, [title, resume.container, sound.container, menu.container])
      .setDepth(2000)
      .setVisible(false)
  }

  private buildGameOverOverlay(): void {
    this.goDim = this.add.rectangle(0, 0, 10, 10, 0x000000, 0.86).setOrigin(0).setDepth(1999).setVisible(false)

    const lb = leaderboardEnabled()

    const title = this.add
      .text(0, -150, 'GAME OVER', { fontFamily: 'sans-serif', fontSize: '40px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5)
    this.goScore = this.add.text(0, -96, 'Score: 0', { fontFamily: 'sans-serif', fontSize: '24px', color: '#ffffff' }).setOrigin(0.5)
    this.goBest = this.add.text(0, -62, 'Best: 0', { fontFamily: 'sans-serif', fontSize: '20px', color: '#ffd43b' }).setOrigin(0.5)
    this.goLbStatus = this.add.text(0, -28, '', { fontFamily: 'sans-serif', fontSize: '15px', color: '#9aa0b0' }).setOrigin(0.5)

    const restart = this.makePill('Restart', 0x1971c2, () => this.gameScene.restartGame())
    restart.container.setPosition(0, 30)

    const items: Phaser.GameObjects.GameObject[] = [title, this.goScore, this.goBest, this.goLbStatus, restart.container]
    this.goPillBgs = [restart.bg]

    if (lb) {
      const view = this.makePill('🏆  Leaderboard', 0xe8a23d, () => void openLeaderboard(this.gameScene.getScore()))
      view.container.setPosition(0, 94)
      items.push(view.container)
      this.goPillBgs.push(view.bg)
    }

    const menu = this.makePill('Menu', 0x6741d9, () => this.gameScene.goHome())
    menu.container.setPosition(0, lb ? 158 : 94)
    items.push(menu.container)
    this.goPillBgs.push(menu.bg)

    this.goContent = this.add.container(0, 0, items).setDepth(2000).setVisible(false)
    this.goPillBgs.forEach((bg) => bg.disableInteractive())
  }

  // On game over, post the score if a name is set (and show the result inline);
  // first-timers get a prompt to set a name via the Leaderboard button.
  private handleGameOverLeaderboard(score: number): void {
    if (!leaderboardEnabled()) {
      this.goLbStatus.setText('')
      return
    }
    const name = loadPlayerName()
    if (name === '') {
      // First time: pop a small name form right away — no button to hunt for.
      this.goLbStatus.setText('🏆  Post your score…')
      void promptNameAndSubmit(score).then((res) => {
        if (!this.shownGameOver) return
        if (res) {
          this.goLbStatus.setText(res.rank ? `🏆  Posted as ${res.name} — rank #${res.rank}` : `🏆  Posted as ${res.name}`)
        } else {
          this.goLbStatus.setText('🏆  Tap "Leaderboard" to post your score')
        }
      })
      return
    }
    this.goLbStatus.setText('🏆  Posting…')
    void submitScore(name, score).then((rank) => {
      if (!this.shownGameOver) return
      this.goLbStatus.setText(rank ? `🏆  Posted as ${name} — rank #${rank}` : `🏆  Posted as ${name}`)
    })
  }

  // A styled HUD button: rounded bg with hover, an icon, and a label.
  private makeIconButton(
    iconKey: string,
    label: string,
    color: number,
    onClick: () => void,
  ): {
    container: Phaser.GameObjects.Container
    bg: Phaser.GameObjects.Rectangle
    icon: Phaser.GameObjects.Image
    text: Phaser.GameObjects.Text
    setColor: (c: number) => void
  } {
    const w = 136
    const h = 46
    const r = h / 2 // full pill — bubbly, not boxy
    let current = color

    // Visible glossy pill: soft drop shadow → colored body → top sheen highlight.
    const gfx = this.add.graphics()
    const paint = (c: number): void => {
      gfx.clear()
      gfx.fillStyle(0x000000, 0.22)
      gfx.fillRoundedRect(-w / 2, -h / 2 + 4, w, h, r)
      gfx.fillStyle(c, 1)
      gfx.fillRoundedRect(-w / 2, -h / 2, w, h, r)
      gfx.fillStyle(0xffffff, 0.22)
      gfx.fillRoundedRect(-w / 2 + 6, -h / 2 + 4, w - 12, h * 0.4, { tl: r - 4, tr: r - 4, bl: 9, br: 9 })
    }
    paint(current)

    // Invisible interactive hit target on top — keeps the simple Rectangle
    // input + the pause-overlay enable/disable toggle working unchanged.
    const bg = this.add.rectangle(0, 0, w, h, 0x000000, 0.001).setInteractive({ useHandCursor: true })
    bg.on('pointerover', () => paint(Phaser.Display.Color.IntegerToColor(current).lighten(14).color))
    bg.on('pointerout', () => paint(current))
    bg.on('pointerup', onClick)

    const icon = this.add.image(-w / 2 + 28, 0, iconKey).setDisplaySize(20, 20)
    const text = this.add
      .text(-w / 2 + 50, 0, label, { fontFamily: 'sans-serif', fontSize: '16px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0, 0.5)

    const container = this.add.container(0, 0, [gfx, bg, icon, text])
    const setColor = (c: number): void => {
      current = c
      paint(c)
    }
    return { container, bg, icon, text, setColor }
  }

  // A glossy text pill (no icon) — matches the Play button style.
  private makePill(
    label: string,
    color: number,
    onClick: () => void,
    w = 224,
  ): { container: Phaser.GameObjects.Container; bg: Phaser.GameObjects.Rectangle } {
    const h = 52
    const r = h / 2
    let current = color
    const gfx = this.add.graphics()
    const paint = (c: number): void => {
      gfx.clear()
      gfx.fillStyle(0x000000, 0.25)
      gfx.fillRoundedRect(-w / 2, -h / 2 + 4, w, h, r)
      gfx.fillStyle(c, 1)
      gfx.fillRoundedRect(-w / 2, -h / 2, w, h, r)
      gfx.fillStyle(0xffffff, 0.22)
      gfx.fillRoundedRect(-w / 2 + 6, -h / 2 + 4, w - 12, h * 0.4, { tl: r - 4, tr: r - 4, bl: 10, br: 10 })
    }
    paint(current)
    const bg = this.add.rectangle(0, 0, w, h, 0x000000, 0.001).setInteractive({ useHandCursor: true })
    bg.on('pointerover', () => paint(Phaser.Display.Color.IntegerToColor(current).lighten(14).color))
    bg.on('pointerout', () => paint(current))
    bg.on('pointerup', onClick)
    const text = this.add
      .text(0, 0, label, { fontFamily: 'sans-serif', fontSize: '20px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5)
    return { container: this.add.container(0, 0, [gfx, bg, text]), bg }
  }

  // A small round icon-only button (no text) for the compact portrait HUD.
  private makeMiniButton(
    iconKey: string,
    color: number,
    onClick: () => void,
  ): { container: Phaser.GameObjects.Container; icon: Phaser.GameObjects.Image; circle: Phaser.GameObjects.Arc } {
    const circle = this.add.circle(0, 0, 23, color, 1)
    const icon = this.add.image(0, 0, iconKey).setDisplaySize(24, 24)
    const hit = this.add.circle(0, 0, 30, 0x000000, 0.001).setInteractive({ useHandCursor: true })
    hit.on('pointerup', onClick)
    return { container: this.add.container(0, 0, [circle, icon, hit]), icon, circle }
  }

  private refreshSoundButtons(): void {
    const muted = isMuted()
    const iconKey = muted ? 'ic-mute' : 'ic-sound'
    const label = muted ? 'Sound off' : 'Sound on'
    const color = muted ? 0x4a4f5c : 0x2b8a3e
    this.soundIcon.setTexture(iconKey).setDisplaySize(20, 20)
    this.soundText.setText(label)
    this.soundSetColor(color)
    this.pauseSoundIcon.setTexture(iconKey).setDisplaySize(20, 20)
    this.pauseSoundText.setText(label)
    this.pauseSoundSetColor(color)
    this.miniSoundIcon.setTexture(iconKey).setDisplaySize(24, 24)
    this.miniSoundCircle.setFillStyle(color, 1)
  }

  private toggleMute(): void {
    const muted = !isMuted()
    setMuted(muted)
    saveMuted(muted)
  }
}
