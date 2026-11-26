// LA VOIX : 30 secondes au plus, gardée dans la lettre. Sans micro (la page privée claude.ai le refuse), un cri
// de la ferme tient lieu de voix d'essai.
import { getCtx } from '../../src/core/audio'
import { cry, preloadCries, sfx, type AnimalVoice } from '../../src/core/sfx'
import type { Son } from './coffre'

export const MAX_S = 30
const CRIS: AnimalVoice[] = ['canard', 'mouton', 'chat', 'poule', 'cochon']
preloadCries(CRIS)
export let sansMicro = false

export interface Prise { stop(): Promise<Son | null>; cancel(): void }

/** Ouvre le micro et enregistre ; `onLevel` : le volume (0..1) et les secondes passées. */
export async function enregistrer(onLevel: (v: number, t: number) => void, onFull: () => void): Promise<Prise> {
  const t0 = performance.now()
  const levels: number[] = []
  let raf = 0, alive = true
  const secs = () => (performance.now() - t0) / 1000
  const peaks = (n = 28) => {
    const out: number[] = []
    const top = Math.max(0.05, ...levels)
    for (let i = 0; i < n; i++) {
      const a = Math.floor(i * levels.length / n), b = Math.max(a + 1, Math.floor((i + 1) * levels.length / n))
      out.push(Math.max(0.12, Math.max(0, ...levels.slice(a, b)) / top))
    }
    return out
  }
  let full = false
  const tick = (level: () => number) => {
    if (!alive) return
    const v = level()
    levels.push(v)
    onLevel(v, secs())
    if (secs() >= MAX_S && !full) { full = true; onFull(); return }
    raf = requestAnimationFrame(() => tick(level))
  }
  let stream: MediaStream
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('absent')
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
  } catch {
    sansMicro = true
    document.body.classList.add('sans-micro')
    tick(() => Math.abs(Math.sin(performance.now() / 130)) * (0.5 + Math.random() * 0.5))
    return {
      async stop() {
        alive = false; cancelAnimationFrame(raf)
        if (secs() < 0.4) return null
        return { audio: null, cri: CRIS[(Math.random() * CRIS.length) | 0], peaks: peaks(), dur: 1.3 }
      },
      cancel() { alive = false; cancelAnimationFrame(raf) }
    }
  }
  const off = () => stream.getTracks().forEach(t => t.stop())
  const rec = new MediaRecorder(stream)
  const chunks: Blob[] = []
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
  const ac = getCtx()
  const an = ac?.createAnalyser()
  const src = ac && an ? ac.createMediaStreamSource(stream) : null
  if (src && an) { an.fftSize = 512; src.connect(an) }
  const buf = new Uint8Array(512)
  rec.start()
  tick(() => {
    if (!an) return 0.4
    an.getByteTimeDomainData(buf)
    let s = 0
    for (const v of buf) s += (v - 128) ** 2
    return Math.min(1, Math.sqrt(s / buf.length) / 40)
  })
  const end = () => { alive = false; cancelAnimationFrame(raf); src?.disconnect(); off() }
  return {
    stop: () => new Promise(res => {
      const dur = secs()
      rec.onstop = () => {
        end()
        res(dur < 0.4 || !chunks.length ? null : { audio: new Blob(chunks, { type: rec.mimeType || 'audio/webm' }), cri: null, peaks: peaks(), dur })
      }
      rec.stop()
    }),
    cancel() { try { rec.stop() } catch { /* déjà arrêté */ } end() }
  }
}

let playing: { stop(): void } | null = null
export const taire = () => { playing?.stop(); playing = null }

/** Joue un son ; `onP` : l'avancée (0..1), puis -1 à la fin. */
export function jouer(s: Son, onP: (p: number) => void) {
  taire()
  let raf = 0, done = false
  const finish = () => { if (done) return; done = true; cancelAnimationFrame(raf); onP(-1); if (playing === me) playing = null }
  let me: { stop(): void }
  if (s.audio) {
    const url = URL.createObjectURL(s.audio), a = new Audio(url)
    me = { stop() { a.pause(); URL.revokeObjectURL(url); finish() } }
    const t = () => { onP(Math.min(1, a.currentTime / Math.max(0.1, s.dur))); raf = requestAnimationFrame(t) }
    a.onended = () => me.stop()
    a.onerror = () => me.stop()
    a.play().then(t).catch(() => me.stop())
  } else {
    const t0 = performance.now()
    me = { stop: finish }
    if (s.cri && !cry(s.cri, { vol: 0.9 })) sfx('bong')
    const t = () => { const p = (performance.now() - t0) / 1000 / s.dur; if (p >= 1) { me.stop(); return } onP(p); raf = requestAnimationFrame(t) }
    t()
  }
  playing = me
}

/** Le dessin d'une voix : le bouton lecture et ses barres. */
export const barres = (s: Son, color: string) =>
  `<span class="voix-b" style="--v:${color}"><i class="voix-play"></i><span class="voix-barres">${s.peaks.map(p => `<b style="height:${Math.round(p * 100)}%"></b>`).join('')}</span></span>`
export function brancher(el: HTMLElement, s: Son) {
  const bars = el.querySelectorAll<HTMLElement>('.voix-barres b'), root = el.querySelector<HTMLElement>('.voix-b')!
  if (root.classList.contains('on')) { taire(); return }
  jouer(s, p => {
    root.classList.toggle('on', p >= 0)
    bars.forEach((b, i) => b.classList.toggle('lu', p >= 0 && i / bars.length <= p))
  })
}
