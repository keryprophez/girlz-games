import { isSoundOn } from './audio'

/* Synthèse vocale française — uniquement pour lire du CONTENU pédagogique
   (multiplications, heures), jamais des consignes.
   Les voix se chargent en asynchrone : on les met en cache dès que possible,
   sinon le navigateur peut retomber sur une voix anglaise. */

let frVoice: SpeechSynthesisVoice | null = null

function pickFrVoice() {
  try {
    const voices = speechSynthesis.getVoices()
    frVoice =
      voices.find(v => v.lang === 'fr-FR' && v.localService) ||
      voices.find(v => v.lang === 'fr-FR') ||
      voices.find(v => v.lang.startsWith('fr')) ||
      null
  } catch { /* rien */ }
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  pickFrVoice()
  try { speechSynthesis.addEventListener('voiceschanged', pickFrVoice) } catch { /* rien */ }
}

export function say(text: string) {
  if (!isSoundOn()) return
  try {
    if (!('speechSynthesis' in window)) return
    if (!frVoice) pickFrVoice()
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'fr-FR'
    u.rate = 0.95
    u.pitch = 1.1
    if (frVoice) u.voice = frVoice
    speechSynthesis.speak(u)
  } catch { /* pas de synthèse dispo : le visuel suffit */ }
}

export function shutUp() {
  try { if ('speechSynthesis' in window) speechSynthesis.cancel() } catch { /* rien */ }
}
