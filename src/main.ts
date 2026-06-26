import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene'
import { BackgroundScene } from './scenes/BackgroundScene'
import { TitleScene } from './scenes/TitleScene'
import { GameScene } from './scenes/GameScene'
import { UIScene } from './scenes/UIScene'
import { GAME, WORLD } from './config/tuning'

// Dev aid: surface any uncaught error as a visible on-screen overlay. An
// exception inside Phaser's game loop otherwise just stops rendering, which
// looks like a silent freeze.
function installErrorOverlay(): void {
  const show = (label: string, detail: string): void => {
    let el = document.getElementById('err-overlay')
    if (!el) {
      el = document.createElement('div')
      el.id = 'err-overlay'
      el.style.cssText =
        'position:fixed;inset:0 0 auto 0;z-index:99999;background:rgba(170,20,20,.96);' +
        'color:#fff;font:12px/1.45 monospace;padding:12px;white-space:pre-wrap;' +
        'max-height:60%;overflow:auto'
      document.body.appendChild(el)
    }
    el.textContent = `⚠ ${label}\n${detail}`
  }
  window.addEventListener('error', (e) => {
    show('Uncaught error', (e.error && e.error.stack) || e.message || String(e))
  })
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as { stack?: string } | undefined
    show('Unhandled promise rejection', (r && r.stack) || String(r))
  })
}

installErrorOverlay()

// Single Phaser game instance. All tunable numbers come from config/tuning.ts.
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME.width,
  height: GAME.height,
  backgroundColor: '#141418', // gutter/frame colour around the board
  scale: {
    mode: Phaser.Scale.RESIZE, // canvas fills the window; scenes lay out responsively
    width: GAME.width,
    height: GAME.height,
  },
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: GAME.gravityY },
      debug: GAME.debugPhysics,
      // Sleeping is OFF: a body could otherwise sleep mid-air (e.g. a small
      // bubble slowly extruded between two big ones) and hang there forever.
      // Friction + air drag keep settled piles quiet instead.
      enableSleeping: false,
      positionIterations: WORLD.positionIterations,
      velocityIterations: WORLD.velocityIterations,
      constraintIterations: WORLD.constraintIterations,
    },
  },
  scene: [BootScene, BackgroundScene, TitleScene, GameScene, UIScene],
}

new Phaser.Game(config)
