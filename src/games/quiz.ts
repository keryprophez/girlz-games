import type { GameContext, GameDef } from '../core/types'
import { $, FARM, pick, rnd, shuffle, uniqueNumbers } from '../core/utils'
import { sGood, sNope, sWin } from '../core/audio'
import { FX, fxAt, JUICE } from '../core/fx'

let quiz: any = {}
let ctx: GameContext

function renderHearts() {
  $('qHearts').textContent = '❤️'.repeat(quiz.lives) + '🖤'.repeat(3 - quiz.lives)
}

function nextQuestion() {
  if (!quiz.running) return
  if (quiz.lives <= 0 || quiz.asked >= quiz.max) return finish()
  const q: any = ctx.byTier<() => any>(makeEasy, makeMedium, makeExpert)()
  $('qPrompt').textContent = q.prompt
  $('qScene').textContent = q.scene || ''
  $('qProgress').textContent = `Question ${quiz.asked + 1}/${quiz.max}`
  $('qStreak').textContent = quiz.streak >= 2 ? `🔥 série ${quiz.streak}` : ''
  $('quizScore').textContent = '⭐ ' + quiz.score
  const opts = $('qOpts')
  opts.innerHTML = ''
  shuffle([...q.options]).forEach((o: any) => {
    const b = document.createElement('button')
    b.className = 'qopt'
    b.textContent = String(o)
    b.onclick = () => answerQ(b, o, q.answer)
    opts.appendChild(b)
  })
}

function answerQ(btn: HTMLButtonElement, chosen: any, correct: any) {
  document.querySelectorAll<HTMLButtonElement>('.qopt').forEach(b => (b.onclick = null))
  if (String(chosen) === String(correct)) {
    btn.classList.add('good')
    quiz.streak++; quiz.best = Math.max(quiz.best, quiz.streak)
    quiz.score += 1 + (quiz.streak >= 3 ? 1 : 0); sGood()
    fxAt(btn, JUICE.warm, 14); FX.floatEl(btn, '+' + (1 + (quiz.streak >= 3 ? 1 : 0)))
    if (quiz.streak === 3) ctx.toast('🔥 Série de 3 ! Bonus')
  } else {
    btn.classList.add('bad')
    quiz.streak = 0; quiz.lives--; renderHearts(); sNope()
    document.querySelectorAll<HTMLButtonElement>('.qopt').forEach(b => {
      if (b.textContent === String(correct)) b.classList.add('good')
    })
  }
  $('quizScore').textContent = '⭐ ' + quiz.score
  quiz.asked++
  setTimeout(() => quiz.running && nextQuestion(), 1050)
}

function makeEasy() {
  const t = Math.random()
  if (t < 0.35) { const a = pick(FARM), n = rnd(3, 10); return { prompt: "Combien d'animaux ?", scene: a.repeat(n), options: uniqueNumbers(n, 2, 12, 4), answer: n } }
  if (t < 0.65) { const a = rnd(1, 6), b = rnd(1, 6), s = a + b; return { prompt: `Combien font ${a} + ${b} ?`, scene: '🐣'.repeat(a) + ' ➕ ' + '🐣'.repeat(b), options: uniqueNumbers(s, 2, 14, 4), answer: s } }
  if (t < 0.85) { const a = rnd(4, 10), b = rnd(1, a - 1), d = a - b; return { prompt: `Il en reste combien : ${a} - ${b} ?`, scene: '🥚'.repeat(a), options: uniqueNumbers(d, 0, 10, 4), answer: d } }
  const a = pick(FARM); let x = rnd(2, 6), y = rnd(2, 7); if (x === y) y++
  return { prompt: 'Quel groupe a le PLUS ?', scene: `A: ${a.repeat(x)}   B: ${a.repeat(y)}`, options: ['A', 'B'], answer: x > y ? 'A' : 'B' }
}
function makeMedium() {
  const t = Math.random()
  if (t < 0.25) { const a = rnd(5, 15), b = rnd(3, 10), s = a + b; return { prompt: `${a} + ${b} = ?`, options: uniqueNumbers(s, 8, 30, 4), answer: s } }
  if (t < 0.5) { const a = rnd(8, 18), b = rnd(2, a - 2), d = a - b; return { prompt: `${a} - ${b} = ?`, options: uniqueNumbers(d, 0, 18, 4), answer: d } }
  if (t < 0.72) { const a = rnd(2, 5), b = rnd(2, 5), p = a * b; return { prompt: `${a} paquets de ${b} œufs, ça fait ?`, options: uniqueNumbers(p, 4, 30, 4), answer: p } }
  if (t < 0.88) { const a = rnd(2, 9), s = rnd(a + 1, 18), m = s - a; return { prompt: `${a} + ? = ${s}`, options: uniqueNumbers(m, 0, 16, 4), answer: m } }
  const st = rnd(1, 6), seq = [st, st + 2, st + 4, st + 6]
  return { prompt: 'Quel nombre vient après ?', scene: seq.join('  ') + '  …', options: uniqueNumbers(st + 8, st + 2, st + 16, 4), answer: st + 8 }
}
function makeExpert() {
  const t = Math.random()
  if (t < 0.28) { const a = rnd(3, 9), b = rnd(3, 9), p = a * b; return { prompt: `${a} × ${b} = ?`, options: uniqueNumbers(p, 9, 90, 4), answer: p } }
  if (t < 0.5) { const b = rnd(2, 9), q = rnd(2, 9), p = b * q; return { prompt: `${p} ÷ ${b} = ?`, options: uniqueNumbers(q, 2, 12, 4), answer: q } }
  if (t < 0.7) { const a = rnd(10, 30), b = rnd(5, 15), c = rnd(2, 9), r = a + b - c; return { prompt: `${a} + ${b} - ${c} = ?`, options: uniqueNumbers(r, 5, 55, 4), answer: r } }
  if (t < 0.86) { const b = rnd(2, 9), f = rnd(2, 9), p = b * f; return { prompt: `${b} × ? = ${p}`, options: uniqueNumbers(f, 2, 12, 4), answer: f } }
  const st = rnd(2, 9), step = pick([3, 5]), seq = [st, st + step, st + 2 * step, st + 3 * step]
  return { prompt: 'Suite : quel nombre vient après ?', scene: seq.join('  ') + '  …', options: uniqueNumbers(st + 4 * step, st + step, st + 6 * step, 4), answer: st + 4 * step }
}

function finish() {
  sWin()
  let stars: 1 | 2 | 3 = quiz.lives >= 3 ? 3 : quiz.lives >= 2 ? 2 : 1
  if (quiz.score < 3) stars = 1
  ctx.finish({
    title: 'Quiz terminé !',
    msg: `${quiz.score} points · meilleure série ${quiz.best} 🔥`,
    stars, starsEarned: stars + (quiz.best >= 4 ? 1 : 0)
  })
}

export const quizGame: GameDef = {
  id: 'quiz', name: 'Le Quiz', icon: '🧮', sq: 'sq-mint', cat: 'reflexion',
  subtitle: 'Des petits calculs rigolos',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="topbar">
        <div class="hearts" id="qHearts">❤️❤️❤️</div>
        <div class="chip" id="quizScore">⭐ 0</div>
      </div>
      <div class="panel qbox">
        <div class="qprompt" id="qPrompt"></div>
        <div class="qscene" id="qScene"></div>
        <div class="qopts" id="qOpts"></div>
        <div class="qfoot"><span id="qProgress"></span><span class="streak" id="qStreak"></span></div>
      </div>`
    quiz = { score: 0, lives: 3, streak: 0, best: 0, asked: 0, max: c.byTier(8, 10, 10), running: true }
    renderHearts()
    nextQuestion()
    return () => { quiz.running = false }
  }
}
