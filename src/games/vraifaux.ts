import type { GameContext, GameDef } from '../core/types'
import { $, pick, rnd } from '../core/utils'
import { sGood, sNope, sWin } from '../core/audio'
import { FX } from '../core/fx'

const VF_SOUNDS: [string, string][] = [['🐮', 'Meuh'], ['🐱', 'Miaou'], ['🐶', 'Ouaf'], ['🐔', 'Cocorico'], ['🐷', 'Groin'], ['🐑', 'Bêêê'], ['🦆', 'Coin coin']]
const VF_COLORS: [string, string][] = [['🍌', 'jaune'], ['🍎', 'rouge'], ['🥦', 'vert'], ['🍇', 'violet'], ['🥕', 'orange'], ['🍓', 'rouge'], ['🌽', 'jaune'], ['🍆', 'violet']]

let vf: any = null
let ctx: GameContext

function next() {
  if (!vf || !vf.running) return
  vf.current = ctx.byTier(makeEasy, makeMed, makeExp)()
  $('vfStatement').textContent = vf.current.text
  vf.lock = false
}

function makeEasy() {
  const t = Math.random()
  if (t < 0.4) {
    const [e, snd] = pick(VF_SOUNDS)
    const truth = Math.random() < 0.5
    const shown = truth ? snd : pick(VF_SOUNDS.filter(s => s[1] !== snd))[1]
    return { text: `${e} fait « ${shown} » ?`, answer: truth }
  }
  if (t < 0.75) {
    const a = rnd(1, 6), b = rnd(1, 6), real = a + b
    const truth = Math.random() < 0.5
    const shown = truth ? real : real + pick([-2, -1, 1, 2])
    return { text: `${a} + ${b} = ${shown} ?`, answer: truth }
  }
  const [e, col] = pick(VF_COLORS)
  const truth = Math.random() < 0.5
  const shown = truth ? col : pick(VF_COLORS.filter(c => c[1] !== col))[1]
  return { text: `${e} est ${shown} ?`, answer: truth }
}
function makeMed() {
  const t = Math.random()
  if (t < 0.4) {
    const a = rnd(4, 18), b = rnd(2, 12), op = Math.random() < 0.5 ? '+' : '-'
    const real = op === '+' ? a + b : a - b
    const truth = Math.random() < 0.5
    const shown = truth ? real : real + pick([-3, -2, -1, 1, 2, 3])
    return { text: `${a} ${op} ${b} = ${shown} ?`, answer: truth }
  }
  if (t < 0.7) {
    let a = rnd(3, 20), b = rnd(3, 20); if (a === b) b++
    const sign = Math.random() < 0.5 ? '>' : '<'
    return { text: `${a} ${sign} ${b} ?`, answer: sign === '>' ? a > b : a < b }
  }
  const a = rnd(2, 5), b = rnd(2, 5), real = a * b
  const truth = Math.random() < 0.5
  const shown = truth ? real : real + pick([-2, -1, 1, 2])
  return { text: `${a} × ${b} = ${shown} ?`, answer: truth }
}
function makeExp() {
  const t = Math.random()
  if (t < 0.4) {
    const a = rnd(3, 9), b = rnd(3, 9), real = a * b
    const truth = Math.random() < 0.5
    const shown = truth ? real : real + pick([-4, -3, -2, 2, 3, 4])
    return { text: `${a} × ${b} = ${shown} ?`, answer: truth }
  }
  if (t < 0.65) {
    const b = rnd(2, 9), q = rnd(2, 9), p = b * q
    const truth = Math.random() < 0.5
    const shown = truth ? q : q + pick([-2, -1, 1, 2])
    return { text: `${p} ÷ ${b} = ${shown} ?`, answer: truth }
  }
  if (t < 0.85) {
    const n = rnd(10, 60)
    const claim = Math.random() < 0.5 ? 'pair' : 'impair'
    return { text: `${n} est un nombre ${claim} ?`, answer: (n % 2 === 0) === (claim === 'pair') }
  }
  const a = rnd(5, 20), b = rnd(3, 12), c = rnd(2, 8), real = a + b - c
  const truth = Math.random() < 0.5
  const shown = truth ? real : real + pick([-3, -2, 2, 3])
  return { text: `${a} + ${b} - ${c} = ${shown} ?`, answer: truth }
}

function answer(choice: boolean) {
  if (!vf || !vf.running || vf.lock) return
  vf.lock = true
  const btn = $(choice ? 'vfTrue' : 'vfFalse')
  if (choice === vf.current.answer) {
    vf.score++; sGood()
    btn.classList.add('flash-good')
    FX.floatEl(btn, '+1')
  } else {
    vf.score = Math.max(0, vf.score - 1); sNope()
    btn.classList.add('flash-bad')
  }
  $('vfScore').textContent = '⚡ ' + vf.score
  setTimeout(() => {
    btn.classList.remove('flash-good', 'flash-bad')
    next()
  }, 240)
}

function finish() {
  const score = vf ? vf.score : 0
  sWin()
  const th = ctx.byTier([14, 9], [16, 10], [18, 12])
  const stars = score >= th[0] ? 3 : score >= th[1] ? 2 : 1
  ctx.finish({ title: 'Temps écoulé !', msg: `${ctx.playerName} a marqué ${score} points ⚡`, stars, starsEarned: stars })
}

export const vraifaux: GameDef = {
  id: 'vraifaux', name: 'Vrai ou Faux', icon: '⚡', sq: 'sq-pink', cat: 'reflexion',
  subtitle: 'Réponds le plus vite possible !',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="topbar">
        <div class="chip" id="vfScore">⚡ 0</div>
      </div>
      <div class="tbar" style="max-width:560px"><div class="tfill" id="vfTimer"></div></div>
      <div class="panel vfstatement" id="vfStatement"></div>
      <div class="vfbtns">
        <button class="vfbtn vrai" id="vfTrue">VRAI ✔</button>
        <button class="vfbtn faux" id="vfFalse">FAUX ✖</button>
      </div>`
    vf = { score: 0, timeLeft: 45, running: true, lock: false }
    ;($('vfTrue') as HTMLButtonElement).onclick = () => answer(true)
    ;($('vfFalse') as HTMLButtonElement).onclick = () => answer(false)
    const timer = setInterval(() => {
      if (!vf || !vf.running) return
      vf.timeLeft--
      $('vfTimer').style.width = (vf.timeLeft / 45) * 100 + '%'
      if (vf.timeLeft <= 0) finish()
    }, 1000)
    next()
    return () => {
      if (vf) { vf.running = false; vf = null }
      clearInterval(timer)
    }
  }
}
