// LE COFFRE de la maquette : les lettres, gardées sur l'appareil (IndexedDB), rien ailleurs.
import type { Who } from '../../src/core/mine'
import type { AnimalVoice } from '../../src/core/sfx'

/** La feuille a une taille fixe, quelle que soit celle de l'écran (comme l'Atelier). */
export const W = 1500
export const H = 1000

interface Pose { x: number; y: number; s: number; r: number }
export interface Texte extends Pose { k: 'texte'; t: string; color: string; font: string; size: number }
/** `src` : « emoji:😀 », « animal:cow », « photo:cat », « forme:coeur:#E8414F ». */
export interface Gomme extends Pose { k: 'gomme'; src: string }
export interface Son { audio: Blob | null; cri: AnimalVoice | null; peaks: number[]; dur: number }
export interface Voix extends Pose, Son { k: 'voix'; color: string }
export type Obj = Texte | Gomme | Voix

export interface Lettre {
  id: string; from: Who; to: Who; at: number
  paper: string; paint: Blob | null; objs: Obj[]
  env: { color: string; stamp: string; seal: string } | null
  opened: boolean
}
const mem = new Map<string, unknown>()
let dbp: Promise<IDBDatabase> | null = null
const db = () => (dbp ??= new Promise<IDBDatabase>((ok, ko) => {
  const rq = indexedDB.open('maquette-courrier', 1)
  rq.onupgradeneeded = () => rq.result.createObjectStore('kv')
  rq.onsuccess = () => ok(rq.result)
  rq.onerror = () => ko(rq.error)
}))
async function get<T>(k: string): Promise<T | null> {
  try {
    const d = await db()
    return await new Promise(res => {
      const rq = d.transaction('kv').objectStore('kv').get(k)
      rq.onsuccess = () => res((rq.result as T) ?? null)
      rq.onerror = () => res(null)
    })
  } catch { return (mem.get(k) as T) ?? null }
}
async function put(k: string, v: unknown) {
  mem.set(k, v)
  try {
    const d = await db()
    await new Promise<void>(res => {
      const tx = d.transaction('kv', 'readwrite')
      tx.objectStore('kv').put(v, k)
      tx.oncomplete = tx.onerror = tx.onabort = () => res()
    })
  } catch { /* en mémoire seulement */ }
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
export const other = (w: Who): Who => (w === 'jade' ? 'joyce' : 'jade')

export const coffre = {
  lettres: [] as Lettre[],
  async load() {
    const l = await get<Lettre[]>('lettres')
    if (l) this.lettres = l
    else await this.exemples()
  },
  async save() { await put('lettres', this.lettres) },
  async draft(w: Who): Promise<Lettre | null> { return get<Lettre>('brouillon:' + w) },
  async setDraft(w: Who, l: Lettre | null) { await put('brouillon:' + w, l) },
  /** Le courrier fermé qui attend dans la boîte de `w`. */
  waiting(w: Who) { return this.lettres.filter(l => l.to === w && !l.opened) },
  kept(w: Who) { return this.lettres.filter(l => l.to === w && l.opened) },
  /** Le départ de la maquette : une lettre d'exemple. */
  async exemples() {
    const now = Date.now()
    this.lettres = [{
      id: uid(), from: 'joyce', to: 'jade', at: now, paper: '#FFF1D6', paint: await dessinExemple(), opened: false,
      objs: [
        { k: 'texte', t: 'Coucou Jade !\nTu veux jouer avec moi\nau château de sable ?', x: 560, y: 260, s: 1, r: -0.03, color: '#1C64C8', font: 'Gochi Hand', size: 92 },
        { k: 'gomme', src: 'animal:chick', x: 1230, y: 300, s: 1.5, r: 0.12 },
        { k: 'gomme', src: 'emoji:🏖️', x: 1180, y: 720, s: 1.2, r: -0.1 },
        { k: 'gomme', src: 'emoji:💛', x: 130, y: 860, s: 0.8, r: -0.2 },
        { k: 'voix', x: 420, y: 800, s: 1, r: 0.02, color: '#B197FC', audio: null, cri: 'canard', peaks: [0.2, 0.6, 0.9, 0.5, 0.8, 1, 0.6, 0.3, 0.7, 0.9, 0.4, 0.6, 0.8, 0.5, 0.2, 0.5, 0.7, 0.3], dur: 1.2 }
      ],
      env: { color: '#B197FC', stamp: 'animal:duck', seal: 'etoile' }
    }]
    await put('brouillon:jade', null)
    await put('brouillon:joyce', null)
    await this.save()
  }
}

/** Un petit soleil et une mer au feutre, pour la lettre d'exemple. */
function dessinExemple(): Promise<Blob | null> {
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')!
  g.lineCap = g.lineJoin = 'round'
  g.lineWidth = 20
  g.strokeStyle = '#4FB8E7'
  for (let k = 0; k < 2; k++) {
    g.beginPath()
    for (let x = 700; x <= 1440; x += 10) { const y = 890 + k * 46 + Math.sin(x / 45 + k) * 14; if (x === 700) g.moveTo(x, y); else g.lineTo(x, y) }
    g.stroke()
  }
  g.strokeStyle = '#FFA94D'
  g.lineWidth = 18
  g.beginPath(); g.arc(870, 660, 62, 0, 6.3); g.stroke()
  for (let k = 0; k < 9; k++) { const a = k * 0.698; g.beginPath(); g.moveTo(870 + Math.cos(a) * 92, 660 + Math.sin(a) * 92); g.lineTo(870 + Math.cos(a) * 128, 660 + Math.sin(a) * 128); g.stroke() }
  return new Promise(r => c.toBlob(r))
}
