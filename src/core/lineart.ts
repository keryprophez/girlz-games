import { withRenderer } from './portraits'
import { critterKit, FARM, FARM_MORE, type CritterKind } from './critters'
import { trainModel, trainParts } from './train3d'
import { makeRocket } from './rocket3d'
import { barnChoir } from './barn3d'
import { diskGet, diskPut } from './diskcache'
import type { Stage, T3 } from './three3d'

/* ✏️ Les coloriages de la ferme (30/09) — les personnages 3D de l'app rendus
   en DESSINS AU TRAIT pour l'Atelier : « jamais deux styles », ce sont les
   mêmes animaux que dans les jeux. Même recette que la photo de la
   Princesse qui devient coloriage : chaque pièce de la scène est peinte
   d'une couleur unie (sans lumière), et on garde les bords — là où la
   couleur change ; les petites pièces sombres (les yeux) restent pleines,
   à l'encre. Trait brun, fond transparent, 1500 × 1000 comme les feuilles
   de l'Atelier (le seau de peinture s'arrête sur les traits).

   Au catalogue : les 13 animaux, de trois quarts et de profil, dans leur
   pré sous le soleil ; le petit train et ses voyageurs ; la fusée de
   l'Espace dans les étoiles ; la chorale sur la scène de la grange.
   Calculés à la première demande, puis gardés (`core/diskcache.ts`). */

type Scene = import('three').Scene
type Cam = import('three').PerspectiveCamera

export interface Sheet { id: string; kind: 'bete' | 'train' | 'fusee' | 'grange'; critter?: CritterKind; view?: 'face' | 'profil' }

const BETES: CritterKind[] = [...FARM, ...FARM_MORE, 'mole']
export const SHEETS: Sheet[] = [
  ...BETES.flatMap((k): Sheet[] => [
    { id: `bete-${k}-face`, kind: 'bete', critter: k, view: 'face' },
    { id: `bete-${k}-profil`, kind: 'bete', critter: k, view: 'profil' }
  ]),
  { id: 'scene-train', kind: 'train' },
  { id: 'scene-fusee', kind: 'fusee' },
  { id: 'scene-grange', kind: 'grange' }
]
export const sheetById = (id: string) => SHEETS.find(s => s.id === id)

export const PAGE_W = 1500, PAGE_H = 1000
/** Version du dessin : à changer si la recette change (le cache se renouvelle). */
const VERSION = 'v2'

const pages = new Map<string, string>()
const minis = new Map<string, string>()

/** Le coloriage en grand (dataURL PNG 1500 × 1000), ou null sans WebGL. */
export async function sheetLines(id: string): Promise<string | null> {
  const hit = pages.get(id)
  if (hit) return hit
  const kept = await diskGet('coloriage', VERSION + ':' + id)
  if (kept) { pages.set(id, kept); return kept }
  const s = sheetById(id)
  if (!s) return null
  const url = await withRenderer(PAGE_W, PAGE_H, (T, r) => drawSheet(T, r, s, PAGE_W, PAGE_H, 1))
    .catch(err => { console.error('coloriage', id, err); return null })
  if (url) {
    pages.set(id, url)
    void diskPut('coloriage', VERSION + ':' + id, url, 40)
  }
  return url
}

/** Les vignettes du livre de coloriages (300 × 200), tout le catalogue d'un coup. */
export async function sheetMinis(): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const missing: Sheet[] = []
  for (const s of SHEETS) {
    const hit = minis.get(s.id) || await diskGet('coloriage-mini', VERSION + ':' + s.id)
    if (hit) { minis.set(s.id, hit); out[s.id] = hit } else missing.push(s)
  }
  if (!missing.length) return out
  await withRenderer(300, 200, async (T, r) => {
    for (const s of missing) {
      const url = drawSheet(T, r, s, 300, 200, 0)
      if (!url) continue
      minis.set(s.id, url)
      out[s.id] = url
      void diskPut('coloriage-mini', VERSION + ':' + s.id, url, 60)
      // Laisse respirer la page entre deux rendus
      await new Promise(res => setTimeout(res, 0))
    }
  }).catch(err => console.error('vignettes des coloriages', err))
  return out
}

/* ---------- Les scènes ---------- */
interface Built { scene: Scene; cam: Cam; dispose(): void }

/** Un faux « Stage » : ce dont ont besoin la fusée et la grange pour se construire. */
function fakeStage(T: T3, renderer: import('three').WebGLRenderer, scene: Scene, bin: { dispose(): void }[]): Stage {
  return { T, scene, renderer, keep: <X extends { dispose(): void }>(x: X) => { bin.push(x); return x } } as unknown as Stage
}

/** Le décor d'un animal : son pré (un disque d'herbe), le soleil, deux nuages. */
function meadow(T: T3, scene: Scene, cam: Cam, dist: number, grass = true) {
  if (grass) {
    const disk = new T.Mesh(new T.CircleGeometry(1, 64), new T.MeshBasicMaterial())
    disk.rotation.x = -Math.PI / 2
    const halfW = Math.tan(cam.fov / 2 * Math.PI / 180) * dist * cam.aspect
    disk.scale.setScalar(halfW * 0.8)
    disk.position.y = -0.002
    scene.add(disk)
  }
  // Le soleil et les nuages sont posés au fond, là où la caméra les voit en haut
  const at = (nx: number, ny: number, d: number) => {
    const v = new T.Vector3(nx, ny, 0.5).unproject(cam).sub(cam.position).normalize()
    return cam.position.clone().addScaledVector(v, d)
  }
  const far = dist * 2.2
  const sun = new T.Mesh(new T.CircleGeometry(1, 48), new T.MeshBasicMaterial())
  sun.position.copy(at(-0.7, 0.62, far))
  sun.scale.setScalar(far * 0.06)
  sun.lookAt(cam.position)
  scene.add(sun)
  for (const [nx, ny, k] of [[0.5, 0.74, 1], [-0.1, 0.84, 0.8]] as const) {
    const c = new T.Group()
    // Un nuage = une seule forme : ses bulles partagent une couleur, seul le tour reste
    c.userData.one = true
    c.position.copy(at(nx, ny, far))
    c.lookAt(cam.position)
    const s = far * 0.04 * k
    for (const [x, y, r] of [[-1.3, 0, 0.9], [0, 0.35, 1.2], [1.3, 0, 0.9], [0.6, -0.3, 0.8], [-0.6, -0.3, 0.8]]) {
      const b = new T.Mesh(new T.CircleGeometry(r * s, 40), new T.MeshBasicMaterial())
      b.position.set(x * s, y * s, 0)
      c.add(b)
    }
    scene.add(c)
  }
}

function build(T: T3, renderer: import('three').WebGLRenderer, s: Sheet, aspect: number): Built {
  const scene = new T.Scene()
  const bin: { dispose(): void }[] = []
  const cam = new T.PerspectiveCamera(30, aspect, 0.05, 200)
  const kit = critterKit(T)
  bin.push(kit)
  if (s.kind === 'bete') {
    const c = kit.make(s.critter!, 1)
    c.obj.rotation.y = s.view === 'face' ? -0.42 : -1.3
    scene.add(c.obj)
    const box = new T.Box3().setFromObject(c.obj)
    const ctr = box.getCenter(new T.Vector3()), size = box.getSize(new T.Vector3())
    const tan = Math.tan(cam.fov / 2 * Math.PI / 180)
    // L'animal remplit les deux tiers de la hauteur de la page
    const dist = Math.max(size.y / 0.64 / 2 / tan, Math.max(size.x, size.z) / 0.6 / 2 / (tan * aspect))
    cam.position.set(ctr.x, ctr.y + dist * 0.3, ctr.z + dist)
    cam.lookAt(ctr.x, ctr.y - size.y * 0.1, ctr.z)
    cam.updateMatrixWorld()
    meadow(T, scene, cam, dist)
  } else if (s.kind === 'train') {
    const P = trainParts(T)
    bin.push({ dispose() { Object.values(P).forEach(x => (x as { dispose?: () => void }).dispose?.()) } })
    const m = trainModel(T, P, 3)
    const who: CritterKind[] = ['cow', 'pig', 'sheep']
    m.wagons.forEach((w, i) => {
      const c = kit.make(who[i], 0.74)
      c.obj.position.y = 0.41
      c.obj.rotation.y = 0.35
      w.g.add(c.obj)
    })
    m.g.position.x = -m.length / 2 + 1.1
    scene.add(m.g)
    // Les rails et quelques traverses
    const steel = new T.MeshBasicMaterial()
    for (const z of [-0.36, 0.36]) {
      const rail = new T.Mesh(new T.BoxGeometry(12, 0.06, 0.06), steel)
      rail.position.set(0, 0.03, z)
      scene.add(rail)
    }
    for (let x = -5.5; x <= 5.5; x += 0.7) {
      const sl = new T.Mesh(new T.BoxGeometry(0.16, 0.05, 1.0), new T.MeshBasicMaterial())
      sl.position.set(x, 0.0, 0)
      scene.add(sl)
    }
    cam.fov = 30
    cam.position.set(0.8, 2.1, 9.2)
    cam.lookAt(0.2, 0.75, 0)
    cam.updateProjectionMatrix(); cam.updateMatrixWorld()
    meadow(T, scene, cam, 9.2, false)
  } else if (s.kind === 'fusee') {
    const st = fakeStage(T, renderer, scene, bin)
    const r = makeRocket(T, st)
    r.group.rotation.z = -0.5
    scene.add(r.group)
    // Une planète à anneau, la Lune, des étoiles
    const planet = new T.Mesh(new T.SphereGeometry(0.34, 48, 32), new T.MeshBasicMaterial())
    planet.position.set(1.15, 0.42, -0.6)
    const ring = new T.Mesh(new T.TorusGeometry(0.52, 0.06, 8, 64), new T.MeshBasicMaterial())
    ring.rotation.set(1.25, 0.2, 0.3)
    planet.add(ring)
    scene.add(planet)
    const moon = new T.Mesh(new T.SphereGeometry(0.2, 40, 24), new T.MeshBasicMaterial())
    moon.position.set(-1.2, -0.4, -0.4)
    scene.add(moon)
    const star = new T.Shape()
    for (let k = 0; k < 10; k++) {
      const a = Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? 0.4 : 1
      if (k) star.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
      else star.moveTo(Math.cos(a) * rr, Math.sin(a) * rr)
    }
    const starGeo = new T.ShapeGeometry(star)
    for (const [x, y, sc] of [[-1.35, 0.55, 0.1], [-0.7, 0.8, 0.07], [0.55, -0.7, 0.08], [1.4, -0.35, 0.06], [-0.45, -0.72, 0.06], [0.9, 0.85, 0.07]]) {
      const m = new T.Mesh(starGeo, new T.MeshBasicMaterial())
      m.position.set(x, y, 0)
      m.scale.setScalar(sc)
      scene.add(m)
    }
    cam.position.set(0, 0.05, 4.1)
    cam.lookAt(0, 0.05, 0)
    cam.updateMatrixWorld()
  } else {
    const st = fakeStage(T, renderer, scene, bin)
    scene.add(new T.HemisphereLight('#FFE2B8', '#3A2416', 1))
    barnChoir(st, kit, (['rooster', 'cow', 'pig', 'dog', 'cat', 'horse'] as CritterKind[]).map(animal => ({ animal, color: 0x888888 })))
    cam.fov = 36
    cam.position.set(0, 1.9, 6.6)
    cam.lookAt(0, 1.45, -0.8)
    cam.updateProjectionMatrix(); cam.updateMatrixWorld()
  }
  return {
    scene, cam,
    dispose() {
      scene.traverse(o => {
        const m = o as import('three').Mesh
        if (m.geometry) m.geometry.dispose()
        if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => x.dispose())
      })
      bin.forEach(x => x.dispose())
    }
  }
}

/* ---------- Le trait ---------- */
/** Rend la scène en couleurs d'identité, garde les bords, remplit les yeux. */
function drawSheet(T: T3, renderer: import('three').WebGLRenderer, s: Sheet, w: number, h: number, thick: number): string | null {
  const b = build(T, renderer, s, w / h)
  const rt = new T.WebGLRenderTarget(w, h)
  const tmp: import('three').Material[] = []
  try {
    const inkIds = new Set<number>()
    let n = 0
    const sph = new T.Sphere()
    const shared = new Map<import('three').Object3D, import('three').Color>()
    b.scene.updateMatrixWorld(true)
    b.scene.traverse(o => {
      const any = o as import('three').Mesh & { isSprite?: boolean; isPoints?: boolean; isLine?: boolean; isLight?: boolean }
      if (any.isSprite || any.isPoints || any.isLine) { o.visible = false; return }
      if (!any.isMesh) return
      const src = (Array.isArray(any.material) ? any.material[0] : any.material) as import('three').MeshStandardMaterial
      // Les lumières de scène (cônes additifs, zones de toucher invisibles) ne se dessinent pas
      if (src.transparent && (src.opacity < 0.05 || src.blending === T.AdditiveBlending)) { o.visible = false; return }
      // Une couleur d'identité par pièce (ou par forme : les bulles d'un
      // nuage), en valeurs linéaires, relues telles quelles
      let one: import('three').Object3D | null = o.parent
      while (one && !one.userData.one) one = one.parent
      let col = one ? shared.get(one) : undefined
      if (!col) {
        n++
        const hsh = Math.imul(n, 2654435761) >>> 8
        col = new T.Color().setRGB((hsh & 255) / 255, ((hsh >> 8) & 255) / 255, (((hsh >> 16) & 127) + 64) / 255, T.LinearSRGBColorSpace)
        if (one) shared.set(one, col)
      }
      // Les pupilles et les truffes (petites pièces noires) : à l'encre
      const c = src.color
      if (c && c.r * 0.3 + c.g * 0.59 + c.b * 0.11 < 0.012) {
        any.geometry.computeBoundingSphere()
        sph.copy(any.geometry.boundingSphere!).applyMatrix4(any.matrixWorld)
        if (sph.radius < 0.07) inkIds.add(col.getHex(T.LinearSRGBColorSpace))
      }
      const m = new T.MeshBasicMaterial({ side: T.DoubleSide })
      m.color.copy(col)
      tmp.push(m)
      any.material = m
    })
    b.scene.background = null
    renderer.setRenderTarget(rt)
    renderer.setClearColor(0x000000, 0)
    renderer.clear()
    renderer.render(b.scene, b.cam)
    const px = new Uint8Array(w * h * 4)
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, px)
    renderer.setRenderTarget(null)
    // Les bords (et l'encre)
    const edge = new Uint8Array(w * h)
    const key = (i: number) => (px[i] << 16) | (px[i + 1] << 8) | px[i + 2]
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        const a = px[i + 3], k = a ? key(i) : -1
        if (a && inkIds.has(k)) { edge[y * w + x] = 1; continue }
        if (x < w - 1) { const j = i + 4; if ((px[j + 3] ? key(j) : -1) !== k) { edge[y * w + x] = 1; continue } }
        if (y < h - 1) { const j = i + w * 4; if ((px[j + 3] ? key(j) : -1) !== k) { edge[y * w + x] = 1 } }
      }
    }
    // Un trait épaissi (3 px sur la feuille, 1 px en vignette), la page à l'endroit
    const out = document.createElement('canvas')
    out.width = w; out.height = h
    const g = out.getContext('2d')!
    const img = g.createImageData(w, h)
    const [ir, ig, ib] = [0x3A, 0x2E, 0x25]
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let on = false
        for (let dy = -thick; dy <= thick && !on; dy++) {
          for (let dx = -thick; dx <= thick && !on; dx++) {
            const xx = x + dx, yy = y + dy
            if (xx >= 0 && yy >= 0 && xx < w && yy < h && edge[yy * w + xx]) on = true
          }
        }
        if (on) {
          const o = ((h - 1 - y) * w + x) * 4
          img.data[o] = ir; img.data[o + 1] = ig; img.data[o + 2] = ib; img.data[o + 3] = 255
        }
      }
    }
    g.putImageData(img, 0, 0)
    return out.toDataURL('image/png')
  } finally {
    rt.dispose()
    tmp.forEach(x => x.dispose())
    b.dispose()
  }
}

