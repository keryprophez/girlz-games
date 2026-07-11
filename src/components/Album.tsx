import { useFerme } from '../core/store'
import { COLLECT } from '../core/utils'

export function Album({ onClose }: { onClose: () => void }) {
  const store = useFerme()
  const current = store.profiles.find(p => p.id === store.currentId) || store.profiles[0]
  const prog = store.progress[current.id] || { stars: 0, stickers: [], bestStars: {} }

  return (
    <div id="album" className="show" onClick={onClose}>
      <div className="modal albumcard" onClick={e => e.stopPropagation()}>
        <h2>📔 L'album de {current.name}</h2>
        <div className="albumsub">{prog.stickers.length} animaux sur {COLLECT.length} · ⭐ {prog.stars} étoiles</div>
        <div className="collgrid">
          {COLLECT.map(e => {
            const have = prog.stickers.includes(e)
            return <div key={e} className={'slot ' + (have ? 'have' : 'locked')}>{have ? e : '❓'}</div>
          })}
        </div>
        <div className="rbtns">
          <button className="bigbtn ghost" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  )
}
