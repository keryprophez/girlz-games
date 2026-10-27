import { useRef, useState } from 'react'
import { useFerme } from '../core/store'
import { WORLDS } from '../games'
import { sFlip } from '../core/audio'
import { VoiceStudio } from './VoiceStudio'
import { TimerButton } from './PlayTimer'
import { ICON, starsHTML } from '../core/icons'
import { BADGE, WORLD_BADGE } from '../core/badges'
import { POSTERS } from '../core/posters'

/** L'affiche d'un jeu (une image du jeu en train de se jouer, 28/09). */
const posterUrl = (id: string) => import.meta.env.BASE_URL + 'assets/affiches/' + id + '.webp'

const Svg = ({ html, className }: { html: string; className?: string }) =>
  <span className={className} dangerouslySetInnerHTML={{ __html: html }} />

const WORLD_KEY = 'ferme:univers'

export function Home({ onPlay }: { onPlay: (id: string) => void }) {
  const store = useFerme()
  const [voicesOpen, setVoicesOpen] = useState(false)

  /* L'univers ouvert est retenu : on revient là où on jouait */
  const [world, setWorld] = useState(() => {
    try { const w = localStorage.getItem(WORLD_KEY); if (w && WORLDS.some(x => x.id === w)) return w } catch { /* stockage refusé */ }
    return WORLDS[0].id
  })
  const shown = WORLDS.find(w => w.id === world) || WORLDS[0]
  const pickWorld = (id: string) => {
    if (id === world) return
    sFlip()
    setWorld(id)
    try { localStorage.setItem(WORLD_KEY, id) } catch { /* stockage refusé */ }
  }

  /* Ouvrir un jeu (23/09) : la vignette touchée grandit jusqu'à remplir
     l'écran, puis le jeu apparaît dessous — on VOIT où on entre. */
  const launching = useRef(false)
  const launch = (tile: HTMLElement, id: string, sq: string, badge: string) => {
    if (launching.current) return
    launching.current = true
    sFlip()
    const from = (tile.querySelector('.sq, .gc-img') || tile).getBoundingClientRect()
    const z = document.createElement('div')
    z.className = 'gc-zoom sq ' + sq
    // L'affiche grandit jusqu'à remplir l'écran ; sans affiche, la vignette
    if (POSTERS.has(id)) z.style.background = `center/cover no-repeat url("${posterUrl(id)}")`
    else z.innerHTML = `<span class="gc-zoom-badge">${badge}</span>`
    Object.assign(z.style, { left: from.left + 'px', top: from.top + 'px', width: from.width + 'px', height: from.height + 'px' })
    document.body.appendChild(z)
    requestAnimationFrame(() => requestAnimationFrame(() => z.classList.add('go')))
    window.setTimeout(() => { launching.current = false; onPlay(id) }, 380)
    window.setTimeout(() => z.classList.add('out'), 520)
    window.setTimeout(() => z.remove(), 1000)
  }

  return (
    <section className="screen active home">
      <div className="hm-top">
        <div className="brand">
          <h1>La Ferme Magique</h1>
          <div className="tag">Les jeux de Jade et Joyce</div>
        </div>
        <div className="statrow">
          <div className="stat"><button onClick={() => store.toggleSound()}><Svg html={store.sound ? ICON.sound : ICON.mute} /></button></div>
          <div className="stat"><button onClick={() => setVoicesOpen(true)} title="Voix de la famille"><Svg html={ICON.mic} /></button></div>
          <TimerButton />
        </div>
      </div>

      {/* Trois univers en gros onglets dessinés ; un univers = un écran, sans défilement */}
      <nav className="hm-tabs">
        {WORLDS.map(w => (
          <button key={w.id} data-w={w.id} className={'hm-tab w-' + w.id + (w.id === world ? ' sel' : '')}
            onClick={() => pickWorld(w.id)} aria-label={w.label}>
            <Svg className="hm-tab-badge" html={WORLD_BADGE[w.id] || ''} />
            <span className="hm-tab-nm">{w.label}</span>
          </button>
        ))}
      </nav>
      <div className={'hm-grid w-' + world + ' n' + shown.games.length} key={world}>
        {shown.games.map(g => {
          const best = store.best[g.id] || 0
          return (
            <button className={'gc' + (POSTERS.has(g.id) ? ' gc-poster' : '')} key={g.id} data-id={g.id}
              onClick={e => launch(e.currentTarget, g.id, g.sq, BADGE[g.id] || g.icon)}>
              {POSTERS.has(g.id)
                ? <img className="gc-img" src={posterUrl(g.id)} alt="" draggable={false} />
                : <span className={'sq ' + g.sq}>{BADGE[g.id] ? <Svg html={BADGE[g.id]} /> : g.icon}</span>}
              <span className="nm">{g.name}</span>
              {world !== 'creer' && <Svg className="gc-stars" html={starsHTML(best)} />}
            </button>
          )
        })}
      </div>
      {voicesOpen && <VoiceStudio onClose={() => setVoicesOpen(false)} />}
    </section>
  )
}
