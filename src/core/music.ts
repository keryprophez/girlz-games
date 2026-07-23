import { getCtx, isSoundOn } from './audio'

/* Musique d'ambiance GÉNÉRATIVE — zéro fichier audio, fidèle à l'identité de
   la ferme. Chaque univers a son thème (accords, gamme, tempo, style) et la
   mélodie est improvisée en marche aléatoire sur la gamme : la musique ne se
   répète jamais exactement. Volume volontairement discret, sous les bruitages. */

interface Theme {
  bpm: number
  style: 'box' | 'oompah' | 'pad' | 'waltz'
  /** Accords (notes MIDI), un par mesure, en boucle. */
  chords: number[][]
  /** Notes MIDI où la mélodie a le droit de se promener. */
  scale: number[]
  /** Note de basse par mesure (MIDI). */
  bass: number[]
}

const THEMES: Record<string, Theme> = {
  // Boîte à musique d'hiver, cristalline et lente
  winter: {
    bpm: 72, style: 'box',
    chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]],
    scale: [72, 74, 76, 79, 81, 84, 88],
    bass: [48, 45, 41, 43]
  },
  // Grand pad spatial, contemplation et merveille
  space: {
    bpm: 48, style: 'pad',
    chords: [[48, 55, 64, 67], [45, 52, 60, 64], [41, 48, 57, 64], [43, 50, 59, 62]],
    scale: [79, 84, 86, 88, 91, 96],
    bass: [36, 33, 29, 31]
  },
  // Orgue de fête foraine, oom-pah joyeux
  fair: {
    bpm: 112, style: 'oompah',
    chords: [[53, 57, 60], [53, 57, 60], [50, 53, 58], [48, 52, 55]],
    scale: [65, 67, 69, 72, 74, 77],
    bass: [41, 41, 38, 36]
  },
  // Petite valse de trattoria pour la pizzeria
  kitchen: {
    bpm: 104, style: 'waltz',
    chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]],
    scale: [72, 74, 76, 77, 79, 81],
    bass: [48, 45, 41, 43]
  },
  // Prairie douce (chenille, créatifs)
  meadow: {
    bpm: 84, style: 'box',
    chords: [[55, 59, 62], [52, 55, 59], [48, 52, 55], [50, 54, 57]],
    scale: [67, 69, 71, 74, 76, 79],
    bass: [43, 40, 36, 38]
  },
  // Nuit calme sous les fusées
  night: {
    bpm: 46, style: 'pad',
    chords: [[45, 52, 57, 60], [41, 48, 55, 57], [43, 50, 55, 59], [45, 52, 57, 60]],
    scale: [81, 84, 88, 89, 93],
    bass: [33, 29, 31, 33]
  }
}

const m2f = (m: number) => 440 * Math.pow(2, (m - 69) / 12)

let master: GainNode | null = null
let current: string | null = null
let timer = 0
let nextT = 0
let step = 0
let lastMel = 0

function ensureMaster(ac: AudioContext): GainNode {
  if (master) return master
  master = ac.createGain()
  master.gain.value = 0.55
  master.connect(ac.destination)
  return master
}

/* ---- Instruments (tous discrets, routés vers master) ---- */
function pluck(ac: AudioContext, f: number, t: number, vol: number, bright = false) {
  const g = ac.createGain()
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + (bright ? 1.4 : 0.9))
  const o1 = ac.createOscillator()
  o1.type = 'triangle'; o1.frequency.value = f
  const o2 = ac.createOscillator()
  o2.type = 'sine'; o2.frequency.value = f * 2.003 // harmonique légèrement désaccordée = boîte à musique
  const g2 = ac.createGain(); g2.gain.value = 0.35
  o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(master!)
  o1.start(t); o2.start(t)
  o1.stop(t + 1.5); o2.stop(t + 1.5)
}

function padChord(ac: AudioContext, notes: number[], t: number, dur: number, vol: number) {
  for (const n of notes) {
    const o = ac.createOscillator()
    o.type = 'sine'; o.frequency.value = m2f(n)
    const g = ac.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.3)
    g.gain.setValueAtTime(vol, t + dur * 0.7)
    g.gain.linearRampToValueAtTime(0.0001, t + dur)
    o.connect(g); g.connect(master!)
    o.start(t); o.stop(t + dur + 0.05)
  }
}

function bassNote(ac: AudioContext, n: number, t: number, dur: number, vol: number) {
  const o = ac.createOscillator()
  o.type = 'sine'; o.frequency.value = m2f(n)
  const g = ac.createGain()
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g); g.connect(master!)
  o.start(t); o.stop(t + dur + 0.05)
}

/** Mélodie en marche aléatoire : proche de la note précédente, jamais pareille. */
function nextMelody(scale: number[]): number {
  const jump = Math.random() < 0.2 ? 2 : 1
  const dir = Math.random() < 0.5 ? -1 : 1
  lastMel = Math.max(0, Math.min(scale.length - 1, lastMel + dir * jump))
  return scale[lastMel]
}

function scheduleStep(ac: AudioContext, th: Theme, s: number, t: number, stepDur: number) {
  const spb = th.style === 'waltz' ? 6 : 8
  const bar = Math.floor(s / spb) % th.chords.length
  const sub = s % spb
  const chord = th.chords[bar]
  const barDur = stepDur * spb

  if (th.style === 'box') {
    if (sub === 0) {
      bassNote(ac, th.bass[bar], t, barDur, 0.08)
      padChord(ac, chord, t, barDur, 0.016)
    }
    if (sub % 2 === 0 && Math.random() < 0.55) pluck(ac, m2f(nextMelody(th.scale)), t, 0.075)
    else if (Math.random() < 0.12) pluck(ac, m2f(nextMelody(th.scale)), t, 0.05)
  } else if (th.style === 'oompah') {
    if (sub === 0 || sub === 4) bassNote(ac, th.bass[bar], t, stepDur * 1.8, 0.11)
    if (sub === 2 || sub === 6) chord.forEach(n => pluck(ac, m2f(n + 12), t, 0.035))
    if (sub % 2 === 0 && Math.random() < 0.4) pluck(ac, m2f(nextMelody(th.scale)), t, 0.06)
  } else if (th.style === 'waltz') {
    if (sub === 0) bassNote(ac, th.bass[bar], t, stepDur * 2.4, 0.1)
    if (sub === 2 || sub === 4) chord.forEach(n => pluck(ac, m2f(n + 12), t, 0.028))
    if (Math.random() < 0.42) pluck(ac, m2f(nextMelody(th.scale)), t, 0.06)
  } else { // pad
    if (sub === 0) {
      padChord(ac, chord, t, barDur * 1.05, 0.03)
      bassNote(ac, th.bass[bar], t, barDur, 0.06)
    }
    if (Math.random() < 0.1) pluck(ac, m2f(nextMelody(th.scale)), t, 0.045, true)
  }
}

/** Lance l'ambiance d'un univers (remplace la précédente en douceur). */
export function playMusic(theme: string) {
  const th = THEMES[theme]
  if (!th || current === theme) return
  stopMusic(0.3)
  const ac = getCtx()
  if (!ac) return
  current = theme
  master = null
  ensureMaster(ac)
  lastMel = Math.floor(th.scale.length / 2)
  step = 0
  nextT = ac.currentTime + 0.15
  const stepDur = 60 / th.bpm / 2
  timer = window.setInterval(() => {
    if (!isSoundOn()) return // silencieux mais le temps continue de filer
    const now = ac.currentTime
    if (nextT < now) nextT = now + 0.05
    while (nextT < now + 0.5) {
      scheduleStep(ac, th, step, nextT, stepDur)
      step++
      nextT += stepDur
    }
  }, 200)
}

/** Fondu de sortie puis silence. */
export function stopMusic(fade = 0.7) {
  clearInterval(timer)
  timer = 0
  current = null
  const m = master
  master = null
  if (!m) return
  const ac = getCtx()
  try {
    if (ac) {
      m.gain.setValueAtTime(m.gain.value, ac.currentTime)
      m.gain.linearRampToValueAtTime(0.0001, ac.currentTime + fade)
    }
    setTimeout(() => { try { m.disconnect() } catch { /* rien */ } }, fade * 1000 + 100)
  } catch { /* rien */ }
}
