import { useRef, useState } from 'react'
import { exportSave, importSave, isTight, prettySize, saveBytes, QUOTA } from '../core/backup'
import { sGood, sNope, sPop } from '../core/audio'
import { toast } from '../core/utils'
import { MathGate } from './PlayTimer'

/* 💾 Sauvegarde — fenêtre pour les parents. Tant qu'il n'y a pas de base de
   données, c'est le seul filet contre un nettoyage du navigateur : on exporte
   un fichier JSON (photos et voix comprises) et on peut le réimporter.
   Le réimport écrase tout : il passe donc par la « question de grand ». */

export function BackupButton() {
  const [open, setOpen] = useState(false)
  const tight = isTight()
  return (
    <>
      <div className="stat">
        <button onClick={() => { sPop(); setOpen(true) }} title="Sauvegarde">
          {tight ? '⚠️' : '💾'}
        </button>
      </div>
      {open && <BackupModal onClose={() => setOpen(false)} />}
    </>
  )
}

function BackupModal({ onClose }: { onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [gate, setGate] = useState(false)
  const bytes = saveBytes()
  const pct = Math.min(100, Math.round((bytes / QUOTA) * 100))

  const pickFile = () => fileRef.current?.click()

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const err = await importSave(f)
    if (err) { sNope(); toast(err); return }
    sGood()
    toast('Sauvegarde restaurée ! On redémarre…')
    setTimeout(() => location.reload(), 900)
  }

  return (
    <div id="album" className="show" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <h2>💾 Sauvegarde</h2>
        <p>Tout est gardé dans ce navigateur. Un nettoyage l'effacerait :
          garde une copie du fichier sur ton téléphone ou ton cloud.</p>

        <div className="bk-meter">
          <div className="bk-meter-fill" style={{ width: pct + '%' }} />
        </div>
        <div className="bk-size">{prettySize(bytes)} utilisés{pct >= 80 ? ' — c\'est presque plein ⚠️' : ` (${pct} %)`}</div>

        {gate
          ? <MathGate onSuccess={() => { setGate(false); pickFile() }} onClose={() => setGate(false)} />
          : (
            <div className="rbtns">
              <button className="bigbtn primary" onClick={() => { if (exportSave()) sGood() }}>
                ⬇️ Enregistrer une copie
              </button>
              <button className="bigbtn ghost" onClick={() => { sPop(); setGate(true) }}>
                ⬆️ Restaurer une copie
              </button>
              <button className="bigbtn ghost" onClick={onClose}>Fermer</button>
            </div>
          )}
        <input ref={fileRef} type="file" accept="application/json,.json"
          style={{ display: 'none' }} onChange={onFile} />
      </div>
    </div>
  )
}
