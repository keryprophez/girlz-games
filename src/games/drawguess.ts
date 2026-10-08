import type { GameContext, GameDef } from '../core/types'
import { createStage, loader, type Stage, type T3 } from '../core/three3d'
import { particles, toScreen, type Particles } from '../core/scene3d'
import { buildFarm } from '../core/farm3d'
import { critterKit, type Critter, type CritterKit } from '../core/critters'
import { cry, preloadCries, sfx, preloadSfx } from '../core/sfx'
import { photoImg } from '../core/sprites'
import { ICON } from '../core/icons'
import { shuffle } from '../core/utils'
import { visible } from '../core/hand'
import {
  candidates, getKey, setKey, looksLikeKey, guessDrawing, GuessFailure, matches, spoken, POOLS,
  type Guess, type GuessError
} from '../core/drawguess'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MathGate } from '../components/PlayTimer'

/* 🎨 DEVINE MON DESSIN (8/10, Jouer ; le père : « DEVINE MON DESSIN ! »,
   puis « met un chat ») — elle dessine sur la feuille de l'Atelier, le chat
   de la ferme, sur sa botte de foin, regarde et devine. C'est Claude qui
   regarde (core/drawguess.ts : la clé du père, le dessin seul envoyé).

   - Défi : la photo de l'imagier épinglée sur la feuille dit quoi dessiner
     (sans un mot). « Fini » (l'œil) : il réfléchit (la tête penchée, trois
     points), puis propose — il le DIT et le MONTRE en photo. Trouvé : il
     saute, crie de sa vraie voix, confettis, la photo se coche, une étoile.
     Sinon il propose la suivante (trois à la fleur, deux à l'éclair, une à
     la flamme), puis hausse les épaules : on peut ajouter des détails et
     lui remontrer, ou passer (« Suivant »). Cinq dessins par partie.
   - La rampe est dans ce qu'il connaît : à la fleur il choisit parmi les
     quatorze sujets de la fleur, à l'éclair parmi vingt-neuf, à la flamme
     parmi tout (et il n'a droit qu'à une réponse).
   - Libre : elle dessine ce qu'elle veut ; il propose, elle répond du
     pouce (Oui / Non). Pas de score : une création ne se note pas.
   - Sans clé, sans réseau : on dessine quand même ; la bulle montre un
     cadenas (ou un nuage), le bouton « Clé » ouvre la Question de grand.
   - Le signe « c'est une IA » (demandé par Anthropic) : l'étincelle dorée
     au-dessus du chat. */

type Mode = 'defi' | 'libre'
type Phase = 'load' | 'draw' | 'think' | 'show' | 'win' | 'out'
type Anim = 'idle' | 'think' | 'propose' | 'yes' | 'no' | 'shrug'

/** La feuille : son dessin, en pixels de canvas (4:3,1). */
const CW = 1024, CH = 800
/** La couleur du papier (aussi le fond de l'image envoyée). */
const PAPER = '#FFFDF8'
const PALETTE = ['#E8414F', '#FFA94D', '#FFD43B', '#94D82D', '#4FB8E7', '#9C6ADE', '#8B5E3C', '#3A2E25']
const SIZES = [7, 14, 26]
const ROUNDS = 5
/** La taille du chat à l'écran (unités de scène), le dessus de la botte. */
const HEIGHT = 0.74
const SEAT = { y: 0.46, z: 0.9 }

const svg = (inner: string, s = 40) => `<svg viewBox="0 0 48 48" width="${s}" height="${s}" aria-hidden="true">${inner}</svg>`
const I = {
  eraser: svg(`<path d="M6 30L24 12l16 16-12 12H16z" fill="#FF9CB1"/><path d="M6 30l8-8 16 16-2 2H16z" fill="#F4F0EA"/><path d="M16 40h26" stroke="#B9AEA2" stroke-width="3" stroke-linecap="round"/>`, 32),
  trash: svg(`<path d="M12 15h24l-2 25a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3z" fill="#E8574C"/><rect x="8" y="9" width="32" height="6" rx="2.5" fill="#C8453B"/><rect x="19" y="5" width="10" height="6" rx="2.5" fill="#C8453B"/><path d="M19 21v16M24 21v16M29 21v16" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".85"/>`, 32),
  /** « Fini » : un œil (montre-lui ton dessin). */
  eye: svg(`<path d="M4 24c5-9 12-14 20-14s15 5 20 14c-5 9-12 14-20 14S9 33 4 24z" fill="#fff"/><circle cx="24" cy="24" r="8.5" fill="#2E7D4F"/><circle cx="26.5" cy="21.5" r="2.6" fill="#fff"/>`, 52),
  /** L'étincelle : « c'est une IA qui devine ». */
  spark: svg(`<path d="M24 3c2 11 6 15 18 21-12 6-16 10-18 21-2-11-6-15-18-21 12-6 16-10 18-21z" fill="#FFD34D" stroke="#E0A800" stroke-width="2" stroke-linejoin="round"/><path d="M38 4c.8 4 2.2 5.4 6 6.5-3.8 1.1-5.2 2.5-6 6.5-.8-4-2.2-5.4-6-6.5 3.8-1.1 5.2-2.5 6-6.5z" fill="#FFE98A"/>`, 34),
  pencil: svg(`<path d="M10 38l4-12 20-20 8 8-20 20z" fill="#FFD43B" stroke="#45362A" stroke-width="2.5" stroke-linejoin="round"/><path d="M10 38l4-12 8 8z" fill="#F4D8B0" stroke="#45362A" stroke-width="2.5" stroke-linejoin="round"/><path d="M10 38l2-6 4 4z" fill="#45362A"/>`, 30),
  thumb: (up: boolean) => svg(`<g transform="${up ? '' : 'rotate(180 24 24)'}"><path d="M14 22h-6v18h6zM17 40h17c3 0 5-2 6-5l3-10c1-3-1-6-4-6h-9l2-7c1-4-2-7-5-6l-10 14z" fill="#fff"/></g>`, 46),
  next: svg(`<path d="M10 24h24M24 12l12 12-12 12" fill="none" stroke="#45362A" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`, 32),
  key: svg(`<circle cx="15" cy="24" r="9" fill="none" stroke="#B9851F" stroke-width="5"/><path d="M24 24h18M36 24v7M42 24v5" fill="none" stroke="#B9851F" stroke-width="5" stroke-linecap="round"/>`, 32),
  lock: svg(`<rect x="10" y="21" width="28" height="22" rx="5" fill="#B9851F"/><path d="M16 21v-6a8 8 0 0 1 16 0v6" fill="none" stroke="#B9851F" stroke-width="5"/><circle cx="24" cy="31" r="3.4" fill="#fff"/><rect x="22.6" y="32" width="2.8" height="6" rx="1.4" fill="#fff"/>`, 84),
  cloud: svg(`<path d="M14 36h22a8 8 0 0 0 0-16 11 11 0 0 0-21-2 8 8 0 0 0-1 18z" fill="#B8C4D0"/><path d="M19 25l10 10M29 25 19 35" stroke="#fff" stroke-width="3.6" stroke-linecap="round"/>`, 84),
  wait: svg(`<path d="M14 6h20v6c0 5-5 8-7.5 12 2.5 4 7.5 7 7.5 12v6H14v-6c0-5 5-8 7.5-12C19 20 14 17 14 12z" fill="#FFD34D" stroke="#B9851F" stroke-width="2.5" stroke-linejoin="round"/>`, 84),
  what: svg(`<circle cx="24" cy="24" r="20" fill="#FFE8A3"/><path d="M17.5 18a6.5 6.5 0 1 1 9.5 5.8c-2 1-3 2.2-3 4.6v1.6" fill="none" stroke="#B9851F" stroke-width="4.4" stroke-linecap="round"/><circle cx="24" cy="36.5" r="2.8" fill="#B9851F"/>`, 120),
  libre: svg(`<path d="M10 38l4-12 20-20 8 8-20 20z" fill="#FF8FB8" stroke="#45362A" stroke-width="2.5" stroke-linejoin="round"/><path d="M10 38l4-12 8 8z" fill="#F4D8B0" stroke="#45362A" stroke-width="2.5" stroke-linejoin="round"/><path d="M33 34c3-2 6 1 4 4s-6 3-8 1" fill="none" stroke="#9C6ADE" stroke-width="3" stroke-linecap="round"/>`, 34),
  defi: svg(`<rect x="7" y="9" width="30" height="30" rx="3" fill="#fff" stroke="#45362A" stroke-width="2.5" transform="rotate(-8 22 24)"/><circle cx="21" cy="21" r="5" fill="#FFA94D" transform="rotate(-8 22 24)"/><path d="M11 34l8-8 6 5 5-4 6 7z" fill="#94D82D" transform="rotate(-8 22 24)"/><rect x="16" y="5" width="12" height="6" rx="1.5" fill="#FFE98A" transform="rotate(4 22 8)"/>`, 34)
}

interface Stroke { last: { x: number; y: number }; mid: { x: number; y: number } }

interface S {
  stage: Stage
  T: T3
  kit: CritterKit
  cat: Critter
  catY0: number
  fx: Particles
  mode: Mode
  phase: Phase
  round: number
  found: number
  targets: string[]
  target: string | null
  guess: Guess | null
  /** Quelle proposition est montrée ; combien il a le droit d'en montrer. */
  gi: number
  shown: number
  /** Combien de fois elle lui a montré ce dessin. */
  tries: number
  anim: Anim
  animT: number
  t: number
  dirty: boolean
  color: string
  size: number
  eraser: boolean
  strokes: Map<number, Stroke>
  abort: AbortController | null
  error: GuessError | 'nokey' | null
}

let me: S | null = null
let ctx: GameContext
/** Le bot (scripts/play.mjs) répond à la place de Claude : jamais de vrai appel en intégration. */
type Fake = (target: string | null) => Guess | Promise<Guess>
let fake: Fake | null = null

const $q = <T extends HTMLElement>(sel: string) => ctx.root.querySelector<T>(sel)!

/* ---------- La feuille ---------- */
function paint(s: S, id: number, x: number, y: number, first: boolean) {
  const g = $q<HTMLCanvasElement>('#dgCv').getContext('2d')!
  g.lineCap = 'round'; g.lineJoin = 'round'
  g.globalCompositeOperation = s.eraser ? 'destination-out' : 'source-over'
  g.strokeStyle = s.color; g.fillStyle = s.color
  g.lineWidth = s.eraser ? SIZES[2] * 1.6 : s.size
  const st = s.strokes.get(id)
  if (first || !st) {
    g.beginPath(); g.arc(x, y, g.lineWidth / 2, 0, Math.PI * 2); g.fill()
    s.strokes.set(id, { last: { x, y }, mid: { x, y } })
  } else {
    // Une courbe douce d'un milieu au suivant (pas de coins sur un trait rapide)
    const mid = { x: (st.last.x + x) / 2, y: (st.last.y + y) / 2 }
    g.beginPath(); g.moveTo(st.mid.x, st.mid.y); g.quadraticCurveTo(st.last.x, st.last.y, mid.x, mid.y); g.stroke()
    st.last = { x, y }; st.mid = mid
  }
  g.globalCompositeOperation = 'source-over'
  if (!s.eraser) s.dirty = true
  syncDone(s)
}

function clearPaper(s: S) {
  const cv = $q<HTMLCanvasElement>('#dgCv')
  cv.getContext('2d')!.clearRect(0, 0, CW, CH)
  s.dirty = false
  syncDone(s)
}

/** Le dessin tel qu'on le montre : réduit (512 px de large), sur le papier, en PNG base64. */
function exportPng(): string {
  const src = $q<HTMLCanvasElement>('#dgCv')
  const c = document.createElement('canvas')
  c.width = 512; c.height = Math.round(512 * CH / CW)
  const g = c.getContext('2d')!
  g.fillStyle = PAPER; g.fillRect(0, 0, c.width, c.height)
  g.drawImage(src, 0, 0, c.width, c.height)
  return c.toDataURL('image/png').split(',')[1]
}

/* ---------- La mise en page (la feuille, le plateau, les boutons) ---------- */
function layout() {
  const a = $q('#dgWrap').getBoundingClientRect()
  const W = a.width, H = a.height
  const x0 = Math.max(16, W * 0.045), y0 = Math.max(70, H * 0.115)
  const ph = Math.max(200, Math.min(H - y0 - 116, W * 0.56 / 1.28)), pw = ph * 1.28
  const paper = $q('#dgPaper')
  Object.assign(paper.style, { left: `${x0}px`, top: `${y0}px`, width: `${pw}px`, height: `${ph}px` })
  Object.assign($q('#dgTray').style, { left: `${x0}px`, top: `${y0 + ph + 16}px`, width: `${Math.min(W - x0 - 16, pw + 150)}px` })
  // « Fini » dans le coin de la feuille, au-dessus du plateau d'outils
  const d = Math.min(104, H * 0.13)
  Object.assign($q('#dgDone').style, { left: `${x0 + pw - d * 0.55}px`, top: `${y0 + ph - d - 26}px` })
  const card = $q('#dgCard')
  const cw = Math.round(ph * 0.3)
  card.style.width = `${cw}px`
  card.style.setProperty('--p', `${Math.round(cw * 0.06)}px`)
}

function syncDone(s: S) {
  const done = $q('#dgDone')
  done.hidden = s.phase !== 'draw'
  done.classList.toggle('dg-ready', s.dirty)
  $q('#dgNext').hidden = !(s.phase === 'draw' && s.tries > 0)
}

/* ---------- Ce qu'il dit : la bulle ---------- */
function bubble(html: string | null, cls = '') {
  const b = $q('#dgBubble')
  b.hidden = !html
  if (html) { b.innerHTML = html; b.className = 'dg-bubble ' + cls }
}

const FAIL_ICON: Record<GuessError | 'nokey', string> = { nokey: I.lock, cle: I.lock, reseau: I.cloud, limite: I.wait, refus: I.what, autre: I.cloud }

function showError(s: S, why: GuessError | 'nokey') {
  s.error = why
  bubble(`<span class="dg-icon">${FAIL_ICON[why]}</span>`, 'dg-err')
  // Sans clé (ou une clé refusée) : le bouton « Clé » apparaît pour un grand
  $q('#dgKeyItem').hidden = !(why === 'nokey' || why === 'cle')
  sfx('error', { vol: 0.25, rate: 0.9 })
  setAnim(s, 'shrug')
  s.phase = 'draw'
  syncDone(s)
}

function setAnim(s: S, a: Anim) { s.anim = a; s.animT = 0 }

/* ---------- Les manches ---------- */
function startRound(s: S) {
  s.phase = 'draw'; s.tries = 0; s.guess = null; s.gi = 0
  s.target = s.mode === 'defi' ? s.targets[s.round % s.targets.length] : null
  const card = $q('#dgCard')
  card.hidden = s.mode !== 'defi'
  if (s.target) {
    card.innerHTML = `<i class="tape"></i>${photoImg(s.target, 160)}<span class="pen">${I.pencil}</span>`
    card.classList.remove('ok', 'skip')
    card.classList.add('dg-in'); ctx.after(500, () => card.classList.remove('dg-in'))
  }
  clearPaper(s)
  bubble(null)
  if (!getKey() && !fake) showError(s, 'nokey')
  setAnim(s, 'idle')
  pips(s)
  syncDone(s)
}

function pips(s: S) {
  const p = $q('#dgPips')
  p.hidden = s.mode !== 'defi'
  p.innerHTML = Array.from({ length: ROUNDS }, (_, i) => `<i class="${i < s.round ? (s.found > i ? 'got' : 'miss') : i === s.round ? 'now' : ''}">${i < s.found ? ICON.star : ''}</i>`).join('')
}

async function onDone(s: S) {
  if (s.phase !== 'draw') return
  if (!s.dirty) { $q('#dgDone').classList.add('dg-shake'); ctx.after(500, () => $q('#dgDone').classList.remove('dg-shake')); sfx('tick', { vol: 0.3 }); return }
  const key = getKey()
  if (!key && !fake) { showError(s, 'nokey'); return }
  s.phase = 'think'; s.tries++; s.error = null
  syncDone(s)
  bubble('<div class="dg-dots"><i></i><i></i><i></i></div>', 'dg-think')
  setAnim(s, 'think')
  sfx('whoosh', { vol: 0.25, rate: 1.3 })
  const png = exportPng()
  const t0 = performance.now()
  const cands = s.mode === 'defi' ? candidates(ctx.tier) : null
  let g: Guess
  try {
    if (fake) g = await fake(s.target)
    else {
      s.abort = new AbortController()
      g = await guessDrawing(key, png, cands, s.abort.signal)
    }
  } catch (e) {
    if (me !== s || !ctx.alive()) return
    showError(s, e instanceof GuessFailure ? e.why : 'autre')
    return
  } finally { s.abort = null }
  if (me !== s || !ctx.alive()) return
  // Il réfléchit au moins un peu (une réponse instantanée ne se croit pas)
  const wait = Math.max(0, 1300 - (performance.now() - t0))
  ctx.after(wait, () => {
    if (me !== s) return
    s.guess = g; s.gi = 0
    s.shown = s.mode === 'defi' ? ctx.byTier(3, 2, 1) : 3
    reveal(s)
  })
}

/** Il propose : il le dit, il le montre (la photo de l'imagier, ou un point d'interrogation doré). */
function reveal(s: S) {
  const it = s.guess!.items[s.gi]
  s.phase = 'show'
  bubble(`${it.photo ? photoImg(it.photo, 168) : `<span class="dg-icon">${I.what}</span>`}<button class="dg-say" id="dgSay" aria-label="Encore">${ICON.sound}</button>`, 'dg-show')
  $q('#dgSay').onclick = () => ctx.say(spoken(it))
  ctx.say(spoken(it))
  setAnim(s, 'propose')
  sfx('pluck', { vol: 0.35, rate: 1.2 })
  const thumbs = $q('#dgThumbs')
  if (s.mode === 'libre') { thumbs.hidden = false; return }
  thumbs.hidden = true
  ctx.after(1500, () => {
    if (me !== s || s.phase !== 'show') return
    if (s.target && matches(it, s.target)) win(s)
    else wrong(s)
  })
}

/** Ce n'est pas ça : il secoue la tête, et propose la suivante… ou hausse les épaules. */
function wrong(s: S) {
  setAnim(s, 'no')
  sfx('cloth', { vol: 0.3, rate: 0.8 })
  s.gi++
  if (s.guess && s.gi < Math.min(s.shown, s.guess.items.length)) {
    ctx.after(1100, () => { if (me === s && s.phase === 'show') reveal(s) })
    return
  }
  ctx.after(900, () => {
    if (me !== s) return
    bubble(`<span class="dg-icon">${I.what}</span>`, 'dg-err')
    setAnim(s, 'shrug')
    $q('#dgThumbs').hidden = true
    // Elle peut ajouter des détails et le lui remontrer, ou passer ; au troisième essai, on passe
    if (s.tries >= 3) { ctx.after(1600, () => { if (me === s) skip(s) }); return }
    s.phase = 'draw'
    syncDone(s)
  })
}

function win(s: S) {
  s.phase = 'win'
  $q('#dgThumbs').hidden = true
  setAnim(s, 'yes')
  if (!cry('chat', { vol: 0.8, max: 1.3 })) sfx('pluck', { vol: 0.6, rate: 1.4 })
  sfx('confirm', { vol: 0.5, delay: 0.15 })
  const head = s.cat.obj.position.clone().setY(SEAT.y + HEIGHT * 0.9)
  for (let k = 0; k < 3; k++) ctx.after(k * 260, () => { if (me === s) s.fx.burst(head, { count: 30, color: [0xFFD34D, 0xFF6B81, 0x4FB8E7, 0x5EC97B, 0xB197FC], speed: 2.4, spread: 1, life: 1.2, size: 0.04, gravity: 2.5 }) })
  if (s.mode === 'defi') { s.found++; $q('#dgCard').classList.add('ok') }
  ctx.after(2800, () => { if (me === s) next(s) })
}

function skip(s: S) {
  if (s.mode === 'defi') $q('#dgCard').classList.add('skip')
  sfx('whoosh', { vol: 0.25, rate: 0.9 })
  ctx.after(s.mode === 'defi' ? 500 : 0, () => { if (me === s) next(s) })
}

function next(s: S) {
  s.round++
  if (s.round >= ROUNDS) { outro(s); return }
  startRound(s)
}

function outro(s: S) {
  s.phase = 'out'
  bubble(null)
  setAnim(s, 'yes')
  if (s.mode === 'libre') {
    ctx.finish({ title: 'Quels jolis dessins !', msg: 'Le chat a regardé tes cinq dessins', stars: 3, score: ROUNDS, scoreIcon: I.pencil, outroMs: 1800 })
    return
  }
  const stars: 1 | 2 | 3 = s.found >= 4 ? 3 : s.found >= 2 ? 2 : 1
  ctx.finish({ title: s.found >= 4 ? 'Il a reconnu tes dessins !' : 'Bien dessiné !', msg: `Le chat a deviné ${s.found} dessin${s.found > 1 ? 's' : ''} sur ${ROUNDS}`, stars, score: s.found, scoreIcon: ICON.star, outroMs: 1800 })
}

function setMode(s: S, m: Mode) {
  if (m === s.mode && s.round === 0 && !s.dirty) return
  s.abort?.abort()
  s.mode = m
  ctx.root.querySelectorAll<HTMLElement>('.dg-mode').forEach(b => b.classList.toggle('sel', b.dataset.m === m))
  s.round = 0; s.found = 0
  s.targets = shuffle(POOLS[ctx.tier].slice())
  $q('#dgThumbs').hidden = true
  startRound(s)
  sfx('select', { vol: 0.3 })
}

/* ---------- La clé (un grand : la Question de grand, puis la clé) ---------- */
let gateRoot: Root | null = null
function openKey(s: S) {
  const sheet = $q('#dgSheet')
  sheet.hidden = false
  const close = () => { gateRoot?.unmount(); gateRoot = null; sheet.hidden = true; sheet.innerHTML = '' }
  sheet.innerHTML = '<div class="modal" id="dgGate"></div>'
  sheet.onclick = e => { if (e.target === sheet) close() }
  gateRoot = createRoot($q('#dgGate'))
  gateRoot.render(createElement(MathGate, {
    onClose: close,
    onSuccess: () => {
      gateRoot?.unmount(); gateRoot = null
      const had = !!getKey()
      sheet.innerHTML = `<div class="modal dg-keybox">
        <div class="pt-gate-title">Clé de l'API Claude</div>
        <p>Colle ici ta clé (platform.claude.com → API Keys). Elle reste sur cette tablette ; seul le dessin est envoyé, pour que le chat le devine.</p>
        <input id="dgKeyIn" type="password" autocomplete="off" spellcheck="false" placeholder="sk-ant-…">
        <div class="dg-keyrow"><button class="bigbtn" id="dgKeyOk">Garder</button>${had ? '<button class="bigbtn ghost" id="dgKeyDel">Retirer la clé</button>' : ''}<button class="bigbtn ghost" id="dgKeyNo">Annuler</button></div>
        <div class="dg-keyerr" id="dgKeyErr" hidden>Ce n'est pas une clé de l'API (elle commence par sk-ant-)</div>
      </div>`
      const inp = $q<HTMLInputElement>('#dgKeyIn')
      inp.focus()
      $q('#dgKeyOk').onclick = () => {
        if (!looksLikeKey(inp.value)) { $q('#dgKeyErr').hidden = false; return }
        setKey(inp.value)
        close()
        $q('#dgKeyItem').hidden = true
        if (s.phase === 'draw') bubble(null)
        sfx('confirm', { vol: 0.4 })
      }
      const del = ctx.root.querySelector<HTMLElement>('#dgKeyDel')
      if (del) del.onclick = () => { setKey(''); close(); showError(s, 'nokey') }
      $q('#dgKeyNo').onclick = close
    }
  }))
}

/* ---------- Chaque image : le chat, la bulle qui le suit ---------- */
function frame(s: S, dt: number) {
  s.t += dt; s.animT += dt
  const { cat } = s
  const o = cat.obj
  s.kit.blink(cat, dt)
  // La caméra glisse de côté : le chat à droite de l'écran, quelle que soit la forme de l'écran
  const cam = s.stage.camera
  const X = 0.55 * 3.1 * Math.tan(cam.fov * Math.PI / 360) * cam.aspect
  cam.position.set(X, 1.22, -2.25); cam.lookAt(X, 0.98, SEAT.z)
  const sc = 1 + Math.sin(s.t * 2.2) * 0.008
  let y = s.catY0, rz = 0, ry = Math.PI - 0.42
  const u = s.animT
  switch (s.anim) {
    case 'think': rz = Math.sin(u * 1.8) * 0.14; y += Math.abs(Math.sin(u * 3.6)) * 0.008; break
    case 'propose': ry = Math.PI - 0.12 * Math.min(1, u * 4); y += Math.max(0, Math.sin(Math.min(1, u * 3) * Math.PI)) * 0.06; break
    case 'yes': ry = Math.PI - 0.1 + (u < 0.8 ? u / 0.8 * Math.PI * 2 : 0); y += Math.abs(Math.sin(u * 7)) * 0.12 * Math.max(0, 1 - u / 2.4); break
    case 'no': ry = Math.PI - 0.3 + Math.sin(u * 16) * 0.28 * Math.max(0, 1 - u / 0.8); break
    case 'shrug': rz = Math.sin(u * 7) * 0.09 * Math.max(0, 1 - u / 1.2); break
  }
  o.position.y = y
  o.rotation.set(0, ry, rz)
  o.scale.setScalar(o.userData.k as number * sc)
  s.fx.update(dt)
  // La bulle, l'étincelle et les pouces suivent sa tête
  const head = toScreen(s.stage, { x: o.position.x, y: SEAT.y + HEIGHT * 0.95, z: SEAT.z })
  const a = $q('#dgWrap').getBoundingClientRect()
  const hx = head.x - a.left, hy = head.y - a.top
  const b = $q('#dgBubble')
  if (!b.hidden) { b.style.left = `${hx}px`; b.style.top = `${hy - 14}px` }
  const sp = $q('#dgSpark')
  sp.style.left = `${hx + 46}px`; sp.style.top = `${hy - 40}px`
  const th = $q('#dgThumbs')
  if (!th.hidden) { th.style.left = `${hx}px`; th.style.top = `${Math.min(a.height - 130, hy + a.height * 0.36)}px` }
}

export const drawguess: GameDef = {
  id: 'drawguess', name: 'Devine mon dessin', icon: '🖍️', sq: 'sq-sun', cat: 'reflexion', music: 'meadow',
  subtitle: 'Dessine, et le chat de la ferme devine ce que c\'est',
  // La main : dessiner sur la feuille, puis lui montrer (l'œil) ; en Libre, lui répondre du pouce
  hand: root => {
    const s = me
    if (!s) return null
    if (s.phase === 'show' && s.mode === 'libre') {
      const th = visible(root, '#dgThumbs button')
      return th.length ? { choose: th } : null
    }
    if (s.phase !== 'draw' || s.error) return null
    if (s.dirty) { const d = visible(root, '#dgDone button'); return d.length ? { tap: d[0] } : null }
    const p = root.querySelector('#dgPaper')?.getBoundingClientRect()
    if (!p) return null
    return { trace: [0, 1, 2, 3, 4, 5, 6, 7, 8].map(k => { const a = k / 8 * Math.PI * 2; return { x: p.left + p.width * (0.5 + Math.cos(a) * 0.16), y: p.top + p.height * (0.48 + Math.sin(a) * 0.2) } }) }
  },
  mount(c) {
    ctx = c
    let dead = false
    c.root.innerHTML = `
      <div class="arena g3-arena dg-wrap" id="dgWrap">
        <div class="dg-pips" id="dgPips"></div>
        <div class="dg-paper" id="dgPaper"><canvas id="dgCv" width="${CW}" height="${CH}"></canvas>
          <div class="dg-card" id="dgCard" hidden></div>
        </div>
        <div class="dg-tray" id="dgTray">
          ${PALETTE.map((p, i) => `<button class="at-color${i === 1 ? ' sel' : ''}" data-c="${p}" style="background:${p}" aria-label="Couleur"></button>`).join('')}
          <span class="dg-sizes">${SIZES.map((z, i) => `<button class="at-size${i === 1 ? ' sel' : ''}" data-s="${z}" aria-label="Taille"><i style="width:${7 + i * 8}px;height:${7 + i * 8}px"></i></button>`).join('')}</span>
          <span class="tool-item"><button class="at-tool" id="dgEraser" aria-label="Gomme">${I.eraser}</button><i class="tool-cap">Gomme</i></span>
          <span class="tool-item"><button class="at-tool at-trash" id="dgClear" aria-label="Tout effacer">${I.trash}</button><i class="tool-cap">Effacer</i></span>
          <span class="tool-item" id="dgNext" hidden><button class="at-tool" aria-label="Suivant">${I.next}</button><i class="tool-cap">Suivant</i></span>
        </div>
        <span class="tool-item dg-done" id="dgDone" hidden><button aria-label="Fini">${I.eye}</button><i class="tool-cap">Fini</i></span>
        <div class="dg-modes">
          <span class="tool-item"><button class="sn-tool dg-mode sel" data-m="defi" aria-label="Défi">${I.defi}</button><i class="tool-cap">Défi</i></span>
          <span class="tool-item"><button class="sn-tool dg-mode" data-m="libre" aria-label="Libre">${I.libre}</button><i class="tool-cap">Libre</i></span>
          <span class="tool-item" id="dgKeyItem" hidden><button class="sn-tool dg-key" id="dgKey" aria-label="Clé">${I.key}</button><i class="tool-cap">Clé</i></span>
        </div>
        <div class="dg-bubble" id="dgBubble" hidden></div>
        <div class="dg-spark" id="dgSpark">${I.spark}</div>
        <div class="dg-thumbs" id="dgThumbs" hidden>
          <span class="tool-item"><button class="dg-yes" id="dgYes" aria-label="Oui">${I.thumb(true)}</button><i class="tool-cap">Oui</i></span>
          <span class="tool-item"><button class="dg-no" id="dgNo" aria-label="Non">${I.thumb(false)}</button><i class="tool-cap">Non</i></span>
        </div>
        <div class="dg-sheet" id="dgSheet" hidden></div>
      </div>`
    preloadSfx(['whoosh', 'pluck', 'confirm', 'cloth', 'tick', 'error', 'select'])
    preloadCries(['chat'])
    const arena = $q('#dgWrap')
    const hideLoader = loader(arena, 'drawguess')
    layout()
    const onResize = () => { if (!dead) layout() }
    window.addEventListener('resize', onResize)

    ;(async () => {
      const stage = await createStage(arena, {
        sky: '#9ED4F2', fov: 36, cam: [0.8, 1.22, -2.25], target: [0.8, 0.98, SEAT.z],
        hemi: ['#DCEFFF', '#5E8A44', 1.0],
        sun: { pos: [6.5, 14, -7], color: '#FFF0D2', intensity: 2.3, area: 6, far: 45 },
        fill: 0.5, exposure: 1.0, fog: [9, 26]
      })
      if (dead) { stage.dispose(); return }
      const T = stage.T
      const farm = await buildFarm(stage, { night: false })
      if (dead || !stage.alive) { stage.dispose(); return }
      // Derrière lui : la meule et le tas de bois (comme l'Animal qui répète)
      farm.root.rotation.y = -52 * Math.PI / 180
      const bale = farm.bale()
      bale.position.set(0, 0.23, SEAT.z)
      bale.rotation.y = Math.PI / 2 + 0.06
      stage.scene.add(bale)
      const kit = critterKit(T, { fine: true })
      const cat = kit.make('cat', 0.8)
      const box = new T.Box3().setFromObject(cat.obj)
      const k = HEIGHT / Math.max(0.1, box.max.y - box.min.y)
      cat.obj.scale.setScalar(k)
      cat.obj.userData.k = k
      const catY0 = SEAT.y - box.min.y * k
      cat.obj.position.set(0, catY0, SEAT.z)
      stage.scene.add(cat.obj)
      // Un canvas WebGL sous l'interface : la feuille et les boutons restent au-dessus
      stage.renderer.domElement.classList.add('dg-gl')
      const s: S = {
        stage, T, kit, cat, catY0, fx: particles(stage, 300),
        mode: 'defi', phase: 'load', round: 0, found: 0, targets: shuffle(POOLS[c.tier].slice()), target: null,
        guess: null, gi: 0, shown: 3, tries: 0, anim: 'idle', animT: 0, t: 0,
        dirty: false, color: PALETTE[1], size: SIZES[1], eraser: false, strokes: new Map(), abort: null, error: null
      }
      me = s
      hideLoader()
      stage.start(dt => { if (me === s) frame(s, dt) })
      startRound(s)

      /* --- Le doigt sur la feuille : un trait par doigt (`pointerId`) --- */
      const cv = $q<HTMLCanvasElement>('#dgCv')
      const at = (e: PointerEvent) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * CW, y: (e.clientY - r.top) / r.height * CH } }
      cv.addEventListener('pointerdown', e => {
        if (me !== s || s.phase !== 'draw') return
        e.preventDefault()
        cv.setPointerCapture(e.pointerId)
        const p = at(e)
        paint(s, e.pointerId, p.x, p.y, true)
      })
      cv.addEventListener('pointermove', e => {
        if (me !== s || !s.strokes.has(e.pointerId)) return
        const p = at(e)
        paint(s, e.pointerId, p.x, p.y, false)
      })
      const end = (e: PointerEvent) => { s.strokes.delete(e.pointerId) }
      cv.addEventListener('pointerup', end)
      cv.addEventListener('pointercancel', end)

      /* --- Les outils --- */
      ctx.root.querySelectorAll<HTMLElement>('.at-color').forEach(b => b.addEventListener('click', () => {
        s.color = b.dataset.c!; s.eraser = false
        ctx.root.querySelectorAll('.at-color').forEach(x => x.classList.toggle('sel', x === b))
        $q('#dgEraser').classList.remove('sel')
        ctx.root.querySelectorAll<HTMLElement>('.at-size i').forEach(i => { i.style.background = s.color })
        sfx('tick', { vol: 0.25 })
      }))
      ctx.root.querySelectorAll<HTMLElement>('.at-size').forEach(b => b.addEventListener('click', () => {
        s.size = Number(b.dataset.s)
        ctx.root.querySelectorAll('.at-size').forEach(x => x.classList.toggle('sel', x === b))
        sfx('tick', { vol: 0.25 })
      }))
      ctx.root.querySelectorAll<HTMLElement>('.at-size i').forEach(i => { i.style.background = s.color })
      $q('#dgEraser').addEventListener('click', () => { s.eraser = !s.eraser; $q('#dgEraser').classList.toggle('sel', s.eraser); sfx('tick', { vol: 0.25 }) })
      $q('#dgClear').addEventListener('click', () => {
        if (s.phase !== 'draw') return
        clearPaper(s)
        $q('#dgPaper').classList.add('at-swish'); ctx.after(450, () => $q('#dgPaper').classList.remove('at-swish'))
        sfx('cloth', { vol: 0.4 })
      })
      $q('#dgDone button').addEventListener('click', () => { void onDone(s) })
      $q('#dgNext button').addEventListener('click', () => { if (s.phase === 'draw') skip(s) })
      $q('#dgYes').addEventListener('click', () => { if (s.phase === 'show') win(s) })
      $q('#dgNo').addEventListener('click', () => { if (s.phase === 'show') wrong(s) })
      ctx.root.querySelectorAll<HTMLElement>('.dg-mode').forEach(b => b.addEventListener('click', () => setMode(s, b.dataset.m as Mode)))
      $q('#dgKey').addEventListener('click', () => openKey(s))

      // Accroche pour les bots (scripts/play.mjs) — inerte en production
      if ((window as unknown as { __BOT?: boolean }).__BOT) {
        ;(window as unknown as { __dg: unknown }).__dg = {
          get phase() { return s.phase }, get mode() { return s.mode }, get round() { return s.round },
          get found() { return s.found }, get target() { return s.target }, get dirty() { return s.dirty },
          get error() { return s.error }, get tries() { return s.tries },
          get shown() { return s.guess && s.phase === 'show' ? s.guess.items[s.gi] : null },
          /** Le bot répond à la place de Claude : `(cible) => fiche`. */
          set fake(f: Fake | null) { fake = f; if (f && s.error === 'nokey') { s.error = null; bubble(null); $q('#dgKeyItem').hidden = true } },
          /** Un rond et deux oreilles, comme au doigt (les vrais événements du canvas). */
          scribble: () => { const pts = [[0.4, 0.4], [0.5, 0.3], [0.6, 0.4], [0.6, 0.6], [0.4, 0.6], [0.4, 0.4]]; pts.forEach(([x, y], i) => paint(s, 99, x * CW, y * CH, i === 0)); s.strokes.delete(99) },
          /** L'affiche (scripts/posters.mjs) : le défi du chat, un chat au feutre, il le reconnaît. */
          demo: () => {
            s.targets[s.round] = 'cat'
            startRound(s)
            const line = (pts: number[][], color: string, size: number) => {
              s.color = color; s.size = size
              pts.forEach(([x, y], i) => paint(s, 98, x * CW, y * CH, i === 0)); s.strokes.delete(98)
            }
            const ring = (cx: number, cy: number, rx: number, ry: number) => Array.from({ length: 33 }, (_, k) => [cx + Math.cos(k / 32 * Math.PI * 2) * rx, cy + Math.sin(k / 32 * Math.PI * 2) * ry])
            const O = '#FFA94D', B = '#3A2E25'
            line(ring(0.52, 0.36, 0.13, 0.15), O, 14)
            line([[0.42, 0.27], [0.41, 0.1], [0.48, 0.22]], O, 14)
            line([[0.56, 0.22], [0.63, 0.1], [0.62, 0.27]], O, 14)
            line(ring(0.53, 0.68, 0.15, 0.14), O, 14)
            line([[0.68, 0.7], [0.78, 0.62], [0.8, 0.5], [0.76, 0.44]], O, 14)
            line([[0.47, 0.34], [0.47, 0.35]], B, 26); line([[0.57, 0.34], [0.57, 0.35]], B, 26)
            line([[0.44, 0.41], [0.33, 0.39]], B, 7); line([[0.44, 0.43], [0.33, 0.45]], B, 7)
            line([[0.6, 0.41], [0.71, 0.39]], B, 7); line([[0.6, 0.43], [0.71, 0.45]], B, 7)
            line([[0.5, 0.42], [0.52, 0.44], [0.54, 0.42]], '#E8414F', 7)
            // Il montre sa réponse, et l'image en reste là (pas de suite qui file avant la photo)
            s.phase = 'show'
            syncDone(s)
            bubble(`${photoImg('cat', 168)}<button class="dg-say" aria-label="Encore">${ICON.sound}</button>`, 'dg-show')
            setAnim(s, 'propose')
            $q('#dgCard').classList.add('ok')
          },
          ready: true
        }
      }
      stage.keep({
        dispose() {
          kit.dispose()
          s.fx.dispose()
          delete (window as { __dg?: unknown }).__dg
        }
      })
    })().catch(err => { console.error(err); hideLoader(); ctx.toast('La 3D n\'est pas disponible ici') })

    return () => {
      dead = true
      window.removeEventListener('resize', onResize)
      gateRoot?.unmount(); gateRoot = null
      fake = null
      const s = me
      me = null
      if (s) { s.abort?.abort(); try { s.stage.dispose() } catch { /* déjà démonté */ } }
    }
  }
}
