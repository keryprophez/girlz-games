import type { Stage } from './three3d'
import { loadModel, dotTex } from './three3d'
import { decor, ring } from './scene3d'

/* Le paysage d'hiver du Bonhomme de neige (23/09) — là où il n'y avait
   qu'une plaine blanche et une couronne de sapins sous un ciel uni :
   - un ciel en dégradé (bleu profond en haut, pêche à l'horizon) et des
     montagnes enneigées au loin, noyées dans une brume de la même couleur ;
   - des collines de neige, des rochers coiffés de blanc ;
   - un chalet en rondins assemblé pièce par pièce (kit Holiday de Kenney :
     murs, coins, pignons, toit enneigé, cheminée qui FUME), sa couronne sur
     la porte, un sapin décoré, une luge, un banc, des lanternes qui luisent,
     deux rennes qui broutent.
   Tout est posé HORS du champ de jeu (rayon > FIELD + 1) : la caméra tourne
   autour du bonhomme, le décor doit tenir de tous les côtés. */

type T3 = Stage['T']

export interface Winter {
  /** À appeler à chaque image : fumée de la cheminée, lanternes, rennes. */
  update(dt: number, t: number): void
}

/* Les kits Kenney sont clairs : sous hemi + soleil + IBL, l'ACES les délave
   (piège connu). On les assombrit, la lumière les remonte. */
const SHADE = 0.74

/** Les couleurs du ciel : à reprendre pour le brouillard (horizon). */
export const WINTER_SKY = { top: '#5E97D6', mid: '#A9CFEF', horizon: '#F4DCCB' }

function skyDome(T: T3): import('three').Mesh {
  const geo = new T.SphereGeometry(160, 32, 16)
  const top = new T.Color(WINTER_SKY.top), mid = new T.Color(WINTER_SKY.mid), hor = new T.Color(WINTER_SKY.horizon)
  const pos = geo.attributes.position
  const cols = new Float32Array(pos.count * 3)
  const c = new T.Color()
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i) / 160 // -1 … 1
    if (h < 0.02) c.copy(hor)
    else if (h < 0.3) c.copy(hor).lerp(mid, (h - 0.02) / 0.28)
    else c.copy(mid).lerp(top, Math.min(1, (h - 0.3) / 0.5))
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new T.BufferAttribute(cols, 3))
  const m = new T.Mesh(geo, new T.MeshBasicMaterial({
    vertexColors: true, side: T.BackSide, fog: false, depthWrite: false, toneMapped: false
  }))
  m.renderOrder = -10
  return m
}

/** Des montagnes en facettes, coiffées de neige, sur tout l'horizon. */
function mountains(T: T3, scene: import('three').Scene) {
  const rockMat = new T.MeshStandardMaterial({ color: 0x5E7396, roughness: 0.95, flatShading: true })
  const capMat = new T.MeshStandardMaterial({ color: 0xF2F7FF, roughness: 0.8, flatShading: true })
  const g = new T.Group()
  const n = 16
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.2
    const r = 62 + Math.random() * 18
    const h = 14 + Math.random() * 16
    const w = 16 + Math.random() * 12
    const seg = 5 + (i % 3)
    const peak = new T.Mesh(new T.ConeGeometry(w, h, seg, 1), rockMat)
    peak.position.set(Math.cos(a) * r, h / 2 - 1, Math.sin(a) * r)
    peak.rotation.y = Math.random() * Math.PI
    // La calotte : le même cône, plus petit, recalé sur le sommet
    const k = 0.38
    const cap = new T.Mesh(new T.ConeGeometry(w * k * 1.04, h * k, seg, 1), capMat)
    cap.position.y = h / 2 - (h * k) / 2 + 0.05
    peak.add(cap)
    g.add(peak)
  }
  scene.add(g)
}

/** Des collines de neige douces entre le champ et les montagnes. */
function hills(T: T3, scene: import('three').Scene, snowMat: import('three').Material) {
  const geo = new T.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2)
  for (const [x, z, s, h] of [
    [-34, -38, 16, 3.2], [8, -50, 20, 4], [42, -28, 15, 2.8], [48, 10, 17, 3.4],
    [26, 44, 16, 3], [-20, 46, 18, 3.6], [-50, 8, 17, 3.2], [-44, -14, 12, 2.2]
  ] as const) {
    const m = new T.Mesh(geo, snowMat)
    m.scale.set(s, h, s * 0.8)
    m.position.set(x, -0.2, z)
    m.receiveShadow = true
    scene.add(m)
  }
}

/* ---- Le chalet : grille de 2 × 2 cases (une case = 1 unité Kenney) ----
   Les murs du kit sont posés sur le bord +z de leur case ; on tourne la
   pièce pour la mettre sur un autre bord. Le pignon et le toit sont des
   demi-pièces : le côté droit tel quel, le côté gauche en miroir. */
async function cabin(T: T3): Promise<{ obj: import('three').Group; chimney: import('three').Vector3 }> {
  const names = ['cabin-wall', 'cabin-window-a', 'cabin-door-rotate', 'cabin-corner-logs', 'cabin-roof-snow',
    'cabin-roof-snow-chimney', 'cabin-wall-roof', 'cabin-wall-wreath'] as const
  const proto = Object.fromEntries(await Promise.all(names.map(async n => [n, await loadModel('holiday', n)] as const)))
  const g = new T.Group()
  const put = (name: typeof names[number], x: number, y: number, z: number, rot: number, mirror = false) => {
    const o = proto[name].clone(true)
    o.traverse(m => {
      const mesh = m as import('three').Mesh
      if (!mesh.isMesh) return
      const mat = (mesh.material as import('three').MeshStandardMaterial).clone()
      mat.color.multiplyScalar(SHADE * 0.82)
      mesh.material = mat
    })
    o.position.set(x, y, z)
    o.rotation.y = rot
    if (mirror) o.scale.x = -1
    g.add(o)
    return o
  }
  const P = Math.PI
  // Façade (+z) : fenêtre et porte ; derrière : deux murs ; côtés : la couronne, des fenêtres
  put('cabin-window-a', -0.5, 0, 0.5, 0)
  put('cabin-door-rotate', 0.5, 0, 0.5, 0)
  put('cabin-wall', -0.5, 0, -0.5, P)
  put('cabin-wall', 0.5, 0, -0.5, P)
  put('cabin-window-a', 0.5, 0, 0.5, P / 2)
  put('cabin-wall', 0.5, 0, -0.5, P / 2)
  put('cabin-wall-wreath', -0.5, 0, 0.5, -P / 2)
  put('cabin-window-a', -0.5, 0, -0.5, -P / 2)
  put('cabin-corner-logs', -0.5, 0, 0.5, 0)
  put('cabin-corner-logs', 0.5, 0, 0.5, P / 2)
  put('cabin-corner-logs', 0.5, 0, -0.5, P)
  put('cabin-corner-logs', -0.5, 0, -0.5, -P / 2)
  // Pignons, devant et derrière
  put('cabin-wall-roof', 0.5, 1, 0.5, 0)
  put('cabin-wall-roof', -0.5, 1, 0.5, 0, true)
  put('cabin-wall-roof', -0.5, 1, -0.5, P)
  put('cabin-wall-roof', 0.5, 1, -0.5, P, true)
  // Toit enneigé, faîtage au milieu (x = 0), et la cheminée derrière à droite
  put('cabin-roof-snow', 0.5, 1, 0.5, 0)
  put('cabin-roof-snow-chimney', 0.5, 1, -0.5, 0)
  put('cabin-roof-snow', -0.5, 1, 0.5, P)
  put('cabin-roof-snow', -0.5, 1, -0.5, P)
  // Le haut de la cheminée : le point le plus haut de sa pièce, côté cheminée
  return { obj: g, chimney: new T.Vector3(0.3, 2.45, -0.45) }
}

/** Pose tout le décor ; les modèles arrivent en arrière-plan (le jeu n'attend pas). */
export function winterScene(stage: Stage, o: {
  field: number
  /** Le matériau du sol (neige), pour les collines. */
  snowMat: import('three').Material
}): Winter {
  const { T, scene } = stage
  scene.add(skyDome(T))
  scene.background = new T.Color(WINTER_SKY.horizon)
  mountains(T, scene)
  hills(T, scene, o.snowMat)

  const toCenter = (x: number, z: number) => Math.atan2(-x, -z)
  const R = o.field

  /* Où vivent les éléments du décor (le reste de la couronne = sapins) */
  const CABIN = { x: -8.2, z: -R - 10.5, s: 1.9 }
  const spots: { model: string; x: number; z: number; size: number; rot?: number; shade?: number }[] = ([
    { model: 'holiday/tree-decorated-snow', x: CABIN.x + 4.1, z: CABIN.z + 0.4, size: 3.4, rot: 0.4 },
    { model: 'holiday/sled', x: CABIN.x + 2.7, z: CABIN.z + 3.2, size: 1.1, rot: 0.9 },
    { model: 'holiday/bench', x: CABIN.x - 2.2, z: CABIN.z + 3.3, size: 1.25, rot: toCenter(CABIN.x - 2.2, CABIN.z + 3.3) },
    { model: 'holiday/reindeer', x: 7.4, z: -7.2, size: 1.5, rot: -2.2 },
    { model: 'holiday/reindeer', x: 9.1, z: -5.4, size: 1.2, rot: -1.2 },
    { model: 'holiday/rocks-large', x: 10.5, z: 1.5, size: 2.6 },
    { model: 'holiday/rocks-large', x: -10.8, z: 3.5, size: 2.2 },
    { model: 'holiday/rocks-medium', x: 3.5, z: 10.8, size: 1.3 },
    { model: 'holiday/rocks-medium', x: -8.5, z: -3.8, size: 1.1 },
    { model: 'holiday/snow-bunker', x: 6.8, z: 7.5, size: 2.2 },
    { model: 'holiday/snow-pile', x: -6.2, z: 8.2, size: 1.6 },
    { model: 'holiday/snow-pile', x: 7.2, z: -2.6, size: 1.4 },
    { model: 'holiday/snow-flat-large', x: CABIN.x + 0.3, z: CABIN.z + 3.4, size: 4.2, rot: 0.3 }
  ] as { model: string; x: number; z: number; size: number; rot?: number }[]).map(it => ({ ...it, shade: SHADE }))
  const LANTERNS: [number, number][] = [[CABIN.x + 1.6, CABIN.z + 4.1], [1.6, -R - 2.4], [6.3, -R + 0.6], [-R - 2.2, -1.2]]
  for (const [x, z] of LANTERNS) spots.push({ model: 'holiday/lantern', x, z, size: 1.9, rot: 0, shade: SHADE })
  for (let i = 0; i < 4; i++) {
    const x = CABIN.x - 2.6 + i * 1.28, z = CABIN.z + 4.6
    spots.push({ model: 'holiday/cabin-fence', x, z, size: 1.3, rot: 0, shade: SHADE })
  }

  // Sapins en couronne, mais pas sur le chalet ni sur les autres éléments
  const busy: [number, number, number][] = [[CABIN.x, CABIN.z, 4.4], ...spots.map(s => [s.x, s.z, Math.max(1.2, s.size * 0.8)] as [number, number, number])]
  const trees = ring(34, R + 1.6, R + 9).filter(([x, z]) => busy.every(([bx, bz, br]) => Math.hypot(x - bx, z - bz) > br + 0.9))
  const treeItems = trees.map(([x, z], i) => ({
    model: `holiday/tree-snow-${['a', 'b', 'c'][i % 3]}`, x, z, size: 1.8 + Math.random() * 1.9
  }))

  const out: Winter = { update() { /* remplacé une fois le décor chargé */ } }
  const smoke = puffs(stage)

  Promise.all([
    decor(stage, [...treeItems, ...spots]),
    cabin(T)
  ]).then(([, cab]) => {
    if (!stage.alive) return
    const house = cab.obj
    house.scale.setScalar(CABIN.s)
    house.position.set(CABIN.x, 0, CABIN.z)
    house.rotation.y = toCenter(CABIN.x, CABIN.z)
    scene.add(house)
    house.updateMatrixWorld(true)
    smoke.from.copy(cab.chimney).applyMatrix4(house.matrixWorld)
  }).catch(() => { /* sans décor, le jeu tourne */ })

  // Halos chauds des lanternes (le haut de la lanterne, là où est la flamme)
  const halo = dotTex(T, '#FFD58A')
  stage.keep(halo)
  const glows = LANTERNS.map(([x, z]) => {
    const s = new T.Sprite(new T.SpriteMaterial({ map: halo, transparent: true, opacity: 0.55, depthWrite: false, blending: T.AdditiveBlending }))
    s.position.set(x, 1.62, z)
    s.scale.setScalar(0.5)
    scene.add(s)
    return s
  })

  out.update = (dt, t) => {
    smoke.update(dt)
    glows.forEach((g, i) => {
      const k = 0.85 + Math.sin(t * 5.3 + i * 1.7) * 0.06 + Math.sin(t * 11 + i) * 0.04
      g.scale.setScalar(0.5 * k)
    })
  }
  return out
}

/* La fumée de la cheminée : quelques bouffées recyclées qui montent, grossissent
   et s'effacent, poussées par un petit vent. */
function puffs(stage: Stage) {
  const { T, scene } = stage
  const tex = dotTex(T, '#FFFFFF')
  stage.keep(tex)
  const N = 14
  const from = new T.Vector3(1e4, 0, 0)
  const list: { s: import('three').Sprite; age: number; life: number }[] = []
  for (let i = 0; i < N; i++) {
    const s = new T.Sprite(new T.SpriteMaterial({ map: tex, color: 0xE6E9EE, transparent: true, opacity: 0, depthWrite: false }))
    scene.add(s)
    list.push({ s, age: (i / N) * 4.2, life: 4.2 })
  }
  return {
    from,
    update(dt: number) {
      for (const p of list) {
        p.age += dt
        if (p.age > p.life) p.age -= p.life
        const k = p.age / p.life
        p.s.position.set(from.x + k * 1.6 + Math.sin(p.age * 1.3) * 0.12, from.y + k * 3.4, from.z + k * 0.6)
        p.s.scale.setScalar(0.45 + k * 1.7)
        ;(p.s.material as import('three').SpriteMaterial).opacity = from.x > 1e3 ? 0 : Math.min(1, k * 6) * (1 - k) * 0.7
      }
    }
  }
}
