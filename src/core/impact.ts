/* Le feel des chocs — UN seul endroit pour tout le projet.

   Avant, chaque jeu improvisait : l'un secouait de 6 px quelle que soit la
   violence du choc, l'autre jouait le même « boing » pour un frôlement et pour
   un fracas, un troisième ne faisait rien du tout. Résultat : rien ne « pèse ».

   Ici, un choc a UNE force, comprise entre 0 et 1, dérivée de la vitesse de
   collision. Tout en découle : le volume et la hauteur du son, l'amplitude de
   la secousse, le nombre de particules. Un frôlement chuchote, un fracas
   cogne — et ça se ressent pareil dans les 37 jeux. */

import { getCtx, isSoundOn, buzz } from './audio'
import { FX, JUICE } from './fx'

/** Vitesse de collision (m/s ou px/s) → force normalisée 0..1. */
export function force(speed: number, softAt = 1.2, hardAt = 7): number {
  return Math.max(0, Math.min(1, (Math.abs(speed) - softAt) / (hardAt - softAt)))
}

export type Matter = 'bois' | 'glace' | 'neige' | 'pate' | 'metal' | 'sourd'

/* Chaque matière a son grain : une fréquence de corps et une durée. Un bloc de
   glace claque haut et court, la neige étouffe, la pâte fait « floc ». */
const MATTERS: Record<Matter, { freq: number; dur: number; type: BiquadFilterType; q: number }> = {
  bois: { freq: 420, dur: 0.16, type: 'bandpass', q: 1.1 },
  glace: { freq: 1400, dur: 0.13, type: 'bandpass', q: 2.2 },
  neige: { freq: 700, dur: 0.2, type: 'lowpass', q: 0.8 },
  pate: { freq: 260, dur: 0.22, type: 'lowpass', q: 0.7 },
  metal: { freq: 2100, dur: 0.3, type: 'bandpass', q: 3.4 },
  sourd: { freq: 180, dur: 0.24, type: 'lowpass', q: 0.6 }
}

/** Bruit de choc : souffle filtré + corps sinusoïdal, tous deux mis à l'échelle. */
function thud(m: Matter, f: number) {
  if (!isSoundOn() || f <= 0) return
  const ac = getCtx()
  if (!ac) return
  const cfg = MATTERS[m]
  const t0 = ac.currentTime
  const dur = cfg.dur * (0.6 + f * 0.7)
  try {
    // Souffle : c'est lui qui donne la matière
    const n = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate)
    const d = n.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length)
    const src = ac.createBufferSource(); src.buffer = n
    const flt = ac.createBiquadFilter()
    flt.type = cfg.type
    flt.frequency.setValueAtTime(cfg.freq * (0.8 + f * 0.5), t0)
    flt.Q.value = cfg.q
    const g = ac.createGain()
    g.gain.setValueAtTime(0.06 + f * 0.3, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    src.connect(flt); flt.connect(g); g.connect(ac.destination)
    src.start(t0); src.stop(t0 + dur)

    // Corps : une note grave d'autant plus basse que le choc est violent
    const o = ac.createOscillator(), og = ac.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(cfg.freq * 0.34 * (1.25 - f * 0.4), t0)
    o.frequency.exponentialRampToValueAtTime(cfg.freq * 0.2, t0 + dur * 0.8)
    og.gain.setValueAtTime(0.04 + f * 0.16, t0)
    og.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.connect(og); og.connect(ac.destination)
    o.start(t0); o.stop(t0 + dur)
  } catch { /* audio indisponible : le jeu continue en silence */ }
}

export interface ImpactOpts {
  /** Position écran du choc — sans elle, pas de particules. */
  x?: number
  y?: number
  matter?: Matter
  colors?: string[]
  /** Coupe la secousse (utile si le jeu en applique déjà une). */
  noShake?: boolean
}

/** Dernier impact joué : évite d'empiler 20 sons sur une pile qui s'écroule. */
let last = 0

/**
 * Un choc, ressenti partout pareil.
 * @param f force 0..1, typiquement `force(vitesseDeCollision)`
 */
export function impact(f: number, o: ImpactOpts = {}) {
  f = Math.max(0, Math.min(1, f))
  if (f <= 0.02) return
  const now = performance.now()
  // 45 ms de garde : au-delà, ce n'est plus un choc, c'est du bruit
  if (now - last < 45 && f < 0.65) return
  last = now

  thud(o.matter || 'bois', f)
  if (!o.noShake && f > 0.12) FX.shake(2 + f * 12)
  if (f > 0.35) buzz(Math.round(8 + f * 26))
  if (o.x !== undefined && o.y !== undefined && f > 0.15) {
    FX.burst(o.x, o.y, { colors: o.colors || JUICE.warm, count: Math.round(3 + f * 14) })
  }
}

/** Variante pratique : le choc a lieu sur un élément du DOM. */
export function impactAt(el: Element, f: number, o: ImpactOpts = {}) {
  const r = el.getBoundingClientRect()
  impact(f, { ...o, x: r.left + r.width / 2, y: r.top + r.height / 2 })
}

/**
 * Branche les collisions d'un corps cannon-es sur le feel partagé.
 * Renvoie la fonction de débranchement.
 */
export function wireBody(body: any, o: ImpactOpts & { softAt?: number; hardAt?: number } = {}) {
  const on = (e: any) => {
    const v = Math.abs(e.contact?.getImpactVelocityAlongNormal?.() ?? 0)
    impact(force(v, o.softAt ?? 1.2, o.hardAt ?? 7), o)
  }
  body.addEventListener('collide', on)
  return () => body.removeEventListener('collide', on)
}
