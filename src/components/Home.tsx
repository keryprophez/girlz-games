import { useEffect, useRef, useState } from 'react'
import { useFerme } from '../core/store'
import { CATEGORIES, GAMES } from '../games'
import { COLLECT } from '../core/utils'
import { sFlip, sNope } from '../core/audio'
import { Album } from './Album'
import { VoiceStudio } from './VoiceStudio'
import { TimerButton } from './PlayTimer'
import { FarmHub } from './FarmHub'
import type { Tier } from '../core/types'

const TIER_LABEL: Record<Tier, string> = { easy: '🌱 Douce', med: '🌿 Normale', exp: '🔥 Expert' }
const NEXT_TIER: Record<Tier, Tier> = { easy: 'med', med: 'exp', exp: 'easy' }

export function Home({ onPlay }: { onPlay: (id: string, duel: boolean) => void }) {
  const store = useFerme()
  const [albumOpen, setAlbumOpen] = useState(false)
  const [voicesOpen, setVoicesOpen] = useState(false)
  const [duel, setDuel] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const photoTarget = useRef<string>('')

  const current = store.profiles.find(p => p.id === store.currentId) || store.profiles[0]
  const prog = store.progress[current.id] || { stars: 0, stickers: [], bestStars: {} }

  const askPhoto = (profileId: string) => {
    photoTarget.current = profileId
    fileRef.current?.click()
  }

  const [adjust, setAdjust] = useState<{ img: HTMLImageElement; pid: string } | null>(null)

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const img = new Image()
    // On ouvre le réglage zoom/cadrage plutôt que de recadrer aveuglément :
    // il faut pouvoir zoomer sur la tête !
    img.onload = () => setAdjust({ img, pid: photoTarget.current })
    img.src = URL.createObjectURL(file)
  }

  return (
    <section className={'screen active' + (store.hubView === 'farm' ? ' hub-lean' : '')}>
      <div className="brand">
        <h1>La Ferme Magique</h1>
        <div className="tag">{GAMES.length} jeux pour rêver, jouer et apprendre ✨</div>
      </div>

      {store.hubView === 'list' && <div className="seg-label">Qui joue ?</div>}
      <div className="profiles">
        {store.profiles.map(p => {
          const pProg = store.progress[p.id] || { stars: 0, stickers: [], bestStars: {} }
          const sel = p.id === store.currentId
          return (
            <div key={p.id} className={'pcard' + (sel ? ' sel' : '')}
              onClick={() => { store.selectProfile(p.id); sFlip() }}>
              <button className="pavatar" onClick={e => { e.stopPropagation(); askPhoto(p.id) }}
                style={p.avatar ? { backgroundImage: `url(${p.avatar})` } : undefined}>
                {!p.avatar && '👧'}
                <span className="pcam">📷</span>
              </button>
              {p.avatar && (
                <button className="pdel" title="Enlever la photo"
                  onClick={e => { e.stopPropagation(); store.setAvatar(p.id, null) }}>✖</button>
              )}
              <div className="pname">{p.name}</div>
              <div className="pmeta">⭐ {pProg.stars}</div>
              {sel && (
                <button className="ptier" onClick={e => { e.stopPropagation(); store.setTier(p.id, NEXT_TIER[p.tier]); sFlip() }}>
                  {TIER_LABEL[p.tier]}
                </button>
              )}
            </div>
          )
        })}
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />

      <div className="statrow">
        <div className="stat">⭐ {prog.stars}</div>
        <div className="stat"><button onClick={() => setAlbumOpen(true)}>📔 {prog.stickers.length}/{COLLECT.length}</button></div>
        <div className="stat"><button onClick={() => store.toggleSound()}>{store.sound ? '🔊' : '🔇'}</button></div>
        <div className="stat"><button onClick={() => setVoicesOpen(true)} title="Voix de la famille">🎙</button></div>
        <TimerButton />
      </div>

      <button className="hub-toggle" onClick={() => { sFlip(); store.setHubView(store.hubView === 'farm' ? 'list' : 'farm') }}>
        {store.hubView === 'farm' ? '📋 Voir tous les jeux' : '🌾 Retour à la ferme'}
      </button>

      {store.hubView === 'farm' && <FarmHub onPlay={onPlay} duel={duel} />}

      <button className={'dueltoggle' + (duel ? ' on' : '')} onClick={() => { setDuel(d => !d); sFlip() }}>
        ⚔️ Défi à deux {duel ? '· activé ! Choisissez un jeu' : ''}
      </button>

      {store.hubView === 'list' && <div className="cats">
        {CATEGORIES.map(cat => (
          <div className="cat" key={cat.id}>
            <div className="eyebrow">{cat.icon} {cat.label}</div>
            <div className="grid">
              {GAMES.filter(g => g.cat === cat.id).map(g => {
                const best = prog.bestStars[g.id] || 0
                // Les jeux créatifs sans score n'ont pas de sens en Défi à deux
                const noDuel = duel && g.duel === false
                return (
                  <button className={'gc' + (noDuel ? ' gc-solo' : '')} key={g.id}
                    onClick={() => { if (noDuel) { sNope(); return } onPlay(g.id, duel) }}>
                    <span className={'sq ' + g.sq}>{g.icon}</span>
                    <span className="nm">{g.name}</span>
                    <span className="gc-stars">{'★'.repeat(best)}{'☆'.repeat(3 - best)}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>}
      <div className="footnote">Hors-ligne · la collection de chacune est gardée d'une fois sur l'autre 🌟</div>

      {albumOpen && <Album onClose={() => setAlbumOpen(false)} />}
      {voicesOpen && <VoiceStudio onClose={() => setVoicesOpen(false)} />}
      {adjust && (
        <PhotoAdjust img={adjust.img}
          onCancel={() => { URL.revokeObjectURL(adjust.img.src); setAdjust(null) }}
          onDone={dataUrl => {
            store.setAvatar(adjust.pid, dataUrl)
            URL.revokeObjectURL(adjust.img.src)
            setAdjust(null)
          }} />
      )}
    </section>
  )
}

/* Réglage de la photo : zoom + glisser pour cadrer pile sur la tête. */
function PhotoAdjust({ img, onDone, onCancel }: {
  img: HTMLImageElement
  onDone: (dataUrl: string) => void
  onCancel: () => void
}) {
  const cvRef = useRef<HTMLCanvasElement>(null)
  const view = useRef({ zoom: 1.6, panX: 0, panY: 0 })

  const draw = (cv: HTMLCanvasElement, out: number) => {
    const { zoom, panX, panY } = view.current
    const side = Math.min(img.width, img.height)
    const sw = side / zoom
    const sx = Math.max(0, Math.min(img.width - sw, (img.width - sw) / 2 + panX))
    const sy = Math.max(0, Math.min(img.height - sw, (img.height - sw) / 2 + panY))
    const c = cv.getContext('2d')!
    c.clearRect(0, 0, out, out)
    c.drawImage(img, sx, sy, sw, sw, 0, 0, out, out)
  }

  useEffect(() => {
    const cv = cvRef.current!
    draw(cv, 220)
    let last: { x: number; y: number } | null = null
    const down = (e: PointerEvent) => { e.preventDefault(); last = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId) }
    const move = (e: PointerEvent) => {
      if (!last) return
      const side = Math.min(img.width, img.height)
      const k = side / view.current.zoom / 220
      view.current.panX -= (e.clientX - last.x) * k
      view.current.panY -= (e.clientY - last.y) * k
      last = { x: e.clientX, y: e.clientY }
      draw(cv, 220)
    }
    const up = () => { last = null }
    cv.addEventListener('pointerdown', down)
    cv.addEventListener('pointermove', move)
    cv.addEventListener('pointerup', up)
    return () => {
      cv.removeEventListener('pointerdown', down)
      cv.removeEventListener('pointermove', move)
      cv.removeEventListener('pointerup', up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img])

  const validate = () => {
    const out = document.createElement('canvas')
    out.width = out.height = 256
    draw(out, 256)
    onDone(out.toDataURL('image/jpeg', 0.85))
  }

  return (
    <div id="album" className="show">
      <div className="modal">
        <h2>📷 Cadre la tête !</h2>
        <p>Zoome et déplace la photo pour que le visage remplisse le rond</p>
        <div className="adj-frame">
          <canvas ref={cvRef} width={220} height={220} className="adj-canvas" />
        </div>
        <div className="adj-zoomrow">
          <span>🔍−</span>
          <input type="range" min={1} max={4} step={0.05} defaultValue={1.6} className="adj-slider"
            onInput={e => { view.current.zoom = parseFloat((e.target as HTMLInputElement).value); draw(cvRef.current!, 220) }} />
          <span>🔍+</span>
        </div>
        <div className="rbtns">
          <button className="bigbtn primary" onClick={validate}>✔ C'est parfait !</button>
          <button className="bigbtn ghost" onClick={onCancel}>Annuler</button>
        </div>
      </div>
    </div>
  )
}
