/* La scène partagée des jeux 3D — ce que chaque jeu réinventait moins bien :
   un sol, un décor tiré d'UN kit glTF (plus de sapins en cônes), des particules
   DANS la scène (plus de divs qui flottent au-dessus du canvas), une secousse
   de CAMÉRA (plus de `transform` CSS sur toute la page), et la projection
   monde → écran pour ce qui reste en DOM. */

import type { Stage, T3 } from './three3d'
import { loadModel, fitModel, dotTex } from './three3d'

type V3 = import('three').Vector3

/* ---------- Sol ---------- */
export function ground(stage: Stage, o: { radius?: number; color?: number | string; map?: import('three').Texture; roughness?: number } = {}) {
  const { T, scene } = stage
  const mesh = new T.Mesh(
    new T.CircleGeometry(o.radius ?? 24, 56),
    new T.MeshStandardMaterial({ color: o.color ?? 0x6E9F52, map: o.map ?? null, roughness: o.roughness ?? 0.95 })
  )
  mesh.rotation.x = -Math.PI / 2
  mesh.receiveShadow = true
  scene.add(mesh)
  return mesh
}

/* ---------- Décor ---------- */
export interface DecorItem {
  /** Kit et modèle : `nature/tree_oak`, `holiday/tree-snow-a`… */
  model: string
  x: number
  z: number
  /** Hauteur voulue en mètres (le modèle est posé sur son point le plus bas). */
  size: number
  rot?: number
  /** Assombrit les matériaux (0.5 = moitié) : les kits Kenney sont clairs et
      l'ACES les délave sous hemi + soleil + IBL — piège connu. */
  shade?: number
  /** Teinte multiplicative (hex) : pour tirer la palette menthe du kit nature
      vers un vert de crépuscule, par exemple. */
  tint?: number
}

/** Pose une liste de modèles dans la scène ; renvoie le groupe (déjà ajouté). */
export async function decor(stage: Stage, items: DecorItem[]): Promise<import('three').Group> {
  const { T, scene } = stage
  const group = new T.Group()
  const loaded = await Promise.all(items.map(async it => {
    const [kit, name] = it.model.split('/')
    const g = await loadModel(kit, name)
    fitModel(T, g, it.size)
    if ((it.shade !== undefined && it.shade !== 1) || it.tint !== undefined) {
      // Les matériaux sont partagés avec le prototype en cache : on les clone
      const tint = it.tint !== undefined ? new T.Color(it.tint) : null
      g.traverse((o: import('three').Object3D) => {
        const m = o as import('three').Mesh
        if (!m.isMesh) return
        const mat = (m.material as import('three').MeshStandardMaterial).clone()
        if (it.shade !== undefined) mat.color.multiplyScalar(it.shade)
        if (tint) mat.color.multiply(tint)
        m.material = mat
      })
    }
    // Posé au sol : le point le plus bas du modèle à y = 0
    const box = new T.Box3().setFromObject(g)
    g.position.set(it.x, -box.min.y, it.z)
    g.rotation.y = it.rot ?? Math.random() * Math.PI * 2
    return g
  }))
  if (!stage.alive) return group
  loaded.forEach(g => group.add(g))
  scene.add(group)
  return group
}

/** Positions aléatoires en couronne autour du centre (jamais dans l'aire de jeu). */
export function ring(n: number, rMin: number, rMax: number, arc: [number, number] = [0, Math.PI * 2]): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const a = arc[0] + (arc[1] - arc[0]) * ((i + Math.random() * 0.8) / n)
    const r = rMin + Math.random() * (rMax - rMin)
    out.push([Math.cos(a) * r, Math.sin(a) * r])
  }
  return out
}

/* ---------- Particules GPU ----------
   Un seul `Points` par scène, un tampon fixe, des particules recyclées.
   Chaque burst pose N particules avec une vitesse, une couleur, une durée de
   vie ; `update(dt)` les fait voler et s'éteindre. Zéro allocation en jeu. */
export interface BurstOpts {
  count?: number
  color?: number | string | (number | string)[]
  /** Vitesse initiale (m/s) et dispersion. */
  speed?: number
  spread?: number
  life?: number
  size?: number
  gravity?: number
  /** Direction privilégiée (défaut : vers le haut). */
  dir?: { x: number; y: number; z: number }
}
export interface Particles {
  burst(pos: { x: number; y: number; z: number }, o?: BurstOpts): void
  update(dt: number): void
  dispose(): void
}

const VERT = `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
varying float vAlpha; varying vec3 vColor;
void main(){
  vAlpha = aAlpha; vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (220.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`
const FRAG = `
uniform sampler2D map; varying float vAlpha; varying vec3 vColor;
void main(){
  vec4 t = texture2D(map, gl_PointCoord);
  gl_FragColor = vec4(vColor, t.a * vAlpha);
}`

export function particles(stage: Stage, max = 600): Particles {
  const { T, scene } = stage
  const pos = new Float32Array(max * 3)
  const vel = new Float32Array(max * 3)
  const col = new Float32Array(max * 3)
  const size = new Float32Array(max)
  const alpha = new Float32Array(max)
  const life = new Float32Array(max)
  const maxLife = new Float32Array(max)
  const grav = new Float32Array(max)
  const geo = new T.BufferGeometry()
  const aPos = new T.BufferAttribute(pos, 3)
  const aCol = new T.BufferAttribute(col, 3)
  const aSize = new T.BufferAttribute(size, 1)
  const aAlpha = new T.BufferAttribute(alpha, 1)
  geo.setAttribute('position', aPos)
  geo.setAttribute('aColor', aCol)
  geo.setAttribute('aSize', aSize)
  geo.setAttribute('aAlpha', aAlpha)
  const tex = stage.keep(dotTex(T))
  const mat = new T.ShaderMaterial({
    uniforms: { map: { value: tex } },
    vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, blending: T.NormalBlending
  })
  const points = new T.Points(geo, mat)
  points.frustumCulled = false
  scene.add(points)
  let cursor = 0
  const c = new T.Color()

  return {
    burst(p, o = {}) {
      const n = o.count ?? 12
      const colors = Array.isArray(o.color) ? o.color : [o.color ?? 0xffffff]
      const speed = o.speed ?? 2.2, spread = o.spread ?? 1, lf = o.life ?? 0.7
      const d = o.dir ?? { x: 0, y: 1, z: 0 }
      for (let k = 0; k < n; k++) {
        const i = cursor; cursor = (cursor + 1) % max
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z
        const rx = (Math.random() - 0.5) * 2 * spread, ry = (Math.random() - 0.5) * 2 * spread, rz = (Math.random() - 0.5) * 2 * spread
        const s = speed * (0.5 + Math.random() * 0.8)
        vel[i * 3] = (d.x + rx) * s; vel[i * 3 + 1] = (d.y + ry) * s; vel[i * 3 + 2] = (d.z + rz) * s
        c.set(colors[k % colors.length] as string)
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b
        size[i] = (o.size ?? 0.09) * (0.7 + Math.random() * 0.6)
        life[i] = maxLife[i] = lf * (0.7 + Math.random() * 0.6)
        alpha[i] = 1
        grav[i] = o.gravity ?? 6
      }
      aPos.needsUpdate = aCol.needsUpdate = aSize.needsUpdate = aAlpha.needsUpdate = true
    },
    update(dt) {
      let any = false
      for (let i = 0; i < max; i++) {
        if (life[i] <= 0) continue
        any = true
        life[i] -= dt
        if (life[i] <= 0) { alpha[i] = 0; continue }
        vel[i * 3 + 1] -= grav[i] * dt
        pos[i * 3] += vel[i * 3] * dt
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt
        const k = life[i] / maxLife[i]
        alpha[i] = k < 0.35 ? k / 0.35 : 1
      }
      if (any) { aPos.needsUpdate = true; aAlpha.needsUpdate = true }
    },
    dispose() {
      scene.remove(points)
      geo.dispose(); mat.dispose()
    }
  }
}

/* ---------- Secousse de caméra ----------
   Une force 0..1 → un tremblement amorti appliqué APRÈS que le jeu a placé
   sa caméra : appeler `apply()` en fin de mise à jour, chaque frame. */
export interface CamShake {
  hit(force: number): void
  apply(dt: number): void
}
export function camShake(stage: Stage): CamShake {
  let amp = 0
  let t = 0
  const cam = stage.camera
  return {
    hit(f) { amp = Math.max(amp, Math.min(1, f) * 0.22) },
    apply(dt) {
      if (amp < 0.001) return
      t += dt * 60
      cam.position.x += Math.sin(t * 1.7) * amp
      cam.position.y += Math.cos(t * 2.3) * amp * 0.6
      amp *= Math.pow(0.02, dt) // extinction en ~1 s
    }
  }
}

/* ---------- Monde → écran (coordonnées de page, pour ce qui reste en DOM) ---------- */
export function toScreen(stage: Stage, v: V3 | { x: number; y: number; z: number }): { x: number; y: number } {
  const T: T3 = stage.T
  const p = new T.Vector3(v.x, v.y, v.z).project(stage.camera)
  const r = stage.renderer.domElement.getBoundingClientRect()
  return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height }
}
