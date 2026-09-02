import { useEffect, useState } from 'react'
import { useFerme } from '../core/store'
import { COLLECT } from '../core/utils'
import { frameProps, loadAtlas, type Atlas } from '../core/sprites'

export function Album({ onClose }: { onClose: () => void }) {
  const store = useFerme()
  const current = store.profiles.find(p => p.id === store.currentId) || store.profiles[0]
  const prog = store.progress[current.id] || { stars: 0, stickers: [], bestStars: {} }
  // Les stickers sont de vrais sprites : la planche se charge à l'ouverture
  const [atlas, setAtlas] = useState<Atlas | null>(null)
  useEffect(() => { let on = true; loadAtlas('animals').then(a => on && setAtlas(a)); return () => { on = false } }, [])

  return (
    <div id="album" className="show" onClick={onClose}>
      <div className="modal albumcard" onClick={e => e.stopPropagation()}>
        <h2>📔 L'album de {current.name}</h2>
        <div className="albumsub">{prog.stickers.length} animaux sur {COLLECT.length} · ⭐ {prog.stars} étoiles</div>
        <div className="collgrid">
          {COLLECT.map(name => {
            const have = prog.stickers.includes(name)
            return (
              <div key={name} className={'slot ' + (have ? 'have' : 'locked')}>
                {have && atlas
                  ? <i className="spr" style={frameProps(atlas, name, 40)} />
                  : have ? '…' : '❓'}
              </div>
            )
          })}
        </div>
        <div className="rbtns">
          <button className="bigbtn ghost" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  )
}
