import { useEffect, useState } from 'react'
import { Home } from './components/Home'
import { GameHost } from './components/GameHost'
import { Ambient } from './components/Ambient'
import { Toast } from './components/Toast'

export default function App() {
  const [session, setSession] = useState<{ id: string; duel: boolean } | null>(null)

  useEffect(() => {
    // Empêche le zoom double-tap sur tablette
    let lastTouch = 0
    const onTouchEnd = (e: TouchEvent) => {
      const now = Date.now()
      if (now - lastTouch < 350) e.preventDefault()
      lastTouch = now
    }
    document.addEventListener('touchend', onTouchEnd, { passive: false })
    return () => document.removeEventListener('touchend', onTouchEnd)
  }, [])

  return (
    <>
      <Ambient />
      <div id="app">
        {session
          ? <GameHost key={session.id + (session.duel ? ':duel' : '')} gameId={session.id} duel={session.duel} onHome={() => setSession(null)} />
          : <Home onPlay={(id, duel) => setSession({ id, duel })} />}
      </div>
      <Toast />
    </>
  )
}
