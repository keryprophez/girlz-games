import { useEffect, useRef, useState } from 'react'
import { useFerme } from '../core/store'
import type { ClipSlot } from '../core/save'

/* Studio des voix de la famille — écran parent : on enregistre une fois
   « Bravo ! », « Courage, essaie encore ! »… et ces vraies voix remplacent
   le jingle aux fins de partie. Tout reste sur l'appareil. */

const SLOTS: { slot: ClipSlot; label: string; icon: string }[] = [
  { slot: 'bravo', label: '« Bravo ! »', icon: '🎉' },
  { slot: 'retry', label: '« Courage, essaie encore ! »', icon: '💪' }
]

export function VoiceStudio({ onClose }: { onClose: () => void }) {
  const store = useFerme()
  const [recKey, setRecKey] = useState<ClipSlot | null>(null)
  const [error, setError] = useState('')
  const recRef = useRef<MediaRecorder | null>(null)
  const timerRef = useRef<number>()
  // Posé AVANT d'attendre le micro : deux appuis rapprochés ne lancent
  // qu'un enregistrement (le second restait ouvert jusqu'au rechargement)
  const busyRef = useRef(false)
  const openRef = useRef(true)

  useEffect(() => () => { openRef.current = false; stopRec(); clearTimeout(timerRef.current) }, [])

  const stopRec = () => {
    try { if (recRef.current?.state === 'recording') recRef.current.stop() } catch { /* rien */ }
  }

  const record = async (key: ClipSlot) => {
    if (recKey) { stopRec(); return }
    if (busyRef.current) return
    busyRef.current = true
    setError('')
    let stream: MediaStream | null = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Le studio a été fermé pendant qu'on attendait le micro : on le rend
      if (!openRef.current) { stream.getTracks().forEach(t => t.stop()); busyRef.current = false; return }
      const live = stream
      const rec = new MediaRecorder(live)
      const chunks: Blob[] = []
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
      rec.onstop = () => {
        live.getTracks().forEach(t => t.stop())
        busyRef.current = false
        if (openRef.current) setRecKey(null)
        clearTimeout(timerRef.current)
        if (!chunks.length) return
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' })
        const reader = new FileReader()
        reader.onload = () => useFerme.getState().setVoiceClip(key, reader.result as string)
        reader.readAsDataURL(blob)
      }
      recRef.current = rec
      rec.start()
      setRecKey(key)
      // 6 secondes max par encouragement
      timerRef.current = window.setTimeout(() => stopRec(), 6000)
    } catch {
      stream?.getTracks().forEach(t => t.stop())
      busyRef.current = false
      setError('Micro indisponible — vérifie l\'autorisation dans le navigateur.')
    }
  }

  const play = (key: ClipSlot) => {
    const url = store.voiceClips[key]
    if (url) new Audio(url).play().catch(() => { /* rien */ })
  }

  return (
    <div id="sheet" className="show" onClick={onClose}>
      <div className="modal vs-card" onClick={e => e.stopPropagation()}>
        <h2>🎙 Les voix de la famille</h2>
        <div className="vs-sub">
          Papa, maman, mamie… enregistrez un encouragement : c'est VOTRE voix
          qu'elle entendra à la fin de ses parties. Tout reste sur la tablette.
        </div>
        {error && <div className="vs-error">{error}</div>}
        <div className="vs-block">
          {SLOTS.map(s => {
            const has = !!store.voiceClips[s.slot]
            const recording = recKey === s.slot
            return (
              <div key={s.slot} className="vs-row">
                <span className="vs-label">{s.icon} {s.label}</span>
                <button className={'chip vs-rec' + (recording ? ' on' : '')} onClick={() => record(s.slot)}>
                  {recording ? '■ Stop' : has ? '● Refaire' : '● Enregistrer'}
                </button>
                {has && !recording && <button className="chip" onClick={() => play(s.slot)}>▶</button>}
                {has && !recording && <button className="chip" onClick={() => store.setVoiceClip(s.slot, null)}>🗑</button>}
              </div>
            )
          })}
        </div>
        <div className="rbtns" style={{ marginTop: 12 }}>
          <button className="bigbtn ghost" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  )
}
