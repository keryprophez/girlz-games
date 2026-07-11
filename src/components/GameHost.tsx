import { useEffect, useRef, useState } from 'react'
import { useFerme } from '../core/store'
import { gameById } from '../games'
import type { FinishPayload, GameContext } from '../core/types'
import { toast } from '../core/utils'
import { confetti, FX } from '../core/fx'

interface Result extends FinishPayload {
  newSticker: string | null
}

export function GameHost({ gameId, onHome }: { gameId: string; onHome: () => void }) {
  const game = gameById(gameId)!
  const rootRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [runId, setRunId] = useState(0)
  const store = useFerme()
  const profile = store.profiles.find(p => p.id === store.currentId) || store.profiles[0]

  useEffect(() => {
    if (!rootRef.current) return
    setResult(null)
    const ctx: GameContext = {
      root: rootRef.current,
      tier: profile.tier,
      playerName: profile.name,
      avatar: profile.avatar,
      byTier: (e, m, x) => (profile.tier === 'easy' ? e : profile.tier === 'med' ? m : x),
      toast,
      finish(p) {
        // Stoppe le jeu, crédite la récompense, affiche le résultat
        cleanupRef.current?.()
        cleanupRef.current = null
        const newSticker = useFerme.getState().reward(gameId, p.starsEarned, p.stars)
        setResult({ ...p, newSticker })
        confetti()
        FX.fireworks()
      }
    }
    // Monté après le rendu pour que les dimensions soient mesurables
    const raf = requestAnimationFrame(() => {
      cleanupRef.current = game.mount(ctx)
    })
    return () => {
      cancelAnimationFrame(raf)
      cleanupRef.current?.()
      cleanupRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, runId])

  return (
    <section className="screen active">
      <div className="ghostbar">
        <button className="chip" onClick={onHome}>🏠</button>
        <div className="ghead-inline">{game.name} {game.icon}</div>
        <button className="chip" onClick={() => setRunId(r => r + 1)}>↻</button>
      </div>
      <div className="gsub">{game.subtitle}</div>
      <div className="gameroot" ref={rootRef} key={gameId + ':' + runId} />

      {result && (
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
    </section>
  )
}
