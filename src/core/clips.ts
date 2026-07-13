import { useFerme } from './store'
import { isSoundOn } from './audio'

/* Encouragements enregistrés par la famille — joués aux moments forts
   (fin de partie), jamais en rafale. */

export function hasClip(profileId: string, slot: string): boolean {
  return !!useFerme.getState().voiceClips[profileId + ':' + slot]
}

/** Joue l'encouragement s'il existe. Renvoie true si un clip a été joué. */
export function playClip(profileId: string, slot: string): boolean {
  const url = useFerme.getState().voiceClips[profileId + ':' + slot]
  if (!url) return false
  if (!isSoundOn()) return true
  try {
    const a = new Audio(url)
    a.play().catch(() => { /* autoplay refusé : tant pis */ })
  } catch { /* rien */ }
  return true
}
