import { useEffect, useRef, useState } from 'react'
import { useFerme } from '../core/store'
import { rnd, toast } from '../core/utils'
import { sGood, sNope, sPop, tone } from '../core/audio'
import { say } from '../core/voice'

/* Minuteur parental — on règle un temps de jeu par tranches de 5 minutes.
   Quand c'est fini : écran de pause tout doux qui bloque les jeux. Pour
   débloquer (ou rajouter du temps), il faut résoudre une multiplication
   « de grand » que les filles ne peuvent pas faire. */

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(s / 60)
  return m >= 1 ? `${m} min` : `${s} s`
}

/* ---- Le verrou mathématique (question de grand) ---- */
function MathGate({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
  const [op] = useState(() => ({ a: rnd(23, 89), b: rnd(6, 9) }))
  const [typed, setTyped] = useState('')
  const [oops, setOops] = useState(0)

  const press = (d: string) => {
    sPop()
    if (d === '⌫') { setTyped(t => t.slice(0, -1)); return }
    if (typed.length < 4) setTyped(t => t + d)
  }
  const check = () => {
    if (parseInt(typed || '0') === op.a * op.b) { sGood(); onSuccess(); return }
    sNope()
    setTyped('')
    setOops(o => o + 1)
    if (oops + 1 >= 3) onClose()
  }

  return (
    <div className="pt-gate">
      <div className="pt-gate-title">🔑 Question de grand</div>
      <div className="pt-gate-op">{op.a} × {op.b} = <span className="pt-gate-typed">{typed || '?'}</span></div>
      {oops > 0 && <div className="pt-gate-oops">Presque ! Essai {oops + 1}/3</div>}
      <div className="pt-pad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0'].map(d => (
          <button key={d} className="tb-key pt-key" onClick={() => press(d)}>{d}</button>
        ))}
        <button className="tb-key pt-key pt-ok" onClick={check}>✔</button>
      </div>
      <button className="bigbtn ghost" onClick={onClose} style={{ marginTop: 10 }}>Annuler</button>
    </div>
  )
}

/* ---- Le bouton ⏳ de l'accueil + sa fenêtre de réglage ---- */
export function TimerButton() {
  const { timerEnd, setTimerEnd } = useFerme()
  const [open, setOpen] = useState(false)
  const [mins, setMins] = useState(15)
  const [gate, setGate] = useState<null | 'stop' | 'add'>(null)
  const [, tick] = useState(0)

  useEffect(() => {
    if (!open && !timerEnd) return
    const t = setInterval(() => tick(x => x + 1), 1000)
    return () => clearInterval(t)
  }, [open, timerEnd])

  const left = timerEnd ? timerEnd - Date.now() : 0
  const active = !!timerEnd && left > 0

  return (
    <>
      <div className="stat">
        <button onClick={() => { sPop(); setOpen(true) }} title="Minuteur de jeu">
          ⏳{active ? ` ${fmt(left)}` : ''}
        </button>
      </div>
      {open && (
        <div id="album" className="show" onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}>
          <div className="modal">
            {gate ? (
              <MathGate
                onClose={() => setGate(null)}
                onSuccess={() => {
                  if (gate === 'stop') { setTimerEnd(null); toast('Minuteur arrêté 👍') }
                  else { setTimerEnd((timerEnd || Date.now()) + 5 * 60000); toast('+5 minutes ✨') }
                  setGate(null)
                }} />
            ) : active ? (
              <>
                <h2>⏳ Minuteur en cours</h2>
                <p>Il reste <b>{fmt(left)}</b> de jeu</p>
                <div className="rbtns">
                  <button className="bigbtn primary" onClick={() => setGate('add')}>＋5 min</button>
                  <button className="bigbtn ghost" onClick={() => setGate('stop')}>🛑 Arrêter</button>
                </div>
                <p className="pt-note">Modifier le minuteur demande une question de grand 🔑</p>
              </>
            ) : (
              <>
                <h2>⏳ Minuteur de jeu</h2>
                <p>Quand le temps est écoulé, les jeux font une pause</p>
                <div className="pt-stepper">
                  <button className="pt-step" onClick={() => { sPop(); setMins(m => Math.max(5, m - 5)) }}>−</button>
                  <div className="pt-mins">{mins}<span> min</span></div>
                  <button className="pt-step" onClick={() => { sPop(); setMins(m => Math.min(120, m + 5)) }}>＋</button>
                </div>
                <div className="rbtns">
                  <button className="bigbtn primary" onClick={() => {
                    sGood()
                    setTimerEnd(Date.now() + mins * 60000)
                    toast(`⏳ C'est parti pour ${mins} minutes !`)
                    setOpen(false)
                  }}>▶️ Lancer</button>
                  <button className="bigbtn ghost" onClick={() => setOpen(false)}>Fermer</button>
                </div>
                <p className="pt-note">L'arrêter avant la fin demandera une question de grand 🔑</p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

/* ---- Le gardien : surveille l'heure et affiche l'écran de pause ---- */
export function PlayGuard({ onExpire }: { onExpire: () => void }) {
  const { timerEnd, setTimerEnd } = useFerme()
  const [, tick] = useState(0)
  const [gate, setGate] = useState(false)
  const warned = useRef(false)
  const chimed = useRef(false)

  const left = timerEnd ? timerEnd - Date.now() : Infinity
  const expired = !!timerEnd && left <= 0

  useEffect(() => {
    if (!timerEnd) { warned.current = false; chimed.current = false; return }
    const t = setInterval(() => tick(x => x + 1), 1000)
    return () => clearInterval(t)
  }, [timerEnd])

  // Prévenir une minute avant la fin
  useEffect(() => {
    if (timerEnd && left <= 61000 && left > 0 && !warned.current) {
      warned.current = true
      toast('⏳ Plus qu\'une minute de jeu !')
      tone(520, 0.15, 'sine', 0.12); setTimeout(() => tone(392, 0.2, 'sine', 0.1), 180)
    }
  })

  // À l'expiration : on quitte le jeu en cours et on sonne la pause
  useEffect(() => {
    if (expired && !chimed.current) {
      chimed.current = true
      onExpire()
      ;[392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'sine', 0.1), i * 260))
      say('C\'est l\'heure de la pause ! Tu as très bien joué.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired])

  if (!expired) return null
  return (
    <div className="pt-lock">
      <div className="pt-lock-sky">
        {Array.from({ length: 16 }, (_, i) => (
          <span key={i} className="pt-lock-star" style={{
            left: (i * 61) % 100 + '%', top: (i * 37) % 60 + '%',
            animationDelay: -(i * 0.4) + 's'
          }}>✦</span>
        ))}
      </div>
      <div className="pt-lock-moon">🌙</div>
      <h2 className="pt-lock-title">C'est l'heure de la pause !</h2>
      <p className="pt-lock-sub">Tu as super bien joué 🌟<br />Repose tes yeux, on se retrouve bientôt 💤</p>
      <div className="pt-lock-animals">🐰💤 🐤💤 🐮💤</div>
      {gate ? (
        <div className="modal pt-lock-modal">
          <MathGate
            onClose={() => setGate(false)}
            onSuccess={() => {
              setGate(false)
              setTimerEnd(null)
              toast('Débloqué 👍 Relance un minuteur quand tu veux')
            }} />
        </div>
      ) : (
        <button className="pt-parentbtn" onClick={() => setGate(true)}>🔑 Je suis un parent</button>
      )}
    </div>
  )
}
