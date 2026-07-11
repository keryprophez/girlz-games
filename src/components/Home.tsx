import { useRef, useState } from 'react'
import { useFerme } from '../core/store'
import { CATEGORIES, GAMES } from '../games'
import { COLLECT } from '../core/utils'
import { sFlip } from '../core/audio'
import { Album } from './Album'
import type { Tier } from '../core/types'

const TIER_LABEL: Record<Tier, string> = { easy: '🌱 Douce', med: '🌿 Normale', exp: '🔥 Expert' }
const NEXT_TIER: Record<Tier, Tier> = { easy: 'med', med: 'exp', exp: 'easy' }

export function Home({ onPlay }: { onPlay: (id: string, duel: boolean) => void }) {
  const store = useFerme()
  const [albumOpen, setAlbumOpen] = useState(false)
  const [duel, setDuel] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const photoTarget = useRef<string>('')

  const current = store.profiles.find(p => p.id === store.currentId) || store.profiles[0]
  const prog = store.progress[current.id] || { stars: 0, stickers: [], bestStars: {} }

  const askPhoto = (profileId: string) => {
    photoTarget.current = profileId
    fileRef.current?.click()
  }

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const img = new Image()
    img.onload = () => {
      // Recadrage carré centré, réduit à 256px — assez pour les sprites et le puzzle
      const side = Math.min(img.width, img.height)
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 256
      const c = canvas.getContext('2d')!
      c.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256)
      store.setAvatar(photoTarget.current, canvas.toDataURL('image/jpeg', 0.85))
      URL.revokeObjectURL(img.src)
    }
    img.src = URL.createObjectURL(file)
  }

  return (
    <section className="screen active">
      <div className="brand">
        <h1>La Ferme Magique</h1>
        <div className="tag">{GAMES.length} jeux pour rêver, jouer et apprendre ✨</div>
      </div>

      <div className="seg-label">Qui joue ?</div>
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

      <button className={'dueltoggle' + (duel ? ' on' : '')} onClick={() => { setDuel(d => !d); sFlip() }}>
        ⚔️ Défi à deux {duel ? '· activé ! Choisissez un jeu' : ''}
      </button>

      <div className="statrow">
        <div className="stat">⭐ {prog.stars}</div>
        <div className="stat"><button onClick={() => setAlbumOpen(true)}>📔 {prog.stickers.length}/{COLLECT.length}</button></div>
        <div className="stat"><button onClick={() => store.toggleSound()}>{store.sound ? '🔊' : '🔇'}</button></div>
      </div>

      <div className="cats">
        {CATEGORIES.map(cat => (
          <div className="cat" key={cat.id}>
            <div className="eyebrow">{cat.icon} {cat.label}</div>
            <div className="grid">
              {GAMES.filter(g => g.cat === cat.id).map(g => {
                const best = prog.bestStars[g.id] || 0
                return (
                  <button className="gc" key={g.id} onClick={() => onPlay(g.id, duel)}>
                    <span className={'sq ' + g.sq}>{g.icon}</span>
                    <span className="nm">{g.name}</span>
                    <span className="gc-stars">{'★'.repeat(best)}{'☆'.repeat(3 - best)}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="footnote">Hors-ligne · la collection de chacune est gardée d'une fois sur l'autre 🌟</div>

      {albumOpen && <Album onClose={() => setAlbumOpen(false)} />}
    </section>
  )
}
