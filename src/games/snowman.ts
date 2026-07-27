import type { GameContext, GameDef } from '../core/types'
import { $, pick } from '../core/utils'
import { sCrunch, sPop, sWin, tone } from '../core/audio'
import { confetti } from '../core/fx'
import {
  createStage, loadPhysics, loader, fixedStep, orbitCam, snowTex, bumpyNormal, disposeTree,
  loadModel, fitModel,
  type Stage, type Orbit, type Cannon
} from '../core/three3d'

/* ⛄ Bonhomme de neige 3D — on ROULE vraiment une boule dans la neige : elle
   creuse un sillon, elle grossit, et quand elle est belle on la POSE : elle
   tombe et s'écrase sur la pile avec la physique. Trois boules, puis on
   habille le bonhomme en 3D et on tourne autour.
   Jeu créatif : aucun échec, aucun chrono. */

/* ---------- Réglages ---------- */
const FIELD = 4.6            // demi-largeur du champ de neige jouable
const CAPS = [0.62, 0.46, 0.34]
const R0 = 0.17
const GROW = 0.055           // rayon gagné par unité de distance roulée
const G = 9.82

const SCARVES = ['#E04E63', '#4FA3D8', '#5EC97B', '#FFB84D', '#B08CF0']
const BTNCOLS = ['#332A22', '#E04E63', '#4FA3D8', '#FFB84D']

type CatId = 'hat' | 'scarf' | 'eyes' | 'nose' | 'arms' | 'buttons'
interface Look { hat: string; scarf: string; eyes: string; nose: string; arms: string; buttons: string }

const CATS: { id: CatId; icon: string; opts: [string, string][] }[] = [
  { id: 'hat', icon: '🎩', opts: [['none', '✖️'], ['tophat', '🎩'], ['bonnet', '🧶'], ['crown', '👑']] },
  { id: 'scarf', icon: '🧣', opts: [['none', '✖️'], ...SCARVES.map(c => [c, '●'] as [string, string])] },
  { id: 'eyes', icon: '👀', opts: [['coal', '⚫'], ['button', '🔵'], ['star', '✨']] },
  { id: 'nose', icon: '🥕', opts: [['carrot', '🥕'], ['dot', '🔴']] },
  { id: 'arms', icon: '💪', opts: [['branch', '🌿'], ['mitten', '🧤'], ['none', '✖️']] },
  { id: 'buttons', icon: '🔘', opts: [['none', '✖️'], ...BTNCOLS.map(c => [c, '●'] as [string, string])] }
]

const defLook = (): Look => ({ hat: 'none', scarf: 'none', eyes: 'coal', nose: 'carrot', arms: 'branch', buttons: '#332A22' })

let ctx: GameContext
let S: any = null

/* ---------- Le sillon creusé dans la neige ---------- */
function makeTrail(T: any) {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const g = c.getContext('2d')!
  g.clearRect(0, 0, 512, 512)
  const t = new T.CanvasTexture(c)
  t.colorSpace = T.SRGBColorSpace
  return { canvas: c, g, tex: t }
}

/** Creuse un rond de neige à la position monde (x,z) — la glace bleutée apparaît. */
function digAt(x: number, z: number, r: number) {
  const { g, tex } = S.trail
  const px = ((x + FIELD) / (FIELD * 2)) * 512
  const py = ((z + FIELD) / (FIELD * 2)) * 512
  const pr = (r / (FIELD * 2)) * 512
  const grad = g.createRadialGradient(px, py, pr * 0.2, px, py, pr)
  grad.addColorStop(0, 'rgba(150,190,220,.85)')
  grad.addColorStop(0.7, 'rgba(178,210,235,.6)')
  grad.addColorStop(1, 'rgba(200,225,245,0)')
  g.fillStyle = grad
  g.beginPath(); g.arc(px, py, pr, 0, 7); g.fill()
  tex.needsUpdate = true
}

/* ---------- Décor ---------- */
/** Vrais sapins enneigés du kit holiday, en couronne autour du terrain. */
async function addTrees(T: any, scene: any, gone: () => boolean) {
  const kinds = await Promise.all(
    ['tree-snow-a', 'tree-snow-b', 'tree-snow-c'].map(n => loadModel('holiday', n))
  )
  // Le jeu a pu être démonté pendant le chargement : ne rien greffer sur
  // une scène déjà nettoyée, sinon ces meshes échappent au dispose
  if (gone()) return
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + Math.random() * 0.2
    const d = FIELD + 1.4 + Math.random() * 5
    const g = kinds[i % kinds.length].clone(true)
    fitModel(T, g, 1.6 + Math.random() * 1.5)
    g.position.set(Math.sin(a) * d, 0, Math.cos(a) * d)
    g.rotation.y = Math.random() * Math.PI * 2
    scene.add(g)
  }
}

/** Flocons qui tombent en continu — un nuage de points recyclé, ça ne coûte rien. */
function addSnowfall(T: any, scene: any) {
  const N = 700
  const pos = new Float32Array(N * 3)
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 24
    pos[i * 3 + 1] = Math.random() * 12
    pos[i * 3 + 2] = (Math.random() - 0.5) * 24
  }
  const geo = new T.BufferGeometry()
  geo.setAttribute('position', new T.BufferAttribute(pos, 3))
  const pts = new T.Points(geo, new T.PointsMaterial({
    color: 0xFFFFFF, size: 0.07, transparent: true, opacity: 0.85, depthWrite: false
  }))
  scene.add(pts)
  return { pts, pos, N }
}

/* ---------- Poudreuse projetée à l'impact ---------- */
function puff(x: number, y: number, z: number, n = 26) {
  const { T, scene } = S.stage
  const geo = new T.SphereGeometry(0.045, 6, 5)
  const mat = new T.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.9 })
  const grp = new T.Group()
  const parts: any[] = []
  for (let i = 0; i < n; i++) {
    const m = new T.Mesh(geo, mat)
    m.position.set(x, y, z)
    const a = Math.random() * Math.PI * 2
    const sp = 0.9 + Math.random() * 1.7
    parts.push({ m, vx: Math.cos(a) * sp, vy: 1.4 + Math.random() * 2.2, vz: Math.sin(a) * sp })
    grp.add(m)
  }
  scene.add(grp)
  S.puffs.push({ grp, geo, mat, parts, t: 0 })
}

function stepPuffs(dt: number) {
  const { scene } = S.stage
  for (let i = S.puffs.length - 1; i >= 0; i--) {
    const p = S.puffs[i]
    p.t += dt
    for (const q of p.parts) {
      q.vy -= 6 * dt
      q.m.position.x += q.vx * dt
      q.m.position.y += q.vy * dt
      q.m.position.z += q.vz * dt
      q.m.scale.setScalar(Math.max(0.05, 1 - p.t * 1.3))
    }
    p.mat.opacity = Math.max(0, 0.9 - p.t * 1.2)
    if (p.t > 0.85) {
      scene.remove(p.grp)
      p.geo.dispose(); p.mat.dispose()
      S.puffs.splice(i, 1)
    }
  }
}

/* ---------- Habillage 3D ---------- */
function clearDeco() {
  const { T, scene } = S.stage
  if (S.deco) { disposeTree(T, S.deco); scene.remove(S.deco) }
  S.deco = new T.Group()
  scene.add(S.deco)
}

/** Rayons et hauteurs des trois boules empilées, mesurés sur la pile réelle. */
function anatomy() {
  const [b, m, h] = S.stack
  return {
    bodyR: m.r, headR: h.r, botR: b.r,
    headY: h.mesh.position.y, bodyY: m.mesh.position.y, botY: b.mesh.position.y
  }
}

function buildDeco() {
  const { T } = S.stage
  clearDeco()
  const D = S.deco
  const a = anatomy()
  const L: Look = S.look

  /* Yeux */
  if (L.eyes !== 'none') {
    const col = L.eyes === 'button' ? 0x3F8FD0 : L.eyes === 'star' ? 0xFFD75E : 0x2A2320
    const geo = L.eyes === 'star'
      ? new T.OctahedronGeometry(a.headR * 0.16, 0)
      : new T.SphereGeometry(a.headR * 0.13, 14, 12)
    const mat = new T.MeshStandardMaterial({ color: col, roughness: 0.35, metalness: 0.15 })
    for (const sx of [-1, 1]) {
      const e = new T.Mesh(geo, mat)
      e.position.set(sx * a.headR * 0.36, a.headY + a.headR * 0.22, a.headR * 0.86)
      e.castShadow = true
      D.add(e)
    }
  }

  /* Nez */
  if (L.nose === 'carrot') {
    const n = new T.Mesh(
      new T.ConeGeometry(a.headR * 0.19, a.headR * 0.95, 12),
      new T.MeshStandardMaterial({ color: 0xF08A2E, roughness: 0.55 })
    )
    n.rotation.x = Math.PI / 2
    n.position.set(0, a.headY, a.headR * 1.25)
    n.castShadow = true
    D.add(n)
  } else {
    const n = new T.Mesh(
      new T.SphereGeometry(a.headR * 0.18, 16, 12),
      new T.MeshStandardMaterial({ color: 0xE0504F, roughness: 0.4 })
    )
    n.position.set(0, a.headY, a.headR * 0.95)
    n.castShadow = true
    D.add(n)
  }

  /* Bouche : petits cailloux en arc — toujours là, ça donne le sourire */
  const mGeo = new T.SphereGeometry(a.headR * 0.07, 10, 8)
  const mMat = new T.MeshStandardMaterial({ color: 0x2A2320, roughness: 0.5 })
  for (let i = -2; i <= 2; i++) {
    const p = new T.Mesh(mGeo, mMat)
    const ang = i * 0.30
    p.position.set(Math.sin(ang) * a.headR * 0.6, a.headY - a.headR * 0.34 - Math.cos(ang) * a.headR * 0.06, a.headR * 0.83)
    D.add(p)
  }

  /* Chapeau */
  if (L.hat === 'tophat') {
    const mat = new T.MeshStandardMaterial({ color: 0x2A2733, roughness: 0.45, metalness: 0.1 })
    const brim = new T.Mesh(new T.CylinderGeometry(a.headR * 1.15, a.headR * 1.15, a.headR * 0.09, 24), mat)
    brim.position.y = a.headY + a.headR * 0.86
    const top = new T.Mesh(new T.CylinderGeometry(a.headR * 0.72, a.headR * 0.72, a.headR * 1.15, 24), mat)
    top.position.y = a.headY + a.headR * 1.45
    const band = new T.Mesh(new T.CylinderGeometry(a.headR * 0.74, a.headR * 0.74, a.headR * 0.24, 24),
      new T.MeshStandardMaterial({ color: 0xE04E63, roughness: 0.6 }))
    band.position.y = a.headY + a.headR * 1.0
    ;[brim, top, band].forEach(m => { m.castShadow = true; D.add(m) })
  } else if (L.hat === 'bonnet') {
    const mat = new T.MeshStandardMaterial({ color: 0x4FA3D8, roughness: 0.95 })
    const cap = new T.Mesh(new T.SphereGeometry(a.headR * 1.03, 22, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat)
    cap.position.y = a.headY + a.headR * 0.28
    const rim = new T.Mesh(new T.TorusGeometry(a.headR * 1.0, a.headR * 0.13, 10, 24), mat)
    rim.rotation.x = Math.PI / 2
    rim.position.y = a.headY + a.headR * 0.3
    const pom = new T.Mesh(new T.SphereGeometry(a.headR * 0.26, 14, 12),
      new T.MeshStandardMaterial({ color: 0xFFF3E0, roughness: 1 }))
    pom.position.y = a.headY + a.headR * 1.35
    ;[cap, rim, pom].forEach(m => { m.castShadow = true; D.add(m) })
  } else if (L.hat === 'crown') {
    const mat = new T.MeshStandardMaterial({ color: 0xF0C24A, roughness: 0.28, metalness: 0.85 })
    const band = new T.Mesh(new T.CylinderGeometry(a.headR * 0.8, a.headR * 0.8, a.headR * 0.4, 20, 1, true), mat)
    band.position.y = a.headY + a.headR * 1.0
    band.castShadow = true
    D.add(band)
    for (let i = 0; i < 6; i++) {
      const sp = new T.Mesh(new T.ConeGeometry(a.headR * 0.16, a.headR * 0.42, 8), mat)
      const ang = (i / 6) * Math.PI * 2
      sp.position.set(Math.sin(ang) * a.headR * 0.8, a.headY + a.headR * 1.38, Math.cos(ang) * a.headR * 0.8)
      sp.castShadow = true
      D.add(sp)
    }
  }

  /* Écharpe : un tore au cou + deux pans qui pendent */
  if (L.scarf !== 'none') {
    const col = new T.Color(L.scarf)
    const mat = new T.MeshStandardMaterial({ color: col, roughness: 1 })
    const neckY = (a.headY - a.headR * 0.82 + a.bodyY + a.bodyR * 0.82) / 2
    const nr = Math.max(a.headR * 0.85, a.bodyR * 0.62)
    const ring = new T.Mesh(new T.TorusGeometry(nr, nr * 0.22, 12, 26), mat)
    ring.rotation.x = Math.PI / 2
    ring.position.y = neckY
    ring.castShadow = true
    D.add(ring)
    for (const sx of [-0.55, 0.35]) {
      const tail = new T.Mesh(new T.BoxGeometry(nr * 0.5, nr * 1.5, nr * 0.2), mat)
      tail.position.set(sx * nr, neckY - nr * 0.75, nr * 0.72)
      tail.rotation.x = -0.25
      tail.rotation.z = sx * 0.18
      tail.castShadow = true
      D.add(tail)
    }
  }

  /* Bras */
  if (L.arms !== 'none') {
    const woodMat = new T.MeshStandardMaterial({ color: 0x6B4A32, roughness: 0.9 })
    const len = a.bodyR * 2.0
    const armGeo = new T.CylinderGeometry(a.bodyR * 0.055, a.bodyR * 0.075, len, 8)
    const TILT = 0.55 // radians au-dessus de l'horizontale
    for (const sx of [-1, 1]) {
      // Direction du bras : vers l'extérieur et vers le haut
      const dx = sx * Math.cos(TILT), dy = Math.sin(TILT)
      const shx = sx * a.bodyR * 0.8, shy = a.bodyY + a.bodyR * 0.3
      const arm = new T.Mesh(armGeo, woodMat)
      arm.position.set(shx + dx * len / 2, shy + dy * len / 2, 0)
      arm.rotation.z = -sx * (Math.PI / 2 - TILT) // aligne le cylindre (+Y) sur la direction
      arm.castShadow = true
      D.add(arm)
      const tipX = shx + dx * len, tipY = shy + dy * len
      // Deux brindilles au bout, sinon ça fait un bâton
      for (const k of [-1, 1]) {
        const tw = new T.Mesh(new T.CylinderGeometry(a.bodyR * 0.03, a.bodyR * 0.04, a.bodyR * 0.5, 6), woodMat)
        tw.position.set(tipX + dx * a.bodyR * 0.16, tipY + a.bodyR * 0.2, k * a.bodyR * 0.16)
        tw.rotation.z = -sx * 0.9
        tw.rotation.x = k * 0.5
        tw.castShadow = true
        D.add(tw)
      }
      if (L.arms === 'mitten') {
        const mit = new T.Mesh(new T.SphereGeometry(a.bodyR * 0.2, 14, 12),
          new T.MeshStandardMaterial({ color: 0xE04E63, roughness: 1 }))
        mit.position.set(tipX, tipY, 0)
        mit.scale.set(1, 1.25, 0.85)
        mit.castShadow = true
        D.add(mit)
      }
    }
  }

  /* Boutons */
  if (L.buttons !== 'none') {
    const mat = new T.MeshStandardMaterial({ color: new T.Color(L.buttons), roughness: 0.4, metalness: 0.2 })
    const geo = new T.SphereGeometry(a.bodyR * 0.11, 14, 12)
    for (let i = 0; i < 3; i++) {
      const b = new T.Mesh(geo, mat)
      const ang = 0.5 - i * 0.5
      b.position.set(0, a.bodyY + Math.sin(ang) * a.bodyR * 0.86, Math.cos(ang) * a.bodyR * 0.94)
      b.castShadow = true
      D.add(b)
    }
  }
}

/* ---------- Interface ---------- */
function optionRow() {
  const cat = CATS.find(c => c.id === S.cat)!
  const cur = (S.look as any)[S.cat]
  return cat.opts.map(([v, ic]) => {
    const isCol = v.startsWith('#')
    return `<button class="du-opt${isCol ? ' du-color' : ''}${cur === v ? ' sel' : ''}" data-v="${v}"
      ${isCol ? `style="background:${v}"` : ''}>${isCol ? '' : ic}</button>`
  }).join('')
}

function paintUI() {
  const rolling = S.phase === 'roll'
  $('snRoll').style.display = rolling ? '' : 'none'
  $('snDeco').style.display = rolling ? 'none' : ''
  if (rolling) {
    const n = Math.min(2, S.stack.length)
    const pct = Math.min(1, (S.r - R0) / (CAPS[n] - R0))
    $('snGauge').style.width = (pct * 100).toFixed(0) + '%'
    $('snBall').textContent = `⛄ Boule ${Math.min(3, S.stack.length + 1)}/3`
    ;($('snPlace') as HTMLButtonElement).disabled = S.r < R0 * 1.35 || S.dropping
    $('snPlace').classList.toggle('ready', pct > 0.75)
  } else {
    $('snTabs').innerHTML = CATS.map(c =>
      `<button class="chip sn-tab${S.cat === c.id ? ' sel' : ''}" data-c="${c.id}">${c.icon}</button>`).join('')
    $('snOpts').innerHTML = optionRow()
    bindDeco()
  }
}

function bindDeco() {
  $('snTabs').querySelectorAll<HTMLElement>('.sn-tab').forEach(b => {
    b.onclick = () => { if (!S) return; S.cat = b.dataset.c as CatId; sPop(); paintUI() }
  })
  $('snOpts').querySelectorAll<HTMLElement>('.du-opt').forEach(b => {
    b.onclick = () => {
      if (!S) return
      ;(S.look as any)[S.cat] = b.dataset.v
      sPop()
      buildDeco()
      paintUI()
    }
  })
}

/* ---------- Poser une boule ---------- */
function placeBall() {
  if (!S || S.dropping || S.phase !== 'roll') return
  const CANNON: Cannon = S.CANNON
  const r = S.r
  const idx = S.stack.length
  const topY = S.stack.length ? S.stack[S.stack.length - 1].topY : 0

  // Détache la boule roulante : elle devient un corps dynamique lâché au-dessus de la pile
  const mesh = S.ball
  S.ball = null
  // Un léger décalage donne du caractère, mais la boule tombe sur un RAIL vertical :
  // une sphère sur une sphère finirait toujours par glisser, et le jeu se bloquerait.
  const tx = (Math.random() - 0.5) * r * 0.14
  const tz = (Math.random() - 0.5) * r * 0.14
  mesh.position.set(tx, topY + r + 0.45, tz)

  const body = new CANNON.Body({
    mass: 1.2 + r,
    material: S.matSnow,
    shape: new CANNON.Sphere(r),
    position: new CANNON.Vec3(tx, mesh.position.y, tz)
  })
  body.linearDamping = 0.2
  body.angularDamping = 0.9
  S.world.addBody(body)

  const entry = { mesh, body, r, tx, tz, topY: 0, settled: false, t: 0, landed: false }
  S.stack.push(entry)
  S.dropping = true
  ctx.toast(idx === 2 ? 'La tête est posée ! 🎉' : 'Et hop, une boule de plus !')
  paintUI()
}

/** Fige une boule posée : une sphère sur une sphère finirait toujours par rouler. */
function settle(e: any) {
  const CANNON: Cannon = S.CANNON
  e.settled = true
  e.body.velocity.setZero()
  e.body.angularVelocity.setZero()
  // mass = 0 AVANT le passage en statique : sinon invMass reste fini et la boule
  // suivante « s'enfonce » dedans au lieu de rebondir (piège déjà vu en 2D).
  e.body.mass = 0
  e.body.type = CANNON.Body.STATIC
  e.body.updateMassProperties()
  e.topY = e.body.position.y + e.r
  e.mesh.scale.setScalar(e.r)
  S.dropping = false

  if (S.stack.length >= 3) {
    S.phase = 'deco'
    S.orbit.look = [0, e.topY * 0.52, 0]
    S.orbit.dist = Math.max(3.4, e.topY * 1.6 + 1.4)
    S.orbit.height = e.topY * 0.3
    S.orbit.auto = 0.16 // le bonhomme tourne doucement : on le voit sous tous les angles
    buildDeco()
    sWin()
    ctx.toast('Ton bonhomme est né ! Habille-le 🎩')
  } else {
    newBall()
  }
  paintUI()
}

function newBall() {
  const { T, scene } = S.stage
  S.r = R0
  const m = new T.Mesh(S.ballGeo, S.snowMat)
  m.castShadow = true; m.receiveShadow = true
  m.scale.setScalar(R0)
  // Toujours devant la caméra, bien visible : une petite ne doit rien chercher
  m.position.set((Math.random() - 0.5) * 1.2, R0, 1.9)
  scene.add(m)
  S.ball = m
}

/* ---------- Fin ---------- */
function finish() {
  if (!S || S.done) return
  S.done = true
  confetti()
  sWin()
  const names = ['génial', 'magnifique', 'trop beau', 'super rigolo']
  ctx.finish({
    title: 'Quel beau bonhomme ! ⛄',
    msg: `${ctx.playerName} a roulé un bonhomme de neige ${pick(names)}`,
    stars: 3, starsEarned: 3
  })
}

export const snowman: GameDef = {
  id: 'snowman', name: 'Bonhomme de neige', icon: '⛄', sq: 'sq-sky', cat: 'creatif', duel: false, music: 'winter',
  subtitle: 'Roule tes boules dans la vraie neige, empile-les, puis habille-le !',
  mount(c) {
    ctx = c
    let dead = false
    c.root.innerHTML = `
      <div class="topbar">
        <div class="chip" id="snBall">⛄ Boule 1/3</div>
        <button class="chip" id="snLeft">◀</button>
        <button class="chip" id="snRight">▶</button>
      </div>
      <div class="arena g3-arena" id="snArena">
        <div class="hint g3-hint" id="snHint">Glisse ton doigt : la boule roule et grossit ! ❄️</div>
      </div>
      <div class="g3-bar" id="snRoll">
        <div class="g3-gauge"><i id="snGauge"></i></div>
        <button class="g3-btn" id="snPlace">Poser la boule ⬇️</button>
      </div>
      <div class="g3-bar" id="snDeco" style="display:none">
        <div class="g3-row" id="snTabs"></div>
        <div class="g3-row sn-optrow" id="snOpts"></div>
        <div class="g3-row">
          <button class="g3-btn ghost" id="snAgain">🎲 Surprise</button>
          <button class="g3-btn" id="snDone">C'est fini ! ✅</button>
        </div>
      </div>`

    const arena = $('snArena')
    const hideLoader = loader(arena, '⛄')

    ;(async () => {
      const [, CANNON] = await loadPhysics()
      if (dead) return
      const stage: Stage = await createStage(arena, {
        sky: '#AEDCF5',
        fog: [12, 34], fogColor: '#D3EAF8',
        cam: [0, 2.9, 6.1], target: [0, 0.85, 0], fov: 46,
        hemi: ['#DDF0FF', '#9FBBD0', 1.15],
        sun: { pos: [5.5, 8, 5], color: '#FFF4E0', intensity: 2.5, area: 8, far: 26 },
        fill: 0.5, exposure: 1.08
      })
      if (dead) { stage.dispose(); return }
      hideLoader()
      const T = stage.T
      const scene = stage.scene

      /* Sol de neige + calque de sillon */
      const snowMap = stage.keep(snowTex(T, 9))
      const snowNrm = stage.keep(bumpyNormal(T, 10, 9))
      const ground = new T.Mesh(
        new T.PlaneGeometry(60, 60),
        new T.MeshStandardMaterial({ map: snowMap, normalMap: snowNrm, roughness: 0.86, metalness: 0 })
      )
      ground.rotation.x = -Math.PI / 2
      ground.receiveShadow = true
      scene.add(ground)

      const trail = makeTrail(T)
      const trailMesh = new T.Mesh(
        new T.PlaneGeometry(FIELD * 2, FIELD * 2),
        new T.MeshStandardMaterial({
          map: trail.tex, transparent: true, roughness: 0.55, metalness: 0.05,
          polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
        })
      )
      trailMesh.rotation.x = -Math.PI / 2
      trailMesh.position.y = 0.002
      trailMesh.receiveShadow = true
      scene.add(trailMesh)

      addTrees(T, scene, () => dead)
      const fall = addSnowfall(T, scene)

      /* Monde physique : ne sert qu'à la chute et à l'écrasement des boules */
      const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -G, 0) })
      world.broadphase = new CANNON.SAPBroadphase(world)
      ;(world.solver as any).iterations = 14
      const matSnow = new CANNON.Material('snow')
      world.addContactMaterial(new CANNON.ContactMaterial(matSnow, matSnow, { friction: 0.9, restitution: 0.02 }))
      world.addBody(new CANNON.Body({
        type: CANNON.Body.STATIC, material: matSnow, shape: new CANNON.Plane(),
        quaternion: new CANNON.Quaternion().setFromEuler(-Math.PI / 2, 0, 0)
      }))

      const snowMat = new T.MeshStandardMaterial({
        color: 0xFAFDFF, map: snowMap, normalMap: snowNrm, roughness: 0.78, metalness: 0.02
      })
      const ballGeo = new T.SphereGeometry(1, 30, 22)

      S = {
        stage, CANNON, world, matSnow, snowMat, ballGeo, trail, fall,
        phase: 'roll', stack: [], r: R0, ball: null, dropping: false, done: false,
        look: defLook(), cat: 'hat' as CatId, deco: null, puffs: [],
        orbit: orbitCam(stage, 5.6, 2.1, [0, 0.7, 0]),
        step: fixedStep()
      }
      newBall()

      /* --- Rouler la boule : glisser le doigt --- */
      let dragging = false
      let lastPt: { x: number; y: number } | null = null
      const fwd = new T.Vector3(), right = new T.Vector3(), move = new T.Vector3()

      const onDown = (e: PointerEvent) => {
        if (!S || S.phase !== 'roll' || !S.ball) return
        dragging = true
        lastPt = { x: e.clientX, y: e.clientY }
        $('snHint').style.opacity = '0'
      }
      const onMove = (e: PointerEvent) => {
        if (!S || !dragging || !lastPt || !S.ball) return
        const dx = e.clientX - lastPt.x, dy = e.clientY - lastPt.y
        lastPt = { x: e.clientX, y: e.clientY }
        // Le doigt pousse dans le repère de la caméra : « vers le haut » = « vers le fond »
        stage.camera.getWorldDirection(fwd)
        fwd.y = 0; fwd.normalize()
        right.set(fwd.z, 0, -fwd.x)
        move.copy(right).multiplyScalar(dx * 0.011).add(fwd.clone().multiplyScalar(-dy * 0.011))
        const dist = move.length()
        if (dist < 0.0004) return

        const b = S.ball
        const cap = CAPS[S.stack.length]
        b.position.add(move)
        // On reste dans le champ de neige
        const lim = FIELD - S.r
        b.position.x = Math.max(-lim, Math.min(lim, b.position.x))
        b.position.z = Math.max(-lim, Math.min(lim, b.position.z))

        if (S.r < cap) {
          S.r = Math.min(cap, S.r + dist * GROW)
          if (S.r >= cap) { ctx.toast('Elle est énorme ! Pose-la 👇'); tone(880, 0.12, 'triangle', 0.12) }
        }
        b.scale.setScalar(S.r)
        b.position.y = S.r

        // Rotation de roulement autour de l'axe perpendiculaire au déplacement
        const axis = new T.Vector3(move.z, 0, -move.x).normalize()
        b.rotateOnWorldAxis(axis, dist / S.r)

        digAt(b.position.x, b.position.z, S.r * 1.15)
        S.rolled = (S.rolled || 0) + dist
        if (S.rolled > 0.55) { S.rolled = 0; sCrunch() }
        paintUI()
      }
      const onUp = () => { dragging = false; lastPt = null }

      stage.renderer.domElement.addEventListener('pointerdown', onDown)
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)

      /* --- Boutons --- */
      ;($('snPlace') as HTMLButtonElement).onclick = () => placeBall()
      $('snLeft').onclick = () => { S?.orbit.turn(-0.6); sPop() }
      $('snRight').onclick = () => { S?.orbit.turn(0.6); sPop() }
      $('snDone').onclick = () => finish()
      $('snAgain').onclick = () => {
        if (!S) return
        S.look = {
          hat: pick(['none', 'tophat', 'bonnet', 'crown']),
          scarf: pick(['none', ...SCARVES]),
          eyes: pick(['coal', 'button', 'star']),
          nose: pick(['carrot', 'dot']),
          arms: pick(['branch', 'mitten', 'none']),
          buttons: pick(['none', ...BTNCOLS])
        }
        sPop(); buildDeco(); paintUI()
      }
      paintUI()

      /* --- Boucle --- */
      stage.start((dt) => {
        if (!S) return
        // Pendant le roulage la caméra suit la boule : elle ne sort jamais du cadre
        if (S.phase === 'roll' && S.ball) {
          S.orbit.look = [S.ball.position.x * 0.75, 0.7, S.ball.position.z * 0.75]
        }
        S.orbit.update(dt)

        // Neige qui tombe : recyclage des flocons arrivés au sol
        const p = fall.pos
        for (let i = 0; i < fall.N; i++) {
          p[i * 3 + 1] -= dt * (0.5 + (i % 7) * 0.09)
          p[i * 3] += Math.sin((performance.now() / 1400) + i) * dt * 0.12
          if (p[i * 3 + 1] < 0) { p[i * 3 + 1] = 11 + Math.random() * 2 }
        }
        fall.pts.geometry.attributes.position.needsUpdate = true

        S.step(dt, () => {
          world.step(1 / 60)
          for (const e of S.stack) {
            if (e.settled) continue
            // Rail vertical : la chute est simulée, la dérive latérale ne l'est pas
            e.body.position.x = e.tx
            e.body.position.z = e.tz
            e.body.velocity.x = 0
            e.body.velocity.z = 0
            e.t += 1 / 60
          }
        })
        for (const e of S.stack) {
          if (e.settled) continue
          e.mesh.position.copy(e.body.position as any)
          e.mesh.quaternion.copy(e.body.quaternion as any)
          // Écrasement à l'impact : la boule s'aplatit puis retrouve sa forme
          const rest = (S.stack.indexOf(e) ? S.stack[S.stack.indexOf(e) - 1].topY : 0) + e.r
          if (!e.landed && e.body.position.y <= rest + 0.02) {
            e.landed = true
            e.squash = 1
            puff(e.tx, e.body.position.y - e.r, e.tz, 18)
            sCrunch()
          }
          if (e.squash > 0) {
            e.squash = Math.max(0, e.squash - dt * 3.4)
            const k = Math.sin(e.squash * Math.PI * 2.2) * e.squash * 0.22
            e.mesh.scale.set(e.r * (1 + k), e.r * (1 - k), e.r * (1 + k))
          } else e.mesh.scale.setScalar(e.r)
          if (e.t > 0.3 && e.body.velocity.length() < 0.14) settle(e)
          else if (e.t > 4) settle(e) // filet de sécurité : on ne bloque jamais le jeu
        }
        stepPuffs(dt)
      })

      S.cleanup = () => {
        stage.renderer.domElement.removeEventListener('pointerdown', onDown)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        trail.tex.dispose()
        stage.dispose()
      }
    })().catch(() => { hideLoader(); ctx.toast('La 3D n\'est pas disponible ici 😕') })

    return () => {
      dead = true
      if (S) {
        try { S.cleanup?.() } catch { /* déjà démonté */ }
        S = null
      }
    }
  }
}
