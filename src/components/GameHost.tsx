import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useFerme } from '../core/store'
import { gameById } from '../games'
import type { FinishPayload, GameContext, Profile } from '../core/types'
import { toast } from '../core/utils'
import { confetti, FX } from '../core/fx'
import { say, shutUp } from '../core/voice'
import { playClip } from '../core/clips'

interface Result extends FinishPayload {
  newSticker: string | null
}

function Face({ p, px = 54 }: { p: Profile; px?: number }) {
  return p.avatar
    ? <span className="face-sprite" style={{ width: px, height: px, backgroundImage: `url(${p.avatar})` }} />
    : <span style={{ fontSize: px * 0.8 }}>👧</span>
}

export function GameHost({ gameId, duel, onHome }: { gameId: string; duel: boolean; onHome: () => void }) {
  const game = gameById(gameId)!
  const rootRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [runId, setRunId] = useState(0)
  const [turn, setTurn] = useState(0)
  const [interstitial, setInterstitial] = useState<Result | null>(null)
  const [duelDone, setDuelDone] = useState<Result[] | null>(null)
  const [crashed, setCrashed] = useState(false)
  const duelResults = useRef<Result[]>([])
  const store = useFerme()

  // Mode grand écran : préférence mémorisée — chaque jeu se monte directement
  // à la bonne taille, plus besoin de basculer (et relancer) en pleine partie
  const big = store.bigplay
  useLayoutEffect(() => {
    document.body.classList.toggle('bigplay', big)
  }, [big])
  const toggleBig = () => {
    store.toggleBigplay()
    try {
      if (!big) document.documentElement.requestFullscreen?.()?.catch?.(() => { /* rien */ })
      else if (document.fullscreenElement) document.exitFullscreen?.()?.catch?.(() => { /* rien */ })
    } catch { /* plein écran indisponible (iOS) : l'agrandissement CSS suffit */ }
    setRunId(r => r + 1)
  }
  useEffect(() => () => {
    document.body.classList.remove('bigplay')
    try { if (document.fullscreenElement) document.exitFullscreen?.()?.catch?.(() => { /* rien */ }) } catch { /* rien */ }
  }, [])

  // Filet anti-crash : une exception dans un timer ou un handler d'un jeu
  // affiche un écran « Oups » au lieu de laisser un plateau figé
  const safeCleanup = () => {
    try { cleanupRef.current?.() } catch (err) { console.error(err) }
    cleanupRef.current = null
  }
  useEffect(() => {
    const onErr = () => {
      safeCleanup()
      setCrashed(true)
    }
    window.addEventListener('error', onErr)
    return () => window.removeEventListener('error', onErr)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // En duel, l'ordre est figé au montage : la joueuse sélectionnée commence
  const playersRef = useRef<Profile[]>([])
  if (playersRef.current.length === 0) {
    const cur = store.profiles.find(p => p.id === store.currentId) || store.profiles[0]
    const other = store.profiles.find(p => p.id !== cur.id) || cur
    playersRef.current = duel ? [cur, other] : [cur]
  }
  const profile = playersRef.current[Math.min(turn, playersRef.current.length - 1)]


  useEffect(() => {
    if (!rootRef.current) return
    setResult(null)
    setCrashed(false)
    const p = profile
    const ctx: GameContext = {
      root: rootRef.current,
      tier: p.tier,
      playerName: p.name,
      avatar: p.avatar,
      look: p.look || null,
      byTier: (e, m, x) => (p.tier === 'easy' ? e : p.tier === 'med' ? m : x),
      toast,
      say,
      finish(payload) {
        cleanupRef.current?.()
        cleanupRef.current = null
        const newSticker = useFerme.getState().reward(gameId, payload.starsEarned, payload.stars, p.id)
        const res: Result = { ...payload, newSticker }
        confetti()
        FX.fireworks()
        // La vraie voix de la famille, après le jingle
        setTimeout(() => playClip(p.id, payload.stars >= 2 ? 'bravo' : 'retry'), 800)
        if (!duel) { setResult(res); return }
        duelResults.current = [...duelResults.current.slice(0, turn), res]
        if (turn === 0) setInterstitial(res)
        else setDuelDone([...duelResults.current])
      }
    }
    // Monté après le rendu pour que les dimensions soient mesurables
    const raf = requestAnimationFrame(() => {
      try {
        cleanupRef.current = game.mount(ctx)
      } catch (err) {
        console.error(err)
        setCrashed(true)
      }
    })
    return () => {
      cancelAnimationFrame(raf)
      safeCleanup()
      shutUp()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, runId, turn])

  const startSecondTurn = () => {
    setInterstitial(null)
    setTurn(1)
  }

  const restartDuel = () => {
    duelResults.current = []
    setDuelDone(null)
    setInterstitial(null)
    setTurn(0)
    setRunId(r => r + 1)
  }

  const duelMessage = (rs: Result[]) => {
    const [a, b] = rs
    if (a.stars === b.stars) return 'Égalité parfaite, bravo les deux ! 🎉'
    const winner = a.stars > b.stars ? playersRef.current[0] : playersRef.current[1]
    return `${winner.name} brille un peu plus fort cette fois ✨ Bravo les deux !`
  }

  return (
    <section className="screen active">
      <div className="ghostbar">
        <button className="chip" onClick={onHome}>🏠</button>
        <div className="ghead-inline">
          {duel && <span className="duel-tag">⚔️ {profile.name} · </span>}
          {game.name} {game.icon}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="chip" onClick={toggleBig} title="Grand écran">{big ? '🗕' : '⛶'}</button>
          <button className="chip" onClick={() => setRunId(r => r + 1)}>↻</button>
        </div>
      </div>
      <div className="gsub">{game.subtitle}</div>
      <div className="gameroot" ref={rootRef} key={gameId + ':' + runId + ':' + turn} />

      {crashed && (
        <div id="result" className="show">
          <div className="modal">
            <h2>Oups ! 🐮</h2>
            <p>Le jeu a eu un petit pépin… Ce n'est pas de ta faute !</p>
            <div className="rbtns">
              <button className="bigbtn primary" onClick={() => { setCrashed(false); setRunId(r => r + 1) }}>↻ Réessayer</button>
              <button className="bigbtn ghost" onClick={onHome}>🏠 Menu</button>
            </div>
          </div>
        </div>
      )}

      {result && !duel && (
        <div id="result" className="show">
          <div className="modal">
            <h2>{result.title}</h2>
            <p>{result.msg}  (+{result.starsEarned} ⭐)</p>
            <div className="stars">
              {[0, 1, 2].map(i => (
                <span key={i} style={{ animationDelay: i * 0.18 + 's' }}>{i < result.stars ? '⭐' : '☆'}</span>
              ))}
            </div>
            {result.newSticker && (
              <div className="rewardbox" style={{ display: 'block' }}>
                <span className="ra">{result.newSticker}</span>
                <span>Nouvel animal pour l'album de {profile.name} !</span>
              </div>
            )}
            <div className="rbtns">
              <button className="bigbtn primary" onClick={() => { setResult(null); setRunId(r => r + 1) }}>↻ Rejouer</button>
              <button className="bigbtn ghost" onClick={onHome}>🏠 Menu</button>
            </div>
          </div>
        </div>
      )}

      {interstitial && (
        <div id="result" className="show">
          <div className="modal">
            <h2>{playersRef.current[0].name} : {'⭐'.repeat(interstitial.stars)}</h2>
            <p>{interstitial.msg}</p>
            <div className="duel-next">
              <Face p={playersRef.current[1]} px={64} />
              <div className="duel-next-txt">Au tour de <b>{playersRef.current[1].name}</b> !</div>
            </div>
            <div className="rbtns">
              <button className="bigbtn primary" onClick={startSecondTurn}>⚔️ C'est parti !</button>
            </div>
          </div>
        </div>
      )}

      {duelDone && (
        <div id="result" className="show">
          <div className="modal">
            <h2>⚔️ Résultat du défi</h2>
            {duelDone.map((r, i) => (
              <div className="duelrow" key={i}>
                <Face p={playersRef.current[i]} px={44} />
                <span className="duelname">{playersRef.current[i].name}</span>
                <span className="duelstars">{'⭐'.repeat(r.stars)}{'☆'.repeat(3 - r.stars)}</span>
              </div>
            ))}
            <p style={{ marginTop: 10 }}>{duelMessage(duelDone)}</p>
            <div className="rbtns">
              <button className="bigbtn primary" onClick={restartDuel}>⚔️ Revanche !</button>
              <button className="bigbtn ghost" onClick={onHome}>🏠 Menu</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
