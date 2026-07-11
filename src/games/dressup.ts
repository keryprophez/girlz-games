import type { GameContext, GameDef } from '../core/types'
import { $, faceSprite, pick } from '../core/utils'
import { sPop, sWin } from '../core/audio'
import { confetti } from '../core/fx'

/* Habille ton avatar — créatif, avec la photo de la joueuse au centre.
   On tape un accessoire pour le mettre ou l'enlever. */

const CATS: { key: string; label: string; items: string[] }[] = [
  { key: 'hat', label: 'Chapeaux', items: ['🎩', '👒', '👑', '🧢', '🎓'] },
  { key: 'glasses', label: 'Lunettes', items: ['🕶️', '👓', '🥽'] },
  { key: 'friend', label: 'Copains', items: ['🦄', '🐰', '🐤', '🐈', '🦋'] },
  { key: 'held', label: 'À la main', items: ['🎈', '🪄', '🌂', '🌸', '🍦'] }
]
const BGS = [
  { icon: '🌳', css: 'linear-gradient(180deg,#CBEBFD,#BFE8B0)' },
  { icon: '🏖️', css: 'linear-gradient(180deg,#BDE3FA,#FFE8B0)' },
  { icon: '🌌', css: 'linear-gradient(180deg,#4C4177,#B197FC)' },
  { icon: '🌈', css: 'linear-gradient(180deg,#FFD3E0,#CDEFD6,#CFE8FB)' }
]

let du: any = null
let ctx: GameContext

function renderLook() {
  ;['hat', 'glasses', 'friend', 'held'].forEach(key => {
    $('du-' + key).textContent = du.look[key] || ''
  })
  document.querySelectorAll<HTMLElement>('.du-item').forEach(b => {
    b.classList.toggle('sel', du.look[b.dataset.k!] === b.dataset.v)
  })
}

function finish() {
  sWin(); confetti()
  const worn = Object.values(du.look).filter(Boolean).join(' ')
  ctx.finish({
    title: 'Superbe look !',
    msg: `${ctx.playerName} porte ${worn || 'son plus beau sourire'} ✨`,
    stars: 3, starsEarned: 3
  })
}

export const dressup: GameDef = {
  id: 'dressup', name: 'Habille-toi', icon: '👗', sq: 'sq-lilac', cat: 'creatif',
  subtitle: 'Chapeaux, lunettes, copains… compose ton look !',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="topbar">
        ${BGS.map((b, i) => `<button class="chip du-bg${i === 0 ? ' sel' : ''}" data-i="${i}">${b.icon}</button>`).join('')}
        <button class="chip" id="duRandom">🎲</button>
      </div>
      <div class="du-stage" id="duStage" style="background:${BGS[0].css}">
        <div class="du-doll">
          <span class="du-slot du-hat" id="du-hat"></span>
          <span class="du-face">${faceSprite(c.avatar, '👧', 120)}</span>
          <span class="du-slot du-glasses" id="du-glasses"></span>
          <span class="du-slot du-held" id="du-held"></span>
          <span class="du-slot du-friend" id="du-friend"></span>
        </div>
      </div>
      ${CATS.map(cat => `
        <div class="du-row">
          <span class="du-label">${cat.label}</span>
          ${cat.items.map(it => `<button class="du-item" data-k="${cat.key}" data-v="${it}">${it}</button>`).join('')}
        </div>`).join('')}
      <button class="bigbtn primary" id="duDone" style="margin-top:12px">✨ C'est parfait !</button>`

    du = { look: { hat: '', glasses: '', friend: '', held: '' }, running: true }

    document.querySelectorAll<HTMLElement>('.du-item').forEach(b => {
      b.onclick = () => {
        if (!du || !du.running) return
        const k = b.dataset.k!, v = b.dataset.v!
        du.look[k] = du.look[k] === v ? '' : v
        sPop(); renderLook()
      }
    })
    document.querySelectorAll<HTMLElement>('.du-bg').forEach(b => {
      b.onclick = () => {
        if (!du || !du.running) return
        $('duStage').style.background = BGS[parseInt(b.dataset.i!)].css
        document.querySelectorAll('.du-bg').forEach(x => x.classList.remove('sel'))
        b.classList.add('sel'); sPop()
      }
    })
    ;($('duRandom') as HTMLButtonElement).onclick = () => {
      if (!du || !du.running) return
      CATS.forEach(cat => { du.look[cat.key] = pick([...cat.items, '']) })
      $('duStage').style.background = pick(BGS).css
      sPop(); renderLook()
    }
    ;($('duDone') as HTMLButtonElement).onclick = () => du && du.running && finish()
    return () => { if (du) { du.running = false; du = null } }
  }
}
