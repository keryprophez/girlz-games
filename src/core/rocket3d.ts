/* ---------- LA FUSÉE DE L'ESPACE (28/09) ----------
   La fusée « A » commandée à Canva (blanche et rouge, hublot, ailerons en
   faux), reconstruite en vraie 3D pour qu'elle tourne avec la caméra :
   l'image ne sert que de modèle. Proportions relevées sur l'image redressée
   (longueur 1, de la sortie de tuyère en y = −0,5 à la pointe en y = +0,5).
   Ce qui lui donne l'air « rendu » : une peinture rouge vernie, une coque
   métallisée avec ses joints et ses rivets, et un environnement qui reflète
   le Soleil là où il est vraiment (`update` tourne ses reflets vers lui).
   L'axe de la fusée est +Y ; son hublot regarde +Z. */
import type { Stage, T3 } from './three3d'

type V3 = import('three').Vector3
type Obj3 = import('three').Object3D

export interface Rocket {
  group: import('three').Group
  /** `thrust` 0..1 : la flamme ; `sunDir` : direction du Soleil vue de la fusée (monde). */
  update(now: number, thrust: number, sunDir?: V3): void
}

/** Le profil de la coque (rayon, hauteur), de la bague à la jonction du nez. */
const HULL: [number, number][] = [
  [0.1, -0.323], [0.108, -0.27], [0.116, -0.2], [0.122, -0.12], [0.127, -0.01],
  [0.131, 0.08], [0.133, 0.167], [0.13, 0.24], [0.122, 0.3], [0.111, 0.343]
]

/** Une courbe lisse passant par les points (Catmull-Rom), échantillonnée en `n` points. */
function smooth(T: T3, pts: [number, number][], n: number) {
  const c = new T.SplineCurve(pts.map(([r, y]) => new T.Vector2(r, y)))
  return c.getSpacedPoints(n - 1)
}

/** La peau de la coque : peinture argent chaud, joints de panneaux et rivets.
    Renvoie la couleur et la carte de relief (les joints sont des creux). */
function hullTextures(T: T3, stage: Stage) {
  const W = 1024, H = 512
  const col = document.createElement('canvas'); col.width = W; col.height = H
  const bump = document.createElement('canvas'); bump.width = W; bump.height = H
  const c = col.getContext('2d')!, b = bump.getContext('2d')!
  c.fillStyle = '#d9d4cb'; c.fillRect(0, 0, W, H)
  b.fillStyle = '#808080'; b.fillRect(0, 0, W, H)
  // un léger brossé en long, pour que la lumière ne tombe pas « en plastique »
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * W, y = Math.random() * H, l = 20 + Math.random() * 90
    const v = Math.random() < 0.5 ? 255 : 0
    c.fillStyle = `rgba(${v},${v},${v},0.035)`; c.fillRect(x, y, 1.2, l)
  }
  // v (vertical) suit la hauteur : y = −0,323 en bas → 0,343 en haut
  const vOf = (y: number) => H - ((y + 0.323) / 0.666) * H
  const seams = [-0.29, -0.01, 0.31]
  for (const y of seams) {
    const py = vOf(y)
    c.fillStyle = 'rgba(70,64,58,0.55)'; c.fillRect(0, py - 1.5, W, 3)
    b.fillStyle = '#303030'; b.fillRect(0, py - 2, W, 4)
    for (let k = 0; k < 48; k++) {
      const px = (k + 0.5) * (W / 48)
      for (const dy of [-7, 7]) {
        b.fillStyle = '#d8d8d8'; b.beginPath(); b.arc(px, py + dy, 2.6, 0, Math.PI * 2); b.fill()
        c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.arc(px, py + dy, 2.2, 0, Math.PI * 2); c.fill()
      }
    }
  }
  // quatre joints en long, entre les ailerons
  for (let k = 0; k < 4; k++) {
    const px = ((k + 0.5) / 4) * W
    c.fillStyle = 'rgba(70,64,58,0.35)'; c.fillRect(px - 1, 0, 2, H)
    b.fillStyle = '#404040'; b.fillRect(px - 1.5, 0, 3, H)
  }
  const map = new T.CanvasTexture(col); map.colorSpace = T.SRGBColorSpace; map.anisotropy = 4
  const bumpMap = new T.CanvasTexture(bump); bumpMap.anisotropy = 4
  ;[map, bumpMap].forEach(t => stage.keep(t))
  return { map, bumpMap }
}

/** L'environnement qu'elle reflète : un Soleil chaud, un contre-jour bleuté,
    le noir de l'espace. Le Soleil y est sur +X ; `update` le tourne. */
function spaceEnv(T: T3, stage: Stage) {
  const s = new T.Scene()
  s.background = new T.Color(0x000000)
  const sky = new T.Mesh(new T.SphereGeometry(10, 32, 16), new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vD;
    void main(){
      float sun = max(dot(vD, vec3(1.0, 0.0, 0.0)), 0.0);
      float back = max(dot(vD, vec3(-0.7, 0.35, 0.0)), 0.0);
      vec3 c = vec3(1.0, 0.86, 0.66) * (pow(sun, 3.0) * 0.9 + pow(sun, 40.0) * 6.0)
             + vec3(0.25, 0.42, 0.85) * pow(back, 2.0) * 0.55
             + vec3(0.03, 0.035, 0.05);
      gl_FragColor = vec4(c, 1.0);
    }`
  }))
  s.add(sky)
  const pm = new T.PMREMGenerator(stage.renderer)
  const tex = pm.fromScene(s, 0.02).texture
  pm.dispose()
  sky.geometry.dispose(); (sky.material as import('three').Material).dispose()
  stage.keep(tex)
  return tex
}

/** Une lueur ronde (halo de tuyère). */
function glowTex(T: T3, stage: Stage) {
  const c = document.createElement('canvas'); c.width = c.height = 128
  const g = c.getContext('2d')!
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,220,160,0.6)')
  gr.addColorStop(0.6, 'rgba(255,140,60,0.15)'); gr.addColorStop(1, 'rgba(255,120,40,0)')
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128)
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace
  stage.keep(t)
  return t
}

/** Une couche de flamme : un fuseau de révolution, additif, qui vacille. */
function flameLayer(T: T3, len: number, rad: number, hot: [number, number, number], cool: [number, number, number], gain: number) {
  const prof = smooth(T, [[0.001, 0], [rad * 0.95, -len * 0.08], [rad, -len * 0.22], [rad * 0.62, -len * 0.55], [rad * 0.2, -len * 0.85], [0.001, -len]], 24)
  const geo = new T.LatheGeometry(prof, 28)
  const mat = new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPow: { value: 0.5 }, uHot: { value: new T.Vector3(...hot) }, uCool: { value: new T.Vector3(...cool) }, uGain: { value: gain } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main(){
      vUv = uv;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
    fragmentShader: `uniform float uTime; uniform float uPow; uniform vec3 uHot; uniform vec3 uCool; uniform float uGain;
    varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main(){
      float t = vUv.y;                         // 0 à la tuyère, 1 au bout
      float face = abs(dot(normalize(vN), normalize(vV)));
      float soft = smoothstep(0.0, 0.75, face); // bords fondus
      float flick = 0.82 + 0.18 * sin(t * 26.0 - uTime * 38.0 + vUv.x * 18.85) * sin(uTime * 17.0 + t * 9.0);
      float diamonds = 1.0 + 0.22 * pow(max(sin(t * 22.0 - uTime * 3.0), 0.0), 6.0);
      float body = pow(1.0 - t, 1.3) * smoothstep(0.0, 0.06, t + 0.02);
      vec3 c = mix(uCool, uHot, pow(1.0 - t, 2.2));
      gl_FragColor = vec4(c * body * soft * flick * diamonds * uGain * (0.35 + 1.1 * uPow), 1.0);
    }`
  })
  const m = new T.Mesh(geo, mat)
  m.frustumCulled = false
  return { mesh: m, mat }
}

export function makeRocket(T: T3, stage: Stage): Rocket {
  const group = new T.Group()
  const env = spaceEnv(T, stage)
  const { map, bumpMap } = hullTextures(T, stage)
  const hull = new T.MeshPhysicalMaterial({ color: 0xffffff, map, bumpMap, bumpScale: 0.6, metalness: 0.45, roughness: 0.32, clearcoat: 0.35, clearcoatRoughness: 0.25, envMap: env, envMapIntensity: 1.1 })
  const red = new T.MeshPhysicalMaterial({ color: 0x9c1119, metalness: 0.05, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06, envMap: env, envMapIntensity: 1.2 })
  const steel = new T.MeshStandardMaterial({ color: 0xa7adb5, metalness: 1, roughness: 0.2, envMap: env, envMapIntensity: 1.3 })
  const gun = new T.MeshStandardMaterial({ color: 0x3b3f46, metalness: 0.9, roughness: 0.35, envMap: env, envMapIntensity: 1 })
  const glass = new T.MeshPhysicalMaterial({ color: 0x0a1a33, metalness: 0, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, envMap: env, envMapIntensity: 2.2, emissive: 0x16345e, emissiveIntensity: 0.35 })
  const mats = [hull, red, steel, gun, glass]
  const add = (o: Obj3) => { group.add(o); return o }

  // La coque (lathe lissé), le nez rouge en ogive, la bague sombre, la tuyère
  add(new T.Mesh(new T.LatheGeometry(smooth(T, HULL, 48), 72), hull))
  const nose = smooth(T, [[0.111, 0.341], [0.103, 0.375], [0.084, 0.415], [0.056, 0.452], [0.026, 0.482], [0.004, 0.499], [0.0, 0.5]], 32)
  add(new T.Mesh(new T.LatheGeometry(nose, 72), red))
  add(new T.Mesh(new T.LatheGeometry(smooth(T, [[0.102, -0.323], [0.094, -0.335], [0.086, -0.352], [0.084, -0.371]], 10), 64), gun))
  // la tuyère : une cloche d'acier, deux nervures, un fond sombre
  const bell: [number, number][] = [[0.058, -0.371], [0.06, -0.39], [0.066, -0.43], [0.072, -0.47], [0.077, -0.5]]
  const bellPts = smooth(T, bell, 16)
  const inner = bellPts.map(p => new T.Vector2(p.x - 0.006, p.y)).reverse()
  add(new T.Mesh(new T.LatheGeometry([...bellPts, new T.Vector2(0.077, -0.502), ...inner], 56), steel))
  for (const y of [-0.405, -0.448]) {
    const ring = new T.Mesh(new T.TorusGeometry(0.066 + (y + 0.405) * -0.2, 0.0045, 8, 48), steel)
    ring.rotation.x = Math.PI / 2; ring.position.y = y; add(ring)
  }
  const throat = new T.Mesh(new T.CircleGeometry(0.056, 32), new T.MeshBasicMaterial({ color: 0x0b0806 }))
  throat.rotation.x = Math.PI / 2; throat.position.y = -0.38; add(throat)

  // Le hublot : un dôme de verre bleu nuit dans un anneau d'acier, face +Z
  const porthole = new T.Group()
  const rHull = 0.1315
  const dome = new T.Mesh(new T.SphereGeometry(0.075, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.24), glass)
  dome.rotation.x = Math.PI / 2; dome.position.z = rHull - 0.058
  const rim = new T.Mesh(new T.TorusGeometry(0.052, 0.011, 16, 56), steel)
  rim.position.z = rHull + 0.002
  const collar = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 0.02, 48, 1, true), gun)
  collar.rotation.x = Math.PI / 2; collar.position.z = rHull - 0.006
  porthole.add(dome, rim, collar)
  porthole.position.y = 0.2
  add(porthole)

  // Quatre ailerons en faux : le bord d'attaque bombé, la pointe filant vers
  // l'arrière au-delà de la tuyère, le bord de fuite creusé
  const fin = new T.Shape()
  fin.moveTo(0.11, -0.04)
  fin.bezierCurveTo(0.24, -0.14, 0.29, -0.36, 0.215, -0.585)
  fin.bezierCurveTo(0.19, -0.5, 0.145, -0.41, 0.088, -0.35)
  fin.lineTo(0.11, -0.04)
  const finGeo = new T.ExtrudeGeometry(fin, { depth: 0.018, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 3, curveSegments: 24 })
  finGeo.translate(0, 0, -0.009)
  for (let k = 0; k < 4; k++) {
    const holder = new T.Group()
    // un aileron sous le hublot (+Z), comme sur l'image, et les trois autres à 90°
    holder.rotation.y = -Math.PI / 2 + k * (Math.PI / 2)
    holder.add(new T.Mesh(finGeo, red))
    add(holder)
  }

  group.traverse(o => { const m = o as import('three').Mesh; if (m.isMesh) { m.castShadow = false; m.receiveShadow = false } })

  // La flamme : un cœur blanc-jaune dans un fuseau orange, et une lueur ronde
  const flame = new T.Group()
  const outer = flameLayer(T, 0.62, 0.085, [1.0, 0.72, 0.32], [0.9, 0.25, 0.05], 2.2)
  const core = flameLayer(T, 0.34, 0.05, [1.0, 0.97, 0.9], [1.0, 0.7, 0.3], 4.0)
  flame.add(outer.mesh, core.mesh)
  flame.position.y = -0.5
  const glow = new T.Sprite(new T.SpriteMaterial({ map: glowTex(T, stage), color: 0xffb070, blending: T.AdditiveBlending, depthWrite: false, transparent: true }))
  glow.position.y = -0.53
  group.add(flame, glow)

  const rot = new T.Quaternion(), X = new T.Vector3(1, 0, 0), dir = new T.Vector3(), euler = new T.Euler()
  return {
    group,
    update(now, thrust, sunDir) {
      const t = now / 1000
      for (const f of [outer, core]) { f.mat.uniforms.uTime.value = t; f.mat.uniforms.uPow.value = thrust }
      const w = 0.85 + thrust * 0.4
      flame.scale.set(w, 0.45 + thrust * 1.0 + Math.sin(now / 45) * 0.05, w)
      glow.scale.setScalar(0.18 + thrust * 0.32 + Math.sin(now / 60) * 0.015)
      glow.material.opacity = 0.35 + thrust * 0.65
      if (sunDir) {
        // Les reflets suivent le vrai Soleil : l'environnement (Soleil sur +X)
        // tourne pour que son Soleil tombe dans la direction du vrai (repère
        // du monde : three applique l'inverse de cette rotation au reflet)
        rot.setFromUnitVectors(X, dir.copy(sunDir).normalize())
        euler.setFromQuaternion(rot)
        for (const m of mats) m.envMapRotation.copy(euler)
      }
    }
  }
}
