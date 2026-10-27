import { useFerme } from './store'
import { isSoundOn } from './audio'
import type { ClipSlot } from './save'

/* Encouragements enregistrés par la famille (le studio des voix) — joués
   aux moments forts (fin de partie), jamais en rafale. */

/** Joue l'encouragement s'il existe. Renvoie true si un clip a été joué. */
export function playClip(slot: ClipSlot): boolean {
  const url = useFerme.getState().voiceClips[slot]
  if (!url) return false
  if (!isSoundOn()) return true
  try {
    const a = new Audio(url)
    a.play().catch(() => { /* autoplay refusé : tant pis */ })
  } catch { /* rien */ }
  return true
}
