import { useEffect, useState } from 'react'
import { Home } from './components/Home'
import { GameHost } from './components/GameHost'
import { Ambient } from './components/Ambient'
import { Toast } from './components/Toast'
import { ErrorBoundary } from './components/ErrorBoundary'
import { PlayGuard } from './components/PlayTimer'
import { ICON } from './core/icons'
import { unlockVoice } from './core/voice'

/* Plein écran + paysage, demandés depuis le tap sur la tuile (il faut un geste
   utilisateur). Tout est optionnel : si le navigateur refuse, on joue quand
   même, et le bouton maison ressort du plein écran. */
export function enterFullscreen() {
  try {
    // Seul le mode `fullscreen` du manifeste cache VRAIMENT la barre système
    // d'Android. En `standalone` (installation antérieure au manifeste) la
    // barre du bas restait, et les poignets des filles appuyaient dessus :
    // on demande donc le plein écran dans TOUS les cas sauf celui-là (10/09).
    if (matchMedia('(display-mode: fullscreen)').matches) return
    if (document.fullscreenElement) return
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
  const [session, setSession] = useState<{ id: string } | null>(null)

  /* Android rend la main dès qu'on balaie depuis le bord : le plein écran est
     perdu et la barre système revient. On le reprend au premier geste suivant
     (un geste utilisateur est obligatoire pour le redemander). */
  useEffect(() => {
    const retake = () => {
      unlockVoice()   // Android : la synthèse doit être déverrouillée par un geste
      if (document.body.classList.contains('playing')) enterFullscreen()
    }
    document.addEventListener('pointerdown', retake, { passive: true })
    return () => document.removeEventListener('pointerdown', retake)
  }, [])

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
            ? <GameHost key={session.id} gameId={session.id} onHome={() => setSession(null)} />
            : <Home onPlay={id => { enterFullscreen(); setSession({ id }) }} />}
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
