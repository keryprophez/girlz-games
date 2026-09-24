/* Sons de gestes et d'interface — de VRAIS échantillons (Kenney, CC0), là où
   les gestes n'avaient que des `tone()` synthétiques : tranche, pas, clic,
   tic, chute… Un jeu Flash, c'est 50 % de son.

   Chaque nom logique a plusieurs variantes, tirées au hasard, avec une
   hauteur légèrement variée : deux tranches ne sonnent jamais pareil.
   Chargement paresseux ; tant qu'un son n'est pas décodé, il ne joue pas
   (les jeux gardent leur `tone()` de secours s'ils y tiennent).

   Tout passe par le bus « effets » : un seul volume à régler, et la musique
   (core/music.ts) a le sien. */

import { getCtx, isSoundOn } from './audio'

const LIB = {
  slice: ['knifeSlice', 'knifeSlice2'],
  whoosh: ['drawKnife1', 'drawKnife2'],
  chop: ['chop'],
  cloth: ['cloth1', 'cloth2'],
  step: ['footstep00', 'footstep01', 'footstep02', 'footstep03'],
  tick: ['tick_001', 'tick_002'],
  click: ['click_001', 'click_002', 'click_003'],
  metal: ['metalClick'],
  coins: ['handleCoins'],
  creak: ['creak1'],
  pluck: ['pluck_001', 'pluck_002'],
  confirm: ['confirmation_001', 'confirmation_002'],
  error: ['error_001', 'error_004'],
  drop: ['drop_001', 'drop_002'],
  switch: ['switch_001'],
  bong: ['bong_001'],
  glass: ['glass_001', 'glass_002'],
  select: ['select_001'],
  open: ['maximize_001'],
  close: ['minimize_001']
} as const

export type SfxName = keyof typeof LIB

const buffers = new Map<string, AudioBuffer | null>()
let bus: GainNode | null = null

function fxBus(ac: AudioContext): GainNode {
  if (!bus) {
    bus = ac.createGain()
    bus.gain.value = 0.9
    bus.connect(ac.destination)
  }
  return bus
}

function load(file: string) {
  if (buffers.has(file)) return
  buffers.set(file, null)
  const ac = getCtx()
  if (!ac) return
  fetch(`${import.meta.env.BASE_URL}assets/sounds/${file}.ogg`)
    .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer() })
    .then(b => ac.decodeAudioData(b))
    .then(buf => buffers.set(file, buf))
    .catch(() => { /* reste muet : pas de secours synthétique ici */ })
}

/** Précharge une liste de sons (au montage d'un jeu, pour que le premier joue). */
export function preloadSfx(names: SfxName[]) {
  for (const n of names) for (const f of LIB[n]) load(f)
}

/** Joue un son. `vol` 0..1, `rate` autour de 1 (0.8 = plus grave), `spread`
    = variation aléatoire de hauteur (0.06 par défaut). */
export function sfx(name: SfxName, o: { vol?: number; rate?: number; spread?: number; delay?: number } = {}) {
  if (!isSoundOn()) return
  const ac = getCtx()
  if (!ac) return
  const files = LIB[name]
  const file = files[Math.floor(Math.random() * files.length)]
  const buf = buffers.get(file)
  if (buf === undefined) { preloadSfx([name]); return }
  if (!buf) return
  const src = ac.createBufferSource()
  src.buffer = buf
  const spread = o.spread ?? 0.06
  src.playbackRate.value = (o.rate ?? 1) * (1 + (Math.random() * 2 - 1) * spread)
  const g = ac.createGain()
  g.gain.value = o.vol ?? 1
  src.connect(g); g.connect(fxBus(ac))
  src.start(ac.currentTime + (o.delay ?? 0))
}

/** Volume du bus effets (0..1). */
export function setFxVolume(v: number) {
  const ac = getCtx()
  if (!ac) return
  fxBus(ac).gain.setTargetAtTime(v, ac.currentTime, 0.05)
}

/* ---------- Les voix des animaux (25/09) ----------
   De vrais cris enregistrés (Wikimedia Commons, licences libres, crédités
   dans public/assets/CREDITS.md), choisis À L'OREILLE par le père sur une
   page d'écoute : une voix par animal de la ferme. Les six premières ont
   leur personnage 3D (`core/critters.ts`, table `CRY`) ; le coq, la chèvre,
   le cheval et le chat attendent le leur. */

export type AnimalVoice = 'vache' | 'poule' | 'canard' | 'mouton' | 'cochon' | 'chien' | 'coq' | 'chevre' | 'cheval' | 'chat'

/** La voix de chaque personnage de la ferme qui en a une. */
export const CRY: Partial<Record<import('./critters').CritterKind, AnimalVoice>> = {
  cow: 'vache', hen: 'poule', duck: 'canard', sheep: 'mouton', pig: 'cochon', dog: 'chien'
}

function loadCry(v: AnimalVoice) {
  const key = 'animals/' + v
  if (buffers.has(key)) return
  buffers.set(key, null)
  const ac = getCtx()
  if (!ac) return
  fetch(`${import.meta.env.BASE_URL}assets/sounds/animals/${v}.mp3`)
    .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer() })
    .then(b => ac.decodeAudioData(b))
    .then(buf => buffers.set(key, buf))
    .catch(() => { /* reste muet : le jeu garde son secours */ })
}

/** Précharge des voix (au montage d'un jeu). */
export function preloadCries(vs: AnimalVoice[]) {
  for (const v of vs) loadCry(v)
}

/** La voix qui chante en ce moment, pour la couper en mode `solo`. */
let singing: { g: GainNode; src: AudioBufferSourceNode } | null = null

/** Un animal chante. `max` (s) : la voix s'éteint en douceur au-delà (une
    note de Simon, un temps de la Boîte à rythme) ; `solo` : la voix
    précédente se tait d'abord, une note à la fois. Renvoie false tant que
    le son n'est pas décodé (le jeu joue alors son secours). */
export function cry(v: AnimalVoice, o: { vol?: number; rate?: number; max?: number; solo?: boolean; delay?: number } = {}): boolean {
  const ac = getCtx()
  if (!ac) return false
  const buf = buffers.get('animals/' + v)
  if (buf === undefined) { loadCry(v); return false }
  if (!buf) return false
  if (!isSoundOn()) return true
  const t0 = ac.currentTime + (o.delay ?? 0)
  if (o.solo && singing) {
    const prev = singing
    prev.g.gain.setTargetAtTime(0, t0, 0.02)
    try { prev.src.stop(t0 + 0.12) } catch { /* déjà fini */ }
  }
  const src = ac.createBufferSource()
  src.buffer = buf
  src.playbackRate.value = o.rate ?? 1
  const g = ac.createGain()
  const vol = o.vol ?? 1
  g.gain.setValueAtTime(vol, t0)
  src.connect(g); g.connect(fxBus(ac))
  src.start(t0)
  const len = buf.duration / (o.rate ?? 1)
  if (o.max && o.max < len) {
    g.gain.setValueAtTime(vol, t0 + Math.max(0, o.max - 0.08))
    g.gain.linearRampToValueAtTime(0, t0 + o.max)
    src.stop(t0 + o.max + 0.02)
  }
  const me = { g, src }
  if (o.solo) singing = me
  src.onended = () => { if (singing === me) singing = null }
  return true
}
