import { useEffect, useState } from 'react'
import { Home } from './components/Home'
import { GameHost } from './components/GameHost'
import { Ambient } from './components/Ambient'
import { Toast } from './components/Toast'
import { ErrorBoundary } from './components/ErrorBoundary'
import { PlayGuard } from './components/PlayTimer'

export default function App() {
  const [session, setSession] = useState<{ id: string; duel: boolean } | null>(null)

  // Le zoom double-tap est neutralisé par `touch-action: manipulation` en CSS :
  // pas de preventDefault global, qui avalait un tap sur deux dans les jeux rapides.

  // Pendant un jeu, les halos d'ambiance se figent (économie GPU sur tablette)
  useEffect(() => {
    document.body.classList.toggle('ingame', !!session)
    return () => document.body.classList.remove('ingame')
  }, [session])

  return (
    <>
      <Ambient />
      <div id="app">
        <ErrorBoundary onReset={() => setSession(null)}>
          {session
            ? <GameHost key={session.id + (session.duel ? ':duel' : '')} gameId={session.id} duel={session.duel} onHome={() => setSession(null)} />
            : <Home onPlay={(id, duel) => setSession({ id, duel })} />}
        </ErrorBoundary>
      </div>
      <PlayGuard onExpire={() => setSession(null)} />
      <Toast />
    </>
  )
}
