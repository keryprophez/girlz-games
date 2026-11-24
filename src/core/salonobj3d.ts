/* @version 2026-11-25 00:20 */
import type * as THREE from 'three'
import type { T3 } from './three3d'

/* Les objets du Salon de coiffure, choisis par le père (24/11) : la brosse
   lilas à étoile, l'élastique à nœud de satin.
   Unités : le rayon de la tête vaut 1. La brosse : les poils vers −y, le
   manche vers +x. L'élastique : son anneau dans le plan xy, les cheveux
   passent le long de z, le haut vers +y (`userData.bow` : son nœud). */

/** De vrais reflets (une pièce éclairée), pour la laque, l'or et le satin. */
export async function reflets(THREE: T3, renderer: THREE.WebGLRenderer) {
  const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js')
  const p = new THREE.PMREMGenerator(renderer), piece = new RoomEnvironment(), t = p.fromScene(piece, 0.04)
  p.dispose()
  piece.dispose()
  return t
}

export function salonObjets(THREE: T3) {
  const bump = (x: number, a: number, b: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

  /** Le corps d'une brosse, d'une seule pièce : une section arrondie qui suit le
      contour (demi-largeur le long de x), plate à la tête, ronde au manche, le
      dos bombé, le manche qui se relève. */
  function corps(half: [number, number][], thick: number) {
    const N = 120, M = 40, pos: number[] = [], idx: number[] = []
    const line = new THREE.SplineCurve(half.map(([x, y]) => new THREE.Vector2(x, y))).getSpacedPoints(N)
    line.forEach((pt, i) => {
      const w = Math.max(0.0005, pt.y), x = pt.x
      const h = thick * Math.sqrt(1 - (1 - Math.min(1, w / 0.085)) ** 2), lift = 0.1 * bump(x, 0.25, 1.05) ** 1.5
      for (let k = 0; k <= M; k++) {
        const a = k / M * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a), e = 2 / 2.7
        const z = w * Math.sign(c) * Math.abs(c) ** e, y = h * Math.sign(sn) * Math.abs(sn) ** e
        const dome = sn > 0 ? 0.04 * sn * Math.max(0, 1 - (z / 0.27) ** 2) * (1 - bump(x, 0.05, 0.42)) * Math.min(1, w / 0.12) : 0
        pos.push(x, y + dome + lift, z)
        if (i < N && k < M) { const p0 = i * (M + 1) + k, p1 = p0 + M + 1; idx.push(p0, p1, p0 + 1, p1, p1 + 1, p0 + 1) }
      }
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    // (la couture de la section : mêmes normales des deux côtés)
    const n = g.getAttribute('normal')
    for (let i = 0; i <= N; i++) {
      const a = i * (M + 1), b = a + M, v = new THREE.Vector3(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize()
      n.setXYZ(a, v.x, v.y, v.z); n.setXYZ(b, v.x, v.y, v.z)
    }
    return g
  }

  /** Les touffes de poils, en quinconce dans un ovale, plantés sur le coussin. */
  function touffes(g: THREE.Group, o: { rx: number; rz: number; step: number; r: number; len: number; tip: number; mat: THREE.Material; y: (x: number, z: number) => number }) {
    const at: [number, number][] = []
    for (let j = -20; j <= 20; j++) for (let i = -20; i <= 20; i++) {
      const x = (i + (j & 1 ? 0.5 : 0)) * o.step, z = j * o.step * 0.87
      if ((x / o.rx) ** 2 + (z / o.rz) ** 2 < 1) at.push([x, z])
    }
    const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(o.r * 0.8, o.r, o.len, 8), o.mat, at.length)
    const tips = new THREE.InstancedMesh(new THREE.SphereGeometry(o.tip, 10, 8), o.mat, at.length)
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1)
    at.forEach(([x, z], k) => {
      // (les poils du bord s'écartent un peu, comme sur un vrai coussin)
      q.setFromEuler(e.set(-z * 0.9, 0, x * 0.5))
      const base = new THREE.Vector3(x, o.y(x, z), z), d = new THREE.Vector3(0, -1, 0).applyQuaternion(q)
      stems.setMatrixAt(k, m.compose(base.clone().addScaledVector(d, o.len / 2), q, one))
      tips.setMatrixAt(k, m.compose(base.clone().addScaledVector(d, o.len), q, one))
    })
    g.add(stems, tips)
  }

  /** Le dos d'une brosse posée sur les cheveux : sa profondeur est avancée de
      `pull` vers la caméra, pour que les fils du dessus ne lui mordent pas le
      bord (les poils, eux, entrent dans les cheveux). La forme ne bouge pas. */
  function avance(m: THREE.Material, pull: { value: number }) {
    m.onBeforeCompile = s => {
      s.uniforms.pull = pull
      s.vertexShader = 'uniform float pull;\n' + s.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
        { vec4 q = projectionMatrix * vec4(mvPosition.xy, mvPosition.z + pull, 1.0); gl_Position.z = q.z / q.w * gl_Position.w; }`)
    }
    return m
  }

  /** La brosse : laquée lilas, liseré et étoile dorés, coussin crème, poils doux en touffes. */
  function brosse(env: THREE.Texture) {
    const g = new THREE.Group(), pull = { value: 0 }
    const laque = new THREE.MeshPhysicalMaterial({ color: '#6A3FC4', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, envMap: env, envMapIntensity: 0.35 })
    const or = new THREE.MeshPhysicalMaterial({ color: '#E0A93C', metalness: 1, roughness: 0.25, envMap: env, envMapIntensity: 0.8 })
    const creme = new THREE.MeshPhysicalMaterial({ color: '#C9B89E', roughness: 0.6, envMap: env, envMapIntensity: 0.2 })
    const poil = new THREE.MeshPhysicalMaterial({ color: '#D8CDBA', roughness: 0.6, envMap: env, envMapIntensity: 0.2 })
    const half: [number, number][] = [[-0.35, 0], [-0.33, 0.12], [-0.22, 0.22], [-0.03, 0.255], [0.15, 0.21], [0.26, 0.125], [0.35, 0.072], [0.47, 0.056], [0.64, 0.068], [0.82, 0.088], [0.95, 0.078], [1.02, 0.04], [1.03, 0]]
    g.add(new THREE.Mesh(corps(half, 0.056), laque))
    // le liseré autour du coussin
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.045, 10, 80), or)
    rim.rotation.x = Math.PI / 2; rim.scale.set(0.265, 0.205, 0.22); rim.position.set(-0.03, -0.047, 0)
    g.add(rim)
    const bed = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), creme)
    bed.scale.set(0.26, 0.04, 0.2); bed.position.set(-0.03, -0.044, 0)
    g.add(bed)
    const tufts = new THREE.Group()
    tufts.position.x = -0.03
    touffes(tufts, { rx: 0.23, rz: 0.17, step: 0.042, r: 0.013, len: 0.095, tip: 0.0115, mat: poil, y: (x, z) => -0.046 - 0.034 * Math.sqrt(Math.max(0, 1 - (x / 0.26) ** 2 - (z / 0.2) ** 2)) })
    g.add(tufts)
    // l'étoile dorée, sur le dos
    const star = new THREE.Shape()
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2 + Math.PI / 10 - Math.PI / 2, r = k & 1 ? 0.055 : 0.115; star[k ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r) }
    star.closePath()
    const sg = new THREE.ExtrudeGeometry(star, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.012, bevelSegments: 4 })
    sg.rotateX(-Math.PI / 2)
    const s = new THREE.Mesh(sg, or)
    s.position.set(-0.05, 0.088, 0)
    g.add(s)
    avance(laque, pull); avance(or, pull)
    return { o: g, pull }
  }

  /** Une bande de ruban le long d'un tracé (demi-largeur `w` et bombé `c` en chaque point). */
  function ruban(n: number, at: (t: number) => { p: [number, number, number]; w: [number, number, number]; c?: [number, number, number] }) {
    const pos: number[] = [], idx: number[] = [], M = 12
    for (let i = 0; i <= n; i++) {
      const { p, w, c = [0, 0, 0] } = at(i / n)
      for (let j = 0; j <= M; j++) { const k = j / M * 2 - 1, b = k * k; pos.push(p[0] + w[0] * k + c[0] * b, p[1] + w[1] * k + c[1] * b, p[2] + w[2] * k + c[2] * b) }
      if (i < n) for (let j = 0; j < M; j++) { const a = i * (M + 1) + j, b = a + M + 1; idx.push(a, b, a + 1, b, b + 1, a + 1) }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    return g
  }

  /** L'élastique : un cordon torsadé et son nœud de satin. */
  function elastique(env: THREE.Texture, color = '#D8265F', cord = '#8E1E48') {
    const g = new THREE.Group()
    const fil = new THREE.MeshPhysicalMaterial({ color: cord, roughness: 0.5, sheen: 0.6, sheenColor: new THREE.Color('#FF9CBE'), envMap: env, envMapIntensity: 0.4 })
    for (let k = 0; k < 3; k++) {
      const pts: THREE.Vector3[] = []
      for (let i = 0; i < 240; i++) {
        const u = i / 240 * Math.PI * 2, a = u * 9 + k / 3 * Math.PI * 2, R = 0.088 + Math.cos(a) * 0.018
        pts.push(new THREE.Vector3(Math.cos(u) * R, Math.sin(u) * R, Math.sin(a) * 0.026))
      }
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 360, 0.019, 10, true), fil))
    }
    const satin = new THREE.MeshPhysicalMaterial({ color, roughness: 0.34, sheen: 0.8, sheenRoughness: 0.3, sheenColor: new THREE.Color('#FFD0DF'), clearcoat: 0.25, clearcoatRoughness: 0.4, envMap: env, envMapIntensity: 0.3, side: THREE.DoubleSide })
    const bow = new THREE.Group()
    for (const s of [-1, 1]) {
      // la coque : devant, le tour, derrière ; pincée au milieu
      bow.add(new THREE.Mesh(ruban(60, t => {
        const b = Math.sin(Math.PI * t), x = 0.27 * Math.pow(b, 0.75), hw = 0.026 + 0.078 * Math.pow(b, 0.8)
        const fold = 0.012 * Math.sin(t * Math.PI * 2) * b
        return { p: [s * x, 0.02 * b + fold, 0.085 * Math.sin(2 * Math.PI * t) * (t < 0.5 ? 1 : 0.6) + 0.02], w: [0, hw, 0.01 * b], c: [-s * 0.085 * b * b, 0, t < 0.5 ? -0.03 * b : 0.02 * b] }
      }), satin))
      // le pan
      bow.add(new THREE.Mesh(ruban(40, t => ({ p: [s * (0.02 + 0.13 * t), -0.02 - 0.25 * t, 0.045 + 0.03 * Math.sin(t * 5 + s)], w: [0.022 + 0.036 * t, s * 0.014 * t - (t > 0.97 ? 0.02 : 0), 0.006] })), satin))
    }
    const knot = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), satin)
    knot.scale.set(0.04, 0.046, 0.05); knot.position.z = 0.03
    bow.add(knot)
    bow.position.set(0, 0.118, 0.045)
    g.add(bow)
    // (au bout d'une tresse, il se tourne vers nous)
    g.userData.bow = bow
    return g
  }
  return { brosse, elastique }
}
