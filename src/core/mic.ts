/* LE MICRO (5/10, l'Animal qui répète) — ouvert à la demande, coupé pour
   de bon (`stop` arrête la piste : le voyant du micro s'éteint).

   Il ne garde RIEN : chaque morceau de son (≈ 43 ms) est passé à `onChunk`
   puis oublié ; c'est le jeu qui tient la phrase en mémoire, le temps de la
   répéter. Rien n'est écrit sur le disque, rien ne quitte la tablette. */
import { getCtx } from './audio'

export interface Mic {
  /** Échantillons par seconde du contexte audio. */
  sr: number
  /** Coupe le micro (la piste s'arrête, le voyant s'éteint). Idempotent. */
  stop(): void
}

/** Ce qui peut arriver : pas de micro, refusé, ou autre souci. */
export type MicError = 'absent' | 'refuse' | 'autre'

const WORKLET = `
class Prise extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(2048); this.n = 0 }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (ch) for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i]
      if (this.n === this.buf.length) { this.port.postMessage(this.buf); this.buf = new Float32Array(2048); this.n = 0 }
    }
    return true
  }
}
registerProcessor('prise-du-micro', Prise)`

let workletUrl: string | null = null
const loaded = new WeakSet<BaseAudioContext>()

/** Ouvre le micro. `onChunk` reçoit le son au fil de l'eau. `raw` : sans
    les traitements de Chrome (les bots : leur fausse voix est un son
    régulier, que l'anti-bruit effacerait). */
export async function openMic(onChunk: (x: Float32Array) => void, o: { raw?: boolean } = {}): Promise<Mic> {
  const ac = getCtx()
  if (!ac || !navigator.mediaDevices?.getUserMedia) throw 'absent' as MicError
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: !o.raw, noiseSuppression: !o.raw, autoGainControl: !o.raw, channelCount: 1 }
    })
  } catch (e) {
    const n = (e as { name?: string })?.name
    throw (n === 'NotAllowedError' || n === 'SecurityError' ? 'refuse' : n === 'NotFoundError' ? 'absent' : 'autre') as MicError
  }
  if (ac.state === 'suspended') await ac.resume().catch(() => { /* au prochain geste */ })
  const src = ac.createMediaStreamSource(stream)
  // Une sortie muette : le nœud doit être tiré par le graphe pour travailler
  const mute = ac.createGain()
  mute.gain.value = 0
  mute.connect(ac.destination)
  let node: AudioNode
  let dead = false
  if (ac.audioWorklet) {
    if (!loaded.has(ac)) {
      workletUrl ??= URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }))
      await ac.audioWorklet.addModule(workletUrl)
      loaded.add(ac)
    }
    const w = new AudioWorkletNode(ac, 'prise-du-micro', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] })
    w.port.onmessage = e => { if (!dead) onChunk(e.data as Float32Array) }
    node = w
  } else {
    // Vieux navigateurs : l'ancienne méthode, dépréciée mais partout
    const sp = ac.createScriptProcessor(2048, 1, 1)
    sp.onaudioprocess = e => { if (!dead) onChunk(new Float32Array(e.inputBuffer.getChannelData(0))) }
    node = sp
  }
  src.connect(node)
  node.connect(mute)
  return {
    sr: ac.sampleRate,
    stop() {
      if (dead) return
      dead = true
      try { src.disconnect(); node.disconnect(); mute.disconnect() } catch { /* déjà fait */ }
      if (node instanceof AudioWorkletNode) node.port.onmessage = null
      stream.getTracks().forEach(t => t.stop())
    }
  }
}
