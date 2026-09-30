import { dotTex, type Stage, type T3 } from './three3d'
import type { Critter, CritterKind, CritterKit } from './critters'

/* 🎪 La scène de la grange — née avec le Chœur (28/09), partagée depuis le
   30/09 avec la Boîte à rythme : un mur de planches rouges aux portes en
   croix, des poutres, des bottes de foin, une guirlande d'ampoules, une
   estrade en bois, et la chorale dessus, chacun sur son coussin de couleur,
   sous son projecteur. Quand un animal chante, son projecteur s'allume, il
   saute et des notes s'envolent. Le jeu garde sa logique ; la scène ne fait
   que jouer ce qu'on lui dit (`sing`, `wrong`, `step`). */

type V3 = import('three').Vector3

export interface Actor {
  c: Critter
  base: V3
  color: number
  cushion: import('three').MeshStandardMaterial
  beam: import('three').MeshBasicMaterial
  pool: import('three').SpriteMaterial
  /** La zone qu'on touche (invisible, plus large que l'animal) ; `userData.i` = son rang. */
  hit: import('three').Mesh
  /** Chante encore (secondes), se trompe (secondes). */
  sing: number
  wrong: number
}

export interface Choir {
  actors: Actor[]
  kit: CritterKit
  bulbs: import('three').MeshStandardMaterial[]
  hemi: import('three').HemisphereLight | null
  notes: { s: import('three').Sprite; v: V3; age: number }[]
  t: number
}

/** ce que la salle doit montrer à cette image */
export interface Mood {
  /** L'écoute : la salle se tamise, les projecteurs éteints parlent seuls. */
  dim?: boolean
  /** La fête (concert final) : la guirlande clignote. */
  party?: boolean
  /** La mesure (0..1, 1 au temps) : la guirlande bat avec la musique. */
  beat?: number
}

/** Des planches verticales : couleur, joints sombres, nœuds. */
export function planks(T: T3, base: string, joint: string, n: number, w = 512, h = 512) {
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

function buildBarn(stage: Stage, bulbs: import('three').MeshStandardMaterial[]) {
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
    bulbs.push(m)
    const b = new T.Mesh(bulbGeo, m)
    b.position.set(x, y, -1.2)
    scene.add(b)
  }
}

/** La grange et sa chorale : un animal par entrée de `pads`, de gauche à droite. */
export function barnChoir(stage: Stage, kit: CritterKit, pads: { animal: CritterKind; color: number }[]): Choir {
  const { T, scene } = stage
  const ch: Choir = {
    actors: [], kit, bulbs: [], notes: [], t: 0,
    hemi: scene.children.find(o => (o as import('three').HemisphereLight).isHemisphereLight) as import('three').HemisphereLight || null
  }
  buildBarn(stage, ch.bulbs)
  const n = pads.length
  // Serrés juste ce qu'il faut : jamais sous les cœurs ni sous la chanson
  const spread = Math.min(1.4, 5.0 / (n - 1))
  const fit = Math.min(1, spread / 1.15)
  const cushionGeo = new T.CylinderGeometry(0.5, 0.56, 0.16, 32)
  const beamGeo = new T.CylinderGeometry(0.28, 0.75, 4.6, 32, 1, true)
  const hitGeo = new T.CylinderGeometry(0.62, 0.62, 1.6, 12)
  const hitMat = new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  const pool = stage.keep(dotTex(T, '#FFF2C0'))
  pads.forEach((p, i) => {
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
    ch.actors.push({ c, base, color: p.color, cushion, beam, pool: poolMat, hit, sing: 0, wrong: 0 })
  })
  stage.keep({ dispose() { cushionGeo.dispose(); beamGeo.dispose(); hitGeo.dispose(); hitMat.dispose() } })
  // Les notes qui s'envolent
  const nt = stage.keep(noteTex(T))
  for (let k = 0; k < 30; k++) {
    const s = new T.Sprite(new T.SpriteMaterial({ map: nt, transparent: true, opacity: 0, depthWrite: false }))
    s.scale.setScalar(0.32)
    scene.add(s)
    ch.notes.push({ s, v: new T.Vector3(), age: -1 })
  }
  return ch
}

/** Des notes s'envolent de l'animal, l'une après l'autre. */
export function emitNotes(ch: Choir, a: Actor, n: number) {
  for (let k = 0; k < n; k++) {
    const p = ch.notes.find(q => q.age < 0)
    if (!p) return
    p.age = -k * 0.12 - 0.001 // décalées : elles partent l'une après l'autre
    p.s.position.set(a.base.x + (Math.random() - 0.5) * 0.3, a.base.y + 1.1, a.base.z + 0.2)
    p.v.set((Math.random() - 0.5) * 0.6, 1.1 + Math.random() * 0.4, 0.1)
  }
}

/** Un animal chante `seconds` secondes : il saute, son projecteur s'allume. */
export function singOn(ch: Choir, i: number, seconds: number, notes = 3) {
  const a = ch.actors[i]
  if (!a) return
  a.sing = Math.max(a.sing, seconds)
  emitNotes(ch, a, notes)
}

/** Une image de la scène. */
export function stepChoir(ch: Choir, dt: number, mood: Mood = {}) {
  ch.t += dt
  if (ch.hemi) ch.hemi.intensity += ((mood.dim ? 0.22 : 0.34) - ch.hemi.intensity) * Math.min(1, dt * 4)
  for (const a of ch.actors) {
    ch.kit.blink(a.c, dt)
    let y = 0, sx = 1, sy = 1, rz = 0
    if (a.sing > 0) {
      a.sing = Math.max(0, a.sing - dt)
      const k = ch.t * 9
      y = Math.abs(Math.sin(k)) * 0.22
      sy = 1 + Math.sin(k * 2) * 0.06; sx = 1 - Math.sin(k * 2) * 0.04
    }
    if (a.wrong > 0) {
      a.wrong = Math.max(0, a.wrong - dt)
      rz = Math.sin(ch.t * 40) * 0.18 * (a.wrong / 0.6)
    }
    a.c.obj.position.y = 0.52 + y
    a.c.obj.scale.set(sx, sy, sx)
    a.c.obj.rotation.z = rz
    const on = a.sing > 0 ? 1 : 0
    a.beam.opacity += ((on ? 0.34 : mood.dim ? 0.03 : 0.08) - a.beam.opacity) * Math.min(1, dt * 12)
    a.pool.opacity += ((on ? 0.8 : 0.15) - a.pool.opacity) * Math.min(1, dt * 12)
    a.cushion.emissiveIntensity += ((a.wrong > 0 ? 0.9 : on ? 0.45 : 0) - a.cushion.emissiveIntensity) * Math.min(1, dt * 12)
    a.cushion.emissive.setHex(a.wrong > 0 ? 0xFF3030 : a.color)
  }
  // La guirlande : elle scintille, clignote pendant la fête, bat la mesure
  const beat = mood.beat ?? 0
  ch.bulbs.forEach((b, i) => {
    b.emissiveIntensity = mood.party
      ? (Math.sin(ch.t * 10 + i) > 0 ? 2.2 : 0.4)
      : 1.1 + Math.sin(ch.t * 2 + i * 1.7) * 0.25 + beat * 1.1
  })
  for (const p of ch.notes) {
    if (p.age === -1) continue
    p.age += dt
    const m = p.s.material as import('three').SpriteMaterial
    if (p.age < 0) { m.opacity = 0; continue }
    p.s.position.addScaledVector(p.v, dt)
    p.s.position.x += Math.sin(p.age * 6) * dt * 0.3
    m.opacity = p.age > 1.2 ? 0 : Math.min(1, p.age * 8) * (1 - p.age / 1.2)
    if (p.age > 1.2) p.age = -1
  }
}
