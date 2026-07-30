import { useEffect, useState } from 'react'
import { useFerme } from '../core/store'
import { COLLECT } from '../core/utils'
import { frameStyle, loadAtlas, type Atlas } from '../core/sprites'

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
                  ? <i className="spr" style={styleOf(atlas, name)} />
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

/** frameStyle renvoie du texte CSS ; React veut un objet. */
function styleOf(atlas: Atlas, name: string): React.CSSProperties {
  const o: Record<string, string> = {}
  for (const decl of frameStyle(atlas, name, 40).split(';')) {
    const i = decl.indexOf(':')
    if (i < 0) continue
    const k = decl.slice(0, i).trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    o[k] = decl.slice(i + 1).trim()
  }
  return o as React.CSSProperties
}
