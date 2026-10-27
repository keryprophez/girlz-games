/* 🐠 L'AQUARIUM en 3D (27/10) — modelé ici, rien de Kenney : le bac vu de
   face (le verre et ses reflets, le cadre, la rampe de lumière, le meuble),
   le sable du fond et ses dunes, la lumière qui danse dessus (une texture
   de caustiques qui défile, deux couches qui se croisent : aucun calcul de
   lumière), les rayons qui tombent de la surface, les bulles du diffuseur ;
   le décor qu'on pose (algues qui ondulent, rochers moussus, château
   englouti, coffre au trésor qui s'ouvre et lâche ses bulles, coquillage,
   corail) ; les flocons de nourriture. La logique est dans `fishtank.ts`. */
import type { Stage, T3 } from './three3d'
import { woodTex } from './three3d'
import { decoObject } from './beach3d'
import type { DecoKind } from './fishtank'

type Grp = import('three').Group

/** Le bac : sa largeur (x), sa profondeur (z, de l'arrière à la vitre), le niveau de l'eau. */
export const TANK = { w: 3.1, z0: -0.55, z1: 0.45, water: 1.62, top: 1.75 }

/** Les dunes du fond : la hauteur du sable en (x, z). */
export const sandY = (x: number, z: number) => 0.09 + Math.sin(x * 1.7 + 0.6) * 0.035 + Math.cos(x * 3.1 - z * 2.4) * 0.018 - z * 0.06

const canvasTex = (T: T3, stage: Stage, w: number, h: number, f: (g: CanvasRenderingContext2D) => void, srgb = true) => {
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h })
  f(c.getContext('2d')!)
  const t = new T.CanvasTexture(c)
  if (srgb) t.colorSpace = T.SRGBColorSpace
  t.anisotropy = 4
  return stage.keep(t)
}

/** Les caustiques : un réseau de lignes claires, raccordable (des cellules de Voronoï vues par leurs bords). */
function causticTex(T: T3, stage: Stage) {
  const S = 256
  const pts: [number, number][] = []
  let seed = 9
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  for (let i = 0; i < 22; i++) pts.push([rnd() * S, rnd() * S])
  const t = canvasTex(T, stage, S, S, g => {
    const img = g.createImageData(S, S)
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let d1 = 1e9, d2 = 1e9
      for (const [px, py] of pts) for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        const d = Math.hypot(x - px - ox, y - py - oy)
        if (d < d1) { d2 = d1; d1 = d } else if (d < d2) d2 = d
      }
      const e = Math.max(0, 1 - (d2 - d1) / 7)
      const v = Math.pow(e, 2.2) * 255
      const k = (y * S + x) * 4
      img.data[k] = img.data[k + 1] = img.data[k + 2] = v; img.data[k + 3] = 255
    }
    g.putImageData(img, 0, 0)
  }, false)
  t.wrapS = t.wrapT = T.RepeatWrapping
  return t
}

const CAUSTIC_V = `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`
const CAUSTIC_F = `
uniform sampler2D uMap; uniform float uT; uniform float uK; uniform vec3 uTint; varying vec2 vUv; varying vec3 vW;
void main(){
  vec2 p = vW.xz * 1.3;
  float a = texture2D(uMap, p + vec2(uT * 0.031, uT * 0.017)).r;
  float b = texture2D(uMap, p * 1.37 + vec2(-uT * 0.023, uT * 0.029)).r;
  float c = min(a, b) * 1.6 + a * b * 0.8;
  gl_FragColor = vec4(uTint * c * uK, 1.0);
}`

export interface Tank {
  /** Chaque image : les caustiques, les rayons, les bulles, la surface. */
  step(dt: number, t: number): void
  /** Lâche des bulles en (x, y, z). */
  bubbles(x: number, y: number, z: number, n: number): void
  /** Le soir (« Fini ») : la pièce s'assombrit, le bac reste éclairé (0..1). */
  setEvening(k: number): void
  /** Le sable du fond (on y pose le décor). */
  sand: import('three').Mesh
  /** La vitre (on la tapote). */
  glass: import('three').Mesh
}

export function buildTank(T: T3, stage: Stage): Tank {
  const S = stage.scene
  const std = (color: string, o: Partial<import('three').MeshStandardMaterialParameters> = {}) => new T.MeshStandardMaterial({ color, roughness: 0.55, ...o })
  const W = TANK.w, D = TANK.z1 - TANK.z0
  // La pièce autour : le mur, le parquet (on les voit quand on recule, le soir)
  const wall = new T.Mesh(new T.PlaneGeometry(14, 7), std('#DCE6EE', { roughness: 0.95 }))
  wall.position.set(0, 1.5, TANK.z0 - 0.5); S.add(wall)
  const floorT = stage.keep(woodTex(T, '#B88A5A')); floorT.wrapS = floorT.wrapT = T.RepeatWrapping; floorT.repeat.set(4, 3)
  const floor = new T.Mesh(new T.PlaneGeometry(14, 8), new T.MeshStandardMaterial({ map: floorT, roughness: 0.7 }))
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.95; floor.receiveShadow = true; S.add(floor)
  // Le meuble en bois sous le bac
  const cab = new T.Mesh(new T.BoxGeometry(W + 0.3, 0.86, D + 0.25), new T.MeshStandardMaterial({ map: stage.keep(woodTex(T, '#8C5E3A')), roughness: 0.55 }))
  cab.position.set(0, -0.52, (TANK.z0 + TANK.z1) / 2); cab.receiveShadow = true; S.add(cab)
  for (const x of [-W / 4, W / 4]) {
    const door = new T.Mesh(new T.BoxGeometry(W / 2 - 0.14, 0.7, 0.02), new T.MeshStandardMaterial({ map: stage.keep(woodTex(T, '#9A6A44')), roughness: 0.5 }))
    door.position.set(x, -0.52, TANK.z1 + 0.135); S.add(door)
    const knob = new T.Mesh(new T.SphereGeometry(0.025, 12, 8), std('#D8B25A', { metalness: 1, roughness: 0.3 })); knob.position.set(x + (x < 0 ? 0.6 : -0.6), -0.5, TANK.z1 + 0.16); S.add(knob)
  }
  // Le fond du bac : un dégradé d'eau profonde (le poster de fond des vrais aquariums)
  const back = new T.Mesh(new T.PlaneGeometry(W, TANK.top), new T.MeshBasicMaterial({ map: canvasTex(T, stage, 64, 256, g => {
    const gr = g.createLinearGradient(0, 0, 0, 256)
    gr.addColorStop(0, '#5FC4D8'); gr.addColorStop(0.45, '#2F8DB5'); gr.addColorStop(1, '#165A86')
    g.fillStyle = gr; g.fillRect(0, 0, 64, 256)
  }), fog: false }))
  back.position.set(0, TANK.top / 2, TANK.z0 - 0.002); S.add(back)
  // Le sable et ses dunes
  const sg = new T.PlaneGeometry(W, D, 64, 22)
  sg.rotateX(-Math.PI / 2)
  sg.translate(0, 0, (TANK.z0 + TANK.z1) / 2)
  const sp = sg.attributes.position as import('three').BufferAttribute
  const scol = new Float32Array(sp.count * 3)
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i), z = sp.getZ(i)
    sp.setY(i, sandY(x, z))
    const n = Math.sin(x * 37) * Math.cos(z * 41) * 0.03 + Math.sin(x * 9 + z * 13) * 0.04
    scol[i * 3] = 0.86 + n; scol[i * 3 + 1] = 0.74 + n; scol[i * 3 + 2] = 0.55 + n
  }
  sg.setAttribute('color', new T.BufferAttribute(scol, 3))
  sg.computeVertexNormals()
  const grain = canvasTex(T, stage, 256, 256, g => {
    g.fillStyle = '#F4F0E8'; g.fillRect(0, 0, 256, 256)
    let seed = 21
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    for (let i = 0; i < 4000; i++) { const l = rnd(); g.fillStyle = l < 0.5 ? `rgba(130,100,60,${0.15 + rnd() * 0.2})` : l < 0.85 ? `rgba(255,255,250,${0.4 + rnd() * 0.4})` : `rgba(80,70,90,${0.25})`; g.fillRect(rnd() * 256, rnd() * 256, 1.2 + rnd() * 2, 1.2 + rnd() * 2) }
    // Quelques graviers colorés
    for (let i = 0; i < 70; i++) { g.fillStyle = ['#E88A7A', '#7FB8E0', '#F2D06B', '#9BD08A'][i % 4]; g.globalAlpha = 0.7; g.beginPath(); g.arc(rnd() * 256, rnd() * 256, 1.6 + rnd() * 1.6, 0, 7); g.fill() }
    g.globalAlpha = 1
  })
  grain.wrapS = grain.wrapT = T.RepeatWrapping; grain.repeat.set(7, 2.3)
  const sand = new T.Mesh(sg, new T.MeshStandardMaterial({ vertexColors: true, map: grain, color: '#F0DDBA', roughness: 0.92 }))
  sand.receiveShadow = true
  S.add(sand)
  // Le sable vu par la tranche, derrière la vitre (ses couches, ses graviers)
  const cut = new T.Shape()
  cut.moveTo(-W / 2, 0)
  for (let i = 0; i <= 48; i++) { const x = -W / 2 + W * i / 48; cut.lineTo(x, sandY(x, TANK.z1 - 0.01)) }
  cut.lineTo(W / 2, 0)
  const layers = canvasTex(T, stage, 512, 64, g => {
    const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, '#E2C99A'); gr.addColorStop(0.6, '#C8A874'); gr.addColorStop(1, '#9C7E55')
    g.fillStyle = gr; g.fillRect(0, 0, 512, 64)
    let seed = 5
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    for (let i = 0; i < 900; i++) { g.fillStyle = ['#8E7A62', '#E88A7A', '#7FB8E0', '#F2D06B', '#FFFFFF', '#6E6458'][i % 6]; g.globalAlpha = 0.55; g.beginPath(); g.ellipse(rnd() * 512, 10 + rnd() * 54, 1.5 + rnd() * 2.5, 1 + rnd() * 1.6, rnd() * 3, 0, 7); g.fill() }
  })
  const cutGeo = new T.ShapeGeometry(cut, 1)
  const cp = cutGeo.attributes.position as import('three').BufferAttribute, cuv = cutGeo.attributes.uv as import('three').BufferAttribute
  for (let i = 0; i < cp.count; i++) cuv.setXY(i, (cp.getX(i) + W / 2) / W * 4, cp.getY(i) / 0.12)
  layers.wrapS = T.RepeatWrapping
  const front = new T.Mesh(cutGeo, new T.MeshStandardMaterial({ map: layers, roughness: 0.9 }))
  front.position.z = TANK.z1 - 0.004
  S.add(front)
  // La lumière qui danse sur le sable : la même surface, un cheveu au-dessus, en lumière ajoutée
  const caus = causticTex(T, stage)
  const cu = { uMap: { value: caus }, uT: { value: 0 }, uK: { value: 0.32 }, uTint: { value: new T.Color('#DFF8FF') } }
  const cmesh = new T.Mesh(sg.clone(), new T.ShaderMaterial({ uniforms: cu, vertexShader: CAUSTIC_V, fragmentShader: CAUSTIC_F, transparent: true, blending: T.AdditiveBlending, depthWrite: false }))
  cmesh.position.y = 0.004
  S.add(cmesh)
  // La surface vue d'en dessous : un miroir mouvant, clair
  const su = { uMap: { value: caus }, uT: { value: 0 }, uK: { value: 0.22 }, uTint: { value: new T.Color('#BFF3FF') } }
  const surface = new T.Mesh(new T.PlaneGeometry(W, D, 1, 1), new T.ShaderMaterial({ uniforms: su, vertexShader: CAUSTIC_V, fragmentShader: CAUSTIC_F, transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }))
  surface.rotation.x = Math.PI / 2; surface.position.set(0, TANK.water, (TANK.z0 + TANK.z1) / 2)
  S.add(surface)
  const film = new T.Mesh(new T.PlaneGeometry(W, D), new T.MeshBasicMaterial({ color: '#9BE3F0', transparent: true, opacity: 0.35, side: T.DoubleSide, depthWrite: false }))
  film.rotation.x = Math.PI / 2; film.position.set(0, TANK.water - 0.002, (TANK.z0 + TANK.z1) / 2)
  S.add(film)
  // Les rayons de lumière qui tombent de la surface
  const rayTex = canvasTex(T, stage, 64, 256, g => {
    const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr; g.fillRect(0, 0, 64, 256)
    const h = g.createLinearGradient(0, 0, 64, 0); h.addColorStop(0, 'rgba(0,0,0,1)'); h.addColorStop(0.5, 'rgba(0,0,0,0)'); h.addColorStop(1, 'rgba(0,0,0,1)')
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = h; g.fillRect(0, 0, 64, 256)
  })
  const rays: import('three').Mesh[] = []
  for (let i = 0; i < 6; i++) {
    const r = new T.Mesh(new T.PlaneGeometry(0.28 + (i % 3) * 0.1, 1.6), new T.MeshBasicMaterial({ map: rayTex, transparent: true, opacity: 0.22, blending: T.AdditiveBlending, depthWrite: false, color: '#D8F6FF', fog: false }))
    r.position.set(-1.25 + i * 0.5, TANK.water - 0.8, -0.2 + (i % 2) * 0.25)
    r.rotation.z = 0.32
    r.userData.seed = i * 1.7
    rays.push(r); S.add(r)
  }
  // Le cadre : la rampe de lumière en haut, le socle en bas, les arêtes de verre
  const black = std('#1F2328', { roughness: 0.4, metalness: 0.3 })
  const hood = new T.Mesh(new T.BoxGeometry(W + 0.12, 0.14, D + 0.1), black); hood.position.set(0, TANK.top + 0.07, (TANK.z0 + TANK.z1) / 2); S.add(hood)
  const strip = new T.Mesh(new T.PlaneGeometry(W, 0.06), new T.MeshBasicMaterial({ color: '#FFFFFF' })); strip.rotation.x = Math.PI / 2; strip.position.set(0, TANK.top - 0.001, (TANK.z0 + TANK.z1) / 2); S.add(strip)
  const base = new T.Mesh(new T.BoxGeometry(W + 0.12, 0.08, D + 0.1), black); base.position.set(0, -0.05, (TANK.z0 + TANK.z1) / 2); S.add(base)
  const edgeMat = new T.MeshPhysicalMaterial({ color: '#7FC9B8', roughness: 0.1, transparent: true, opacity: 0.55, clearcoat: 1 })
  for (const x of [-W / 2, W / 2]) for (const z of [TANK.z0, TANK.z1]) {
    const e = new T.Mesh(new T.BoxGeometry(0.03, TANK.top, 0.03), edgeMat); e.position.set(x, TANK.top / 2, z); S.add(e)
  }
  // Les vitres des côtés : un voile bleuté
  for (const x of [-W / 2, W / 2]) {
    const side = new T.Mesh(new T.PlaneGeometry(D, TANK.top), new T.MeshBasicMaterial({ color: '#2F8DB5', transparent: true, opacity: 0.55, side: T.DoubleSide, depthWrite: false }))
    side.rotation.y = Math.PI / 2; side.position.set(x, TANK.top / 2, (TANK.z0 + TANK.z1) / 2); S.add(side)
  }
  // La vitre de devant : presque rien, juste les reflets de la pièce
  const glass = new T.Mesh(new T.PlaneGeometry(W, TANK.top), new T.MeshPhysicalMaterial({ color: '#FFFFFF', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.07, clearcoat: 1, clearcoatRoughness: 0.03, depthWrite: false }))
  glass.position.set(0, TANK.top / 2, TANK.z1 + 0.002)
  glass.renderOrder = 5
  S.add(glass)
  // Le diffuseur : une pierre au fond à droite, ses bulles
  const stone = new T.Mesh(new T.CylinderGeometry(0.05, 0.06, 0.05, 16), std('#5C6A78', { roughness: 0.9 }))
  const stoneX = 1.15, stoneZ = -0.35
  stone.position.set(stoneX, sandY(stoneX, stoneZ) + 0.02, stoneZ); S.add(stone)
  const MAXB = 90
  const bubbleMat = new T.MeshPhysicalMaterial({ color: '#FFFFFF', roughness: 0.05, transparent: true, opacity: 0.45, clearcoat: 1, emissive: '#BFEFFF', emissiveIntensity: 0.25, depthWrite: false })
  const bubbles = new T.InstancedMesh(new T.SphereGeometry(1, 12, 8), bubbleMat, MAXB)
  bubbles.instanceMatrix.setUsage(T.DynamicDrawUsage)
  bubbles.frustumCulled = false
  S.add(bubbles)
  const B = Array.from({ length: MAXB }, (_, i) => ({ x: stoneX, y: -1, z: stoneZ, r: 0.01, v: 0.3, ph: i, live: false, stream: i < 34 }))
  const m4 = new T.Matrix4()
  const spawn = (b: typeof B[0], x: number, y: number, z: number) => { b.x = x + (Math.random() - 0.5) * 0.03; b.y = y; b.z = z + (Math.random() - 0.5) * 0.03; b.r = 0.008 + Math.random() * 0.016; b.v = 0.25 + Math.random() * 0.2 + b.r * 6; b.ph = Math.random() * 6; b.live = true }
  for (const b of B) if (b.stream) { spawn(b, stoneX, sandY(stoneX, stoneZ) + 0.05, stoneZ); b.y += Math.random() * 1.5 }
  // La lumière du bac : une lampe blanche bleutée en haut
  const lamp = new T.PointLight('#E8FBFF', 2.2, 5, 1.2)
  lamp.position.set(0, TANK.top - 0.1, 0.1); S.add(lamp)
  const hemi = S.children.find(o => (o as import('three').HemisphereLight).isHemisphereLight) as import('three').HemisphereLight | undefined
  const hemiI = hemi?.intensity ?? 1, sunI = stage.sun?.intensity ?? 1
  return {
    sand, glass,
    step(dt, t) {
      cu.uT.value = t; su.uT.value = t * 0.7
      for (const r of rays) {
        const s0 = r.userData.seed as number
        ;(r.material as import('three').MeshBasicMaterial).opacity = 0.14 + 0.1 * Math.sin(t * 0.6 + s0)
        r.position.x += Math.sin(t * 0.25 + s0) * dt * 0.02
        r.rotation.z = 0.32 + Math.sin(t * 0.3 + s0) * 0.04
      }
      B.forEach((b, i) => {
        if (b.live) {
          b.y += b.v * dt
          b.x += Math.sin(t * 5 + b.ph) * dt * 0.04
          if (b.y > TANK.water - b.r) {
            b.live = false
            if (b.stream) spawn(b, stoneX, sandY(stoneX, stoneZ) + 0.05, stoneZ)
          }
        }
        const s = b.live ? b.r * (1 + Math.sin(t * 9 + b.ph) * 0.08) : 0
        m4.makeScale(s, s * 0.92, s).setPosition(b.x, b.live ? b.y : -5, b.z)
        bubbles.setMatrixAt(i, m4)
      })
      bubbles.instanceMatrix.needsUpdate = true
    },
    bubbles(x, y, z, n) {
      for (const b of B) { if (n <= 0) break; if (b.stream || b.live) continue; spawn(b, x, y, z); b.y += Math.random() * 0.1; n-- }
    },
    setEvening(k) {
      if (hemi) hemi.intensity = hemiI * (1 - 0.65 * k)
      if (stage.sun) stage.sun.intensity = sunI * (1 - 0.8 * k)
      lamp.intensity = 2.2 + k * 1.5
      stage.scene.environmentIntensity = 0.55 * (1 - 0.6 * k)
      ;(wall.material as import('three').MeshStandardMaterial).color.set('#DCE6EE').lerp(new T.Color('#4A5470'), k)
    }
  }
}

/* ---------- Le décor qu'on pose ---------- */

/** Les algues ondulent : leur sommet balance, le pied tient (un décalage dans le shader). */
export function swayMaterial(T: T3, color: string, uT: { value: number }) {
  const m = new T.MeshStandardMaterial({ color, roughness: 0.6, side: T.DoubleSide })
  m.onBeforeCompile = sh => {
    sh.uniforms.uT = uT
    sh.vertexShader = 'uniform float uT;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float sway = transformed.y * transformed.y;
      vec4 wp = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      transformed.x += sin(uT * 1.6 + wp.x * 3.0 + transformed.y * 2.5) * 0.12 * sway;
      transformed.z += cos(uT * 1.2 + wp.x * 2.0 + transformed.y * 2.0) * 0.06 * sway;`)
  }
  m.customProgramCacheKey = () => 'algue-ondule'
  return m
}

export function aqDeco(T: T3, stage: Stage, k: DecoKind, uT: { value: number }): Grp {
  const g = new T.Group()
  const add = <M extends import('three').Mesh>(o: M) => { o.castShadow = true; o.receiveShadow = true; g.add(o); return o }
  const std = (color: string, o: Partial<import('three').MeshStandardMaterialParameters> = {}) => new T.MeshStandardMaterial({ color, roughness: 0.6, ...o })
  if (k === 'algue') {
    // Des rubans de varech, de hauteurs et de verts différents
    const greens = ['#2FA35A', '#45B86A', '#7CC94F', '#1F8A50', '#58B26F']
    for (let i = 0; i < 6; i++) {
      const h = 0.55 + (i * 0.37 % 1) * 0.55
      const geo = new T.PlaneGeometry(0.055, h, 1, 14)
      geo.translate(0, h / 2, 0)
      const p = geo.attributes.position as import('three').BufferAttribute
      for (let v = 0; v < p.count; v++) { const y = p.getY(v); p.setX(v, p.getX(v) * (1 - y / h * 0.55) + Math.sin(y * 9 + i) * 0.015) }
      geo.computeVertexNormals()
      const leaf = add(new T.Mesh(geo, swayMaterial(T, greens[i % greens.length], uT)))
      leaf.position.set((i - 2.5) * 0.035, 0, Math.sin(i * 2.1) * 0.04)
      leaf.rotation.y = i * 0.9
    }
  } else if (k === 'rocher') {
    const tints = ['#7D7F86', '#8E8577', '#6D7A82']
    for (let i = 0; i < 3; i++) {
      const geo = new T.IcosahedronGeometry(0.13 - i * 0.03, 3)
      const p = geo.attributes.position as import('three').BufferAttribute
      const col = new Float32Array(p.count * 3)
      const base = new T.Color(tints[i]), moss = new T.Color('#5E8F4A')
      for (let v = 0; v < p.count; v++) {
        const x = p.getX(v), y = p.getY(v), z = p.getZ(v)
        const n = 1 + Math.sin(x * 31 + i) * 0.08 + Math.cos(y * 27) * 0.07 + Math.sin(z * 23 + x * 11) * 0.06
        p.setXYZ(v, x * n, y * n * 0.75, z * n)
        const c = base.clone().lerp(moss, Math.max(0, y / 0.13) * 0.7 * (0.5 + 0.5 * Math.sin(x * 40 + z * 30)))
        col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b
      }
      geo.setAttribute('color', new T.BufferAttribute(col, 3))
      // Lisse : la normale d'un caillou rond (l'icosaèdre n'a pas de sommets partagés, ses normales calculées seraient à facettes)
      const nn = geo.attributes.normal as import('three').BufferAttribute
      for (let v = 0; v < p.count; v++) { const l = Math.hypot(p.getX(v), p.getY(v) / 0.75, p.getZ(v)) || 1; nn.setXYZ(v, p.getX(v) / l, p.getY(v) / 0.75 / l, p.getZ(v) / l) }
      const r = add(new T.Mesh(geo, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 })))
      r.position.set([0, 0.13, -0.1][i], 0.05 - i * 0.015, [0, 0.05, 0.06][i])
    }
  } else if (k === 'chateau') {
    // Le château englouti : un donjon, deux tourelles, la porte en arc, des fenêtres, de la mousse
    const stoneT = canvasTex(T, stage, 256, 256, c => {
      c.fillStyle = '#B9A9C9'; c.fillRect(0, 0, 256, 256)
      for (let r = 0; r < 8; r++) for (let q = -1; q < 5; q++) {
        const x = q * 64 + (r % 2) * 32, y = r * 32, l = 0.88 + ((r * 7 + q * 13) % 10) / 40
        c.fillStyle = `rgb(${195 * l | 0},${178 * l | 0},${210 * l | 0})`; c.fillRect(x + 2, y + 2, 60, 28)
      }
      c.fillStyle = 'rgba(80,140,70,.35)'
      for (let i = 0; i < 30; i++) { c.beginPath(); c.arc((i * 83) % 256, 200 + (i * 37) % 56, 6 + (i % 5) * 3, 0, 7); c.fill() }
    })
    stoneT.wrapS = stoneT.wrapT = T.RepeatWrapping
    const sm = new T.MeshStandardMaterial({ map: stoneT, roughness: 0.85 })
    const tower = (r: number, h: number, x: number, z: number, roof: string) => {
      const t = add(new T.Mesh(new T.CylinderGeometry(r, r * 1.08, h, 20), sm)); t.position.set(x, h / 2, z)
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2
        const m = add(new T.Mesh(new T.BoxGeometry(r * 0.42, r * 0.4, r * 0.3), sm)); m.position.set(x + Math.cos(a) * r * 0.92, h + r * 0.2, z + Math.sin(a) * r * 0.92); m.rotation.y = -a
      }
      const cone = add(new T.Mesh(new T.ConeGeometry(r * 1.05, r * 1.6, 20), std(roof, { roughness: 0.5 }))); cone.position.set(x, h + r * 1.1, z)
      const win = add(new T.Mesh(new T.CircleGeometry(r * 0.25, 16), std('#2A2350', { roughness: 0.3 }))); win.position.set(x, h * 0.66, z + r * 1.0)
    }
    tower(0.11, 0.42, 0, -0.03, '#E8456B')
    tower(0.07, 0.28, -0.17, 0.03, '#5E7DD6')
    tower(0.07, 0.28, 0.17, 0.03, '#5E7DD6')
    const wallG = add(new T.Mesh(new T.BoxGeometry(0.34, 0.18, 0.08), sm)); wallG.position.set(0, 0.09, 0.05)
    const doorS = new T.Shape(); doorS.moveTo(-0.045, 0); doorS.lineTo(0.045, 0); doorS.lineTo(0.045, 0.07); doorS.absarc(0, 0.07, 0.045, 0, Math.PI, false); doorS.lineTo(-0.045, 0)
    const door = add(new T.Mesh(new T.ShapeGeometry(doorS, 10), std('#1E1838', { roughness: 0.3 }))); door.position.set(0, 0.0, 0.092)
    const flag = add(new T.Mesh(new T.PlaneGeometry(0.06, 0.04), std('#FFD34D', { side: T.DoubleSide }))); flag.position.set(0.03, 0.72, -0.03)
    const pole = add(new T.Mesh(new T.CylinderGeometry(0.003, 0.003, 0.1, 6), std('#5A4A3A'))); pole.position.set(0, 0.69, -0.03)
  } else if (k === 'coffre') {
    // Le coffre au trésor : planches, bandes d'or, la serrure ; le couvercle s'ouvre sur les pièces
    const plank = canvasTex(T, stage, 256, 128, c => {
      c.fillStyle = '#8A5A32'; c.fillRect(0, 0, 256, 128)
      for (let i = 0; i < 4; i++) { c.fillStyle = i % 2 ? '#7A4E2A' : '#94643A'; c.fillRect(0, i * 32 + 1, 256, 30) }
      c.strokeStyle = 'rgba(40,20,10,.5)'; c.lineWidth = 2; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(0, i * 32); c.lineTo(256, i * 32); c.stroke() }
    })
    const wood = new T.MeshStandardMaterial({ map: plank, roughness: 0.75 })
    const gold = new T.MeshStandardMaterial({ color: '#E2B85C', metalness: 1, roughness: 0.28 })
    const bw = 0.24, bh = 0.13, bd = 0.15
    const body = add(new T.Mesh(new T.BoxGeometry(bw, bh, bd), wood)); body.position.y = bh / 2
    for (const x of [-bw / 2 + 0.03, bw / 2 - 0.03]) { const b = add(new T.Mesh(new T.BoxGeometry(0.018, bh + 0.004, bd + 0.006), gold)); b.position.set(x, bh / 2, 0) }
    const lock = add(new T.Mesh(new T.BoxGeometry(0.035, 0.04, 0.01), gold)); lock.position.set(0, bh - 0.02, bd / 2 + 0.005)
    // Les pièces d'or qui débordent
    for (let i = 0; i < 9; i++) { const c = add(new T.Mesh(new T.CylinderGeometry(0.018, 0.018, 0.005, 14), gold)); c.position.set((i % 3 - 1) * 0.055 + Math.sin(i) * 0.01, bh + 0.004 + (i % 2) * 0.006, (Math.floor(i / 3) - 1) * 0.035); c.rotation.set(Math.sin(i * 3) * 0.3, 0, Math.cos(i * 2) * 0.3) }
    const pearl = add(new T.Mesh(new T.SphereGeometry(0.016, 14, 10), new T.MeshPhysicalMaterial({ color: '#FFF4F8', roughness: 0.15, clearcoat: 1, sheen: 1, sheenColor: new T.Color('#FFD9EC') }))); pearl.position.set(0.03, bh + 0.016, 0.02)
    const lid = new T.Group(); lid.position.set(0, bh, -bd / 2); g.add(lid)
    const top = new T.Mesh(new T.CylinderGeometry(bd / 2, bd / 2, bw, 20, 1, false, 0, Math.PI), wood)
    top.rotation.z = Math.PI / 2; top.position.set(0, 0, bd / 2); top.castShadow = true; lid.add(top)
    const cap = new T.Mesh(new T.CylinderGeometry(bd / 2 + 0.003, bd / 2 + 0.003, 0.018, 20, 1, false, 0, Math.PI), gold)
    for (const x of [-bw / 2 + 0.03, bw / 2 - 0.03]) { const cc = cap.clone(); cc.rotation.z = Math.PI / 2; cc.position.set(x, 0, bd / 2); lid.add(cc) }
    g.userData.lid = lid
  } else if (k === 'coquillage') {
    const sh = decoObject(T, 'coquillage', '#F6A5B8')
    sh.scale.setScalar(2.6)
    sh.rotation.x = -0.5
    sh.position.y = 0.03
    sh.traverse(o => { o.castShadow = true })
    g.add(sh)
  } else {
    // Le corail : des branches roses qui se divisent, leurs bouts plus clairs
    const mat = new T.MeshStandardMaterial({ color: '#FF7F9E', roughness: 0.7 })
    const tip = new T.MeshStandardMaterial({ color: '#FFC2D1', roughness: 0.6 })
    const branch = (x: number, y: number, z: number, ax: number, az: number, len: number, depth: number) => {
      const b = add(new T.Mesh(new T.CapsuleGeometry(0.018 * (1 - depth * 0.25), len, 4, 10), mat))
      const dir = new T.Vector3(Math.sin(az), Math.cos(az) * Math.cos(ax), Math.sin(ax)).normalize()
      b.position.set(x + dir.x * len / 2, y + dir.y * len / 2, z + dir.z * len / 2)
      b.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir)
      const ex = x + dir.x * len, ey = y + dir.y * len, ez = z + dir.z * len
      if (depth >= 2) { const t = add(new T.Mesh(new T.SphereGeometry(0.02, 10, 8), tip)); t.position.set(ex, ey, ez); return }
      branch(ex, ey, ez, ax + 0.35, az - 0.45, len * 0.75, depth + 1)
      branch(ex, ey, ez, ax - 0.3, az + 0.5, len * 0.75, depth + 1)
    }
    branch(0, 0, 0, 0, 0.1, 0.14, 0)
    branch(0.02, 0, 0.02, 0.4, -0.5, 0.11, 1)
  }
  g.userData.deco = k
  return g
}

/* ---------- Les flocons de nourriture ---------- */

export function flakeMesh(T: T3, max: number) {
  const geo = new T.CircleGeometry(1, 6)
  const m = new T.InstancedMesh(geo, new T.MeshStandardMaterial({ roughness: 0.8, side: T.DoubleSide }), max)
  m.instanceMatrix.setUsage(T.DynamicDrawUsage)
  m.frustumCulled = false
  const cols = ['#FF9F43', '#FFD34D', '#E8573C', '#9BD08A']
  for (let i = 0; i < max; i++) m.setColorAt(i, new T.Color(cols[i % cols.length]))
  return m
}
