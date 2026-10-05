/* LA VOIX RIGOLOTE de l'Animal qui répète (5/10) — logique pure, testée.

   La phrase enregistrée (des échantillons, en mémoire) est transformée ici
   avant d'être rejouée : plus aiguë sans aller plus vite (des grains qui se
   chevauchent, relus plus vite chacun), accélérée façon dessin animé,
   chevrotante, à l'envers. Rien n'est gardé : le jeu écrase la phrase
   suivante par-dessus, et tout part au démontage.

   Le détecteur de phrase (`Phrase`) écoute le niveau du micro, image par
   image : il apprend le bruit de la pièce, sait quand on commence à parler
   (avec une demi-seconde gardée AVANT, pour ne pas couper le premier mot) et
   quand on s'est tu. Les bruits trop courts (un claquement de mains) ne
   comptent pas. */

/** Plus aigu (ratio > 1) ou plus grave, à durée égale : des grains de
    `grainMs` en Hann, à moitié superposés, chacun relu `ratio` fois plus vite. */
export function pitchShift(x: Float32Array, sr: number, ratio: number, grainMs = 50): Float32Array {
  const out = new Float32Array(x.length)
  if (Math.abs(ratio - 1) < 1e-3) { out.set(x); return out }
  const N = Math.max(32, Math.round(sr * grainMs / 1000)), H = N >> 1
  const w = new Float32Array(N)
  for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)
  const norm = new Float32Array(x.length)
  for (let o = -H; o < x.length; o += H) {
    // Le grain qui sort à `o` part du même instant dans l'original ; relu plus
    // vite, il déborderait : on recule son départ pour qu'il reste centré
    const start = o + N / 2 - (N / 2) * ratio
    for (let i = 0; i < N; i++) {
      const at = o + i
      if (at < 0 || at >= x.length) continue
      const s = start + i * ratio
      if (s < 0 || s >= x.length - 1) continue
      const k = Math.floor(s), f = s - k
      out[at] += (x[k] * (1 - f) + x[k + 1] * f) * w[i]
      norm[at] += w[i]
    }
  }
  for (let i = 0; i < out.length; i++) if (norm[i] > 1e-3) out[i] /= Math.max(norm[i], 0.5)
  return out
}

/** Plus vite ET plus aigu (ratio > 1), comme un disque accéléré : le poussin. */
export function speed(x: Float32Array, ratio: number): Float32Array {
  const n = Math.max(1, Math.floor(x.length / ratio))
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const s = i * ratio, k = Math.floor(s), f = s - k
    out[i] = k + 1 < x.length ? x[k] * (1 - f) + x[k + 1] * f : x[Math.min(k, x.length - 1)]
  }
  return out
}

/** À l'envers. */
export function reverse(x: Float32Array): Float32Array {
  const out = new Float32Array(x.length)
  for (let i = 0; i < x.length; i++) out[i] = x[x.length - 1 - i]
  return out
}

/** Chevrotante : la hauteur ondule (`depth` en demi-tons, `rate` en Hz) et
    le volume tremble un peu avec — le « bêêê » du mouton. */
export function vibrato(x: Float32Array, sr: number, rate: number, depth: number): Float32Array {
  const out = new Float32Array(x.length)
  // Une ligne à retard qui varie : sa dérivée change la vitesse de lecture
  const maxD = (Math.pow(2, depth / 12) - 1) * sr / (2 * Math.PI * rate)
  for (let i = 0; i < x.length; i++) {
    const ph = 2 * Math.PI * rate * i / sr
    const s = i - maxD * (1 + Math.sin(ph))
    const k = Math.floor(s), f = s - k
    const v = k >= 0 && k + 1 < x.length ? x[k] * (1 - f) + x[k + 1] * f : 0
    out[i] = v * (0.8 + 0.2 * Math.sin(ph))
  }
  return out
}

/** Le volume, image par image (`fps`) : la bouche de l'animal le suit. */
export function envelope(x: Float32Array, sr: number, fps = 60): Float32Array {
  const step = Math.max(1, Math.round(sr / fps))
  const n = Math.ceil(x.length / step)
  const out = new Float32Array(n)
  let peak = 1e-4
  for (let j = 0; j < n; j++) {
    let sum = 0, c = 0
    for (let i = j * step; i < Math.min(x.length, (j + 1) * step); i++) { sum += x[i] * x[i]; c++ }
    out[j] = Math.sqrt(sum / Math.max(1, c))
    peak = Math.max(peak, out[j])
  }
  for (let j = 0; j < n; j++) out[j] = Math.min(1, out[j] / peak)
  return out
}

/** Ramène le plus fort à `peak` (une phrase dite tout bas s'entend quand même). */
export function normalize(x: Float32Array, peak = 0.9): Float32Array {
  let m = 0
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]))
  const out = new Float32Array(x.length)
  const k = m > 1e-4 ? Math.min(8, peak / m) : 1
  for (let i = 0; i < x.length; i++) out[i] = x[i] * k
  return out
}

/** Une voix d'animal : ce qu'on fait à la phrase (les filtres, eux, sont
    posés à la lecture par le jeu, en Web Audio). */
export interface VoiceStyle {
  /** Demi-tons, à durée égale. */
  pitch: number
  /** Accéléré (> 1) : plus vite et plus aigu en même temps. */
  speed: number
  vibrato?: { rate: number; depth: number }
}

/** La phrase transformée : prête à jouer. */
export function voiceOf(x: Float32Array, sr: number, st: VoiceStyle, backwards = false): Float32Array {
  let y = backwards ? reverse(x) : x
  if (st.pitch) y = pitchShift(y, sr, Math.pow(2, st.pitch / 12))
  if (st.vibrato) y = vibrato(y, sr, st.vibrato.rate, st.vibrato.depth)
  if (Math.abs(st.speed - 1) > 1e-3) y = speed(y, st.speed)
  return normalize(y)
}

/* ---------- Le détecteur de phrase ---------- */

export interface PhraseOpts {
  /** Échantillons par seconde. */
  sr: number
  /** Gardé avant le début détecté (s). */
  preRoll?: number
  /** Silence qui clôt la phrase (s). */
  hang?: number
  /** Plus court que ça (s), ce n'était pas une phrase. */
  minLen?: number
  /** Plus long que ça (s), on coupe et on répète. */
  maxLen?: number
}

export type PhraseEvent = { type: 'start' } | { type: 'end'; samples: Float32Array } | { type: 'drop' }

/** Écoute le micro morceau par morceau (`push`) et dit quand une phrase
    commence, finit (avec ses échantillons) ou ne comptait pas. */
export class Phrase {
  readonly sr: number
  private pre: number
  private hang: number
  private minLen: number
  private maxLen: number
  /** Le bruit de la pièce (RMS), appris quand personne ne parle. */
  floor = 0.004
  /** Le niveau du dernier morceau, 0..1 au-dessus du bruit (pour l'écran). */
  level = 0
  speaking = false
  private ring: Float32Array
  private ringAt = 0
  private ringFull = false
  private rec: Float32Array[] = []
  private recLen = 0
  private quiet = 0
  private loud = 0

  constructor(o: PhraseOpts) {
    this.sr = o.sr
    this.pre = Math.round((o.preRoll ?? 0.5) * o.sr)
    this.hang = o.hang ?? 0.55
    this.minLen = o.minLen ?? 0.3
    this.maxLen = o.maxLen ?? 6
    this.ring = new Float32Array(Math.max(1, this.pre))
  }

  /** Les seuils : on parle au-dessus de `on`, on s'est tu sous `off`. */
  private get on() { return Math.max(0.012, this.floor * 3.2) }
  private get off() { return Math.max(0.008, this.floor * 2) }

  /** Oublie tout (on ne garde rien d'une phrase à l'autre). */
  reset() {
    this.speaking = false
    this.rec = []; this.recLen = 0
    this.quiet = 0; this.loud = 0
    this.ring.fill(0); this.ringAt = 0; this.ringFull = false
    this.level = 0
  }

  push(chunk: Float32Array): PhraseEvent | null {
    let sum = 0
    for (let i = 0; i < chunk.length; i++) sum += chunk[i] * chunk[i]
    const rms = Math.sqrt(sum / Math.max(1, chunk.length))
    const dur = chunk.length / this.sr
    this.level = Math.max(0, Math.min(1, (rms - this.floor) / (this.on * 4)))
    if (!this.speaking) {
      // Le bruit de fond se suit lentement (et vite vers le bas)
      const k = rms < this.floor ? 0.2 : 0.02
      this.floor += (rms - this.floor) * k
      this.floor = Math.max(0.001, Math.min(0.05, this.floor))
      if (rms > this.on) {
        this.speaking = true
        this.loud = dur; this.quiet = 0
        this.rec = [this.preRoll(), chunk.slice()]
        this.recLen = this.rec[0].length + chunk.length
        return { type: 'start' }
      }
      this.keep(chunk)
      return null
    }
    this.rec.push(chunk.slice()); this.recLen += chunk.length
    if (rms > this.off) { this.loud += dur; this.quiet = 0 } else this.quiet += dur
    const len = this.recLen / this.sr
    if (this.quiet >= this.hang || len >= this.maxLen) {
      const enough = this.loud >= this.minLen
      const out = enough ? this.take() : null
      this.reset()
      return out ? { type: 'end', samples: out } : { type: 'drop' }
    }
    return null
  }

  private keep(chunk: Float32Array) {
    for (let i = 0; i < chunk.length; i++) {
      this.ring[this.ringAt] = chunk[i]
      this.ringAt = (this.ringAt + 1) % this.ring.length
      if (this.ringAt === 0) this.ringFull = true
    }
  }

  private preRoll(): Float32Array {
    if (!this.ringFull) return this.ring.slice(0, this.ringAt)
    const out = new Float32Array(this.ring.length)
    out.set(this.ring.subarray(this.ringAt))
    out.set(this.ring.subarray(0, this.ringAt), this.ring.length - this.ringAt)
    return out
  }

  /** La phrase, sans le silence de la fin (on garde un souffle de 80 ms). */
  private take(): Float32Array {
    const all = new Float32Array(this.recLen)
    let at = 0
    for (const c of this.rec) { all.set(c, at); at += c.length }
    const cut = Math.max(0, Math.round((this.quiet - 0.08) * this.sr))
    return all.slice(0, Math.max(1, all.length - cut))
  }
}
