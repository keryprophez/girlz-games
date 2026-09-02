import { useEffect, useState } from 'react'
import { Home } from './components/Home'
import { GameHost } from './components/GameHost'
import { Ambient } from './components/Ambient'
import { Toast } from './components/Toast'
import { ErrorBoundary } from './components/ErrorBoundary'
import { PlayGuard } from './components/PlayTimer'
import { ICON } from './core/icons'

/* Plein écran + paysage, demandés depuis le tap sur la tuile (il faut un geste
   utilisateur). Tout est optionnel : si le navigateur refuse, on joue quand
   même, et le bouton maison ressort du plein écran. */
function enterFullscreen() {
  try {
    const p = document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })
    p?.then(() => {
      const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
      o.lock?.('landscape').catch(() => { /* pas supporté hors PWA : le manifest s'en charge */ })
    }).catch(() => { /* refusé : tant pis */ })
  } catch { /* iOS : pas de plein écran, l'agrandissement CSS suffit */ }
}
export function exitFullscreen() {
  try { if (document.fullscreenElement) document.exitFullscreen?.()?.catch?.(() => { /* rien */ }) } catch { /* rien */ }
}

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
            : <Home onPlay={(id, duel) => { enterFullscreen(); setSession({ id, duel }) }} />}
        </ErrorBoundary>
      </div>
      <PlayGuard />
      <Toast />
      {/* Tablette tenue en portrait : on demande de la tourner, en image */}
      <div className="rotate-hint" aria-hidden="true">
        <span dangerouslySetInnerHTML={{ __html: ICON.rotate }} />
      </div>
    </>
  )
}
