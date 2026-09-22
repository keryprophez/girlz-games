import { SHOW_PROFILES, useFerme } from './store'
import { isSoundOn } from './audio'

/* Encouragements enregistrés par la famille — joués aux moments forts
   (fin de partie), jamais en rafale. */

/** À qui appartient un encouragement : à la joueuse si on choisit qui joue,
    sinon à toute la famille (un « Bravo Jade ! » ne doit pas saluer Joyce). */
export function clipOwner(profileId: string): string {
  return SHOW_PROFILES ? profileId : 'famille'
}

/** Joue l'encouragement s'il existe. Renvoie true si un clip a été joué. */
export function playClip(profileId: string, slot: string): boolean {
  const url = useFerme.getState().voiceClips[clipOwner(profileId) + ':' + slot]
  if (!url) return false
  if (!isSoundOn()) return true
  try {
    const a = new Audio(url)
    a.play().catch(() => { /* autoplay refusé : tant pis */ })
  } catch { /* rien */ }
  return true
}
