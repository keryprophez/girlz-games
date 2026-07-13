import type { GameContext, GameDef } from '../core/types'
import { $, pick, rnd } from '../core/utils'
import { sGood, sNope, sPop, sWin } from '../core/audio'
import { fxAt, JUICE } from '../core/fx'

/* Le Marché de la Ferme — apprendre l'argent avec de vraies pièces en euros
   dessinées (cuivre, or, bicolores) et des billets. Trois façons de jouer :
   🔎 Découvre (tape une pièce, la voix dit sa valeur),
   🛒 Paye (compose le prix exact dans le panier),
   💰 La monnaie (le client paye avec un billet : rends la différence). */

interface Denom { v: number; kind: 'coin' | 'note' }
const DENOMS: Denom[] = [
  { v: 1, kind: 'coin' }, { v: 2, kind: 'coin' }, { v: 5, kind: 'coin' },
  { v: 10, kind: 'coin' }, { v: 20, kind: 'coin' }, { v: 50, kind: 'coin' },
  { v: 100, kind: 'coin' }, { v: 200, kind: 'coin' },
  { v: 500, kind: 'note' }, { v: 1000, kind: 'note' }, { v: 2000, kind: 'note' }
]
const ITEMS = ['🍎', '🥕', '🥖', '🧀', '🍓', '🥚', '🌻', '🍯', '🎈', '🍪']

/** Pièces et billets dessinés en SVG, aux couleurs des vrais euros. */
export function moneySVG(v: number): string {
  if (v >= 500) {
    const conf: Record<number, [string, string, string]> = {
      500: ['#B9BFC6', '#8E99A3', '5 €'], 1000: ['#F2B4A8', '#D98577', '10 €'], 2000: ['#9DBBE0', '#6E93C4', '20 €']
    }
    const [bg, edge, label] = conf[v]
    return `<svg viewBox="0 0 96 52" class="mk-svg">
      <rect x="2" y="2" width="92" height="48" rx="7" fill="${bg}" stroke="${edge}" stroke-width="3"/>
      <rect x="10" y="10" width="26" height="32" rx="4" fill="rgba(255,255,255,.45)"/>
      <circle cx="23" cy="26" r="8" fill="none" stroke="${edge}" stroke-width="2"/>
      <text x="62" y="34" text-anchor="middle" font-size="19" font-weight="800" fill="#3E3428" font-family="'Baloo 2',sans-serif">${label}</text>
    </svg>`
  }
  // Tailles relatives fidèles aux vraies pièces
  const R: Record<number, number> = { 1: 16, 2: 18, 5: 20.5, 10: 17.5, 20: 19.5, 50: 22, 100: 20, 200: 22.5 }
  const r = R[v]
  const label = v >= 100 ? `${v / 100} €` : `${v} c`
  let body: string
  if (v <= 5) {
    // Cuivre
    body = `<circle cx="30" cy="30" r="${r}" fill="#C97C4A" stroke="#A35F33" stroke-width="2.5"/>`
  } else if (v <= 50) {
    // Or
    body = `<circle cx="30" cy="30" r="${r}" fill="#EDC65C" stroke="#C89B32" stroke-width="2.5"/>`
  } else if (v === 100) {
    // 1 € : centre argent, anneau or
    body = `<circle cx="30" cy="30" r="${r}" fill="#EDC65C" stroke="#C89B32" stroke-width="2"/>
            <circle cx="30" cy="30" r="${r * 0.66}" fill="#D8DBDE" stroke="#B4B9BE" stroke-width="1.5"/>`
  } else {
    // 2 € : centre or, anneau argent
    body = `<circle cx="30" cy="30" r="${r}" fill="#D8DBDE" stroke="#A9AFB6" stroke-width="2"/>
            <circle cx="30" cy="30" r="${r * 0.66}" fill="#EDC65C" stroke="#C89B32" stroke-width="1.5"/>`
  }
  return `<svg viewBox="0 0 60 60" class="mk-svg">${body}
    <text x="30" y="${30 + r * 0.28}" text-anchor="middle" font-size="${r * 0.62}" font-weight="800"
      fill="#4A3A22" font-family="'Baloo 2',sans-serif">${label}</text>
  </svg>`
}

/** « 2,50 € », « 50 c », « 3 € » */
function fmt(c: number): string {
  if (c < 100) return `${c} c`
  if (c % 100 === 0) return `${c / 100} €`
  return `${Math.floor(c / 100)},${String(c % 100).padStart(2, '0')} €`
}

/** Ce que la voix a le droit de dire : la valeur, rien d'autre. */
function speak(c: number): string {
  const e = Math.floor(c / 100), ct = c % 100
  if (e && ct) return `${e} euro${e > 1 ? 's' : ''} ${ct}`
  if (e) return `${e} euro${e > 1 ? 's' : ''}`
  return `${ct} centime${ct > 1 ? 's' : ''}`
}

let mk: any = null
let ctx: GameContext

function bankDenoms(): number[] {
  return ctx.byTier([100, 200, 500], [10, 20, 50, 100, 200, 500], [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000])
}

function makePrice(): number {
  return ctx.byTier(rnd(1, 5) * 100, rnd(2, 19) * 50, rnd(35, 1450))
}

function buildBank(denoms: number[]) {
  const bank = $('mkBank')
  bank.innerHTML = ''
  denoms.forEach(v => {
    const d = DENOMS.find(x => x.v === v)!
    const b = document.createElement('button')
    b.className = 'mk-coin' + (d.kind === 'note' ? ' mk-note' : '')
    b.innerHTML = moneySVG(v)
    b.onclick = () => tapBank(v, b)
    bank.appendChild(b)
  })
}

function renderTray() {
  const tray = $('mkTray')
  tray.innerHTML = ''
  mk.tray.forEach((v: number, i: number) => {
    const b = document.createElement('button')
    b.className = 'mk-coin mk-intray' + (v >= 500 ? ' mk-note' : '')
    b.innerHTML = moneySVG(v)
    b.onclick = () => {
      if (!mk || !mk.running || mk.lock) return
      mk.tray.splice(i, 1); sPop(); renderTray()
    }
    tray.appendChild(b)
  })
  const sum = mk.tray.reduce((a: number, b: number) => a + b, 0)
  const tot = $('mkTotal')
  tot.textContent = sum ? fmt(sum) : '—'
  tot.classList.toggle('over', sum > mk.goal)
  tot.classList.toggle('exact', sum === mk.goal)
}

function tapBank(v: number, b: HTMLElement) {
  if (!mk || !mk.running || mk.lock) return
  if (mk.mode === 'explore') {
    sPop(); fxAt(b, JUICE.warm, 6)
    b.classList.remove('boing'); void b.offsetWidth; b.classList.add('boing')
    ctx.say(speak(v))
    mk.seen.add(v)
    return
  }
  mk.tray.push(v)
  sPop()
  renderTray()
  const sum = mk.tray.reduce((a: number, b: number) => a + b, 0)
  if (sum === mk.goal) return success()
  if (sum > mk.goal) { mk.mistakes++; sNope() }
}

function success() {
  mk.lock = true
  sGood()
  fxAt($('mkTray'), JUICE.green, 14)
  ctx.say(speak(mk.goal))
  mk.q++
  setTimeout(() => {
    if (!mk || !mk.running) return
    mk.lock = false
    if (mk.q >= mk.totalQ) return finish()
    nextRound()
  }, 1300)
}

function nextRound() {
  mk.tray = []
  const price = makePrice()
  const item = pick(ITEMS)
  if (mk.mode === 'pay') {
    mk.goal = price
    $('mkItem').innerHTML = `<span class="mk-emoji">${item}</span>
      <span class="mk-price">${fmt(price)}</span>
      <span class="mk-sub">${mk.q + 1}/${mk.totalQ}</span>`
  } else {
    // La monnaie : payé avec le plus petit billet au-dessus du prix
    const note = price < 500 ? 500 : price < 1000 ? 1000 : 2000
    mk.goal = note - price
    $('mkItem').innerHTML = `<span class="mk-emoji">${item}</span>
      <span class="mk-price">${fmt(price)}</span>
      <span class="mk-paid">payé avec ${moneySVG(note)}</span>
      <span class="mk-sub">${mk.q + 1}/${mk.totalQ}</span>`
  }
  renderTray()
}

function setMode(mode: string) {
  mk.mode = mode
  document.querySelectorAll<HTMLElement>('.mk-mode').forEach(x => x.classList.toggle('sel', x.dataset.m === mode))
  mk.lock = false
  mk.q = 0; mk.mistakes = 0; mk.tray = []
  const explore = mode === 'explore'
  $('mkItem').style.display = explore ? 'none' : ''
  $('mkTrayWrap').style.display = explore ? 'none' : ''
  $('mkDone').style.display = explore ? '' : 'none'
  if (explore) {
    mk.seen = new Set()
    $('mkPrompt').textContent = 'Tape une pièce pour entendre sa valeur 🔎'
    buildBank(DENOMS.map(d => d.v))
  } else {
    mk.totalQ = mode === 'pay' ? 4 : 3
    $('mkPrompt').textContent = mode === 'pay'
      ? '🛒 Mets les pièces dans le panier pour payer le prix exact !'
      : '💰 Le client a payé : rends-lui la monnaie exacte !'
    buildBank(bankDenoms())
    nextRound()
  }
}

function finish() {
  sWin()
  const stars = mk.mistakes === 0 ? 3 : mk.mistakes <= 2 ? 2 : 1
  ctx.finish({
    title: mk.mode === 'pay' ? 'Le compte est bon !' : 'Monnaie rendue !',
    msg: `${ctx.playerName} a réussi ${mk.q} paiements (${mk.mistakes} dépassement${mk.mistakes > 1 ? 's' : ''}) 💶`,
    stars, starsEarned: stars
  })
}

export const market: GameDef = {
  id: 'market', name: 'Le Marché', icon: '💶', sq: 'sq-peach', cat: 'reflexion',
  subtitle: 'Découvre les pièces, paye et rends la monnaie !',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="topbar">
        <button class="chip mk-mode sel" data-m="explore">🔎 Découvre</button>
        <button class="chip mk-mode" data-m="pay">🛒 Paye</button>
        <button class="chip mk-mode" data-m="change">💰 La monnaie</button>
      </div>
      <div class="gsub" id="mkPrompt"></div>
      <div class="mk-item" id="mkItem"></div>
      <div class="mk-traywrap" id="mkTrayWrap">
        <div class="mk-tray" id="mkTray"></div>
        <div class="mk-total" id="mkTotal">—</div>
      </div>
      <div class="mk-bank" id="mkBank"></div>
      <button class="bigbtn primary" id="mkDone" style="margin-top:10px">✨ J'ai tout écouté</button>`
    mk = { running: true, lock: false, tray: [], seen: new Set() }
    document.querySelectorAll<HTMLElement>('.mk-mode').forEach(b => {
      b.onclick = () => mk && mk.running && setMode(b.dataset.m!)
    })
    ;($('mkDone') as HTMLButtonElement).onclick = () => {
      if (!mk || !mk.running || mk.mode !== 'explore') return
      sWin()
      ctx.finish({
        title: 'Belle découverte !',
        msg: `${ctx.playerName} a écouté ${mk.seen.size} pièces et billets 💶`,
        stars: 3, starsEarned: 3
      })
    }
    setMode('explore')
    return () => { if (mk) { mk.running = false; mk = null } }
  }
}
