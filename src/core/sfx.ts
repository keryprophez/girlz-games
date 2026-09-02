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
