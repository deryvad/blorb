// The leaderboard overlay — a self-contained DOM panel layered over the game
// (works the same in a browser, the Tauri webview, and the itch embed). Kept out
// of Phaser so the scrolling list + name input are simple and reliable.
//
// openLeaderboard(score) submits `score` (asking for a name once, then
// remembering it) and shows the Top 10. openLeaderboard() just shows the board.

import { topScores, submitScore, isConfigured, type LeaderboardEntry } from './leaderboard'
import { loadPlayerName, savePlayerName } from './storage'

let overlay: HTMLDivElement | null = null

export function leaderboardEnabled(): boolean {
  return isConfigured()
}

function closeOverlay(): void {
  overlay?.remove()
  overlay = null
}

function styled(tag: string, css: string, text?: string): HTMLElement {
  const e = document.createElement(tag)
  e.style.cssText = css
  if (text !== undefined) e.textContent = text
  return e
}

// Stop pointer/touch events on a dialog from bubbling to Phaser's window-level
// input listeners — otherwise a click on the dialog also fires whatever game
// button sits behind it (e.g. Restart).
function blockGameInput(el: HTMLElement): void {
  const stop = (e: Event): void => e.stopPropagation()
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchend', 'keydown', 'keyup', 'keypress']) {
    el.addEventListener(type, stop)
  }
}

function renderRows(container: HTMLElement, entries: LeaderboardEntry[], me: string): void {
  container.innerHTML = ''
  if (entries.length === 0) {
    container.appendChild(styled('div', 'padding:22px;text-align:center;color:#9aa0b0', 'No scores yet — be the first!'))
    return
  }
  for (const e of entries) {
    const mine = me !== '' && e.name.toUpperCase() === me.toUpperCase()
    const row = styled(
      'div',
      `display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:10px;margin:3px 0;${mine ? 'background:rgba(77,171,247,.18);' : ''}`,
    )
    const medal = e.rank === 1 ? '#ffd43b' : e.rank === 2 ? '#c0c4cc' : e.rank === 3 ? '#cd7f32' : '#9aa0b0'
    row.appendChild(styled('div', `width:30px;color:${medal};font-weight:800`, `${e.rank}`))
    row.appendChild(styled('div', 'flex:1;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap', e.name))
    row.appendChild(styled('div', 'font-variant-numeric:tabular-nums;font-weight:800', `${e.score}`))
    container.appendChild(row)
  }
}

export async function openLeaderboard(submitValue?: number): Promise<void> {
  if (!isConfigured()) return
  closeOverlay()

  overlay = styled(
    'div',
    'position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(0,0,0,.62);font-family:-apple-system,"Segoe UI",Roboto,sans-serif',
  ) as HTMLDivElement
  blockGameInput(overlay)

  const panel = styled(
    'div',
    'width:min(92vw,400px);max-height:86vh;display:flex;flex-direction:column;background:#1c1c26;' +
      'border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:18px 18px 20px;color:#e6e6ea;' +
      'box-shadow:0 24px 70px rgba(0,0,0,.55)',
  )
  overlay.appendChild(panel)
  document.body.appendChild(overlay)

  const header = styled('div', 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px')
  header.appendChild(styled('div', 'font-size:20px;font-weight:800', '🏆  Leaderboard'))
  const x = styled('button', 'border:none;background:transparent;color:#9aa0b0;font-size:22px;cursor:pointer;line-height:1', '✕')
  x.addEventListener('click', closeOverlay)
  header.appendChild(x)
  panel.appendChild(header)

  const status = styled('div', 'min-height:18px;font-size:13px;color:#aab0c0;margin-bottom:8px')
  panel.appendChild(status)

  const list = styled('div', 'overflow:auto;flex:1')
  list.appendChild(styled('div', 'padding:22px;text-align:center;color:#9aa0b0', 'Loading…'))
  panel.appendChild(list)

  let me = loadPlayerName()
  const refresh = async (): Promise<void> => renderRows(list, await topScores(10), me)

  if (submitValue !== undefined && me === '') {
    // First post: ask for a name, then submit.
    status.textContent = `You scored ${submitValue}! Enter a name to post it:`
    const form = styled('div', 'display:flex;gap:8px;margin-bottom:10px')
    const input = styled(
      'input',
      'flex:1;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.12);' +
        'background:#14141b;color:#fff;font-size:16px;outline:none',
    ) as HTMLInputElement
    input.maxLength = 12
    input.placeholder = 'Your name'
    const go = styled(
      'button',
      'padding:10px 16px;border:none;border-radius:10px;background:#2b8a3e;color:#fff;font-weight:700;cursor:pointer',
      'Post',
    ) as HTMLButtonElement
    form.appendChild(input)
    form.appendChild(go)
    panel.insertBefore(form, list)
    setTimeout(() => input.focus(), 50)

    const doPost = async (): Promise<void> => {
      const n = input.value.trim()
      if (n === '') {
        input.focus()
        return
      }
      me = n
      savePlayerName(n)
      form.remove()
      status.textContent = 'Posting…'
      const rank = await submitScore(n, submitValue)
      status.textContent = rank ? `You scored ${submitValue} — rank #${rank}!` : `Posted your ${submitValue}.`
      await refresh()
    }
    go.addEventListener('click', () => void doPost())
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void doPost()
    })
    await refresh()
    return
  }

  if (submitValue !== undefined) {
    status.textContent = `Posting your ${submitValue}…`
    await refresh()
    const rank = await submitScore(me, submitValue)
    status.textContent = rank ? `You scored ${submitValue} — rank #${rank}!` : `Posted your ${submitValue} as ${me}.`
    await refresh()
    return
  }

  status.textContent = me !== '' ? `Playing as ${me}` : ''
  await refresh()
}

// A small inline form to post a score the first time (no saved name yet). Pops
// automatically on game over so there's no button to hunt for. Resolves with the
// result, or null if dismissed.
export function promptNameAndSubmit(score: number): Promise<{ name: string; rank: number | null } | null> {
  return new Promise((resolve) => {
    if (!isConfigured()) {
      resolve(null)
      return
    }
    const ov = styled(
      'div',
      'position:fixed;inset:0;z-index:100001;display:flex;align-items:center;justify-content:center;' +
        'background:rgba(0,0,0,.55);font-family:-apple-system,"Segoe UI",Roboto,sans-serif',
    ) as HTMLDivElement
    blockGameInput(ov)
    const panel = styled(
      'div',
      'width:min(90vw,340px);background:#1c1c26;border:1px solid rgba(255,255,255,.1);border-radius:16px;' +
        'padding:18px;color:#e6e6ea;box-shadow:0 22px 60px rgba(0,0,0,.55)',
    )
    const header = styled('div', 'display:flex;align-items:center;justify-content:space-between;margin-bottom:4px')
    header.appendChild(styled('div', 'font-size:18px;font-weight:800', '🏆  Post to the leaderboard'))
    const xBtn = styled('button', 'border:none;background:transparent;color:#9aa0b0;font-size:22px;cursor:pointer;line-height:1', '✕')
    header.appendChild(xBtn)
    panel.appendChild(header)
    panel.appendChild(styled('div', 'font-size:14px;color:#9aa0b0;margin-bottom:12px', `You scored ${score} — pick a name:`))
    const row = styled('div', 'display:flex;gap:8px')
    const input = styled(
      'input',
      'flex:1;padding:11px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.14);' +
        'background:#14141b;color:#fff;font-size:16px;outline:none',
    ) as HTMLInputElement
    input.maxLength = 12
    input.placeholder = 'Your name'
    const post = styled(
      'button',
      'padding:11px 18px;border:none;border-radius:10px;background:#2b8a3e;color:#fff;font-weight:700;cursor:pointer',
      'Post',
    ) as HTMLButtonElement
    row.appendChild(input)
    row.appendChild(post)
    panel.appendChild(row)
    ov.appendChild(panel)
    document.body.appendChild(ov)
    setTimeout(() => input.focus(), 50)

    const done = (result: { name: string; rank: number | null } | null): void => {
      ov.remove()
      resolve(result)
    }
    const doPost = async (): Promise<void> => {
      const n = input.value.trim()
      if (n === '') {
        input.focus()
        return
      }
      savePlayerName(n)
      post.textContent = 'Posting…'
      post.disabled = true
      const rank = await submitScore(n, score)
      done({ name: n, rank })
    }
    post.addEventListener('click', () => void doPost())
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void doPost()
    })
    xBtn.addEventListener('click', () => done(null))
  })
}
