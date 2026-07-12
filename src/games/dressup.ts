import type { GameContext, GameDef } from '../core/types'
import { $, pick } from '../core/utils'
import { sPop, sWin } from '../core/audio'
import { confetti } from '../core/fx'
import {
  characterSVG, defaultLook, hatIcon, glassesIcon, heldIcon,
  HAIR_COLORS, OUTFIT_COLORS, type Look
} from '../core/character'
import { useFerme } from '../core/store'

/* Habille-toi — un VRAI personnage illustré dont le visage est la photo de la
   joueuse. Les habits s'enfilent sur le corps dessiné, et le look choisi la
   suit ensuite dans les autres jeux (Poussin, Course, Attrape). */

const BGS = [
  { icon: '🌳', css: 'linear-gradient(180deg,#CBEBFD,#BFE8B0)' },
  { icon: '🏖️', css: 'linear-gradient(180deg,#BDE3FA,#FFE8B0)' },
  { icon: '🌌', css: 'linear-gradient(180deg,#4C4177,#B197FC)' },
  { icon: '🌈', css: 'linear-gradient(180deg,#FFD3E0,#CDEFD6,#CFE8FB)' }
]
const HATS: Look['hat'][] = ['none', 'crown', 'cap', 'sunhat', 'party']
const GLASSES: Look['glasses'][] = ['none', 'round', 'sun']
const HELD: Look['held'][] = ['none', 'balloon', 'wand', 'flower', 'icecream']

let du: any = null
let ctx: GameContext

function render() {
  $('duDoll').innerHTML = characterSVG(ctx.avatar, du.look, 150)
  document.querySelectorAll<HTMLElement>('.du-opt').forEach(b => {
    b.classList.toggle('sel', du.look[b.dataset.k!] === b.dataset.v)
  })
}

function setLookProp(k: keyof Look, v: string) {
  if (!du || !du.running) return
  du.look[k] = v
  sPop(); render()
}

function finish() {
  sWin(); confetti()
  // Le look est persisté : elle le portera dans les autres jeux
  useFerme.getState().setLook(du.profileId, { ...du.look })
  ctx.say('Superbe ! Tu porteras ce look dans les autres jeux !')
  ctx.finish({
    title: 'Superbe look !',
    msg: `${ctx.playerName} portera ce look dans les autres jeux ✨`,
    stars: 3, starsEarned: 3
  })
}

export const dressup: GameDef = {
  id: 'dressup', name: 'Habille-toi', icon: '👗', sq: 'sq-lilac', cat: 'creatif',
  subtitle: 'Compose ton look — tu le porteras dans les autres jeux !',
  mount(c) {
    ctx = c
    const st = useFerme.getState()
    du = { look: { ...(st.profiles.find(p => p.id === st.currentId)?.look || defaultLook()) }, profileId: st.currentId, running: true }

    const colorChips = (k: string, colors: string[]) => colors.map(col =>
      `<button class="du-opt du-color" data-k="${k}" data-v="${col}" style="background:${col}"></button>`).join('')

    c.root.innerHTML = `
      <div class="topbar">
        ${BGS.map((b, i) => `<button class="chip du-bg${i === 0 ? ' sel' : ''}" data-i="${i}">${b.icon}</button>`).join('')}
        <button class="chip" id="duRandom">🎲</button>
      </div>
      <div class="du-stage" id="duStage" style="background:${BGS[0].css}">
        <div class="du-doll" id="duDoll"></div>
      </div>
      <div class="du-rows">
        <div class="du-row"><span class="du-label">Tenue</span>
          <button class="du-opt" data-k="outfit" data-v="dress"><svg viewBox="55 100 90 125" width="26" height="34"><path d="M79,114 Q100,105 121,114 L137,206 Q139,215 129,215 L71,215 Q61,215 63,206 Z" fill="#FF8FA3" stroke="#D96C81" stroke-width="4"/></svg></button>
          <button class="du-opt" data-k="outfit" data-v="tee"><svg viewBox="55 100 90 120" width="26" height="32"><rect x="70" y="108" width="60" height="52" rx="12" fill="#8CC9F5" stroke="#5FA8DB" stroke-width="4"/><path d="M68,164 L132,164 L141,208 L59,208 Z" fill="#5FA8DB"/></svg></button>
          ${colorChips('color', OUTFIT_COLORS)}
        </div>
        <div class="du-row"><span class="du-label">Cheveux</span>
          <button class="du-opt" data-k="hair" data-v="pigtails"><svg viewBox="40 20 120 90" width="30" height="24"><circle cx="58" cy="62" r="15" fill="#5B3A21"/><circle cx="142" cy="62" r="15" fill="#5B3A21"/><ellipse cx="100" cy="66" rx="32" ry="36" fill="#F6C99F"/><path d="M67,60 Q69,32 100,30 Q131,32 133,60 Q116,44 100,45 Q84,44 67,60 Z" fill="#5B3A21"/></svg></button>
          <button class="du-opt" data-k="hair" data-v="long"><svg viewBox="40 20 120 130" width="26" height="30"><path d="M62,70 Q56,150 74,158 L126,158 Q144,150 138,70 Q138,30 100,27 Q62,30 62,70 Z" fill="#5B3A21"/><ellipse cx="100" cy="66" rx="30" ry="34" fill="#F6C99F"/><path d="M67,60 Q69,32 100,30 Q131,32 133,60 Q116,44 100,45 Q84,44 67,60 Z" fill="#5B3A21"/></svg></button>
          ${colorChips('hairColor', HAIR_COLORS)}
        </div>
        <div class="du-row"><span class="du-label">Chapeau</span>
          ${HATS.map(h => `<button class="du-opt" data-k="hat" data-v="${h}">${hatIcon(h)}</button>`).join('')}
        </div>
        <div class="du-row"><span class="du-label">Lunettes</span>
          ${GLASSES.map(g => `<button class="du-opt" data-k="glasses" data-v="${g}">${glassesIcon(g)}</button>`).join('')}
        </div>
        <div class="du-row"><span class="du-label">À la main</span>
          ${HELD.map(h => `<button class="du-opt" data-k="held" data-v="${h}">${heldIcon(h)}</button>`).join('')}
        </div>
      </div>
      <button class="bigbtn primary" id="duDone" style="margin-top:12px">✨ C'est parfait !</button>`

    document.querySelectorAll<HTMLElement>('.du-opt').forEach(b => {
      b.onclick = () => setLookProp(b.dataset.k as keyof Look, b.dataset.v!)
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
      du.look = {
        outfit: pick(['dress', 'tee'] as const), color: pick(OUTFIT_COLORS),
        hair: pick(['pigtails', 'long'] as const), hairColor: pick(HAIR_COLORS),
        hat: pick(HATS), glasses: pick(GLASSES), held: pick(HELD)
      }
      $('duStage').style.background = pick(BGS).css
      sPop(); render()
    }
    ;($('duDone') as HTMLButtonElement).onclick = () => du && du.running && finish()
    render()
    return () => { if (du) { du.running = false; du = null } }
  }
}
