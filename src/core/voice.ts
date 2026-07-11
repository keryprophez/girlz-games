import { isSoundOn } from './audio'

/* Lecture des consignes à voix haute (synthèse vocale du navigateur, hors-ligne).
   Principe "zéro lecture obligatoire" : Jade (CP) doit pouvoir jouer sans lire. */
export function say(text: string) {
  if (!isSoundOn()) return
  try {
    if (!('speechSynthesis' in window)) return
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'fr-FR'
    u.rate = 0.95
    u.pitch = 1.1
    const voices = speechSynthesis.getVoices()
    const fr = voices.find(v => v.lang.startsWith('fr'))
    if (fr) u.voice = fr
    speechSynthesis.speak(u)
  } catch { /* pas de synthèse dispo : tant pis, le visuel suffit */ }
}

export function shutUp() {
  try { if ('speechSynthesis' in window) speechSynthesis.cancel() } catch { /* rien */ }
}
