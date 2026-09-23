import type { GameContext, GameDef } from '../core/types'
import { $, pick, rnd } from '../core/utils'
import { photoImg } from '../core/sprites'
import { sfx, preloadSfx } from '../core/sfx'
import { fxAt, JUICE } from '../core/fx'
import { ICON } from '../core/icons'

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
/* L'étal : les rendus 2D du Food Kit — les mêmes objets que la 3D du projet */
/* Les marchandises sont de VRAIES photos depuis le 12/09 (règle du père :
   pas deux styles dans l'app). Les identifiants sont ceux de `PHOTOS`. */
const ITEMS = ['apple', 'carrot', 'baguette', 'cheese', 'strawberry',
  'egg', 'honey', 'corn', 'cookie', 'muffin', 'tomato', 'pear', 'cake']

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

type Mode = 'explore' | 'pay' | 'change'
interface State {
  running: boolean
  lock: boolean
  mode: Mode
  /** Pièces et billets posés dans le panier (en centimes). */
  tray: number[]
  /** Le compte à atteindre : le prix (Paye) ou la monnaie à rendre. */
  goal: number
  q: number
  totalQ: number
  mistakes: number
  /** Ce qu'on a touché dans Découvre. */
  seen: Set<number>
}

let mk: State | null = null
let ctx: GameContext

function bankDenoms(): number[] {
  return ctx.byTier([100, 200, 500], [10, 20, 50, 100, 200, 500], [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000])
}

function makePrice(): number {
  return ctx.byTier(rnd(1, 5) * 100, rnd(2, 19) * 50, rnd(35, 1450))
}

function buildBank(me: State, denoms: number[]) {
  const bank = $('mkBank')
  bank.innerHTML = ''
  denoms.forEach(v => {
    const d = DENOMS.find(x => x.v === v)!
    const b = document.createElement('button')
    b.className = 'mk-coin' + (d.kind === 'note' ? ' mk-note' : '')
    b.dataset.v = String(v)
    b.innerHTML = moneySVG(v)
    b.onclick = () => tapBank(me, v, b)
    bank.appendChild(b)
  })
}

function renderTray(me: State) {
  const tray = $('mkTray')
  tray.innerHTML = ''
  me.tray.forEach((v, i) => {
    const b = document.createElement('button')
    b.className = 'mk-coin mk-intray' + (v >= 500 ? ' mk-note' : '')
    b.innerHTML = moneySVG(v)
    b.onclick = () => {
      if (mk !== me || !me.running || me.lock) return
      me.tray.splice(i, 1); sfx('coins', { vol: 0.4, rate: 0.9 }); renderTray(me)
      const sum = me.tray.reduce((a, b) => a + b, 0)
      if (sum) ctx.say(speak(sum))
    }
    tray.appendChild(b)
  })
  const sum = me.tray.reduce((a, b) => a + b, 0)
  const tot = $('mkTotal')
  tot.textContent = sum ? fmt(sum) : '—'
  tot.classList.toggle('over', sum > me.goal)
  tot.classList.toggle('exact', sum === me.goal)
}

function tapBank(me: State, v: number, b: HTMLElement) {
  if (mk !== me || !me.running || me.lock) return
  if (me.mode === 'explore') {
    sfx('coins', { vol: 0.6 }); fxAt(b, JUICE.warm, 6)
    b.classList.remove('boing'); void b.offsetWidth; b.classList.add('boing')
    ctx.say(speak(v))
    me.seen.add(v)
    return
  }
  me.tray.push(v)
  sfx('coins', { vol: 0.6, rate: 1 + Math.random() * 0.1 })
  renderTray(me)
  const sum = me.tray.reduce((a, b) => a + b, 0)
  if (sum === me.goal) return success(me)
  if (sum > me.goal) { me.mistakes++; sfx('drop', { vol: 0.4, rate: 0.8 }) }
  // Le geste pédagogique du marché : on dit le total courant à chaque pièce
  ctx.say(speak(sum))
}

function success(me: State) {
  me.lock = true
  sfx('confirm', { vol: 0.8 })
  fxAt($('mkTray'), JUICE.green, 14)
  ctx.say(speak(me.goal))
  me.q++
  ctx.after(1300, () => {
    if (mk !== me || !me.running) return
    me.lock = false
    if (me.q >= me.totalQ) return finish(me)
    nextRound(me)
  })
}

function nextRound(me: State) {
  me.tray = []
  const price = makePrice()
  const item = pick(ITEMS)
  if (me.mode === 'pay') {
    me.goal = price
    $('mkItem').innerHTML = `<div class="mk-show">${photoImg(item, 210)}</div>
      <span class="mk-price">${fmt(price)}</span>`
  } else {
    // La monnaie : payé avec le plus petit billet au-dessus du prix
    const note = price < 500 ? 500 : price < 1000 ? 1000 : 2000
    me.goal = note - price
    $('mkItem').innerHTML = `<div class="mk-show">${photoImg(item, 210)}</div>
      <span class="mk-price">${fmt(price)}</span>
      <span class="mk-paid"><span class="mk-paynote">${moneySVG(note)}</span>${ICON.turnLeft}</span>`
  }
  // Les manches en pastilles, plus « 2/4 » à lire
  $('mkDots').innerHTML = Array.from({ length: me.totalQ }, (_, i) =>
    `<i class="sn-dot${i < me.q ? ' on' : ''}${i === me.q ? ' cur' : ''}"></i>`).join('')
  renderTray(me)
}

function setMode(me: State, mode: Mode) {
  me.mode = mode
  document.querySelectorAll<HTMLElement>('.mk-mode').forEach(x => x.classList.toggle('sel', x.dataset.m === mode))
  me.lock = false
  me.q = 0; me.mistakes = 0; me.tray = []
  const explore = mode === 'explore'
  // Découvre : les pièces prennent tout l'étal ; Paye / Monnaie : l'étal, la caisse, la bourse
  $('mkArena').classList.toggle('explore', explore)
  if (explore) {
    me.seen = new Set()
    buildBank(me, DENOMS.map(d => d.v))
  } else {
    me.totalQ = mode === 'pay' ? 4 : 3
    buildBank(me, bankDenoms())
    nextRound(me)
  }
}

function finish(me: State) {
  const stars = me.mistakes === 0 ? 3 : me.mistakes <= 2 ? 2 : 1
  ctx.finish({
    title: me.mode === 'pay' ? 'Le compte est bon !' : 'Monnaie rendue !',
    msg: `Tu as réussi ${me.q} paiement${me.q > 1 ? 's' : ''}`,
    stars
  })
}

export const market: GameDef = {
  id: 'market', name: 'Le Marché', icon: '💶', sq: 'sq-peach', cat: 'reflexion',
  subtitle: 'Découvre les pièces, paye et rends la monnaie !',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="arena mk-arena explore" id="mkArena">
        <div class="mk-modes">
          <button class="mk-mode sel" data-m="explore" aria-label="Découvre">${ICON.search}</button>
          <button class="mk-mode" data-m="pay" aria-label="Paye">${ICON.basket}</button>
          <button class="mk-mode" data-m="change" aria-label="La monnaie">${ICON.coins}</button>
        </div>
        <div class="mk-main">
          <div class="mk-stall">
            <div class="mk-awning"></div>
            <div class="mk-item" id="mkItem"></div>
            <div class="mk-counter"></div>
          </div>
          <div class="mk-traywrap" id="mkTrayWrap">
            <div class="mk-till"><div class="mk-total" id="mkTotal">—</div></div>
            <div class="mk-tray" id="mkTray"></div>
          </div>
        </div>
        <div class="mk-bank" id="mkBank"></div>
        <div class="mem-dots mk-dots" id="mkDots"></div>
        <button class="sn-tool go mk-done" id="mkDone" aria-label="Fini">${ICON.check}</button>
      </div>`
    preloadSfx(['coins', 'confirm', 'drop'])
    const me: State = { running: true, lock: false, mode: 'explore', tray: [], goal: 0, q: 0, totalQ: 0, mistakes: 0, seen: new Set() }
    mk = me
    document.querySelectorAll<HTMLElement>('.mk-mode').forEach(b => {
      b.onclick = () => { if (me.running) setMode(me, b.dataset.m as Mode) }
    })
    ;($('mkDone') as HTMLButtonElement).onclick = () => {
      if (!me.running || me.mode !== 'explore') return
      ctx.finish({
        title: 'Belle découverte !',
        msg: `Tu as écouté ${me.seen.size} pièces et billets`,
        stars: 3
      })
    }
    // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
    if ((window as unknown as { __BOT?: boolean }).__BOT) {
      ;(window as unknown as { __mk: unknown }).__mk = {
        get goal() { return me.goal }, get q() { return me.q }, get lock() { return me.lock }, get sum() { return me.tray.reduce((a, b) => a + b, 0) }
      }
    }
    setMode(me, 'explore')
    return () => { me.running = false; if (mk === me) mk = null }
  }
}
