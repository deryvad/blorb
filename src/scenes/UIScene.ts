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
  private leaderboardBtn!: Phaser.GameObjects.Container
  private menuBtn!: Phaser.GameObjects.Container
  private menuPanel!: Phaser.GameObjects.Graphics
  private menuOpen = false

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
    this.menuOpen = false

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

    // Labeled action pills, shared between the landscape side-panel and the
    // mobile menu dropdown. Pause/home/leaderboard also dismiss the menu; sound
    // keeps it open so the on/off toggle stays visible. Wide enough for the
    // "Leaderboard" label so all four pills line up.
    const MENU_W = 168
    const pause = this.makeIconButton('ic-pause', 'Pause', 0x1971c2, () => {
      this.closeMenu()
      this.gameScene.togglePause()
    }, MENU_W)
    this.pauseBtn = pause.container

    const lb = this.makeIconButton('ic-rank', 'Leaderboard', 0xe8a23d, () => {
      this.closeMenu()
      void openLeaderboard()
    }, MENU_W)
    this.leaderboardBtn = lb.container
    this.leaderboardBtn.setVisible(false)

    const sound = this.makeIconButton(
      isMuted() ? 'ic-mute' : 'ic-sound',
      isMuted() ? 'Sound off' : 'Sound on',
      isMuted() ? 0x4a4f5c : 0x2b8a3e,
      () => {
        this.toggleMute()
        this.refreshSoundButtons()
      },
      MENU_W,
    )
    this.muteBtn = sound.container
    this.soundIcon = sound.icon
    this.soundText = sound.text
    this.soundSetColor = sound.setColor

    const home = this.makeIconButton('ic-home', 'Home', 0x6741d9, () => {
      this.closeMenu()
      this.gameScene.goHome()
    }, MENU_W)
    this.homeBtn = home.container

    // Dropdown backdrop + the menu (hamburger) button that toggles it (mobile).
    this.menuPanel = this.add.graphics().setDepth(-5).setVisible(false)
    this.menuBtn = this.makeMiniButton('ic-menu', 0x33384a, () => this.toggleMenu()).container
    this.menuBtn.setVisible(false)

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

  // Fixed single-row mobile header bar: logo · buttons · next · score.
  // Sized relative to board WIDTH (not the small design-scale s) so touch targets
  // and text stay properly large on a phone.
  private layoutPortrait(L: Layout): void {
    const b = L.board
    const hh = Phaser.Math.Clamp(b.w * 0.17, 58, 98) // header height
    const top = Math.max(4, (b.y - hh) / 2) // sit in the reserved band above the board
    const cy = top + hh / 2

    // One full-width header card pinned to the top (rightCard unused in portrait).
    this.leftCard
      .clear()
      .fillStyle(0x1c1c26, 0.62)
      .fillRoundedRect(b.x + 4, top, b.w - 8, hh, 16)
      .lineStyle(1, 0xffffff, 0.07)
      .strokeRoundedRect(b.x + 4, top, b.w - 8, hh, 16)
    this.rightCard.clear()

    const bd = hh * 0.6 // menu + dropdown button diameter

    // Menu (hamburger) button — far left.
    const menuX = b.x + hh * 0.16 + bd / 2
    this.menuBtn.setVisible(true).setScale(bd / 46).setPosition(menuX, cy)

    // Logo — right of the menu button, big (the action buttons tuck into the menu).
    const logoH = hh * 0.5
    const logoW = logoH * (3663 / 1140)
    const logoX = menuX + bd / 2 + hh * 0.22
    this.wordmark.setVisible(true).setOrigin(0, 0.5).setPosition(logoX, cy).setDisplaySize(logoW, logoH)

    // Score — far right.
    const scx = b.x + b.w - hh * 0.32
    this.scoreLabel.setOrigin(1, 0.5).setPosition(scx, cy - hh * 0.28).setFontSize(Math.round(hh * 0.17))
    this.scoreText.setOrigin(1, 0.5).setPosition(scx, cy + hh * 0.05).setFontSize(Math.round(hh * 0.4))
    this.bestText.setOrigin(1, 0.5).setPosition(scx, cy + hh * 0.33).setFontSize(Math.round(hh * 0.19))

    // Next bubble — just left of the score.
    this.nextDisplay = hh * 0.44
    const nx = scx - hh * 1.55
    this.nextLabel.setOrigin(0.5).setPosition(nx, cy - hh * 0.29).setFontSize(Math.round(hh * 0.17)).setVisible(true)
    this.nextImg.setPosition(nx, cy + hh * 0.09).setDisplaySize(this.nextDisplay, this.nextDisplay)

    // Action buttons drop down under the menu button as proper labeled pills,
    // shown only while the menu is open.
    if (this.menuOpen) {
      const btns = this.menuButtonList()
      const pscale = Phaser.Math.Clamp(hh / 76, 0.82, 1.2)
      const pillH = 46 * pscale
      const gap = pillH * 0.32
      const innerPad = 10
      const panelTop = top + hh + 6
      const panelX = b.x + 6
      const panelW = 168 * pscale + innerPad * 2
      const panelH = btns.length * pillH + (btns.length - 1) * gap + innerPad * 2
      this.menuPanel
        .clear()
        .fillStyle(0x14141b, 0.95)
        .fillRoundedRect(panelX, panelTop, panelW, panelH, 16)
        .lineStyle(1, 0xffffff, 0.08)
        .strokeRoundedRect(panelX, panelTop, panelW, panelH, 16)
        .setVisible(true)
      const ccx = panelX + panelW / 2
      const y0 = panelTop + innerPad + pillH / 2
      btns.forEach((btn, i) => btn.setVisible(true).setScale(pscale).setPosition(ccx, y0 + i * (pillH + gap)))
      if (!leaderboardEnabled()) this.leaderboardBtn.setVisible(false).setPosition(-500, -500)
    } else {
      this.parkMenuButtons()
    }

    // Hide landscape-only chrome.
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

    this.menuBtn.setVisible(false).setPosition(-500, -500)
    this.menuPanel.setVisible(false)
    if (!leaderboardEnabled()) this.leaderboardBtn.setVisible(false).setPosition(-500, -500)
    const btns = this.menuButtonList()
    const bScale = Math.min(s, (cardW - 16) / 168) // keep the pill inside the card
    const btnTop = b.y + b.h * 0.6
    btns.forEach((btn, i) => btn.setVisible(true).setScale(bScale).setPosition(leftCx, btnTop + i * 58 * s))

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
    w = 136,
  ): {
    container: Phaser.GameObjects.Container
    bg: Phaser.GameObjects.Rectangle
    icon: Phaser.GameObjects.Image
    text: Phaser.GameObjects.Text
    setColor: (c: number) => void
  } {
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
  }

  private toggleMute(): void {
    const muted = !isMuted()
    setMuted(muted)
    saveMuted(muted)
  }

  private toggleMenu(): void {
    this.menuOpen = !this.menuOpen
    this.applyLayout()
  }

  private closeMenu(): void {
    if (!this.menuOpen) return
    this.menuOpen = false
    this.applyLayout()
  }

  // The action buttons in menu order; Leaderboard only when it's configured.
  private menuButtonList(): Phaser.GameObjects.Container[] {
    const list = [this.pauseBtn]
    if (leaderboardEnabled()) list.push(this.leaderboardBtn)
    list.push(this.muteBtn, this.homeBtn)
    return list
  }

  // Hide the menu buttons AND move them off-screen so their hit areas can't
  // swallow taps while collapsed (an invisible container still hit-tests).
  private parkMenuButtons(): void {
    this.menuPanel.setVisible(false)
    for (const c of [this.pauseBtn, this.leaderboardBtn, this.muteBtn, this.homeBtn]) {
      c.setVisible(false).setPosition(-500, -500)
    }
  }
}
