import type { GameContext, GameDef } from '../core/types'
import { $ } from '../core/utils'
import { sPop, sWin } from '../core/audio'
import { confetti } from '../core/fx'

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

const SCENES: { id: string; icon: string; name: string; svg: string }[] = [
  {
    id: 'papillon', icon: '🦋', name: 'Papillon',
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
    id: 'fleur', icon: '🌸', name: 'Fleur',
    svg: `<circle class="creg" cx="348" cy="50" r="26"/>
      <path class="creg" d="M195,170 L205,170 C210,220 205,250 208,290 L192,290 C195,250 190,220 195,170 Z"/>
      <path class="creg" d="M196,230 C160,215 130,225 125,245 C155,255 185,248 199,238 Z"/>
      <path class="creg" d="M204,215 C240,200 270,210 275,230 C245,240 215,233 201,223 Z"/>
      ${petals(200, 120)}
      <circle class="creg" cx="200" cy="120" r="24"/>`
  },
  {
    id: 'maison', icon: '🏠', name: 'Maison',
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

let col: any = null
let ctx: GameContext

function loadScene(sceneId: string) {
  const scene = SCENES.find(s => s.id === sceneId)!
  col.scene = scene
  col.painted = new Set()
  document.querySelectorAll('.cscene-btn').forEach(b => b.classList.toggle('sel', (b as any).dataset.s === sceneId))
  const holder = $('colSvg')
  holder.innerHTML = `<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">${scene.svg}</svg>`
  const regions = holder.querySelectorAll<SVGElement>('.creg')
  col.total = regions.length
  regions.forEach((r, i) => {
    r.addEventListener('pointerdown', () => {
      if (!col || !col.running) return
      r.style.fill = col.color
      sPop()
      if (col.color !== '#FFFFFF') col.painted.add(i)
      else col.painted.delete(i)
      if (col.painted.size === col.total && !col.celebrated) {
        col.celebrated = true
        confetti()
        ctx.toast('Tout colorié ! 🎨')
      }
    })
  })
}

function finish() {
  sWin()
  const all = col.painted.size === col.total
  ctx.finish({
    title: all ? 'Chef-d\'œuvre !' : 'Joli début !',
    msg: `${ctx.playerName} a colorié ${col.scene.name.toLowerCase()} 🎨`,
    stars: all ? 3 : 2,
    starsEarned: all ? 3 : 2
  })
}

export const coloring: GameDef = {
  id: 'coloring', name: 'Coloriage', icon: '🎨', sq: 'sq-sun', cat: 'creatif', duel: false,
  subtitle: 'Choisis une couleur, puis tape sur un morceau du dessin',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="topbar">
        ${SCENES.map((s, i) => `<button class="chip cscene-btn${i === 0 ? ' sel' : ''}" data-s="${s.id}">${s.icon}</button>`).join('')}
      </div>
      <div class="panel colpanel">
        <div id="colSvg"></div>
      </div>
      <div class="palette" id="colPal">
        ${PALETTE.map((p, i) => `<button class="pchip${i === 0 ? ' sel' : ''}" data-c="${p}" style="background:${p}">${p === '#FFFFFF' ? '🧽' : ''}</button>`).join('')}
      </div>
      <button class="bigbtn primary" id="colDone" style="margin-top:12px">✨ C'est fini !</button>`
    col = { color: PALETTE[0], painted: new Set(), total: 0, running: true, celebrated: false }
    document.querySelectorAll<HTMLElement>('.cscene-btn').forEach(b => {
      b.onclick = () => { if (col && col.running) loadScene(b.dataset.s!) }
    })
    document.querySelectorAll<HTMLElement>('.pchip').forEach(b => {
      b.onclick = () => {
        if (!col || !col.running) return
        col.color = b.dataset.c
        document.querySelectorAll('.pchip').forEach(x => x.classList.remove('sel'))
        b.classList.add('sel')
        sPop()
      }
    })
    ;($('colDone') as HTMLButtonElement).onclick = () => col && col.running && finish()
    loadScene(SCENES[0].id)
    return () => { if (col) { col.running = false; col = null } }
  }
}
