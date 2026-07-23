import type { GameContext, GameDef } from '../core/types'
import { $ } from '../core/utils'
import { sBonk, sCrunch, sNope, sPop, sPower, sWin, tone } from '../core/audio'
import { confetti } from '../core/fx'

/* La Pizzeria — comme les vieux jeux flash : choisis ta pâte, aplatis-la en
   tapant, étale la sauce (tomate ou crème) avec le doigt, pose tes
   ingrédients, surveille la cuisson au four… et dévore-la ! */

const DOUGHS = [
  { name: 'Classique', crust: 13 },
  { name: 'Fine', crust: 8 },
  { name: 'Épaisse', crust: 20 }
]
const SAUCES: Record<string, { col: string; icon: string; name: string }> = {
  tomato: { col: '#E8543F', icon: '🍅', name: 'tomate' },
  cream: { col: '#FFF3DC', icon: '🥛', name: 'à la crème' }
}
const TOPS = ['🧀', '🍄', '🫒', '🍅', '🌽', '🍍', '🌿', '🥓']
const FLATTEN_TAPS = 10
const SAUCE_DABS = 14
const BITES = 8

let pi: any = null
let ctx: GameContext

function mixC(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16))
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')
}
const crustCol = (t: number) => t < 0.55 ? mixC('#F2D8A7', '#E5A75B', t / 0.55) : mixC('#E5A75B', '#59340F', (t - 0.55) / 0.45)
const baseCol = (t: number) => t < 0.55 ? mixC('#F7E3BC', '#EDBE7E', t / 0.55) : mixC('#EDBE7E', '#7A4E22', (t - 0.55) / 0.45)

function radii() {
  const R = 40 + pi.flat * 60
  return { R, inner: R - DOUGHS[pi.dough].crust * (R / 100) }
}

function pizzaSVG(px: number): string {
  const t = pi.bakeT
  const { R, inner } = radii()
  const sauce = pi.sauce ? SAUCES[pi.sauce].col : null
  let inside = ''
  if (sauce && pi.sauceFull) inside = `<circle cx="110" cy="110" r="${inner - 2}" fill="${sauce}"/>`
  else if (sauce) inside = pi.dabs.map((d: any) => `<circle cx="${d.x}" cy="${d.y}" r="17" fill="${sauce}" opacity=".92"/>`).join('')
  const tops = pi.tops.map((tp: any) =>
    `<text x="${tp.x}" y="${tp.y}" font-size="22" text-anchor="middle" dominant-baseline="central">${tp.e}</text>`).join('')
  const cuts = pi.step === 'eat'
    ? '<g stroke="rgba(69,54,42,.3)" stroke-width="2">' + [0, 60, 120].map(a => {
        const r2 = a * Math.PI / 180, dx = Math.cos(r2) * R, dy = Math.sin(r2) * R
        return `<line x1="${110 - dx}" y1="${110 - dy}" x2="${110 + dx}" y2="${110 + dy}"/>`
      }).join('') + '</g>'
    : ''
  const bites = pi.bites.map((b: any) => `<circle cx="${b.x}" cy="${b.y}" r="${b.r}" fill="black"/>`).join('')
  return `<svg viewBox="0 0 220 220" width="${px}" height="${px}">
    <defs>
      <mask id="piBiteMask"><rect width="220" height="220" fill="white"/>${bites}</mask>
      <clipPath id="piClip"><circle cx="110" cy="110" r="${inner}"/></clipPath>
    </defs>
    <g mask="url(#piBiteMask)">
      <circle id="piCrust" cx="110" cy="110" r="${R}" fill="${crustCol(t)}" stroke="${mixC('#D9A05B', '#3E2508', t)}" stroke-width="3"/>
      <circle id="piBase" cx="110" cy="110" r="${inner}" fill="${baseCol(t)}"/>
      <g clip-path="url(#piClip)">${inside}${tops}</g>
      ${cuts}
    </g>
  </svg>`
}

function svgXY(e: PointerEvent): { x: number; y: number } | null {
  const svg = $('piStage').querySelector('svg')
  if (!svg) return null
  const r = svg.getBoundingClientRect()
  return { x: (e.clientX - r.left) / r.width * 220, y: (e.clientY - r.top) / r.height * 220 }
}

function setStep(n: number, msg: string) {
  $('piStep').textContent = `👩‍🍳 Étape ${n}/6`
  $('piMsg').textContent = msg
}
function later(fn: () => void, ms: number) {
  pi.tm.push(setTimeout(() => pi && pi.running && fn(), ms))
}

/* ---- 1. La pâte ---- */
function stepDough() {
  pi.step = 'dough'
  setStep(1, 'Choisis ta pâte !')
  $('piArea').innerHTML = `<div class="pi-choices">${DOUGHS.map((d, i) => `
    <button class="pi-choice" data-i="${i}">
      <svg viewBox="0 0 80 60" width="80" height="60">
        <ellipse cx="40" cy="${52 - d.crust}" rx="30" ry="${6 + d.crust}" fill="#F2D8A7" stroke="#D9A05B" stroke-width="3"/>
        <ellipse cx="32" cy="${46 - d.crust}" rx="8" ry="3.5" fill="#F9EBCB"/>
      </svg><span>${d.name}</span></button>`).join('')}</div>`
  document.querySelectorAll<HTMLElement>('.pi-choice').forEach(b => {
    b.onclick = () => { if (!pi || !pi.running) return; pi.dough = parseInt(b.dataset.i!); sPop(); stepFlatten() }
  })
}

/* ---- 2. Aplatir ---- */
function stepFlatten() {
  pi.step = 'flatten'
  setStep(2, 'Tape, tape, tape pour aplatir la pâte !')
  $('piArea').innerHTML = `<div class="pi-stage" id="piStage">${pizzaSVG(210)}</div>`
  const stage = $('piStage')
  stage.onpointerdown = () => {
    if (!pi || !pi.running || pi.step !== 'flatten' || pi.flat >= 1) return
    pi.flat = Math.min(1, pi.flat + 1 / FLATTEN_TAPS)
    tone(260 + pi.flat * 280, 0.07, 'triangle', 0.12)
    stage.innerHTML = pizzaSVG(210)
    stage.classList.remove('pi-squish'); void stage.offsetWidth; stage.classList.add('pi-squish')
    if (pi.flat >= 1) {
      sPower()
      $('piMsg').textContent = 'Bien aplatie, bravo !'
      later(stepSauceChoice, 700)
    }
  }
}

/* ---- 3. La sauce ---- */
function stepSauceChoice() {
  pi.step = 'saucepick'
  setStep(3, 'Tomate ou crème ?')
  $('piArea').innerHTML = `<div class="pi-choices">${Object.keys(SAUCES).map(k => `
    <button class="pi-choice" data-s="${k}">
      <svg viewBox="0 0 80 60" width="80" height="60">
        <circle cx="40" cy="32" r="26" fill="${SAUCES[k].col}" stroke="#D9A05B" stroke-width="3"/>
      </svg><span>${SAUCES[k].icon} ${k === 'tomato' ? 'Tomate' : 'Crème'}</span></button>`).join('')}</div>`
  document.querySelectorAll<HTMLElement>('.pi-choice').forEach(b => {
    b.onclick = () => { if (!pi || !pi.running) return; pi.sauce = b.dataset.s!; sPop(); stepSauceSpread() }
  })
}

function stepSauceSpread() {
  pi.step = 'sauce'
  setStep(3, 'Étale la sauce avec ton doigt !')
  $('piArea').innerHTML = `<div class="pi-stage" id="piStage">${pizzaSVG(210)}</div>`
  const stage = $('piStage')
  const addDab = (e: PointerEvent) => {
    if (!pi || !pi.running || pi.step !== 'sauce' || pi.sauceFull) return
    const p = svgXY(e); if (!p) return
    const { inner } = radii()
    if (Math.hypot(p.x - 110, p.y - 110) > inner - 8) return
    if (pi.dabs.some((d: any) => Math.hypot(d.x - p.x, d.y - p.y) < 14)) return
    pi.dabs.push(p)
    tone(460 + pi.dabs.length * 12, 0.045, 'triangle', 0.09)
    if (pi.dabs.length >= SAUCE_DABS) {
      pi.sauceFull = true
      sPop()
      $('piMsg').textContent = 'Toute la pizza est nappée !'
      later(stepToppings, 700)
    }
    stage.innerHTML = pizzaSVG(210)
  }
  stage.onpointerdown = e => { pi.drag = true; addDab(e) }
  stage.onpointermove = e => { if (pi && pi.drag) addDab(e) }
  stage.onpointerup = () => { if (pi) pi.drag = false }
}

/* ---- 4. Les ingrédients ---- */
function stepToppings() {
  pi.step = 'tops'
  setStep(4, 'Choisis un ingrédient, puis tape sur la pizza pour le poser !')
  $('piArea').innerHTML = `
    <div class="pi-chips">${TOPS.map(e => `<button class="pi-chip${e === pi.sel ? ' sel' : ''}" data-e="${e}">${e}</button>`).join('')}</div>
    <div class="pi-stage" id="piStage">${pizzaSVG(210)}</div>
    <button class="bigbtn primary" id="piBake">🔥 Au four !</button>`
  document.querySelectorAll<HTMLElement>('.pi-chip').forEach(b => {
    b.onclick = () => {
      if (!pi || !pi.running) return
      pi.sel = b.dataset.e!
      document.querySelectorAll('.pi-chip').forEach(x => x.classList.remove('sel'))
      b.classList.add('sel'); sPop()
    }
  })
  const stage = $('piStage')
  stage.onpointerdown = e => {
    if (!pi || !pi.running || pi.step !== 'tops') return
    const p = svgXY(e); if (!p) return
    const { inner } = radii()
    if (Math.hypot(p.x - 110, p.y - 110) > inner - 4) return
    if (pi.tops.length >= 24) { ctx.toast('Elle est déjà bien garnie ! 😄'); return }
    pi.tops.push({ e: pi.sel, x: p.x, y: p.y })
    sPop()
    stage.innerHTML = pizzaSVG(210)
  }
  ;($('piBake') as HTMLButtonElement).onclick = () => {
    if (!pi || !pi.running) return
    if (pi.tops.length === 0) { sNope(); ctx.toast('Pose au moins un ingrédient !'); return }
    sBonk(); stepBake()
  }
}

/* ---- 5. La cuisson ---- */
function stepBake() {
  pi.step = 'bake'
  setStep(5, 'Surveille bien : sors-la quand la jauge est dans le vert !')
  $('piArea').innerHTML = `
    <div class="pi-oven"><div class="pi-stage" id="piStage">${pizzaSVG(165)}</div></div>
    <div class="pi-gauge">
      <div class="pi-zone" style="width:50%;background:#CFE4F2"></div>
      <div class="pi-zone" style="width:30%;background:#7BDD97"></div>
      <div class="pi-zone" style="width:20%;background:#A9613A"></div>
      <div class="pi-cursor" id="piCursor"></div>
    </div>
    <button class="bigbtn primary" id="piOut">🧤 Sors-la !</button>`
  const dur = ctx.byTier(9500, 7500, 6000)
  const start = performance.now()
  const stop = (t: number, verdict: string) => {
    cancelAnimationFrame(pi.raf)
    pi.bakeT = t
    pi.verdict = verdict
  }
  const tick = (now: number) => {
    if (!pi || !pi.running || pi.step !== 'bake' || pi.verdict) return
    const t = Math.min(1, (now - start) / dur)
    pi.bakeT = t
    $('piCursor').style.left = `calc(${t * 100}% - 4px)`
    const crust = $('piStage').querySelector('#piCrust'), base = $('piStage').querySelector('#piBase')
    if (crust && base) {
      crust.setAttribute('fill', crustCol(t))
      base.setAttribute('fill', baseCol(t))
    }
    if (t >= 1) {
      stop(1, 'burnt')
      sNope()
      $('piStage').insertAdjacentHTML('beforeend', '<div class="pi-smoke">💨</div>')
      $('piMsg').textContent = 'Oh non, toute noire !'
      later(stepEat, 1100)
      return
    }
    pi.raf = requestAnimationFrame(tick)
  }
  pi.raf = requestAnimationFrame(tick)
  ;($('piOut') as HTMLButtonElement).onclick = () => {
    if (!pi || !pi.running || pi.verdict) return
    const t = pi.bakeT
    stop(t, t < 0.5 ? 'pale' : t <= 0.8 ? 'perfect' : 'dark')
    sBonk()
    $('piMsg').textContent = pi.verdict === 'perfect' ? 'Cuisson parfaite, bravo chef !'
      : pi.verdict === 'pale' ? 'Hmm, encore un peu pâle…' : 'Ouf, juste à temps, elle est bien dorée !'
    later(stepEat, 900)
  }
}

/* ---- 6. On la mange ! ---- */
function stepEat() {
  pi.step = 'eat'
  setStep(6, 'Croque la pizza ! Tape dessus !')
  $('piArea').innerHTML = `<div class="pi-stage" id="piStage">${pizzaSVG(225)}</div>`
  const stage = $('piStage')
  stage.onpointerdown = e => {
    if (!pi || !pi.running || pi.step !== 'eat' || pi.bites.length >= BITES) return
    const p = svgXY(e); if (!p) return
    const { R } = radii()
    const len = Math.hypot(p.x - 110, p.y - 110) || 1
    if (len > R + 26) return
    const k = Math.min(len, R * 0.94) / len
    pi.bites.push({ x: 110 + (p.x - 110) * k, y: 110 + (p.y - 110) * k, r: 24 + Math.random() * 10 })
    sCrunch()
    stage.innerHTML = pizzaSVG(225)
    if (pi.bites.length >= BITES) {
      $('piMsg').textContent = 'Tout mangé… Miam ! 😋'
      stage.classList.add('pi-gulp')
      sWin(); confetti()
      later(finish, 800)
    }
  }
}

function finish() {
  const v = pi.verdict
  const stars = v === 'perfect' ? 3 : v === 'burnt' ? 1 : 2
  const txt = v === 'perfect' ? 'cuite à la perfection 👨‍🍳'
    : v === 'pale' ? 'encore un peu pâle, mais délicieuse'
    : v === 'dark' ? 'bien dorée-croustillante'
    : 'toute noire… mais dévorée quand même ! 🔥'
  ctx.finish({
    title: 'Bon appétit !',
    msg: `${ctx.playerName} a préparé une pizza ${SAUCES[pi.sauce].name}, ${txt}`,
    stars: stars as 1 | 2 | 3, starsEarned: stars
  })
}

export const pizza: GameDef = {
  id: 'pizza', name: 'La Pizzeria', icon: '🍕', sq: 'sq-peach', cat: 'creatif', music: 'kitchen',
  subtitle: 'Pâte, sauce, ingrédients, cuisson… puis on la dévore !',
  mount(c) {
    ctx = c
    pi = {
      step: 'dough', dough: 0, flat: 0, sauce: null, dabs: [], sauceFull: false,
      tops: [], sel: TOPS[0], bakeT: 0, verdict: null, bites: [], drag: false,
      raf: 0, tm: [], running: true
    }
    c.root.innerHTML = `
      <div class="topbar"><div class="chip" id="piStep"></div></div>
      <div class="gsub" id="piMsg"></div>
      <div class="pi-panel panel" id="piArea"></div>`
    stepDough()
    return () => {
      if (pi) {
        pi.running = false
        cancelAnimationFrame(pi.raf)
        pi.tm.forEach((t: any) => clearTimeout(t))
        pi = null
      }
    }
  }
}
