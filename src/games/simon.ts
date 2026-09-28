import type { GameContext, GameDef } from '../core/types'
import { $, rnd } from '../core/utils'
import { tone } from '../core/audio'
import { sfx, preloadSfx, cry, preloadCries, CRY } from '../core/sfx'
import { ICON, heartsHTML } from '../core/icons'
import { createStage, loader, picker, dotTex, type Stage, type T3 } from '../core/three3d'
import { particles, type Particles } from '../core/scene3d'
import { critterKit, type Critter, type CritterKind, type CritterKit } from '../core/critters'

/* 🎵 Le Chœur de la ferme — l'ancien Simon, refait le 25/09, SUR SCÈNE depuis
   le 28/09 : une vraie grange en 3D (mur de planches rouges, poutres, bottes
   de foin, guirlande d'ampoules), une estrade en bois, et la chorale debout
   dessus, chacun sur son coussin, sous son projecteur. Le coq, le cheval et
   le chat, qui avaient déjà leur voix, ont enfin leur personnage.

   Les animaux chantent une mélodie, on la rejoue en les touchant. Chacun a
   SA VRAIE VOIX (des cris enregistrés, choisis à l'oreille par le père,
   `cry()` de core/sfx.ts) : quand il chante, son projecteur s'allume, il
   saute et des notes s'envolent.

   - Un enjeu visible : la mélodie à atteindre est une rangée de notes sur le
     côté (8, 10 ou 12 selon le niveau), qui se remplit tour après tour ;
   - la chorale grandit avec le niveau : 4 animaux en douce, 5 en normal
     (le chat), 6 en expert (le cheval) ;
   - une fausse note n'arrête pas tout : elle coûte un cœur (3, 2 ou 1), le
     bon animal chante, et la MÊME mélodie revient ; le « presque » (raté sur
     la dernière note) se voit ;
   - la fin est un CONCERT : toute la mélodie retenue rejouée d'un trait par
     la ferme, puis tout le monde chante ensemble, la guirlande clignote ;
   - la vitesse monte à chaque tour, jamais au point de couper les voix. */

const NOTES = [392, 523, 659, 784, 880, 988]
const ALL: { animal: CritterKind; color: number }[] = [
  { animal: 'rooster', color: 0xC9544A },
  { animal: 'cow', color: 0x4E9A55 },
  { animal: 'pig', color: 0x3F86BE },
  { animal: 'dog', color: 0xC99A2E },
  { animal: 'cat', color: 0x8A6CC8 },
  { animal: 'horse', color: 0xC8648E }
]

interface Actor {
  c: Critter
  base: import('three').Vector3
  cushion: import('three').MeshStandardMaterial
  beam: import('three').MeshBasicMaterial
  pool: import('three').SpriteMaterial
  hit: import('three').Mesh
  /** Chante encore (secondes), se trompe (secondes). */
  sing: number
  wrong: number
}

interface State {
  pads: typeof ALL
  seq: number[]
  step: number
  playerTurn: boolean
  best: number
  playSpeed: number
  lives: number
  maxLives: number
  goal: number
  over: boolean
  stage: Stage | null
  actors: Actor[]
  kit: CritterKit | null
  fx: Particles | null
  notes: { s: import('three').Sprite; v: import('three').Vector3; age: number }[]
  bulbs: import('three').MeshStandardMaterial[]
  hemi: import('three').HemisphereLight | null
  listening: boolean
  concert: boolean
  t: number
}

let simon: State | null = null
let ctx: GameContext

function setPhase(me: State, listening: boolean) {
  me.listening = listening
  $('simonPhase').innerHTML = listening ? ICON.sound : ICON.tap
  $('simonPhase').classList.toggle('listen', listening)
}

/** Un animal chante : son projecteur s'allume, il saute, sa vraie voix. */
function sing(me: State, i: number, dur: number) {
  const a = me.actors[i]
  if (a) {
    a.sing = Math.max(0.3, dur / 1000 * 0.85)
    emitNotes(me, a, 3)
  }
  const voice = CRY[me.pads[i].animal]
  // Secours tant que la voix n'est pas décodée : l'ancienne note
  if (!voice || !cry(voice, { max: Math.max(0.35, dur / 1000 * 0.95), solo: true, vol: 0.95 })) {
    tone(NOTES[i], (dur / 1000) * 0.9, 'triangle', 0.18)
  }
}

function emitNotes(me: State, a: Actor, n: number) {
  for (let k = 0; k < n; k++) {
    const p = me.notes.find(q => q.age < 0)
    if (!p) return
    p.age = -k * 0.12 - 0.001 // décalées : elles partent l'une après l'autre
    p.s.position.set(a.base.x + (Math.random() - 0.5) * 0.3, a.base.y + 1.1, a.base.z + 0.2)
    p.v.set((Math.random() - 0.5) * 0.6, 1.1 + Math.random() * 0.4, 0.1)
  }
}

function paintSide(me: State) {
  $('simonLives').innerHTML = heartsHTML(me.lives, me.maxLives)
  $('simonGoal').innerHTML = Array.from({ length: me.goal }, (_, k) =>
    `<i class="${k < me.best ? 'on' : k === me.best ? 'next' : ''}">${ICON.sound}</i>`).join('')
}

function playSequence(me: State) {
  if (simon !== me || me.over) return
  me.playerTurn = false
  setPhase(me, true)
  me.seq.forEach((v, i) => ctx.after(400 + i * me.playSpeed, () => { if (simon === me && !me.over) sing(me, v, me.playSpeed) }))
  ctx.after(400 + me.seq.length * me.playSpeed + 250, () => {
    if (simon !== me || me.over) return
    me.playerTurn = true; me.step = 0
    setPhase(me, false)
  })
}

function press(me: State, i: number) {
  if (simon !== me || me.over || !me.playerTurn) return
  sing(me, i, 420)
  if (i === me.seq[me.step]) {
    me.step++
    if (me.step === me.seq.length) {
      me.playerTurn = false
      me.best = me.seq.length
      paintSide(me)
      sfx('confirm', { vol: 0.6, rate: 1 + Math.min(10, me.best) * 0.04 })
      for (const a of me.actors) me.fx?.burst({ x: a.base.x, y: a.base.y + 1, z: a.base.z }, { count: 8, color: [0xFFD34D, 0xFFFFFF, 0xFF9E7A], speed: 1.6, life: 0.7, size: 0.07, gravity: 2 })
      if (me.best >= me.goal) { ctx.after(600, () => concert(me, true)); return }
      me.seq.push(rnd(0, me.pads.length - 1))
      // Plus vite à chaque tour, jamais au point de couper les voix
      me.playSpeed = Math.max(ctx.byTier(560, 480, 420), me.playSpeed * 0.95)
      ctx.after(800, () => playSequence(me))
    }
    return
  }
  // Fausse note : l'animal touché se trémousse, le bon chante, un cœur s'en va
  me.playerTurn = false
  const almost = me.step === me.seq.length - 1 && me.seq.length > 1
  const a = me.actors[i]
  if (a) a.wrong = 0.6
  sfx('error', { vol: 0.5 })
  me.lives--
  paintSide(me)
  $('simonLives').classList.remove('lost'); void $('simonLives').offsetWidth; $('simonLives').classList.add('lost')
  // Le « presque » : raté sur la toute dernière note, ça se voit
  if (almost) flash(ICON.bolt)
  ctx.after(450, () => { if (simon === me) sing(me, me.seq[me.step], 700) })
  ctx.after(1400, () => {
    if (simon !== me) return
    if (me.lives <= 0) { concert(me, false); return }
    // La MÊME mélodie revient : on la réécoute et on réessaie
    playSequence(me)
  })
}

function flash(html: string) {
  const el = $('simonFlash')
  el.innerHTML = html
  el.classList.remove('go'); void el.offsetWidth; el.classList.add('go')
}

/** Le concert : la mélodie retenue rejouée d'un trait par la ferme, puis
    toute la chorale chante ensemble. Puis l'écran de fin. */
function concert(me: State, won: boolean) {
  if (me.over) return
  me.over = true
  me.playerTurn = false
  setPhase(me, true)
  me.concert = true
  const melody = me.seq.slice(0, Math.max(1, me.best))
  const beat = 300
  melody.forEach((v, k) => ctx.after(300 + k * beat, () => { if (simon === me) sing(me, v, beat) }))
  const tutti = 300 + melody.length * beat + 250
  ctx.after(tutti, () => {
    if (simon !== me) return
    me.actors.forEach((a, k) => {
      a.sing = 1
      emitNotes(me, a, 4)
      const voice = CRY[me.pads[k].animal]
      if (voice) cry(voice, { max: 1.2, vol: 0.7, delay: k * 0.04 })
      me.fx?.burst({ x: a.base.x, y: a.base.y + 1.2, z: a.base.z }, { count: won ? 22 : 8, color: [0xFFD34D, 0xFF7AA8, 0x7FD3FF, 0xFFFFFF], speed: 2.6, life: 1, size: 0.08, gravity: 2.5 })
    })
    if (won) sfx('confirm', { vol: 0.7, rate: 1.2 })
  })
  ctx.after(tutti + 1300, () => finish(me, won))
}

function finish(me: State, won: boolean) {
  const best = me.best
  const two = ctx.byTier(5, 6, 8)
  const stars = won ? 3 : best >= two ? 2 : 1
  ctx.finish({
    title: won ? 'Quel concert !' : best >= two ? 'Belle mélodie !' : 'Encore un petit air ?',
    msg: `Tu as retenu ${best} note${best > 1 ? 's' : ''}`,
    stars,
    score: best,
    scoreIcon: ICON.sound
  })
}

/* ---------- La grange ---------- */
/** Des planches verticales : couleur, joints sombres, nœuds. */
function planks(T: T3, base: string, joint: string, n: number, w = 512, h = 512) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const g = c.getContext('2d')!
  const pw = w / n
  for (let i = 0; i < n; i++) {
    const l = 0.85 + ((i * 37) % 11) / 55
    g.fillStyle = base; g.globalAlpha = 1; g.fillRect(i * pw, 0, pw, h)
    g.fillStyle = `rgba(0,0,0,${(1 - l) * 1.4})`; g.fillRect(i * pw, 0, pw, h)
    g.strokeStyle = 'rgba(255,255,255,.06)'
    for (let k = 0; k < 6; k++) { g.beginPath(); const x = i * pw + Math.random() * pw; g.moveTo(x, 0); g.lineTo(x + (Math.random() - 0.5) * 8, h); g.stroke() }
    g.fillStyle = joint; g.fillRect(i * pw, 0, 3, h)
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(i * pw + pw * 0.5, Math.random() * h, 4, 7, 0, 0, Math.PI * 2); g.fill()
  }
  const t = new T.CanvasTexture(c)
  t.colorSpace = T.SRGBColorSpace
  t.wrapS = t.wrapT = T.RepeatWrapping
  return t
}

function hayTex(T: T3) {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#B98E3A'; g.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 900; i++) {
    g.strokeStyle = ['#D9B25A', '#9C7428', '#E6C877', '#A8802F'][i % 4]
    g.lineWidth = 1 + Math.random()
    const x = Math.random() * 256, y = Math.random() * 256, a = (Math.random() - 0.5) * 0.6
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 26, y + Math.sin(a) * 26); g.stroke()
  }
  // La ficelle
  g.fillStyle = '#6B4A22'; g.fillRect(0, 70, 256, 5); g.fillRect(0, 180, 256, 5)
  const t = new T.CanvasTexture(c)
  t.colorSpace = T.SRGBColorSpace
  return t
}

/** Une note de musique (croche), dessinée, pour s'envoler des chanteurs. */
function noteTex(T: T3) {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = '#FFE08A'; g.strokeStyle = '#FFE08A'; g.lineWidth = 5
  g.beginPath(); g.ellipse(24, 48, 11, 8, -0.4, 0, Math.PI * 2); g.fill()
  g.beginPath(); g.moveTo(34, 46); g.lineTo(34, 10); g.stroke()
  g.beginPath(); g.moveTo(34, 10); g.quadraticCurveTo(50, 16, 48, 30); g.stroke()
  const t = new T.CanvasTexture(c)
  t.colorSpace = T.SRGBColorSpace
  return t
}

function buildBarn(me: State, stage: Stage) {
  const { T, scene } = stage
  const keep = <X extends { dispose(): void }>(x: X) => stage.keep(x)
  // Le mur du fond : planches rouges de grange, et la grande porte ouverte sur la nuit
  const red = keep(planks(T, '#7A231C', '#3A100C', 14))
  red.repeat.set(2, 1)
  const wall = new T.Mesh(new T.PlaneGeometry(18, 8), new T.MeshStandardMaterial({ map: red, roughness: 0.9 }))
  wall.position.set(0, 3.2, -3.4)
  wall.receiveShadow = true
  scene.add(wall)
  const sideMat = new T.MeshStandardMaterial({ map: red, roughness: 0.9, color: 0xB0B0B0 })
  for (const s of [-1, 1]) {
    const side = new T.Mesh(new T.PlaneGeometry(10, 8), sideMat)
    side.position.set(s * 7.2, 3.2, 1.4)
    side.rotation.y = -s * Math.PI / 2
    scene.add(side)
  }
  // Les poutres
  const beamMat = new T.MeshStandardMaterial({ color: 0x3B2415, roughness: 0.85 })
  const beamGeo = new T.BoxGeometry(1, 1, 1)
  const beam = (x: number, y: number, z: number, sx: number, sy: number, sz: number, rz = 0) => {
    const m = new T.Mesh(beamGeo, beamMat)
    m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.z = rz
    m.castShadow = true
    scene.add(m)
  }
  beam(0, 5.3, -3.2, 18, 0.35, 0.35)
  for (const x of [-4.8, 4.8]) beam(x, 2.6, -3.2, 0.35, 5.2, 0.35)
  beam(-2.5, 4.4, -3.15, 0.3, 2.6, 0.2, 0.9); beam(2.5, 4.4, -3.15, 0.3, 2.6, 0.2, -0.9)
  // La porte blanche en croix (les montants de grange), de part et d'autre
  const trim = new T.MeshStandardMaterial({ color: 0xC9C0B0, roughness: 0.8 })
  for (const s of [-1, 1]) {
    const x0 = s * 3.1
    const bars: [number, number, number, number][] = [[x0, 2.0, 2.3, 0.12], [x0, 0.4, 2.3, 0.12], [x0, 3.6, 2.3, 0.12], [x0 - 1.1, 2, 0.12, 3.3], [x0 + 1.1, 2, 0.12, 3.3]]
    for (const [x, y, w, h] of bars) { const m = new T.Mesh(beamGeo, trim); m.position.set(x, y, -3.35); m.scale.set(w, h, 0.05); scene.add(m) }
    for (const r of [0.95, -0.95]) { const m = new T.Mesh(beamGeo, trim); m.position.set(x0, 2, -3.35); m.scale.set(0.12, 3.9, 0.05); m.rotation.z = r; scene.add(m) }
  }
  // Le sol de la grange (terre battue et paille) et l'estrade en bois
  const floor = new T.Mesh(new T.PlaneGeometry(40, 20), new T.MeshStandardMaterial({ color: 0x5B4128, roughness: 1 }))
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)
  const wood = keep(planks(T, '#8A5A30', '#4A2E16', 10))
  wood.repeat.set(3, 1)
  wood.rotation = Math.PI / 2
  const top = new T.MeshStandardMaterial({ map: wood, roughness: 0.75 })
  const skirt = new T.MeshStandardMaterial({ color: 0x5E3A1E, roughness: 0.85 })
  const stageBox = new T.Mesh(new T.BoxGeometry(10, 0.36, 3.6), [skirt, skirt, top, skirt, skirt, skirt])
  stageBox.position.set(0, 0.18, -0.9)
  stageBox.receiveShadow = true; stageBox.castShadow = true
  scene.add(stageBox)
  // Les bottes de foin, empilées aux deux bouts
  const hay = keep(hayTex(T))
  const hayMat = new T.MeshStandardMaterial({ map: hay, roughness: 1 })
  const bale = (x: number, y: number, z: number, ry: number) => {
    const m = new T.Mesh(new T.BoxGeometry(1.1, 0.55, 0.7), hayMat)
    m.position.set(x, y, z); m.rotation.y = ry
    m.castShadow = true; m.receiveShadow = true
    scene.add(m)
  }
  for (const s of [-1, 1]) {
    bale(s * 5.8, 0.28, -1.6, 0.2 * s); bale(s * 5.9, 0.83, -1.7, -0.1 * s); bale(s * 6.4, 0.28, -0.6, 1.3)
    bale(s * 5.6, 0.28, -2.6, 0.05)
  }
  // La guirlande d'ampoules, en arc au-dessus de la scène
  const bulbGeo = new T.SphereGeometry(0.07, 10, 8)
  const bulbColors = [0xFFD27A, 0xFF9E7A, 0xA8E0FF, 0xFFE9A8, 0xC8A8FF]
  for (let i = 0; i <= 24; i++) {
    const u = i / 24
    const x = -5.6 + u * 11.2
    const y = 4.3 - Math.sin(u * Math.PI) * 0.9 - Math.abs(Math.sin(u * Math.PI * 3)) * 0.2
    const m = new T.MeshStandardMaterial({ color: bulbColors[i % 5], emissive: bulbColors[i % 5], emissiveIntensity: 1.3, roughness: 0.3 })
    me.bulbs.push(m)
    const b = new T.Mesh(bulbGeo, m)
    b.position.set(x, y, -1.2)
    scene.add(b)
  }
}

function buildChoir(me: State, stage: Stage) {
  const { T, scene } = stage
  const n = me.pads.length
  const kit = me.kit!
  // Serrés juste ce qu'il faut : jamais sous les cœurs ni sous la chanson
  const spread = Math.min(1.4, 5.0 / (n - 1))
  const fit = Math.min(1, spread / 1.15)
  const cushionGeo = new T.CylinderGeometry(0.5, 0.56, 0.16, 32)
  const beamGeo = new T.CylinderGeometry(0.28, 0.75, 4.6, 32, 1, true)
  const hitGeo = new T.CylinderGeometry(0.62, 0.62, 1.6, 12)
  const hitMat = new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  const pool = stage.keep(dotTex(T, '#FFF2C0'))
  me.pads.forEach((p, i) => {
    const x = (i - (n - 1) / 2) * spread
    const z = -0.7 - Math.cos(((i - (n - 1) / 2) / Math.max(1, n - 1)) * Math.PI) * 0.35
    const base = new T.Vector3(x, 0.44, z)
    const cushion = new T.MeshStandardMaterial({ color: p.color, roughness: 0.55, emissive: p.color, emissiveIntensity: 0 })
    const cm = new T.Mesh(cushionGeo, cushion)
    cm.position.set(x, 0.44, z)
    cm.scale.set(fit, 1, fit)
    cm.castShadow = true; cm.receiveShadow = true
    scene.add(cm)
    const c = kit.make(p.animal, (p.animal === 'horse' ? 1.05 : 0.95) * fit)
    c.obj.position.copy(base).setY(0.52)
    c.obj.rotation.y = -x * 0.08
    c.obj.traverse(o => { o.castShadow = true })
    scene.add(c.obj)
    // Le projecteur : un cône de lumière qui tombe sur lui, et une flaque au sol
    const beam = new T.MeshBasicMaterial({ color: 0xFFE9B0, transparent: true, opacity: 0.05, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide })
    const bm = new T.Mesh(beamGeo, beam)
    bm.position.set(x, 2.8, z)
    scene.add(bm)
    const poolMat = new T.SpriteMaterial({ map: pool, color: 0xFFF2C0, transparent: true, opacity: 0.15, depthWrite: false, blending: T.AdditiveBlending })
    const ps = new T.Sprite(poolMat)
    ps.position.set(x, 0.56, z + 0.1)
    ps.scale.set(1.5, 0.6, 1)
    scene.add(ps)
    // La zone qu'on touche : plus large que lui, invisible
    const hit = new T.Mesh(hitGeo, hitMat)
    hit.position.set(x, 1.2, z)
    hit.userData.i = i
    scene.add(hit)
    me.actors.push({ c, base, cushion, beam, pool: poolMat, hit, sing: 0, wrong: 0 })
  })
  stage.keep({ dispose() { cushionGeo.dispose(); beamGeo.dispose(); hitGeo.dispose(); hitMat.dispose() } })
  // Les notes qui s'envolent
  const nt = stage.keep(noteTex(T))
  for (let k = 0; k < 30; k++) {
    const s = new T.Sprite(new T.SpriteMaterial({ map: nt, transparent: true, opacity: 0, depthWrite: false }))
    s.scale.setScalar(0.32)
    scene.add(s)
    me.notes.push({ s, v: new T.Vector3(), age: -1 })
  }
}

function step(me: State, dt: number) {
  me.t += dt
  // L'écoute : la salle se tamise un peu, les projecteurs parlent
  if (me.hemi) me.hemi.intensity += ((me.listening && !me.concert ? 0.22 : 0.34) - me.hemi.intensity) * Math.min(1, dt * 4)
  for (const a of me.actors) {
    me.kit!.blink(a.c, dt)
    let y = 0, sx = 1, sy = 1, rz = 0
    if (a.sing > 0) {
      a.sing = Math.max(0, a.sing - dt)
      const k = me.t * 9
      y = Math.abs(Math.sin(k)) * 0.22
      sy = 1 + Math.sin(k * 2) * 0.06; sx = 1 - Math.sin(k * 2) * 0.04
    }
    if (a.wrong > 0) {
      a.wrong = Math.max(0, a.wrong - dt)
      rz = Math.sin(me.t * 40) * 0.18 * (a.wrong / 0.6)
    }
    a.c.obj.position.y = 0.52 + y
    a.c.obj.scale.set(sx, sy, sx)
    a.c.obj.rotation.z = rz
    const on = a.sing > 0 ? 1 : 0
    a.beam.opacity += ((on ? 0.34 : me.listening ? 0.03 : 0.08) - a.beam.opacity) * Math.min(1, dt * 12)
    a.pool.opacity += ((on ? 0.8 : 0.15) - a.pool.opacity) * Math.min(1, dt * 12)
    a.cushion.emissiveIntensity += ((a.wrong > 0 ? 0.9 : on ? 0.45 : 0) - a.cushion.emissiveIntensity) * Math.min(1, dt * 12)
    if (a.wrong > 0) a.cushion.emissive.setHex(0xFF3030)
    else a.cushion.emissive.setHex(me.pads[me.actors.indexOf(a)].color)
  }
  // La guirlande : elle scintille, et clignote pendant le concert
  me.bulbs.forEach((b, i) => {
    b.emissiveIntensity = me.concert ? (Math.sin(me.t * 10 + i) > 0 ? 2.2 : 0.4) : 1.1 + Math.sin(me.t * 2 + i * 1.7) * 0.25
  })
  for (const p of me.notes) {
    if (p.age === -1) continue
    p.age += dt
    const m = p.s.material as import('three').SpriteMaterial
    if (p.age < 0) { m.opacity = 0; continue }
    p.s.position.addScaledVector(p.v, dt)
    p.s.position.x += Math.sin(p.age * 6) * dt * 0.3
    m.opacity = p.age > 1.2 ? 0 : Math.min(1, p.age * 8) * (1 - p.age / 1.2)
    if (p.age > 1.2) p.age = -1
  }
  me.fx?.update(dt)
}

export const simonGame: GameDef = {
  id: 'simon', name: 'Le Chœur', icon: '🎵', sq: 'sq-sky', cat: 'memoire',
  subtitle: 'Répète la chanson des animaux de la ferme',
  mount(c) {
    ctx = c
    const pads = ALL.slice(0, c.byTier(4, 5, 6))
    c.root.innerHTML = `
      <div class="arena sm-wrap" id="simonArena">
        <div class="sm-scene" id="simonScene"></div>
        <div class="sm-phase listen" id="simonPhase">${ICON.sound}</div>
        <div class="hud-flash near" id="simonFlash"></div>
        <div class="tq-side sm-side">
          <div class="sm-lives" id="simonLives"></div>
          <div class="sm-goal" id="simonGoal"></div>
        </div>
      </div>`
    preloadSfx(['confirm', 'error'])
    preloadCries(pads.map(p => CRY[p.animal]!).filter(Boolean))
    const lives = c.byTier(3, 2, 1)
    const me: State = {
      pads, seq: [], step: 0, playerTurn: false, best: 0, playSpeed: c.byTier(760, 640, 560),
      lives, maxLives: lives, goal: c.byTier(8, 10, 12), over: false,
      stage: null, actors: [], kit: null, fx: null, notes: [], bulbs: [], hemi: null, listening: true, concert: false, t: 0
    }
    simon = me
    for (let i = 0; i < c.byTier(1, 2, 3); i++) me.seq.push(rnd(0, pads.length - 1))
    paintSide(me)

    // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
    if ((window as unknown as { __BOT?: boolean }).__BOT) {
      ;(window as unknown as { __simon: unknown }).__simon = {
        get seq() { return [...me.seq] }, get playerTurn() { return me.playerTurn }, get best() { return me.best },
        get over() { return me.over }, get lives() { return me.lives }, get goal() { return me.goal }, get pads() { return me.pads.length },
        get step() { return me.step },
        press: (i: number) => press(me, i),
        /** Où toucher l'animal n° i à l'écran (pour un vrai toucher). */
        screen(i: number) {
          const st = me.stage, a = me.actors[i]
          if (!st || !a) return null
          const v = a.base.clone().setY(0.95).project(st.camera)
          const r = st.renderer.domElement.getBoundingClientRect()
          return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }
        }
      }
    }

    const holder = $('simonScene')
    const hideLoader = loader(holder, 'simon')
    ;(async () => {
      const stage = await createStage(holder, {
        sky: '#1E1410', fog: [12, 26], fogColor: '#2A1C14', fov: 36,
        cam: [0, 1.8, 6.1], target: [0, 1.3, -0.8],
        hemi: ['#FFE2B8', '#3A2416', 1.05],
        sun: { pos: [2.5, 7.5, 5], color: '#FFE3B0', intensity: 1.7, area: 7, far: 25 },
        fill: 0.55, exposure: 1.08
      })
      if (simon !== me) { stage.dispose(); return }
      me.stage = stage
      me.kit = critterKit(stage.T)
      stage.keep({ dispose: () => me.kit?.dispose() })
      me.fx = particles(stage, 400)
      me.hemi = stage.scene.children.find(o => (o as import('three').HemisphereLight).isHemisphereLight) as import('three').HemisphereLight || null
      buildBarn(me, stage)
      buildChoir(me, stage)
      // On touche un animal pour qu'il chante
      const pick = picker(stage)
      stage.renderer.domElement.addEventListener('pointerdown', e => {
        const hits = pick(e, me.actors.map(a => a.hit), false)
        if (hits.length) press(me, hits[0].object.userData.i as number)
      })
      hideLoader()
      stage.start(dt => { if (simon === me) step(me, dt) })
      ctx.after(700, () => playSequence(me))
    })().catch(err => { hideLoader(); if (simon === me) throw err })
    return () => {
      if (simon === me) simon = null
      me.over = true
      me.stage?.dispose()
      me.stage = null
    }
  }
}
