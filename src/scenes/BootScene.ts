import Phaser from 'phaser'
import { Fruit } from '../objects/Fruit'
import { installAudioUnlock, setMuted, setMasterVolume } from '../audio/sfx'
import { loadMuted, loadVolume } from '../storage'

// Boot: generate textures, arm audio + restore audio prefs, then show the title.
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene')
  }

  preload(): void {
    // Wordmark logo (viewBox 3663×1140 ≈ 3.21:1), rasterized large for crispness.
    this.load.svg('wordmark', 'blorb_wordmark.svg', { width: 1380, height: 429 })
  }

  create(): void {
    Fruit.makeTextures(this)
    this.makeSparkTexture()
    this.makeIcons()

    installAudioUnlock()
    setMuted(loadMuted())
    const vol = loadVolume()
    if (vol >= 0) setMasterVolume(vol)

    this.scene.launch('BackgroundScene')
    this.scene.sendToBack('BackgroundScene')
    this.scene.start('TitleScene')
  }

  // Small white dot used for merge particle bursts.
  private makeSparkTexture(): void {
    if (this.textures.exists('spark')) return
    const g = this.add.graphics()
    g.fillStyle(0xffffff, 1)
    g.fillCircle(6, 6, 6)
    g.generateTexture('spark', 12, 12)
    g.destroy()
  }

  // Crisp white vector icons (24x24) for the HUD buttons — no image files needed.
  private makeIcons(): void {
    const make = (key: string, draw: (g: Phaser.GameObjects.Graphics) => void): void => {
      if (this.textures.exists(key)) return
      const g = this.add.graphics()
      draw(g)
      g.generateTexture(key, 24, 24)
      g.destroy()
    }

    make('ic-pause', (g) => {
      g.fillStyle(0xffffff, 1)
      g.fillRoundedRect(7, 5, 4, 14, 1.5)
      g.fillRoundedRect(13, 5, 4, 14, 1.5)
    })

    make('ic-play', (g) => {
      g.fillStyle(0xffffff, 1)
      g.fillTriangle(7, 5, 7, 19, 19, 12)
    })

    make('ic-home', (g) => {
      g.fillStyle(0xffffff, 1)
      g.fillTriangle(12, 4, 2, 12, 22, 12)
      g.fillRect(6, 11, 12, 9)
    })

    make('ic-sound', (g) => {
      g.fillStyle(0xffffff, 1)
      g.fillRect(4, 9, 3, 6)
      g.fillTriangle(7, 6, 7, 18, 13, 12)
      g.lineStyle(2, 0xffffff, 1)
      g.beginPath()
      g.arc(13, 12, 4, -Math.PI / 3, Math.PI / 3)
      g.strokePath()
      g.beginPath()
      g.arc(13, 12, 7.5, -Math.PI / 3, Math.PI / 3)
      g.strokePath()
    })

    make('ic-mute', (g) => {
      g.fillStyle(0xffffff, 1)
      g.fillRect(4, 9, 3, 6)
      g.fillTriangle(7, 6, 7, 18, 13, 12)
      g.lineStyle(2, 0xff8787, 1)
      g.lineBetween(16, 8, 22, 16)
      g.lineBetween(22, 8, 16, 16)
    })

    make('ic-menu', (g) => {
      g.fillStyle(0xffffff, 1)
      g.fillRoundedRect(5, 6, 14, 2.6, 1.3)
      g.fillRoundedRect(5, 11, 14, 2.6, 1.3)
      g.fillRoundedRect(5, 16, 14, 2.6, 1.3)
    })
  }
}
