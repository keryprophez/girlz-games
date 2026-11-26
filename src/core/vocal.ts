/* @version 2026-11-26 09:40 */
import { getCtx, isSoundOn } from './audio'
import { playMusic, stopMusic } from './music'
import { isPaused, onPause } from './session'
import type { MicError } from './mic'

/* LA VOIX GARDÉE du Courrier : une fille parle (30 s au plus), sa voix se colle
   sur la lettre et sa sœur l'entend. Au contraire de `core/mic.ts`, qui promet
   de ne rien garder (l'Animal qui répète), ce module ENREGISTRE (MediaRecorder)
   — d'où un module à part. Rien ne quitte la tablette (règle 3).

   - Le micro s'ouvre au toucher, et se ferme dans TOUS les cas : arrêt,
     30 s, pause (onglet caché, minuteur parental), jeu quitté, même pendant
     que le navigateur demande l'autorisation.
   - Coupée en route (30 s, pause), la voix est GARDÉE : `fini` la reçoit.
   - La musique se tait pendant qu'on parle et qu'on écoute, puis reprend
     (sauf en pause : la coquille s'en charge). */

export const MIN_S = 0.4
export const MAX_S = 30

export interface Son { audio: Blob; pics: number[]; duree: number }

/** Les barres d'une voix : `n` hauteurs entre 0,12 et 1, la plus forte à 1. */
export function pics(niveaux: number[], n = 28): number[] {
  const haut = Math.max(0.05, ...niveaux.filter(v => Number.isFinite(v)))
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * niveaux.length / n), b = Math.max(a + 1, Math.floor((i + 1) * niveaux.length / n))
    const m = Math.max(0, ...niveaux.slice(a, b).filter(v => Number.isFinite(v)))
    out.push(Math.max(0.12, Math.min(1, m / haut)))
  }
  return out
}

export interface Prise {
  /** Arrête et rend la voix (null : moins de 0,4 s, ou rien d'enregistré). */
  arreter(): Promise<Son | null>
  /** Arrête et jette. */
  jeter(): void
}
export interface Ecoute {
  /** Le volume (0..1) et les secondes passées, à chaque image. */
  niveau(v: number, s: number): void
  /** La prise s'est arrêtée d'elle-même (30 s, pause) : la voix, gardée. */
  fini(s: Son | null): void
}

/** Ouvre le micro et enregistre. Lève un `MicError`. `encore` : faux si le jeu
    est parti pendant l'autorisation (la piste est alors rendue, et null). */
export async function enregistrer(e: Ecoute, o: { musique?: string; encore(): boolean }): Promise<Prise | null> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw 'absent' as MicError
  let flux: MediaStream
  try {
    flux = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } })
  } catch (err) {
    const n = (err as { name?: string })?.name
    throw (n === 'NotAllowedError' || n === 'SecurityError' ? 'refuse' : n === 'NotFoundError' ? 'absent' : 'autre') as MicError
  }
  const rendre = () => flux.getTracks().forEach(t => t.stop())
  if (!o.encore()) { rendre(); return null }
  let rec: MediaRecorder
  try { rec = new MediaRecorder(flux) } catch { rendre(); throw 'autre' as MicError }
  stopMusic(0.2)
  const morceaux: Blob[] = [], niveaux: number[] = []
  rec.ondataavailable = ev => { if (ev.data.size) morceaux.push(ev.data) }
  const ac = getCtx()
  const an = ac?.createAnalyser()
  const src = ac && an ? ac.createMediaStreamSource(flux) : null
  if (src && an) { an.fftSize = 512; src.connect(an) }
  const buf = new Uint8Array(512)
  const t0 = performance.now()
  const secs = () => (performance.now() - t0) / 1000
  let raf = 0, fini = false
  let resultat: Promise<Son | null> | null = null

  const fermer = () => {
    cancelAnimationFrame(raf)
    offPause()
    try { src?.disconnect() } catch { /* déjà */ }
    rendre()
    if (o.musique && o.encore() && !isPaused()) playMusic(o.musique)
  }
  const stop = (garder: boolean): Promise<Son | null> => {
    if (resultat) return resultat
    fini = true
    const duree = secs()
    resultat = new Promise(res => {
      const conclure = () => {
        fermer()
        if (!garder || duree < MIN_S || !morceaux.length) { res(null); return }
        res({ audio: new Blob(morceaux, { type: rec.mimeType || 'audio/webm' }), pics: pics(niveaux), duree: Math.min(MAX_S, duree) })
      }
      if (rec.state === 'inactive') { conclure(); return }
      rec.onstop = conclure
      try { rec.stop() } catch { conclure() }
    })
    return resultat
  }
  const offPause = onPause(p => { if (p && !fini) void stop(true).then(s => e.fini(s)) })
  const tic = () => {
    if (fini) return
    let v = 0.4
    if (an) {
      an.getByteTimeDomainData(buf)
      let q = 0
      for (const x of buf) q += (x - 128) ** 2
      v = Math.min(1, Math.sqrt(q / buf.length) / 40)
    }
    niveaux.push(v)
    const s = secs()
    e.niveau(v, s)
    if (s >= MAX_S) { void stop(true).then(x => e.fini(x)); return }
    raf = requestAnimationFrame(tic)
  }
  rec.start()
  tic()
  return { arreter: () => stop(true), jeter: () => { void stop(false) } }
}

/* ---------- Écouter ---------- */

let enCours: ((relancer: boolean) => void) | null = null

/** Coupe la voix qui joue (sans relancer la musique : on s'en va). */
export function taire() { enCours?.(false) }

/** Joue une voix. `avance` reçoit l'avancée (0..1), puis -1 à la fin, ou tout
    de suite si le son est coupé ou la voix illisible. Rend son arrêt. */
export function jouer(s: Son, avance: (p: number) => void, o: { musique?: string } = {}): () => void {
  taire()
  if (!isSoundOn() || !s.audio) { avance(-1); return () => {} }
  let url = '', raf = 0, fini = false
  const a = new Audio()
  const arret = (relancer: boolean) => {
    if (fini) return
    fini = true
    cancelAnimationFrame(raf)
    a.pause()
    if (url) URL.revokeObjectURL(url)
    if (enCours === arret) enCours = null
    avance(-1)
    if (relancer && o.musique && !isPaused()) playMusic(o.musique)
  }
  enCours = arret
  try { url = URL.createObjectURL(s.audio) } catch { arret(false); return () => {} }
  a.src = url
  a.onended = () => arret(true)
  a.onerror = () => arret(true)
  const suivre = () => {
    if (fini) return
    avance(Math.min(1, a.currentTime / Math.max(0.1, s.duree)))
    raf = requestAnimationFrame(suivre)
  }
  stopMusic(0.2)
  a.play().then(suivre, () => arret(true))
  return () => arret(true)
}

/** Le dessin d'une voix : le bouton lecture et ses barres (couleur de la fille). */
export const barresHTML = (s: Pick<Son, 'pics'>, couleur: string) =>
  `<span class="voix-b" style="--v:${couleur}"><i class="voix-play"></i><span class="voix-barres">${s.pics.map(p => `<b style="height:${Math.round(p * 100)}%"></b>`).join('')}</span></span>`
