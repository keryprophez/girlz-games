/* @version 2026-11-26 17:23 */
/* LES DEUX BOÎTES AUX LETTRES du Courrier, dans la ferme (`buildFarm` vide et
   quelques pièces) : celle de Jade (verte), celle de Joyce (lilas), leur
   prénom peint sur la porte. Le drapeau rouge se lève quand une lettre fermée
   attend ; la porte s'ouvre en basculant vers l'avant (entrouverte : il n'y
   reste que des lettres déjà ouvertes). Le poussin, le chat et le canard
   tiennent compagnie. Tout est en formes rondes, comme les animaux. Sans
   réseau (le coffre en ligne), un nuage barré flotte au-dessus de chaque
   boîte, à la place du drapeau. */
import { createStage, woodTex, type Stage, type T3 } from './three3d'
import { buildFarm } from './farm3d'
import { critterKit, type Critter } from './critters'
import { particles, toScreen } from './scene3d'
import { WHO, whoOf, type Who } from './mine'

type Group = import('three').Group
export type Vue = 'duo' | Who

interface Boite { g: Group; porte: Group; drapeau: Group; lettre: import('three').Mesh; nuage: import('three').Sprite; pOpen: number; pTo: number; fUp: number; fTo: number; jig: number }
const X: Record<Who, number> = { jade: -0.92, joyce: 0.92 }
const Z = 1.55

/** Le nuage barré (viewBox 48 × 48), le même sur la scène et dans les Souvenirs. */
export const NUAGE_D = 'M14 36h22a8 8 0 0 0 1-16 11 11 0 0 0-21-3 9 9 0 0 0-2 19z'
export const BARRE_D = 'M9 9l30 30'
function nuageTex(T: T3) {
  const cv = document.createElement('canvas')
  cv.width = cv.height = 256
  const g = cv.getContext('2d')!
  g.scale(256 / 48, 256 / 48)
  g.lineCap = 'round'
  g.fillStyle = '#fff'; g.strokeStyle = '#9FB3C8'; g.lineWidth = 2.5
  const n = new Path2D(NUAGE_D), b = new Path2D(BARRE_D)
  g.fill(n); g.stroke(n)
  g.strokeStyle = '#fff'; g.lineWidth = 9; g.stroke(b)
  g.strokeStyle = '#E8574C'; g.lineWidth = 5; g.stroke(b)
  const tx = new T.CanvasTexture(cv)
  tx.colorSpace = T.SRGBColorSpace
  return tx
}

/** Une boîte : le corps arrondi, la porte devant, le drapeau rouge, le poteau de bois. */
function faire(T: T3, stage: Stage, w: Who): Boite {
  const g = new T.Group()
  // Plus sombre et plus vive : l'ACES délave un matériau clair (PIEGES.md)
  const base = new T.Color(w === 'jade' ? '#2C8A4A' : '#8A70D6')
  const vif = (k: number) => base.clone().multiplyScalar(k)
  const corps = new T.MeshPhysicalMaterial({ color: vif(1), roughness: 0.36, clearcoat: 0.5, clearcoatRoughness: 0.35 })
  const fonce = new T.MeshStandardMaterial({ color: vif(0.6), roughness: 0.5 })
  const bois = new T.MeshStandardMaterial({ map: stage.keep(woodTex(T, '#8A5F38')), roughness: 0.85 })
  const rouge = new T.MeshPhysicalMaterial({ color: 0xB9201F, roughness: 0.35, clearcoat: 0.5 })
  const or = new T.MeshStandardMaterial({ color: 0xB98A2A, roughness: 0.3, metalness: 0.7 })
  const sombre = new T.MeshStandardMaterial({ color: 0x17120F, roughness: 1 })
  const arche = (r: number, h: number) => { const s = new T.Shape(); s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, h); s.absarc(0, h, r, 0, Math.PI, false); s.lineTo(-r, 0); return s }
  const mesh = (geo: import('three').BufferGeometry, m: import('three').Material, cast = true) => { const x = new T.Mesh(geo, m); x.castShadow = cast; x.receiveShadow = true; return x }
  // Le corps : un tunnel (la coque, percée), le fond sombre
  const R = 0.26, HH = 0.26, L = 0.86
  const out = arche(R, HH), hole = arche(R - 0.03, HH - 0.0)
  const pts = hole.getPoints(24).map(p => new T.Vector2(p.x, Math.max(0.03, p.y)))
  out.holes.push(new T.Path(pts.reverse()))
  const coque = mesh(new T.ExtrudeGeometry(out, { depth: L, bevelEnabled: true, bevelSize: 0.014, bevelThickness: 0.014, bevelSegments: 4, curveSegments: 32 }), corps)
  coque.position.set(0, 0, -L)
  const fond = mesh(new T.ShapeGeometry(arche(R, HH), 24), sombre, false)
  fond.position.z = -L + 0.02
  const dos = mesh(new T.ExtrudeGeometry(arche(R, HH), { depth: 0.02, bevelEnabled: true, bevelSize: 0.014, bevelThickness: 0.01, bevelSegments: 3, curveSegments: 32 }), fonce)
  dos.position.z = -L - 0.03
  g.add(coque, fond, dos)
  // La porte, qui bascule vers l'avant
  const porte = new T.Group()
  const battant = mesh(new T.ExtrudeGeometry(arche(R + 0.012, HH), { depth: 0.025, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 4, curveSegments: 32 }), corps)
  const bouton = mesh(new T.SphereGeometry(0.034, 20, 14), or)
  bouton.position.set(0, HH + R * 0.62, 0.065)
  porte.add(battant, bouton)
  // Son prénom, peint sur la porte
  const cv = document.createElement('canvas')
  cv.width = 256; cv.height = 128
  const k = cv.getContext('2d')!
  k.fillStyle = '#FFFDF6'; k.beginPath(); k.roundRect(6, 16, 244, 96, 40); k.fill()
  k.fillStyle = '#45362A'; k.font = "800 66px 'Baloo 2',system-ui,sans-serif"; k.textAlign = 'center'; k.textBaseline = 'middle'
  k.fillText(whoOf(w).name, 128, 68)
  const tx = stage.keep(new T.CanvasTexture(cv))
  tx.colorSpace = T.SRGBColorSpace; tx.anisotropy = 4
  const nom = new T.Mesh(new T.PlaneGeometry(0.36, 0.18), new T.MeshStandardMaterial({ map: tx, transparent: true, roughness: 0.6, color: 0xD8D2C6 }))
  nom.position.set(0, 0.2, 0.042)
  porte.add(nom)
  porte.position.set(0, 0.0, 0.018)
  g.add(porte)
  // L'enveloppe qui dépasse
  const lettre = mesh(new T.BoxGeometry(0.34, 0.025, 0.5), new T.MeshStandardMaterial({ color: 0xE9DCC2, roughness: 0.8 }))
  lettre.position.set(0.01, 0.07, -0.2); lettre.rotation.z = 0.04
  lettre.visible = false
  g.add(lettre)
  // Le drapeau
  const drapeau = new T.Group()
  const bras = mesh(new T.BoxGeometry(0.035, 0.44, 0.05), rouge)
  bras.position.y = 0.2
  const pan = mesh(new T.BoxGeometry(0.27, 0.19, 0.03), rouge)
  pan.position.set((w === 'jade' ? 1 : -1) * 0.12, 0.34, 0)
  const axe = mesh(new T.CylinderGeometry(0.035, 0.035, 0.03, 20), or)
  axe.rotation.z = Math.PI / 2
  drapeau.add(bras, pan, axe)
  drapeau.position.set((w === 'jade' ? 1 : -1) * (R + 0.05), 0.24, -0.16)
  g.add(drapeau)
  // Le nuage barré : pas de réseau, la boîte ne s'ouvre pas
  // Par-dessus tout, comme un badge : la boîte ne le cache jamais
  const nuage = new T.Sprite(new T.SpriteMaterial({ map: stage.keep(nuageTex(T)), transparent: true, depthWrite: false, depthTest: false }))
  nuage.renderOrder = 10
  nuage.scale.set(0.36, 0.36, 1)
  nuage.position.set((w === 'jade' ? 1 : -1) * (R + 0.05), 0.56, -0.16)
  nuage.visible = false
  g.add(nuage)
  // Le poteau
  const pot = mesh(new T.BoxGeometry(0.15, 0.92, 0.15), bois)
  pot.position.set(0, -0.48, -0.42)
  const plat = mesh(new T.BoxGeometry(0.46, 0.05, 0.8), bois)
  plat.position.set(0, -0.045, -0.43)
  g.add(pot, plat)
  g.position.set(X[w], 0.94, Z)
  g.rotation.y = w === 'jade' ? 0.2 : -0.2
  stage.scene.add(g)
  return { g, porte, drapeau, lettre, nuage, pOpen: 0, pTo: 0, fUp: 0, fTo: 0, jig: 0 }
}

export interface Boites {
  stage: Stage
  /** La vue où va la caméra. */
  readonly courante: Vue
  vue(v: Vue): void
  drapeau(w: Who, leve: boolean, net?: boolean): void
  /** 0 fermée, 0.25 entrouverte, 1 grande ouverte. */
  porte(w: Who, k: 0 | 0.25 | 1): void
  /** L'enveloppe qui dépasse, porte ouverte. */
  lettre(w: Who, on: boolean): void
  /** Le nuage barré au-dessus de la boîte (pas de réseau). */
  nuage(w: Who, on: boolean): void
  secouer(w: Who): void
  etincelles(w: Who): void
  /** La fente de la boîte, à l'écran. */
  fente(w: Who): { x: number; y: number }
  /** La boîte sous le doigt. */
  sous(x: number, y: number): Who | null
  /** Un écran plein la recouvre : la scène ne se redessine plus. */
  figer(v: boolean): void
  dispose(): void
}

export async function creerBoites(host: HTMLElement): Promise<Boites> {
  const stage = await createStage(host, {
    sky: '#9ED4F2', fov: 36, cam: [0, 1.5, 5.4], target: [0, 1.0, 1.2],
    hemi: ['#DCEFFF', '#5E8A44', 1.0],
    sun: { pos: [5.5, 10, 8], color: '#FFF0D2', intensity: 2.2, area: 5, far: 40 },
    fill: 0.5, exposure: 1.0, fog: [11, 30]
  })
  const { T } = stage
  const farm = await buildFarm(stage, { night: false, empty: true })
  const put = (id: Parameters<typeof farm.make>[0], x: number, z: number, rot = 0) => { const p = farm.make(id); p.g.position.set(x, 0, z); p.g.rotation.y = rot; farm.root.add(p.g) }
  put('barn', -0.2, -4.4, 0.06)
  put('appleTree', -4.1, -2.0); put('appleTree', 4.5, -3.2); put('haystack', 3.2, -1.2, 0.4); put('well', -3.2, -0.1, 0.5)
  put('bush', -3.5, 0.7); put('bush', 3.6, 0.5); put('veggie', 5.0, -0.2, 0.3); put('coop', -5.0, -0.4, 0.8)
  const B: Record<Who, Boite> = { jade: faire(T, stage, 'jade'), joyce: faire(T, stage, 'joyce') }
  const kit = critterKit(T, { fine: true })
  const amis: { c: Critter; x: number; z: number; ph: number; r: number }[] = [
    { c: kit.make('chick', 0.34), x: -0.05, z: 1.5, ph: 0, r: 0.3 }, { c: kit.make('cat', 0.46), x: 1.72, z: 1.5, ph: 2, r: -0.5 }, { c: kit.make('duck', 0.42), x: -1.78, z: 1.4, ph: 4, r: 0.6 }
  ]
  for (const a of amis) { a.c.obj.position.set(a.x, 0, a.z); a.c.obj.rotation.y = a.r; a.c.obj.traverse(o => { o.castShadow = true }); stage.scene.add(a.c.obj) }
  const fx = particles(stage, 200)

  const VUES: Record<Vue, { c: [number, number, number]; t: [number, number, number] }> = {
    duo: { c: [0, 1.7, 5.9], t: [0, 0.9, 1.2] },
    jade: { c: [-0.62, 1.5, 4.35], t: [-0.84, 0.82, 1.4] },
    joyce: { c: [0.62, 1.5, 4.35], t: [0.84, 0.82, 1.4] }
  }
  let courante: Vue = 'duo'
  const pos = new T.Vector3(...VUES.duo.c), tgt = new T.Vector3(...VUES.duo.t), pTo = pos.clone(), tTo = tgt.clone()
  stage.start((dt, now) => {
    const t = now / 1000, k = 1 - Math.exp(-dt * 4.2)
    pos.lerp(pTo, k); tgt.lerp(tTo, k)
    stage.camera.position.copy(pos); stage.camera.lookAt(tgt)
    for (const w of WHO) {
      const b = B[w.id]
      b.pOpen += (b.pTo - b.pOpen) * (1 - Math.exp(-dt * 9))
      b.porte.rotation.x = b.pOpen * 1.72
      b.fUp += (b.fTo - b.fUp) * (1 - Math.exp(-dt * 8))
      b.drapeau.rotation.x = -(1 - b.fUp) * Math.PI / 2 * 0.98 + (b.fTo ? Math.sin(t * 3) * 0.03 : 0)
      b.jig = Math.max(0, b.jig - dt * 1.7)
      const beat = b.fTo && !b.pTo ? Math.max(0, Math.sin(t * 2.1 + (w.id === 'jade' ? 0 : 1.6)) - 0.72) * 0.22 : 0
      b.g.rotation.z = Math.sin(t * 34) * 0.05 * b.jig + Math.sin(t * 30) * beat
    }
    for (const a of amis) {
      kit.blink(a.c, dt)
      const s = Math.max(0, Math.sin(t * 1.3 + a.ph))
      a.c.obj.position.y = Math.abs(Math.sin(t * 6 + a.ph)) * 0.05 * (s > 0.7 ? 1 : 0)
      a.c.obj.rotation.y = a.r + Math.sin(t * 0.6 + a.ph) * 0.35
    }
    farm.step(dt, t)
    fx.update(dt)
  })
  const ray = new T.Raycaster()
  const fente = (w: Who) => { B[w].g.updateWorldMatrix(true, false); return B[w].g.localToWorld(new T.Vector3(0, 0.22, 0.1)) }
  return {
    stage,
    get courante() { return courante },
    vue(v: Vue) { courante = v; pTo.set(...VUES[v].c); tTo.set(...VUES[v].t) },
    drapeau(w, leve, net = false) { B[w].fTo = leve ? 1 : 0; if (net) B[w].fUp = B[w].fTo },
    porte(w, k) { B[w].pTo = k },
    lettre(w, on) { B[w].lettre.visible = on },
    nuage(w, on) { B[w].nuage.visible = on },
    secouer(w) { B[w].jig = 1 },
    etincelles(w) { const p = fente(w); fx.burst(p, { count: 40, color: [0xFFD34D, 0xFF8FB0, 0xFFFFFF], speed: 1.7, spread: 1, size: 0.14, life: 1, gravity: 2 }) },
    fente(w) { return toScreen(stage, fente(w)) },
    sous(x, y) {
      const r = stage.renderer.domElement.getBoundingClientRect()
      ray.setFromCamera(new T.Vector2((x - r.left) / r.width * 2 - 1, 1 - (y - r.top) / r.height * 2), stage.camera)
      for (const w of WHO) if (ray.intersectObject(B[w.id].g, true).length) return w.id
      return null
    },
    figer(v) { stage.render = v ? () => { /* l'image d'avant reste */ } : undefined },
    dispose() { stage.dispose() }
  }
}
