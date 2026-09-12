import { isSoundOn } from './audio'
import { duckMusic } from './music'

/* Synthèse vocale française — uniquement pour lire du CONTENU pédagogique
   (multiplications, additions, heures, noms de lieux), jamais des consignes.

   Deux pièges d'Android, payés le 12/09 sur la tablette :

   1. `cancel()` suivi immédiatement de `speak()` AVALE l'énoncé sur Chrome
      Android : la file est vidée juste après l'ajout, plus un son. On laisse
      donc un souffle entre les deux, et on garde le timer pour l'annuler si
      le son est coupé entre-temps.
   2. La synthèse doit être DÉVERROUILLÉE par un vrai geste : tant qu'on n'a
      pas parlé une première fois depuis un tap, tout `speak()` est ignoré en
      silence. `unlockVoice()` est branché sur le premier geste de l'app.

   Et la règle de base : rien ne sort si le son est coupé — au moment de la
   demande ET au moment où l'énoncé part (on peut couper entre les deux). */

let frVoice: SpeechSynthesisVoice | null = null
let pending = 0
let unlocked = false

const synth = (): SpeechSynthesis | null => {
  try { return 'speechSynthesis' in window ? window.speechSynthesis : null } catch { return null }
}

function pickFrVoice() {
  const s = synth()
  if (!s) return
  try {
    const voices = s.getVoices()
    frVoice =
      voices.find(v => v.lang === 'fr-FR' && v.localService) ||
      voices.find(v => v.lang === 'fr-FR') ||
      voices.find(v => v.lang.startsWith('fr')) ||
      null
  } catch { /* rien */ }
}

if (typeof window !== 'undefined') {
  pickFrVoice()
  try { synth()?.addEventListener('voiceschanged', pickFrVoice) } catch { /* rien */ }
}

/** À appeler sur le PREMIER geste utilisateur : déverrouille la synthèse
    d'Android (un énoncé vide suffit) et charge la liste des voix. */
export function unlockVoice() {
  if (unlocked) return
  const s = synth()
  if (!s) return
  unlocked = true
  try {
    pickFrVoice()
    const u = new SpeechSynthesisUtterance(' ')
    u.volume = 0        // inaudible : c'est le déverrouillage qui compte
    u.lang = 'fr-FR'
    s.speak(u)
  } catch { /* rien */ }
}

function utter(text: string) {
  const s = synth()
  if (!s) return
  if (!frVoice) pickFrVoice()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'fr-FR'
  u.rate = 0.95
  u.pitch = 1.1
  u.volume = 1
  if (frVoice) u.voice = frVoice
  duckMusic(true)
  u.onend = u.onerror = () => duckMusic(false)
  // Chrome met parfois sa file en pause tout seul : on la relance avant.
  try { s.resume() } catch { /* rien */ }
  s.speak(u)
}

export function say(text: string) {
  if (!isSoundOn()) return
  const s = synth()
  if (!s) return
  try {
    if (!unlocked) unlockVoice()
    clearTimeout(pending)
    s.cancel()
    // Le souffle indispensable entre `cancel()` et `speak()` (piège 1)
    pending = window.setTimeout(() => {
      if (!isSoundOn()) return   // coupé entre-temps : on ne dit rien
      utter(text)
    }, 60)
  } catch { /* pas de synthèse dispo : le visuel suffit */ }
}

export function shutUp() {
  clearTimeout(pending)
  try { synth()?.cancel() } catch { /* rien */ }
  duckMusic(false)
}
