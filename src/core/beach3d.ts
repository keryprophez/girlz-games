/* 🏖 LA PLAGE en 3D (27/10, le Château de sable) — modelée ici, rien de
   Kenney : le sable (la grille de `sand.ts` en maillage, dont on ne renvoie
   que la zone touchée ; sec clair, mouillé sombre, son grain), l'eau des
   douves, la mer qui roule (un seul shader : des vagues qui arrivent, leur
   écume au bord, le ciel qui s'y reflète), le ciel qui passe au coucher du
   soleil, la serviette, le seau et la pelle ; les moules en
   plastique (la forme même de leur sable, un peu plus grande), les
   coquillages, galets, étoiles de mer, drapeaux et bâtonnets, le crabe et
   les mouettes. */
import type { Stage, T3 } from './three3d'
import { bumpyNormal } from './three3d'
import { CELL, MOLD_R, moldHeight, N, SIZE, takeDirty, type Mold, type Sand } from './sand'

type Grp = import('three').Group

/** Le niveau de la mer à marée basse, et à marée haute (« Fini »). */
export const SEA_LOW = -0.13, SEA_HIGH = 0.03
/** Où la plage commence à descendre vers la mer (z). */
const SHORE_Z = -1.6
const SLOPE = 0.16

/** La plage hors de la grille (la grille la recouvre en son milieu). */
export function beachY(x: number, z: number) {
  const inGrid = Math.abs(x) < SIZE / 2 - 0.01 && Math.abs(z) < SIZE / 2 - 0.01
  if (inGrid) return -0.012
  let y = z < SHORE_Z ? (z - SHORE_Z) * SLOPE : 0
  // Des dunes douces au loin, sur les côtés
  const side = Math.max(0, Math.abs(x) - 2.6)
  if (z > SHORE_Z) y += Math.min(0.5, side * side * 0.04) * (0.6 + 0.4 * Math.sin(x * 0.7 + z * 0.9))
  return y
}

const canvasTex = (T: T3, stage: Stage, w: number, h: number, f: (g: CanvasRenderingContext2D) => void) => {
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h })
  f(c.getContext('2d')!)
  const t = new T.CanvasTexture(c)
  t.colorSpace = T.SRGBColorSpace
  t.anisotropy = 4
  return stage.keep(t)
}

/** Le grain du sable : presque blanc, des grains clairs et sombres (il multiplie la couleur). */
function grainTex(T: T3, stage: Stage) {
  const t = canvasTex(T, stage, 256, 256, g => {
    g.fillStyle = '#F2F0EA'; g.fillRect(0, 0, 256, 256)
    let seed = 17
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    for (let i = 0; i < 5200; i++) {
      const l = rnd()
      g.fillStyle = l < 0.45 ? `rgba(120,95,60,${0.12 + rnd() * 0.2})` : l < 0.9 ? `rgba(255,255,250,${0.3 + rnd() * 0.4})` : `rgba(90,80,90,${0.2 + rnd() * 0.2})`
      g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 1.6, 1 + rnd() * 1.6)
    }
  })
  t.wrapS = t.wrapT = T.RepeatWrapping
  return t
}

/* ---------- Le sable de la grille ---------- */

export interface SandMesh {
  mesh: import('three').Mesh
  water: import('three').Mesh
  /** Renvoie à la carte la zone que les gestes ont touchée (`sand.dirty`). */
  sync(s: Sand): void
  /** La marée qui recouvre la plage : tout le sable de la grille se mouille (0..1). */
  soak(k: number): void
}

const DRY_C = [0.86, 0.72, 0.52], WET_C = [0.56, 0.42, 0.28]

export function sandMesh(T: T3, stage: Stage, s: Sand): SandMesh {
  const cnt = N * N
  const pos = new Float32Array(cnt * 3), nor = new Float32Array(cnt * 3), col = new Float32Array(cnt * 3), uv = new Float32Array(cnt * 2)
  const wpos = new Float32Array(cnt * 3)
  const noise = new Float32Array(cnt)
  let seed = 3
  for (let k = 0; k < cnt; k++) { seed = (seed * 16807) % 2147483647; noise[k] = (seed / 2147483647 - 0.5) * 0.05 }
  const idx: number[] = []
  for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
    const a = j * N + i, b = a + 1, c = a + N, d = c + 1
    idx.push(a, c, b, b, c, d)
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i
    pos[k * 3] = wpos[k * 3] = i * CELL - SIZE / 2
    pos[k * 3 + 2] = wpos[k * 3 + 2] = j * CELL - SIZE / 2
    uv[k * 2] = i / (N - 1); uv[k * 2 + 1] = j / (N - 1)
  }
  const geo = new T.BufferGeometry()
  geo.setAttribute('position', new T.BufferAttribute(pos, 3))
  geo.setAttribute('normal', new T.BufferAttribute(nor, 3))
  geo.setAttribute('color', new T.BufferAttribute(col, 3))
  geo.setAttribute('uv', new T.BufferAttribute(uv, 2))
  geo.setIndex(idx)
  const grain = grainTex(T, stage)
  grain.repeat.set(9, 9)
  const bump = stage.keep(bumpyNormal(T, 10, 1))
  bump.wrapS = bump.wrapT = T.RepeatWrapping
  bump.repeat.set(14, 14)
  const mat = new T.MeshStandardMaterial({ vertexColors: true, map: grain, normalMap: bump, normalScale: new T.Vector2(0.55, 0.55), roughness: 0.96 })
  const mesh = new T.Mesh(geo, mat)
  mesh.receiveShadow = true; mesh.castShadow = true
  // L'eau des douves : la même grille, au niveau de l'eau (cachée sous le sable ailleurs)
  const wgeo = new T.BufferGeometry()
  wgeo.setAttribute('position', new T.BufferAttribute(wpos, 3))
  wgeo.setIndex(idx)
  const wmat = new T.MeshPhysicalMaterial({ color: '#3FA8D8', roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, opacity: 0.72, depthWrite: false })
  const water = new T.Mesh(wgeo, wmat)
  water.renderOrder = 2

  const sync = (sd: Sand) => {
    const d = takeDirty(sd)
    if (!d) return
    // Une marge d'une case : les normales du bord dépendent des voisins
    const i0 = Math.max(0, d.i0 - 1), i1 = Math.min(N - 1, d.i1 + 1), j0 = Math.max(0, d.j0 - 1), j1 = Math.min(N - 1, d.j1 + 1)
    const h = sd.h
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * N + i
      pos[k * 3 + 1] = h[k]
      const hl = h[j * N + Math.max(0, i - 1)], hr = h[j * N + Math.min(N - 1, i + 1)]
      const hd = h[Math.max(0, j - 1) * N + i], hu = h[Math.min(N - 1, j + 1) * N + i]
      let nx = (hl - hr) / (2 * CELL), nz = (hd - hu) / (2 * CELL), ny = 1
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l
      nor[k * 3] = nx; nor[k * 3 + 1] = ny; nor[k * 3 + 2] = nz
      const w = Math.min(1, sd.wet[k] + (sd.wl[k] > h[k] ? 0.3 : 0))
      const n = noise[k]
      for (let c = 0; c < 3; c++) col[k * 3 + c] = DRY_C[c] + (WET_C[c] - DRY_C[c]) * w + n
      // L'eau : à son niveau là où elle est ; à côté, elle file à plat sous le
      // sable (sans quoi elle remonterait le long des tours) ; ailleurs, sous le sable
      if (sd.wl[k] > h[k]) wpos[k * 3 + 1] = sd.wl[k]
      else {
        let lv = h[k] - 0.01
        for (const n of [k - 1, k + 1, k - N, k + N, k - N - 1, k - N + 1, k + N - 1, k + N + 1]) if (n >= 0 && n < N * N && sd.wl[n] > h[n]) lv = Math.min(lv, sd.wl[n])
        wpos[k * 3 + 1] = lv
      }
    }
    const a = j0 * N * 3, n = (j1 - j0 + 1) * N * 3
    for (const name of ['position', 'normal', 'color'] as const) {
      const at = geo.attributes[name] as import('three').BufferAttribute
      at.clearUpdateRanges(); at.addUpdateRange(a, n); at.needsUpdate = true
    }
    const wa = wgeo.attributes.position as import('three').BufferAttribute
    wa.clearUpdateRanges(); wa.addUpdateRange(a, n); wa.needsUpdate = true
    geo.computeBoundingSphere()
    wgeo.computeBoundingSphere()
  }
  s.dirty = { i0: 0, j0: 0, i1: N - 1, j1: N - 1 }
  sync(s)
  const soak = (k: number) => mat.color.setRGB(1 - k * (1 - WET_C[0] / DRY_C[0]) * 0.9, 1 - k * (1 - WET_C[1] / DRY_C[1]) * 0.9, 1 - k * (1 - WET_C[2] / DRY_C[2]) * 0.9)
  return { mesh, water, sync, soak }
}

/* ---------- Le ciel, la mer, la plage autour ---------- */

export interface Seaside {
  /** 0 : plein jour, 1 : le soleil se couche. */
  setDusk(k: number): void
  /** Le niveau de la mer (la marée). */
  setSea(y: number): void
  step(t: number): void
}

const SKY_V = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.9999; }`
const SKY_F = `
uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uSun; uniform vec3 uSunC; varying vec3 vDir;
void main(){
  float h = clamp(vDir.y, 0.0, 1.0);
  vec3 c = mix(uHor, uTop, pow(h, 0.55));
  float s = max(dot(normalize(vDir), normalize(uSun)), 0.0);
  c += uSunC * (pow(s, 900.0) * 6.0 + pow(s, 24.0) * 0.35 + pow(s, 4.0) * 0.12);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`
const SEA_V = `
uniform float uT; uniform float uSea;
varying vec3 vW; varying vec3 vN; varying float vDepth; varying float vCrest;
float beach(float z){ return z < ${SHORE_Z.toFixed(2)} ? (z - (${SHORE_Z.toFixed(2)})) * ${SLOPE.toFixed(2)} : 0.0; }
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  float depth = uSea - beach(w.z);
  // Les vagues arrivent vers la plage (+z) ; plus basses là où l'eau est peu profonde
  float amp = 0.035 * smoothstep(0.0, 0.35, depth) + 0.008;
  float ph = w.z * 3.6 - uT * 2.1 + sin(w.x * 0.6) * 0.8;
  float ph2 = w.x * 2.3 + w.z * 1.7 + uT * 1.3;
  float y = sin(ph) * amp + sin(ph2) * 0.008;
  w.y += y;
  float dz = cos(ph) * 3.6 * amp + cos(ph2) * 1.7 * 0.008;
  float dx = cos(ph) * 0.48 * cos(w.x * 0.6) * amp + cos(ph2) * 2.3 * 0.008;
  vN = normalize(vec3(-dx, 1.0, -dz));
  vCrest = sin(ph);
  vDepth = depth;
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`
const SEA_F = `
uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSky; uniform vec3 uHor; uniform vec3 uSun; uniform vec3 uSunC; uniform float uT;
varying vec3 vW; varying vec3 vN; varying float vDepth; varying float vCrest;
void main(){
  vec3 V = normalize(cameraPosition - vW);
  vec3 N = normalize(vN);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 c = mix(uShallow, uDeep, smoothstep(0.0, 0.45, vDepth));
  c = mix(c, uSky, fres * 0.65);
  vec3 H = normalize(normalize(uSun) + V);
  c += uSunC * pow(max(dot(N, H), 0.0), 180.0) * 1.6;
  // L'écume : au bord (l'eau qui lèche le sable) et sur la crête des vagues près du bord
  float edge = 1.0 - smoothstep(0.0, 0.035, vDepth);
  float wash = smoothstep(0.7, 0.98, vCrest) * (1.0 - smoothstep(0.02, 0.22, vDepth));
  // Une dentelle irrégulière (des sinus de fréquences sans rapport : pas de motif qui se répète)
  float lace = 0.5 + 0.18 * sin(vW.x * 13.7 + vW.z * 5.1 + uT * 0.7) + 0.17 * sin(vW.x * 7.3 - vW.z * 11.9 - uT * 0.5) + 0.15 * sin(vW.x * 29.1 + vW.z * 23.3);
  float foam = clamp(edge * (0.55 + 0.45 * lace) + wash * (0.4 + 0.6 * lace), 0.0, 1.0);
  c = mix(c, vec3(0.97, 0.98, 1.0), foam * 0.85);
  // Au loin, la mer se fond dans l'horizon
  float far = smoothstep(9.0, 34.0, length(vW.xz - cameraPosition.xz));
  c = mix(c, uHor, far);
  float a = clamp(smoothstep(-0.005, 0.04, vDepth) * 0.8 + foam * 0.3 + far, 0.0, 1.0);
  gl_FragColor = vec4(c, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

const C = (T: T3, a: string, b: string, k: number) => new T.Color(a).lerp(new T.Color(b), k)

export function buildSeaside(T: T3, stage: Stage): Seaside {
  const S = stage.scene
  // Le ciel
  const skyU = { uTop: { value: new T.Color('#3F9BE6') }, uHor: { value: new T.Color('#D6EEFA') }, uSun: { value: new T.Vector3(0.3, 0.55, -1) }, uSunC: { value: new T.Color('#FFF2D2') } }
  const sky = new T.Mesh(new T.SphereGeometry(90, 32, 16), new T.ShaderMaterial({ uniforms: skyU, vertexShader: SKY_V, fragmentShader: SKY_F, side: T.BackSide, depthWrite: false, fog: false }))
  sky.renderOrder = -1
  S.add(sky)
  // La plage autour de la grille
  const bw = 40, bd = 24, bseg = [80, 60] as const
  const bgeo = new T.PlaneGeometry(bw, bd, bseg[0], bseg[1])
  bgeo.rotateX(-Math.PI / 2)
  bgeo.translate(0, 0, -bd / 2 + 7)
  const bp = bgeo.attributes.position as import('three').BufferAttribute
  const bcol = new Float32Array(bp.count * 3)
  for (let i = 0; i < bp.count; i++) bp.setY(i, beachY(bp.getX(i), bp.getZ(i)))
  bgeo.computeVertexNormals()
  bgeo.setAttribute('color', new T.BufferAttribute(bcol, 3))
  const grain = grainTex(T, stage)
  grain.repeat.set(60, 36)
  const bump = stage.keep(bumpyNormal(T, 10, 1)); bump.wrapS = bump.wrapT = T.RepeatWrapping; bump.repeat.set(90, 54)
  const beach = new T.Mesh(bgeo, new T.MeshStandardMaterial({ vertexColors: true, map: grain, normalMap: bump, normalScale: new T.Vector2(0.5, 0.5), roughness: 0.96 }))
  beach.receiveShadow = true
  S.add(beach)
  const paintBeach = (sea: number) => {
    for (let i = 0; i < bp.count; i++) {
      const y = bp.getY(i)
      // Le sable mouillé par les vagues, juste au-dessus de l'eau
      const w = 1 - Math.min(1, Math.max(0, (y - sea) / 0.09))
      const n = Math.sin(bp.getX(i) * 7.1) * Math.cos(bp.getZ(i) * 5.3) * 0.02
      for (let c = 0; c < 3; c++) bcol[i * 3 + c] = DRY_C[c] + (WET_C[c] - DRY_C[c]) * w * 0.9 + n
    }
    ;(bgeo.attributes.color as import('three').BufferAttribute).needsUpdate = true
  }
  // La mer
  const seaU = {
    uT: { value: 0 }, uSea: { value: SEA_LOW },
    uDeep: { value: new T.Color('#1260A0') }, uShallow: { value: new T.Color('#3FC6C8') }, uSky: { value: new T.Color('#A9D8F5') },
    uHor: { value: new T.Color('#D6EEFA') }, uSun: { value: skyU.uSun.value }, uSunC: { value: new T.Color('#FFF2D2') }
  }
  const sgeo = new T.PlaneGeometry(80, 44, 160, 110)
  sgeo.rotateX(-Math.PI / 2)
  sgeo.translate(0, 0, -44 / 2 + 3)
  const sea = new T.Mesh(sgeo, new T.ShaderMaterial({ uniforms: seaU, vertexShader: SEA_V, fragmentShader: SEA_F, transparent: true, depthWrite: false }))
  sea.position.y = SEA_LOW
  sea.renderOrder = 1
  S.add(sea)
  paintBeach(SEA_LOW)
  let lastSea = SEA_LOW
  const sun = stage.sun!
  const hemi = S.children.find(o => (o as import('three').HemisphereLight).isHemisphereLight) as import('three').HemisphereLight | undefined
  const fog = S.fog as import('three').Fog | null
  const hemiI = hemi?.intensity ?? 1
  return {
    setDusk(k) {
      skyU.uTop.value.copy(C(T, '#3F9BE6', '#3E4C93', k))
      skyU.uHor.value.copy(C(T, '#D6EEFA', '#FFA36E', k))
      skyU.uSunC.value.copy(C(T, '#FFF2D2', '#FF8A4C', k))
      skyU.uSun.value.set(0.3 - k * 0.1, 0.55 - k * 0.5, -1).normalize()
      seaU.uDeep.value.copy(C(T, '#1260A0', '#36407A', k))
      seaU.uShallow.value.copy(C(T, '#3FC6C8', '#E89A7A', k))
      seaU.uSky.value.copy(C(T, '#A9D8F5', '#FFB385', k))
      seaU.uHor.value.copy(skyU.uHor.value)
      seaU.uSunC.value.copy(skyU.uSunC.value)
      sun.color.copy(C(T, '#FFF1DA', '#FF9A5C', k))
      sun.intensity = 2.6 - k * 1.3
      sun.position.set(-3.0 + k * 1.5, 4.4 - k * 2.8, 1.0 - k * 6)
      if (hemi) { hemi.color.copy(C(T, '#DDEFFF', '#FF9F7A', k)); hemi.groundColor.copy(C(T, '#E8C9A0', '#7A4A60', k)); hemi.intensity = hemiI * (1 - 0.3 * k) }
      if (fog) fog.color.copy(skyU.uHor.value)
      stage.scene.environmentIntensity = 0.6 - k * 0.38
    },
    setSea(y) {
      sea.position.y = y
      seaU.uSea.value = y
      if (Math.abs(y - lastSea) > 0.004) { lastSea = y; paintBeach(y) }
    },
    step(t) { seaU.uT.value = t }
  }
}

/* ---------- Le décor de la plage : la serviette, le seau, la pelle ---------- */

export function buildProps(T: T3, stage: Stage) {
  const S = stage.scene
  const std = (color: string, o: Partial<import('three').MeshStandardMaterialParameters> = {}) => new T.MeshStandardMaterial({ color, roughness: 0.55, ...o })
  const shadowed = <O extends import('three').Object3D>(o: O) => { o.traverse(x => { x.castShadow = true; x.receiveShadow = true }); return o }
  // La serviette rayée, un coin replié
  const tw = canvasTex(T, stage, 256, 512, g => {
    const cols = ['#FF8FB5', '#FFFFFF', '#4FB8E7', '#FFFFFF', '#FFD34D', '#FFFFFF']
    for (let i = 0; i < 16; i++) { g.fillStyle = cols[i % cols.length]; g.fillRect(0, i * 32, 256, 32) }
    g.fillStyle = 'rgba(255,255,255,.35)'; for (let y = 0; y < 512; y += 4) g.fillRect(0, y, 256, 1)
  })
  const tgeo = new T.PlaneGeometry(0.95, 1.8, 24, 40)
  tgeo.rotateX(-Math.PI / 2)
  const tp = tgeo.attributes.position as import('three').BufferAttribute
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i), z = tp.getZ(i)
    let y = 0.006 + Math.sin(x * 9 + z * 3) * 0.004 + Math.sin(z * 6) * 0.003
    // Le coin replié
    const fold = x + z * 0.6 - 0.95
    if (fold > 0) y += fold * 0.25
    tp.setY(i, y)
  }
  tgeo.computeVertexNormals()
  const towel = new T.Mesh(tgeo, new T.MeshStandardMaterial({ map: tw, roughness: 0.95, side: T.DoubleSide }))
  towel.position.set(2.15, 0, 0.7); towel.rotation.y = 0.35
  towel.receiveShadow = true
  S.add(towel)
  // Le seau et la pelle, posés sur la serviette
  const pail = new T.Group()
  const pgeo = new T.LatheGeometry([[0.001, 0], [0.11, 0], [0.14, 0.2], [0.15, 0.205], [0.15, 0.215], [0.137, 0.21], [0.105, 0.012], [0.001, 0.012]].map(([a, b]) => new T.Vector2(a, b)), 32)
  pail.add(new T.Mesh(pgeo, new T.MeshPhysicalMaterial({ color: '#2F9BE0', roughness: 0.35, clearcoat: 0.6, side: T.DoubleSide })))
  const handle = new T.Mesh(new T.TorusGeometry(0.15, 0.007, 8, 24, Math.PI), std('#FFD34D')); handle.position.y = 0.2; handle.rotation.y = 0.4; pail.add(handle)
  pail.position.set(1.95, 0.01, 0.15); pail.rotation.z = 0.04
  S.add(shadowed(pail))
  const shovel = makeShovel(T)
  shovel.position.set(2.35, 0.03, 1.05); shovel.rotation.set(-Math.PI / 2 + 0.06, 0, 0.9)
  S.add(shadowed(shovel))
  // Quelques coquillages perdus sur la plage, hors de la grille
  for (const [x, z, r] of [[-1.9, 1.2, 0.4], [1.7, -1.75, 2], [-1.75, -1.85, 1.1]] as const) {
    const sh = decoObject(T, 'coquillage'); sh.position.set(x, beachY(x, z) + 0.005, z); sh.rotation.y = r; S.add(shadowed(sh))
  }
  return { pail, shovel }
}

/** La pelle jaune : un manche, une pelle bombée (le long de −y, la pointe en bas). */
export function makeShovel(T: T3) {
  const g = new T.Group()
  const m = new T.MeshPhysicalMaterial({ color: '#FFC93C', roughness: 0.35, clearcoat: 0.6, side: T.DoubleSide })
  const stick = new T.Mesh(new T.CylinderGeometry(0.014, 0.016, 0.42, 10), m); stick.position.y = 0.21; g.add(stick)
  const grip = new T.Mesh(new T.TorusGeometry(0.04, 0.012, 8, 18), m); grip.position.y = 0.44; g.add(grip)
  const blade = new T.PlaneGeometry(0.13, 0.15, 8, 8)
  const bp = blade.attributes.position as import('three').BufferAttribute
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), y = bp.getY(i)
    // Bombée, la pointe arrondie
    bp.setZ(i, -x * x * 3.5)
    if (y < -0.04) bp.setX(i, x * (1 - (-0.04 - y) / 0.035 * 0.45))
  }
  blade.computeVertexNormals()
  const b = new T.Mesh(blade, m); b.position.y = -0.07; g.add(b)
  return g
}

/* ---------- Les moules : la forme même de leur sable, en plastique ---------- */

export const MOLD_COLOR: Record<Mold, string> = { tour: '#E8414F', creneaux: '#2F9BE0', coquillage: '#F27BAA', etoile: '#FFC93C', tortue: '#45B86A' }

/** Le moule, posé à l'endroit (sa forme vers le haut, l'ouverture en bas). */
export function moldObject(T: T3, m: Mold) {
  const R = MOLD_R[m] * 1.5, n = 44
  const pos: number[] = [], idx: number[] = []
  const inside: boolean[] = []
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const x = (i / n * 2 - 1) * R, z = (j / n * 2 - 1) * R
    // Le plastique épouse la forme, un peu plus large qu'elle (on en voit l'épaisseur)
    let hgt: number | null = null
    for (const [ox, oz] of [[0, 0], [0.008, 0], [-0.008, 0], [0, 0.008], [0, -0.008]]) {
      const v = moldHeight(m, x + ox, z + oz)
      if (v !== null) hgt = Math.max(hgt ?? -1, v)
    }
    inside.push(hgt !== null)
    pos.push(x, hgt !== null ? hgt + 0.008 : 0, z)
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1
    if (!inside[a] && !inside[b] && !inside[c] && !inside[d]) continue
    idx.push(a, c, b, b, c, d)
  }
  const geo = new T.BufferGeometry()
  geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  const mesh = new T.Mesh(geo, new T.MeshPhysicalMaterial({ color: MOLD_COLOR[m], roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.15, side: T.DoubleSide }))
  mesh.castShadow = true
  const g = new T.Group()
  g.add(mesh)
  return g
}

/** Une vignette du moule vu d'en haut, ombrée d'après sa forme (un rendu, pas un dessin). */
export function moldIcon(m: Mold, px = 72): string {
  const c = Object.assign(document.createElement('canvas'), { width: px, height: px })
  const g = c.getContext('2d')!
  const img = g.createImageData(px, px)
  const R = MOLD_R[m] * 1.5
  const base = MOLD_COLOR[m].match(/\w\w/g)!.map(h => parseInt(h, 16))
  const H = (x: number, z: number) => moldHeight(m, x, z)
  const e = R / px * 2
  for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
    const wx = (x / px * 2 - 1) * R, wz = (y / px * 2 - 1) * R
    const h = H(wx, wz)
    if (h === null) continue
    const dx = ((H(wx + e, wz) ?? 0) - (H(wx - e, wz) ?? 0)) / (2 * e), dz = ((H(wx, wz + e) ?? 0) - (H(wx, wz - e) ?? 0)) / (2 * e)
    const l = Math.max(0.25, Math.min(1.25, 0.8 + (-dx * 0.6 - dz * 0.8) * 0.7 + h * 1.2))
    const k = (y * px + x) * 4
    img.data[k] = Math.min(255, base[0] * l); img.data[k + 1] = Math.min(255, base[1] * l); img.data[k + 2] = Math.min(255, base[2] * l); img.data[k + 3] = 255
  }
  g.putImageData(img, 0, 0)
  return c.toDataURL()
}

/* ---------- Les décorations ---------- */

export type DecoKind = 'coquillage' | 'galet' | 'etoile' | 'drapeau' | 'baton'
export const DECOS: DecoKind[] = ['coquillage', 'galet', 'etoile', 'drapeau', 'baton']

export function decoObject(T: T3, k: DecoKind, tint?: string): Grp {
  const g = new T.Group()
  const add = (o: import('three').Mesh) => { o.castShadow = true; o.receiveShadow = true; g.add(o); return o }
  if (k === 'coquillage') {
    // Une coquille Saint-Jacques : un éventail à côtes, rose nacré, ses deux oreilles
    const geo = new T.BufferGeometry(), pos: number[] = [], col: number[] = [], idx: number[] = []
    const nr = 10, nt = 28, R = 0.07
    const c0 = new T.Color(tint ?? '#F7C6C0'), c1 = new T.Color('#FFF4EC')
    for (let r = 0; r <= nr; r++) for (let t = 0; t <= nt; t++) {
      const rr = r / nr, th = (t / nt - 0.5) * 2.3
      const rib = Math.cos(th * 9 * 1.2) * 0.004 * rr
      const x = Math.sin(th) * rr * R, z = Math.cos(th) * rr * R
      const y = 0.022 * Math.sqrt(Math.max(0, 1 - rr * rr * 0.9)) * rr + rib + 0.003
      pos.push(x, y, z - R * 0.45)
      const c = c0.clone().lerp(c1, 0.5 + 0.5 * Math.cos(rr * 10))
      col.push(c.r, c.g, c.b)
    }
    for (let r = 0; r < nr; r++) for (let t = 0; t < nt; t++) {
      const a = r * (nt + 1) + t, b = a + 1, c = a + nt + 1, d = c + 1
      idx.push(a, c, b, b, c, d)
    }
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3))
    geo.setAttribute('color', new T.Float32BufferAttribute(col, 3))
    geo.setIndex(idx); geo.computeVertexNormals()
    add(new T.Mesh(geo, new T.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.35, clearcoat: 0.5, sheen: 0.6, sheenColor: new T.Color('#FFFFFF'), side: T.DoubleSide })))
    for (const s of [-1, 1]) {
      const ear = add(new T.Mesh(new T.BoxGeometry(0.022, 0.006, 0.016), new T.MeshStandardMaterial({ color: c0, roughness: 0.4 })))
      ear.position.set(s * 0.014, 0.004, -R * 0.47)
    }
  } else if (k === 'galet') {
    const geo = new T.SphereGeometry(0.05, 18, 12)
    const p = geo.attributes.position as import('three').BufferAttribute
    for (let i = 0; i < p.count; i++) { const n = 1 + Math.sin(p.getX(i) * 60) * 0.03 + Math.cos(p.getZ(i) * 50) * 0.03; p.setXYZ(i, p.getX(i) * n, p.getY(i) * n, p.getZ(i) * n) }
    geo.computeVertexNormals()
    const m = add(new T.Mesh(geo, new T.MeshPhysicalMaterial({ color: tint ?? '#9AA3AE', roughness: 0.45, clearcoat: 0.4 })))
    m.scale.set(1.1, 0.45, 0.8); m.position.y = 0.015
  } else if (k === 'etoile') {
    // L'étoile de mer : cinq bras dodus, piquetés de petites bosses
    const sh = new T.Shape()
    for (let i = 0; i <= 10; i++) {
      const a = i / 10 * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.026 : 0.075
      const x = Math.cos(a) * r, y = Math.sin(a) * r
      if (i === 0) sh.moveTo(x, y); else sh.quadraticCurveTo(Math.cos(a - Math.PI / 10) * (r === 0.026 ? 0.05 : 0.045), Math.sin(a - Math.PI / 10) * (r === 0.026 ? 0.05 : 0.045), x, y)
    }
    const geo = new T.ExtrudeGeometry(sh, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.009, bevelSize: 0.01, bevelSegments: 4, curveSegments: 6 })
    geo.rotateX(-Math.PI / 2)
    const mat = new T.MeshStandardMaterial({ color: tint ?? '#FF8A3D', roughness: 0.7 })
    const body = add(new T.Mesh(geo, mat)); body.position.y = 0.01
    const dot = new T.MeshStandardMaterial({ color: '#FFD9A8', roughness: 0.6 })
    for (let a = 0; a < 5; a++) for (let r = 1; r <= 3; r++) {
      const ang = a / 5 * Math.PI * 2 + Math.PI / 2
      const b = add(new T.Mesh(new T.SphereGeometry(0.006, 6, 4), dot))
      b.position.set(Math.cos(ang) * r * 0.017, 0.028, -Math.sin(ang) * r * 0.017)
    }
  } else if (k === 'drapeau') {
    const stick = add(new T.Mesh(new T.CylinderGeometry(0.005, 0.005, 0.32, 8), new T.MeshStandardMaterial({ color: '#8A5A32', roughness: 0.7 })))
    stick.position.y = 0.16
    const cloth = new T.PlaneGeometry(0.13, 0.08, 8, 4)
    cloth.translate(0.065, 0, 0)
    const f = add(new T.Mesh(cloth, new T.MeshStandardMaterial({ color: tint ?? '#E8414F', roughness: 0.75, side: T.DoubleSide })))
    f.position.y = 0.27
    f.userData.flag = true
    const top = add(new T.Mesh(new T.SphereGeometry(0.009, 10, 8), new T.MeshStandardMaterial({ color: '#FFD34D', metalness: 0.6, roughness: 0.3 })))
    top.position.y = 0.325
  } else {
    // Le bâtonnet : une brindille d'écorce, un petit rameau
    const curve = new T.CatmullRomCurve3([new T.Vector3(0, -0.03, 0), new T.Vector3(0.01, 0.08, 0), new T.Vector3(-0.005, 0.17, 0.008), new T.Vector3(0.008, 0.24, 0)])
    const bark = new T.MeshStandardMaterial({ color: tint ?? '#8C6A48', roughness: 0.9 })
    add(new T.Mesh(new T.TubeGeometry(curve, 16, 0.009, 7, false), bark))
    const twig = new T.CatmullRomCurve3([new T.Vector3(0.006, 0.13, 0), new T.Vector3(0.04, 0.17, 0.004), new T.Vector3(0.06, 0.2, 0)])
    add(new T.Mesh(new T.TubeGeometry(twig, 8, 0.005, 6, false), bark))
    const leaf = add(new T.Mesh(new T.SphereGeometry(0.014, 10, 6), new T.MeshStandardMaterial({ color: '#7DB85A', roughness: 0.7 })))
    leaf.scale.set(1.4, 0.4, 0.8); leaf.position.set(0.064, 0.205, 0)
  }
  g.userData.deco = k
  return g
}

/** Le drapeau flotte au vent. */
export function waveFlags(o: import('three').Object3D, t: number) {
  o.traverse(x => {
    if (!x.userData.flag) return
    const p = ((x as import('three').Mesh).geometry.attributes.position) as import('three').BufferAttribute
    if (!x.userData.rest) x.userData.rest = Float32Array.from(p.array as Float32Array)
    const r = x.userData.rest as Float32Array
    for (let i = 0; i < p.count; i++) { const px = r[i * 3]; p.setZ(i, Math.sin(px * 40 - t * 7 + o.position.x * 3) * 0.012 * (px / 0.13)) }
    p.needsUpdate = true
  })
}

/* ---------- Le crabe ---------- */

export interface Crab { g: Grp; legs: import('three').Object3D[]; claws: import('three').Object3D[]; eyes: import('three').Object3D[] }

export function makeCrab(T: T3): Crab {
  const g = new T.Group()
  const shell = new T.MeshPhysicalMaterial({ color: '#E8573C', roughness: 0.45, clearcoat: 0.5 })
  const pale = new T.MeshStandardMaterial({ color: '#F28A6A', roughness: 0.6 })
  const add = (o: import('three').Mesh, p: import('three').Object3D = g) => { o.castShadow = true; p.add(o); return o }
  const body = add(new T.Mesh(new T.SphereGeometry(0.05, 20, 14), shell))
  body.scale.set(1.35, 0.58, 1); body.position.y = 0.045
  const belly = add(new T.Mesh(new T.SphereGeometry(0.048, 16, 10), pale)); belly.scale.set(1.25, 0.35, 0.92); belly.position.y = 0.036
  // Les yeux sur leurs tiges, qui regardent devant (+z)
  const eyes: import('three').Object3D[] = []
  for (const s of [-1, 1]) {
    const e = new T.Group(); e.position.set(s * 0.02, 0.06, 0.03); g.add(e)
    add(new T.Mesh(new T.CylinderGeometry(0.004, 0.005, 0.03, 6), pale), e).position.y = 0.015
    add(new T.Mesh(new T.SphereGeometry(0.009, 12, 8), new T.MeshPhysicalMaterial({ color: '#1A1414', roughness: 0.1, clearcoat: 1 })), e).position.y = 0.033
    const glint = add(new T.Mesh(new T.SphereGeometry(0.003, 6, 4), new T.MeshBasicMaterial({ color: '#FFFFFF' })), e); glint.position.set(0.003, 0.037, 0.006)
    eyes.push(e)
  }
  // Les pinces, à l'avant
  const claws: import('three').Object3D[] = []
  for (const s of [-1, 1]) {
    const arm = new T.Group(); arm.position.set(s * 0.055, 0.04, 0.03); g.add(arm)
    const up = add(new T.Mesh(new T.CapsuleGeometry(0.008, 0.03, 4, 8), shell), arm); up.rotation.z = s * 1.0; up.position.set(s * 0.012, 0.008, 0.008)
    const hand = new T.Group(); hand.position.set(s * 0.03, 0.022, 0.03); arm.add(hand)
    const palm = add(new T.Mesh(new T.SphereGeometry(0.017, 12, 8), shell), hand); palm.scale.set(1, 0.7, 1.3)
    const top = add(new T.Mesh(new T.ConeGeometry(0.008, 0.03, 8), shell), hand); top.rotation.x = Math.PI / 2; top.position.set(0, 0.006, 0.026)
    const bot = add(new T.Mesh(new T.ConeGeometry(0.007, 0.026, 8), pale), hand); bot.rotation.x = Math.PI / 2; bot.position.set(0, -0.006, 0.024)
    bot.userData.jaw = true
    claws.push(arm)
  }
  // Six pattes, trois de chaque côté
  const legs: import('three').Object3D[] = []
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const leg = new T.Group(); leg.position.set(s * 0.05, 0.04, 0.012 - i * 0.022); g.add(leg)
    const a = add(new T.Mesh(new T.CapsuleGeometry(0.005, 0.035, 4, 6), shell), leg); a.rotation.z = s * 1.05; a.position.set(s * 0.018, 0.008, 0)
    const b = add(new T.Mesh(new T.CapsuleGeometry(0.004, 0.035, 4, 6), shell), leg); b.rotation.z = -s * 0.5; b.position.set(s * 0.042, -0.012, 0)
    leg.userData.side = s; leg.userData.i = i
    legs.push(leg)
  }
  return { g, legs, claws, eyes }
}

/* ---------- Les mouettes ---------- */

export function makeGull(T: T3) {
  const g = new T.Group()
  const white = new T.MeshStandardMaterial({ color: '#FBFBF8', roughness: 0.6 })
  const grey = new T.MeshStandardMaterial({ color: '#AEB6C0', roughness: 0.6, side: T.DoubleSide })
  const body = new T.Mesh(new T.CapsuleGeometry(0.06, 0.18, 6, 12), white); body.rotation.z = Math.PI / 2; g.add(body)
  const head = new T.Mesh(new T.SphereGeometry(0.055, 14, 10), white); head.position.set(0.15, 0.03, 0); g.add(head)
  const beak = new T.Mesh(new T.ConeGeometry(0.016, 0.06, 8), new T.MeshStandardMaterial({ color: '#FFB03A', roughness: 0.5 })); beak.rotation.z = -Math.PI / 2; beak.position.set(0.22, 0.02, 0); g.add(beak)
  for (const s of [-1, 1]) {
    const eye = new T.Mesh(new T.SphereGeometry(0.008, 6, 4), new T.MeshBasicMaterial({ color: '#202020' })); eye.position.set(0.18, 0.05, s * 0.04); g.add(eye)
  }
  const tail = new T.Mesh(new T.ConeGeometry(0.05, 0.1, 4), grey); tail.rotation.z = Math.PI / 2; tail.scale.set(1, 1, 0.3); tail.position.set(-0.17, 0, 0); g.add(tail)
  const wings: import('three').Object3D[] = []
  for (const s of [-1, 1]) {
    const w = new T.Group(); w.position.set(0, 0.03, s * 0.04); g.add(w)
    const sh = new T.Shape(); sh.moveTo(0.06, 0); sh.lineTo(-0.06, 0); sh.quadraticCurveTo(-0.1, 0.2, -0.05, 0.42); sh.quadraticCurveTo(0.05, 0.25, 0.06, 0)
    const geo = new T.ShapeGeometry(sh, 8); geo.rotateX(s * Math.PI / 2)
    w.add(new T.Mesh(geo, grey))
    wings.push(w)
  }
  g.userData.wings = wings
  return g
}

/* ---------- La vague qui chante : un souffle filtré qui va et vient ---------- */

export function surf(ac: AudioContext) {
  const len = ac.sampleRate * 3
  const buf = ac.createBuffer(1, len, ac.sampleRate)
  const d = buf.getChannelData(0)
  let last = 0
  for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.2 }
  const src = ac.createBufferSource(); src.buffer = buf; src.loop = true
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900
  const gain = ac.createGain(); gain.gain.value = 0
  src.connect(lp); lp.connect(gain); gain.connect(ac.destination)
  src.start()
  return {
    /** `k` : le souffle de la vague (0..1), `vol` : le volume d'ensemble. */
    set(k: number, vol: number) {
      const t = ac.currentTime
      gain.gain.setTargetAtTime(vol * (0.05 + 0.25 * k), t, 0.12)
      lp.frequency.setTargetAtTime(500 + 1400 * k, t, 0.12)
    },
    stop() { try { gain.gain.setTargetAtTime(0, ac.currentTime, 0.1); src.stop(ac.currentTime + 0.5) } catch { /* déjà arrêté */ } }
  }
}
