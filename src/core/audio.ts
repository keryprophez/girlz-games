/* Moteur sonore Web Audio — aucun fichier, tout est synthétisé. */
let actx: AudioContext | null = null
let soundOn = true

export function setSound(on: boolean) { soundOn = on }
export function isSoundOn() { return soundOn }

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

export const sGood = () => { tone(660, 0.12); setTimeout(() => tone(880, 0.14), 85) }
export const sWin = () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.18), i * 110)) }
export const sNope = () => tone(170, 0.18, 'square', 0.12)
export const sFlip = () => tone(440, 0.07, 'triangle', 0.1)
export const sCatch = () => tone(760, 0.08, 'triangle')
export const sPower = () => { [700, 900, 1200].forEach((f, i) => setTimeout(() => tone(f, 0.1, 'square', 0.12), i * 60)) }
export const sBonk = () => { tone(300, 0.06, 'square', 0.16); setTimeout(() => tone(520, 0.08, 'triangle', 0.12), 50) }
export const sJump = () => tone(500, 0.1, 'triangle', 0.12)
export const sPop = () => { tone(880, 0.05, 'triangle', 0.14); setTimeout(() => tone(1240, 0.07, 'sine', 0.1), 35) }
export const sSlice = () => { tone(900, 0.05, 'sawtooth', 0.06); setTimeout(() => tone(420, 0.08, 'sawtooth', 0.05), 25) }
