/* Moteur sonore Web Audio — aucun fichier, tout est synthétisé. */
let actx: AudioContext | null = null
let soundOn = true

export function setSound(on: boolean) { soundOn = on }
export function isSoundOn() { return soundOn }

/** Petite vibration tactile (tablettes Android) — silencieuse ailleurs. */
export function buzz(pattern: number | number[]) {
  try { if (soundOn && navigator.vibrate) navigator.vibrate(pattern) } catch { /* rien */ }
}

export function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.15) {
  if (!soundOn) return
  try {
    actx = actx || new (window.AudioContext || (window as any).webkitAudioContext)()
    const o = actx.createOscillator()
    const g = actx.createGain()
    o.type = type
    o.frequency.value = freq
    o.connect(g)
    g.connect(actx.destination)
    g.gain.setValueAtTime(vol, actx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur)
    o.start()
    o.stop(actx.currentTime + dur)
  } catch { /* audio indisponible : on joue en silence */ }
}

export const sGood = () => { buzz(12); tone(660, 0.12); setTimeout(() => tone(880, 0.14), 85) }
export const sWin = () => { buzz([25, 50, 25]); [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.18), i * 110)) }
export const sNope = () => { buzz(45); tone(170, 0.18, 'square', 0.12) }
export const sFlip = () => tone(440, 0.07, 'triangle', 0.1)
export const sCatch = () => tone(760, 0.08, 'triangle')
export const sPower = () => { [700, 900, 1200].forEach((f, i) => setTimeout(() => tone(f, 0.1, 'square', 0.12), i * 60)) }
export const sBonk = () => { tone(300, 0.06, 'square', 0.16); setTimeout(() => tone(520, 0.08, 'triangle', 0.12), 50) }
export const sJump = () => tone(500, 0.1, 'triangle', 0.12)
export const sPop = () => { tone(880, 0.05, 'triangle', 0.14); setTimeout(() => tone(1240, 0.07, 'sine', 0.1), 35) }
export const sSlice = () => { tone(900, 0.05, 'sawtooth', 0.06); setTimeout(() => tone(420, 0.08, 'sawtooth', 0.05), 25) }

/* ---- Bruitages v2 : souffle blanc filtré + enveloppes = sons « réels » ---- */
let noiseBuf: AudioBuffer | null = null
/** Contexte audio partagé (un seul pour toute l'app — sons ET musique). */
export function getCtx(): AudioContext | null {
  try {
    actx = actx || new (window.AudioContext || (window as any).webkitAudioContext)()
    if (actx.state === 'suspended') actx.resume().catch(() => { /* rien */ })
    return actx
  } catch { return null }
}
function noiseBurst(dur: number, freq: number, opts: {
  q?: number; vol?: number; type?: BiquadFilterType; sweepTo?: number; delay?: number
} = {}) {
  if (!soundOn) return
  const ac = getCtx()
  if (!ac) return
  const { q = 1, vol = 0.25, type = 'lowpass', sweepTo, delay = 0 } = opts
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  const t0 = ac.currentTime + delay
  const src = ac.createBufferSource()
  src.buffer = noiseBuf
  src.loop = true
  const f = ac.createBiquadFilter()
  f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur)
  const g = ac.createGain()
  g.gain.setValueAtTime(vol, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(f); f.connect(g); g.connect(ac.destination)
  src.start(t0); src.stop(t0 + dur + 0.05)
}
/** Plouf dans l'eau : gros souffle grave + goutte qui remonte. */
export const sSplash = () => {
  noiseBurst(0.4, 900, { vol: 0.3, sweepTo: 250 })
  setTimeout(() => tone(300, 0.12, 'sine', 0.12), 60)
  setTimeout(() => tone(520, 0.1, 'sine', 0.09), 160)
}
/** Explosion charnue (ballon, boum). */
export const sBoomReal = () => {
  noiseBurst(0.5, 2500, { vol: 0.4, sweepTo: 120 })
  tone(65, 0.4, 'sine', 0.3)
  setTimeout(() => tone(48, 0.35, 'sine', 0.2), 50)
}
/** Pop sec et satisfaisant (bulle, pop-corn). */
export const sPopReal = () => {
  noiseBurst(0.07, 1800, { vol: 0.22, type: 'highpass' })
  tone(620, 0.05, 'sine', 0.16)
}
/** Impact touché (bataille navale). */
export const sHit = () => {
  noiseBurst(0.22, 1400, { vol: 0.3, sweepTo: 300 })
  tone(180, 0.15, 'square', 0.14)
}
/** Crounch (neige, bouchée croustillante). */
export const sCrunch = () => {
  noiseBurst(0.09, 950, { vol: 0.26, type: 'bandpass', q: 1.4, sweepTo: 480 })
  noiseBurst(0.05, 2400, { vol: 0.1, type: 'highpass', delay: 0.02 })
}
/** Woosh d'objet lancé. */
export const sWoosh = () => noiseBurst(0.26, 320, { vol: 0.16, type: 'bandpass', q: 0.8, sweepTo: 1700 })
/** Meuh : basse en dents de scie avec glissando. */
export const sMoo = () => {
  if (!soundOn) return
  const ac = getCtx()
  if (!ac) return
  try {
    const o = ac.createOscillator(), g = ac.createGain()
    o.type = 'sawtooth'
    const t0 = ac.currentTime
    o.frequency.setValueAtTime(140, t0)
    o.frequency.exponentialRampToValueAtTime(85, t0 + 0.35)
    o.frequency.exponentialRampToValueAtTime(70, t0 + 0.55)
    g.gain.setValueAtTime(0.16, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6)
    o.connect(g); g.connect(ac.destination)
    o.start(t0); o.stop(t0 + 0.65)
  } catch { /* rien */ }
}
