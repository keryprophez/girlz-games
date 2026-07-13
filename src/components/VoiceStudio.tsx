import { useEffect, useRef, useState } from 'react'
import { useFerme } from '../core/store'

/* Studio des voix de la famille — écran parent : on enregistre une fois
   « Bravo Jade ! », « Courage Joyce ! »… et ces vraies voix remplacent
   le jingle aux fins de partie. Tout reste sur l'appareil. */

const SLOTS = [
  { slot: 'bravo', label: (n: string) => `« Bravo ${n} ! »`, icon: '🎉' },
  { slot: 'retry', label: (n: string) => `« Courage ${n}, essaie encore ! »`, icon: '💪' }
]

export function VoiceStudio({ onClose }: { onClose: () => void }) {
  const store = useFerme()
  const [recKey, setRecKey] = useState<string | null>(null)
  const [error, setError] = useState('')
  const recRef = useRef<MediaRecorder | null>(null)
  const timerRef = useRef<number>()

  useEffect(() => () => { stopRec(); clearTimeout(timerRef.current) }, [])

  const stopRec = () => {
    try { recRef.current?.state === 'recording' && recRef.current.stop() } catch { /* rien */ }
  }

  const record = async (key: string) => {
    if (recKey) { stopRec(); return }
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      const chunks: Blob[] = []
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        setRecKey(null)
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
      setError('Micro indisponible — vérifie l\'autorisation dans le navigateur.')
    }
  }

  const play = (key: string) => {
    const url = store.voiceClips[key]
    if (url) new Audio(url).play().catch(() => { /* rien */ })
  }

  return (
    <div id="album" className="show" onClick={onClose}>
      <div className="modal albumcard" onClick={e => e.stopPropagation()}>
        <h2>🎙 Les voix de la famille</h2>
        <div className="albumsub">
          Papa, maman, mamie… enregistrez un encouragement : c'est VOTRE voix
          qu'elle entendra à la fin de ses parties. Tout reste sur la tablette.
        </div>
        {error && <div className="vs-error">{error}</div>}
        {store.profiles.map(p => (
          <div key={p.id} className="vs-block">
            <div className="vs-name">{p.name}</div>
            {SLOTS.map(s => {
              const key = p.id + ':' + s.slot
              const has = !!store.voiceClips[key]
              const recording = recKey === key
              return (
                <div key={s.slot} className="vs-row">
                  <span className="vs-label">{s.icon} {s.label(p.name)}</span>
                  <button className={'chip vs-rec' + (recording ? ' on' : '')} onClick={() => record(key)}>
                    {recording ? '■ Stop' : has ? '● Refaire' : '● Enregistrer'}
                  </button>
                  {has && !recording && <button className="chip" onClick={() => play(key)}>▶</button>}
                  {has && !recording && <button className="chip" onClick={() => store.setVoiceClip(key, '')}>🗑</button>}
                </div>
              )
            })}
          </div>
        ))}
        <div className="rbtns" style={{ marginTop: 12 }}>
          <button className="bigbtn ghost" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  )
}
