import type { GameContext, GameDef } from '../core/types'
import { $ } from '../core/utils'
import { useFerme } from '../core/store'
import { sfx, preloadSfx } from '../core/sfx'
import { confetti } from '../core/fx'
import { ICON } from '../core/icons'

/* Coloriage magique — créatif, sans score ni chrono.
   On tape une couleur, on tape une zone. Quand tout est colorié : bravo ! */

const PALETTE = ['#FF6B81', '#FFA94D', '#FFE066', '#94D82D', '#5EC97B', '#4FB8E7', '#B197FC', '#F58FB8', '#8B5E3C', '#FFFFFF']

function petals(cx: number, cy: number): string {
  let s = ''
  for (let k = 0; k < 6; k++) {
    const a = k * 60
    s += `<ellipse class="creg" cx="${cx}" cy="${cy - 44}" rx="24" ry="38" transform="rotate(${a} ${cx} ${cy})"/>`
  }
  return s
}

const SCENES: { id: string; name: string; svg: string }[] = [
  {
    id: 'papillon', name: 'Papillon',
    svg: `<circle class="creg" cx="52" cy="48" r="26"/>
      <path class="creg" d="M186,130 C120,60 60,90 80,150 C90,185 150,190 186,160 Z"/>
      <path class="creg" d="M214,130 C280,60 340,90 320,150 C310,185 250,190 214,160 Z"/>
      <path class="creg" d="M186,170 C130,200 110,250 150,255 C180,258 190,220 190,195 Z"/>
      <path class="creg" d="M214,170 C270,200 290,250 250,255 C220,258 210,220 210,195 Z"/>
      <ellipse class="creg" cx="200" cy="160" rx="14" ry="52"/>
      <circle class="creg" cx="200" cy="95" r="16"/>
      <path class="cdeco" d="M195,82 C185,60 175,55 170,50"/>
      <path class="cdeco" d="M205,82 C215,60 225,55 230,50"/>`
  },
  {
    id: 'fleur', name: 'Fleur',
    svg: `<circle class="creg" cx="348" cy="50" r="26"/>
      <path class="creg" d="M195,170 L205,170 C210,220 205,250 208,290 L192,290 C195,250 190,220 195,170 Z"/>
      <path class="creg" d="M196,230 C160,215 130,225 125,245 C155,255 185,248 199,238 Z"/>
      <path class="creg" d="M204,215 C240,200 270,210 275,230 C245,240 215,233 201,223 Z"/>
      ${petals(200, 120)}
      <circle class="creg" cx="200" cy="120" r="24"/>`
  },
  {
    id: 'maison', name: 'Maison',
    svg: `<circle class="creg" cx="52" cy="48" r="26"/>
      <rect class="creg" x="120" y="140" width="160" height="120"/>
      <path class="creg" d="M100,140 L200,60 L300,140 Z"/>
      <rect class="creg" x="185" y="200" width="40" height="60" rx="4"/>
      <rect class="creg" x="140" y="160" width="34" height="34"/>
      <rect class="creg" x="226" y="160" width="34" height="34"/>
      <rect class="creg" x="330" y="200" width="18" height="60"/>
      <circle class="creg" cx="339" cy="180" r="36"/>
      <ellipse class="creg" cx="60" cy="252" rx="40" ry="20"/>`
  }
]

interface State {
  color: string
  scene: typeof SCENES[number]
  /** Zones peintes (hors blanc) : quand tout est colorié, c'est la fête. */
  painted: Set<number>
  total: number
  running: boolean
  celebrated: boolean
  profileId: string
  fills: Record<string, string>
}

let col: State | null = null
let ctx: GameContext

/* Le dessin est GARDÉ (par joueuse et par scène) : on peut reprendre plus tard */
const storeKey = (me: State, scene: string) => `ferme:coloriage:${me.profileId}:${scene}`
function savePaint(me: State) {
  try { localStorage.setItem(storeKey(me, me.scene.id), JSON.stringify(me.fills)) } catch { /* quota : tant pis */ }
}
function loadPaint(me: State, scene: string): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(storeKey(me, scene)) || '{}') } catch { return {} }
}

function loadScene(me: State, sceneId: string) {
  const scene = SCENES.find(s => s.id === sceneId)!
  me.scene = scene
  me.painted = new Set()
  document.querySelectorAll('.cscene-btn').forEach(b => b.classList.toggle('sel', (b as HTMLElement).dataset.s === sceneId))
  const holder = $('colSvg')
  holder.innerHTML = `<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">${scene.svg}</svg>`
  const regions = holder.querySelectorAll<SVGElement>('.creg')
  me.total = regions.length
  me.fills = loadPaint(me, sceneId)
  me.celebrated = false
  regions.forEach((r, i) => {
    const saved = me.fills[i]
    if (saved) { r.style.fill = saved; if (saved !== '#FFFFFF') me.painted.add(i) }
    r.addEventListener('pointerdown', () => {
      if (col !== me || !me.running) return
      r.style.fill = me.color
      me.fills[i] = me.color
      sfx('cloth', { vol: 0.35, rate: 1.4, spread: 0.1 })
      if (me.color !== '#FFFFFF') me.painted.add(i)
      else me.painted.delete(i)
      savePaint(me)
      if (me.painted.size === me.total && !me.celebrated) {
        me.celebrated = true
        confetti()
        sfx('confirm', { vol: 0.8 })
      }
    })
  })
}

function finish(me: State) {
  // Une création ne se note pas : toujours la même fête
  ctx.finish({
    title: 'Chef-d\'œuvre !',
    msg: `Tu as colorié ${me.scene.name.toLowerCase()}`,
    stars: 3
  })
}

export const coloring: GameDef = {
  id: 'coloring', name: 'Coloriage', icon: '🎨', sq: 'sq-sun', cat: 'creatif', music: 'meadow',
  subtitle: 'Choisis une couleur, puis tape sur un morceau du dessin',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="topbar">
        ${SCENES.map((s, i) => `<button class="chip cscene-btn${i === 0 ? ' sel' : ''}" data-s="${s.id}" aria-label="${s.name}"><svg viewBox="0 0 400 300" class="cmini">${s.svg}</svg></button>`).join('')}
      </div>
      <div class="panel colpanel">
        <div id="colSvg"></div>
      </div>
      <div class="palette" id="colPal">
        ${PALETTE.map((p, i) => `<button class="pchip${i === 0 ? ' sel' : ''}" data-c="${p}" style="background:${p}" aria-label="Couleur">${p === '#FFFFFF' ? ICON.replay : ''}</button>`).join('')}
      </div>
      <button class="sn-tool go" id="colDone" style="margin-top:12px" aria-label="Fini">${ICON.check}</button>`
    preloadSfx(['cloth', 'click', 'confirm'])
    const me: State = {
      color: PALETTE[0], scene: SCENES[0], painted: new Set(), total: 0, running: true, celebrated: false,
      profileId: useFerme.getState().currentId, fills: {}
    }
    col = me
    document.querySelectorAll<HTMLElement>('.cscene-btn').forEach(b => {
      b.onclick = () => { if (me.running) { me.painted = new Set(); loadScene(me, b.dataset.s!) } }
    })
    document.querySelectorAll<HTMLElement>('.pchip').forEach(b => {
      b.onclick = () => {
        if (!me.running) return
        me.color = b.dataset.c!
        document.querySelectorAll('.pchip').forEach(x => x.classList.remove('sel'))
        b.classList.add('sel')
        sfx('click', { vol: 0.4 })
      }
    })
    ;($('colDone') as HTMLButtonElement).onclick = () => { if (me.running) finish(me) }
    loadScene(me, SCENES[0].id)
    return () => { me.running = false; if (col === me) col = null }
  }
}
