import type { GameContext, GameDef } from '../core/types'
import { $ } from '../core/utils'
import { sCrunch, sPop, sWin, tone } from '../core/audio'
import { confetti } from '../core/fx'
import {
  createStage, loadPhysics, loader, fixedStep, orbitCam, woodTex, bumpyNormal, picker,
  loadModel, fitModel,
  type Stage, type Cannon
} from '../core/three3d'
import { particles } from '../core/scene3d'
import { ICON } from '../core/icons'
import { foodImg } from '../core/sprites'
import { sfx, preloadSfx } from '../core/sfx'

/* 🍕 La Pizzeria 3D — un vrai bac à sable, façon cuisine pour enfants :
   AUCUNE étape imposée. On étale la sauce au doigt, on lâche les ingrédients
   qui TOMBENT et roulent pour de vrai sur la pâte (et parfois à côté…), on
   enfourne quand on veut — le four chauffe, la pâte dore, le fromage fond,
   et si on l'oublie elle NOIRCIT et fume — on ressort quand on veut, et on
   mange les parts une par une. Les outils sont les rendus du Food Kit.

   Contrôles refaits le 12/09 (« on ne comprend rien ») : **une seule action à
   la fois**. On garnit, un gros bouton unique enfourne, et la cuisson devient
   un VRAI petit jeu : une jauge se remplit, une zone verte = pizza parfaite,
   et il faut taper « Sortir » au bon moment. Trop tôt elle est pâle (on peut
   la remettre au four), trop tard elle est brûlée. Ensuite seulement on mange
   les parts, et la partie se termine d'elle-même quand tout est mangé. */

const PR = 0.56            // rayon de la pizza
const PR_IN = PR - 0.075   // rayon de la garniture (à l'intérieur de la croûte)
const PH = 0.05            // épaisseur de la pâte
const SLICES = 6
const OVEN_Z = -1.5
const G = 9.82

type ToolId = 'tomato' | 'cream' | 'cheese' | 'mushroom' | 'olive' | 'slice' | 'corn' | 'basil' | 'eat'

/** Une tache de sauce, pour les deux outils qui n'ont pas de rendu Food Kit. */
const blob = (c: string) => `<svg viewBox="0 0 48 48" width="40" height="40"><path d="M24 6c8 0 17 6 17 15 0 8-5 10-5 15 0 3-4 6-12 6S8 39 8 34c0-5-4-7-4-13C4 12 14 6 24 6z" fill="${c}"/><ellipse cx="18" cy="16" rx="4" ry="2.5" fill="rgba(255,255,255,.35)"/></svg>`
const mushroomSVG = `<svg viewBox="0 0 48 48" width="40" height="40"><path d="M6 24c0-11 8-18 18-18s18 7 18 18c0 2-1 3-3 3H9c-2 0-3-1-3-3z" fill="#E7D5BD"/><circle cx="17" cy="15" r="3" fill="#fff"/><circle cx="29" cy="12" r="2.4" fill="#fff"/><path d="M17 27h14l-2 13c0 2-2 3-5 3s-5-1-5-3z" fill="#F4E9D8"/></svg>`
const pepperSVG = `<svg viewBox="0 0 48 48" width="40" height="40"><path d="M15 14c-6 2-9 9-8 17s7 12 17 12 16-4 17-12-2-15-8-17c-3-1-6 1-9 1s-6-2-9-1z" fill="#4C9E4A"/><path d="M24 14c0-4 1-7 4-9" stroke="#2F6B2E" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M14 20c-2 4-2 10 0 15" stroke="#76BF6A" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`
const TOOLS: { id: ToolId; icon: string }[] = [
  { id: 'tomato', icon: blob('#CE3A26') }, { id: 'cream', icon: blob('#FFF3DC') },
  { id: 'cheese', icon: foodImg('cheese', 40) }, { id: 'mushroom', icon: mushroomSVG },
  { id: 'olive', icon: foodImg('onion', 40) }, { id: 'slice', icon: foodImg('tomato', 40) },
  { id: 'corn', icon: foodImg('corn', 40) }, { id: 'basil', icon: pepperSVG },
  { id: 'eat', icon: foodImg('plate-dinner', 40) }
]
/** Au-delà, la pizza noircit ; la jauge de cuisson va jusque-là. */
const BURNT = 1.5
/** La zone parfaite de la jauge (en fraction de BURNT). */
const PERFECT_FROM = 0.62, PERFECT_TO = 0.92
/** Trois temps : on garnit, ça cuit (mini-jeu), c'est servi (on mange). */
type Phase = 'garnir' | 'cuisson' | 'servi'
const SAUCES: Record<string, string> = { tomato: 'rgba(206,58,38,1)', cream: 'rgba(255,243,220,1)' }

let ctx: GameContext
let S: any = null

/* ---------- Pâte crue peinte sur une texture : la sauce s'y étale ---------- */
function doughCanvas() {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const g = c.getContext('2d')!
  g.fillStyle = '#F0DCAE'; g.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `hsla(${36 + Math.random() * 14},${45 + Math.random() * 25}%,${74 + Math.random() * 18}%,.45)`
    g.beginPath(); g.arc(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 3.5, 0, 7); g.fill()
  }
  return { c, g }
}

/** Pose une tache de sauce à la position monde (x,z) de la pizza. */
function paintSauce(x: number, z: number, color: string) {
  const { g, tex } = S.sauce
  // La face du dessus d'un CylinderGeometry a ses UV en (u = z, v = x), et la
  // texture canvas est retournée verticalement (flipY). Le doigt touche (x, z)
  // → le canvas se peint en (z, −x). Peindre en (x, z) mettait la tache à
  // l'OPPOSÉ du doigt — vécu sur tablette, corrigé ici.
  const px = ((z / PR_IN) * 0.5 + 0.5) * 512
  const py = ((-x / PR_IN) * 0.5 + 0.5) * 512
  const rad = 52
  const grad = g.createRadialGradient(px, py, 4, px, py, rad)
  grad.addColorStop(0, color)
  grad.addColorStop(0.62, color)
  grad.addColorStop(1, color.replace(/1\)$/, '0)'))
  g.fillStyle = grad
  g.beginPath(); g.arc(px, py, rad, 0, 7); g.fill()
  tex.needsUpdate = true
}

/* ---------- Fabrique d'ingrédients ----------
   Chaque ingrédient est un vrai modèle glTF (Kenney Food Kit), pré-chargé une
   fois puis cloné. Les primitives d'avant — un cube pour le fromage, une sphère
   aplatie pour le basilic — ne pouvaient pas donner autre chose que du plastique. */
const MODELS: Record<string, { file: string; size: number; r: number; melt: boolean }> = {
  mushroom: { file: 'mushroom', size: 0.095, r: 0.042, melt: false },
  olive: { file: 'onion-half', size: 0.075, r: 0.032, melt: false },
  slice: { file: 'tomato-slice', size: 0.105, r: 0.046, melt: false },
  corn: { file: 'corn', size: 0.08, r: 0.032, melt: false },
  basil: { file: 'pepper', size: 0.085, r: 0.034, melt: false }
}

/** Une flaque de mozzarella : une demi-sphère bosselée et aplatie. Le kit Food
    n'a qu'une MEULE de fromage (avec son couteau !) — illisible sur une pizza. */
function cheeseDef(T: any) {
  const mat = new T.MeshStandardMaterial({ color: 0xD8A93F, roughness: 0.42, metalness: 0.02 })
  return {
    r: 0.05, melt: true,
    make: () => {
      const g = new T.SphereGeometry(0.058, 16, 10)
      const pos = g.attributes.position
      const seed = Math.random() * 9
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
        const n = 1 + Math.sin(x * 44 + seed) * 0.16 + Math.cos(z * 37 - seed) * 0.13
        pos.setXYZ(i, x * n, y * 0.4, z * n)
      }
      g.computeVertexNormals()
      return new T.Mesh(g, mat)
    }
  }
}

/** Charge tous les modèles d'un coup : un ingrédient ne doit jamais faire attendre. */
async function preloadIngredients(T: any) {
  const kit: Record<string, any> = { cheese: cheeseDef(T) }
  await Promise.all(Object.entries(MODELS).map(async ([id, def]) => {
    const proto = await loadModel('food', def.file)
    fitModel(T, proto, def.size)
    kit[id] = { r: def.r, melt: def.melt, make: () => proto.clone(true) }
  }))
  return kit
}

function ingredientKitFallback(T: any) {
  const std = (c: number, r = 0.7) => new T.MeshStandardMaterial({ color: c, roughness: r })
  const capGeo = new T.SphereGeometry(0.06, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)
  const stemGeo = new T.CylinderGeometry(0.018, 0.022, 0.045, 8)
  const mushMat = std(0xE7D5BD, 0.85)
  return {
    cheese: cheeseDef(T),
    mushroom: {
      r: 0.056, melt: false,
      make: () => {
        const g = new T.Group()
        const cap = new T.Mesh(capGeo, mushMat)
        cap.position.y = 0.012
        const stem = new T.Mesh(stemGeo, mushMat)
        stem.position.y = -0.012
        g.add(cap, stem)
        return g
      }
    },
    olive: {
      r: 0.042, melt: false,
      make: () => {
        const m = new T.Mesh(new T.TorusGeometry(0.036, 0.016, 8, 14), std(0x2F2A38, 0.42))
        m.rotation.x = Math.PI / 2
        return m
      }
    },
    slice: {
      r: 0.064, melt: false,
      make: () => new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 0.022, 16), std(0xDD4E38, 0.55))
    },
    corn: {
      r: 0.024, melt: false,
      make: () => new T.Mesh(new T.CapsuleGeometry(0.016, 0.02, 4, 8), std(0xFFC63C, 0.5))
    },
    basil: {
      r: 0.04, melt: false,
      make: () => {
        const m = new T.Mesh(new T.SphereGeometry(0.062, 10, 7), std(0x4C9E4A, 0.8))
        m.scale.set(1, 0.28, 0.7)
        return m
      }
    }
  }
}

/** Chaque ingrédient a SA note : l'oreille reconnaît ce qu'on saupoudre. */
const NOTE: Record<string, number> = {
  cheese: 523, mushroom: 349, olive: 294, slice: 440, corn: 784, basil: 587
}

/* ---------- Lâcher un ingrédient ---------- */
function drop(kind: ToolId, x: number, z: number) {
  if (!S || S.inOven) return
  const { scene } = S.stage
  const CANNON: Cannon = S.CANNON
  const kit = S.kit[kind]
  if (!kit) return
  const obj = kit.make()
  obj.position.set(x, 0.62, z)
  obj.castShadow = true
  scene.add(obj)
  const body = new CANNON.Body({
    mass: 0.05, material: S.matFood,
    shape: new CANNON.Sphere(kit.r),
    position: new CANNON.Vec3(x, 0.62, z)
  })
  body.linearDamping = 0.12
  body.angularDamping = 0.35
  body.angularVelocity.set((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5)
  S.world.addBody(body)
  S.loose.push({ obj, body, kind, melt: kit.melt, t: 0 })
  tone(NOTE[kind] || 440, 0.07, 'triangle', 0.06)
}

/** Une fois posé, l'ingrédient rejoint sa part de pizza : plus de physique à simuler. */
function attach(item: any) {
  const { T, scene } = S.stage
  S.world.removeBody(item.body)
  const p = item.obj.position
  const d = Math.hypot(p.x, p.z)
  if (d < PR) {
    let ang = Math.atan2(p.x, p.z)
    if (ang < 0) ang += Math.PI * 2
    const wi = Math.min(SLICES - 1, Math.floor(ang / (Math.PI * 2 / SLICES)))
    const w = S.wedges[wi]
    if (w && !w.eaten) { w.group.attach(item.obj); w.items.push(item) }
    else scene.remove(item.obj)
  }
  // Tombé à côté : il reste sur le plan de travail, c'est la vie
  if (item.melt) S.melting.push(item)
  // Une pincée de farine soulevée : le contact se VOIT
  S.smoke.burst({ x: p.x, y: p.y + 0.02, z: p.z },
    { count: 4, color: [0xFFF4DC, 0xE9D6B0], speed: 0.22, spread: 0.5, life: 0.5, size: 0.05, gravity: -0.4 })
  void T
}

/* ---------- Four ---------- */
/** Change de phase : à chaque instant, UNE SEULE chose à faire. */
function setPhase(p: Phase) {
  if (!S) return
  S.phase = p
  S.inOven = p === 'cuisson'
  const show = (id: string, on: boolean) => { const e = document.getElementById(id); if (e) e.style.display = on ? '' : 'none' }
  show('pzTools', p === 'garnir')
  show('pzOvenItem', p === 'garnir')
  show('pzEatItem', p === 'servi')
  show('pzDoneItem', p === 'servi')
  $('pzCook').classList.toggle('on', p === 'cuisson')
  paintGauge()
  if (p === 'servi') S.tool = 'eat'
  paintUI()
}

/** On enfourne : la jauge démarre. */
function toOven() {
  if (!S || S.ended || S.phase === 'cuisson') return
  S.ovenT = 0
  setPhase('cuisson')
  sfx('cloth', { vol: 0.5, rate: 0.8 })
  tone(180, 0.5, 'sawtooth', 0.06)
}

/** La jauge : le curseur avance, la zone verte est la cuisson parfaite.
    Pour une enfant qui ne lit pas, l'ENTRÉE dans la zone doit s'entendre :
    la jauge s'illumine et un carillon sonne — c'est le signal du geste. */
function paintGauge(dt = 0) {
  const k = S.bake / BURNT
  const n = document.getElementById('pzNeedle')
  if (n) n.style.left = `${Math.min(100, k * 100)}%`
  const good = k >= PERFECT_FROM && k <= PERFECT_TO
  if (good !== S.perfect) {
    S.perfect = good
    document.getElementById('pzCook')?.classList.toggle('go', good)
    if (good) { tone(880, 0.14, 'triangle', 0.09); tone(1320, 0.16, 'triangle', 0.07, 0.1) }
    else tone(200, 0.2, 'sawtooth', 0.07)
  }
  // Un tic-tac qui s'accélère à l'approche : l'oreille compte à rebours
  const period = k < PERFECT_FROM ? 0.34 : good ? 0.16 : 0.5
  S.tickT = (S.tickT || 0) + dt
  if (dt > 0 && S.tickT >= period) {
    S.tickT = 0
    tone(good ? 660 : 420, 0.04, 'square', good ? 0.05 : 0.03)
  }
}

/** Un mot-image au centre : le verdict de la cuisson. */
function verdict(html: string, cls = '') {
  const v = $('pzVerdict')
  v.innerHTML = html
  v.className = 'pz-verdict show ' + cls
  ctx.after(2400, () => { const e = document.getElementById('pzVerdict'); if (e) e.className = 'pz-verdict' })
}

/** Sortir la pizza : LE geste du mini-jeu. Trop tôt, elle repart au four —
    aucune sanction (on est dans Créer), juste une pizza pâle à recuire. */
function pullOut() {
  if (!S || S.ended || S.phase !== 'cuisson') return
  const k = S.bake / BURNT
  sPop()
  S.perfect = false
  document.getElementById('pzCook')?.classList.remove('go')
  if (k < PERFECT_FROM) {
    setPhase('garnir')
    verdict(`${ICON.clock}<span class="pz-vmore">${ICON.flame}</span>`, 'pale')
    const o = document.getElementById('pzOvenItem')
    if (o) { o.classList.add('pulse'); ctx.after(2600, () => document.getElementById('pzOvenItem')?.classList.remove('pulse')) }
    tone(230, 0.3, 'sine', 0.08)
  } else if (k <= PERFECT_TO) {
    setPhase('servi')
    verdict(ICON.star, 'perfect')
    confetti()
    sWin()
  } else {
    setPhase('servi')
    verdict(ICON.flame, 'burnt')
    tone(110, 0.5, 'sawtooth', 0.07)
    sfx('cloth', { vol: 0.5, rate: 0.6 })
  }
}

/* ---------- Manger ---------- */
function eatWedge(wi: number) {
  const w = S.wedges[wi]
  if (!w || w.eaten) return
  w.eaten = true
  w.fade = 0
  S.eaten++
  sCrunch()
  tone(300 + S.eaten * 40, 0.1, 'triangle', 0.1)
  if (S.eaten >= SLICES) ctx.after(700, () => S && finish())
}

function finish() {
  if (!S || S.ended) return
  S.ended = true
  confetti()
  sWin()
  const n = S.dropped
  const burnt = S.bake / BURNT > PERFECT_TO
  ctx.finish({
    title: S.eaten >= SLICES ? (burnt ? 'Toute noire… et dévorée !' : 'Pizza dévorée !') : burnt ? 'Un peu trop cuite !' : 'Quelle belle pizza !',
    msg: `${ctx.playerName} a posé ${n} ingrédient${n > 1 ? 's' : ''}`,
    stars: 3, starsEarned: 3
  })
}

/* ---------- Interface ---------- */
function paintUI() {
  if (!S) return
  $('pzTools').querySelectorAll<HTMLElement>('.g3-tool').forEach(b => {
    b.classList.toggle('sel', b.dataset.t === S.tool)
  })
}

export const pizza: GameDef = {
  id: 'pizza', name: 'La Pizzeria', icon: '🍕', sq: 'sq-peach', cat: 'creatif', music: 'kitchen',
  subtitle: 'Sauce au doigt, ingrédients qui tombent, four bien chaud… puis on croque !',
  mount(c) {
    ctx = c
    let dead = false
    c.root.innerHTML = `
      <div class="topbar">
        <button class="chip" id="pzLeft" aria-label="Tourner">${ICON.turnLeft}</button>
        <button class="chip" id="pzRight" aria-label="Tourner">${ICON.turnRight}</button>
      </div>
      <div class="arena g3-arena pz-arena" id="pzArena">
        <!-- LE mini-jeu de cuisson : la jauge, sa zone verte, le curseur -->
        <div class="pz-cook" id="pzCook">
          <div class="pz-gauge"><span class="pz-perfect"></span><b id="pzNeedle"></b></div>
          <span class="tool-item">
            <button class="sn-tool pz-pull" id="pzOut" aria-label="Sortir la pizza">${ICON.out}</button>
            <i class="tool-cap">Sortir !</i>
          </span>
        </div>
        <div class="pz-verdict" id="pzVerdict"></div>
      </div>
      <div class="g3-bar">
        <div class="g3-row" id="pzTools">
          ${TOOLS.filter(t => t.id !== 'eat').map(t => `<button class="g3-tool" data-t="${t.id}" aria-label="${t.id}">${t.icon}</button>`).join('')}
        </div>
        <div class="g3-row" id="pzActions">
          <span class="tool-item" id="pzOvenItem">
            <button class="sn-tool pz-act" id="pzOven" aria-label="Au four">${ICON.flame}</button>
            <i class="tool-cap">Au four</i></span>
          <span class="tool-item" id="pzEatItem" style="display:none">
            <button class="sn-tool pz-eat" id="pzEat" aria-label="Manger">${TOOLS.find(t => t.id === 'eat')!.icon}</button>
            <i class="tool-cap">Mange !</i></span>
          <span class="tool-item" id="pzDoneItem" style="display:none">
            <button class="sn-tool go" id="pzDone" aria-label="Fini">${ICON.check}</button>
            <i class="tool-cap">Fini</i></span>
        </div>
      </div>`

    const arena = $('pzArena')
    const hideLoader = loader(arena, '🍕')
    preloadSfx(['cloth', 'tick', 'chop'])

    ;(async () => {
      const [, CANNON] = await loadPhysics()
      if (dead) return
      const stage: Stage = await createStage(arena, {
        sky: '#241811',
        fog: [3.2, 9], fogColor: '#241811',
        cam: [0, 1.2, 1.6], target: [0, 0.06, 0], fov: 46,
        hemi: ['#FFE6C4', '#3A2618', 0.75],
        sun: { pos: [1.6, 3.2, 2.2], color: '#FFEFD2', intensity: 2.1, area: 3, far: 10 },
        fill: 0.3, exposure: 0.88
      })
      if (dead) { stage.dispose(); return }
      hideLoader()
      const T = stage.T
      const scene = stage.scene

      /* --- Plan de travail --- */
      const counterMat = new T.MeshStandardMaterial({
        map: stage.keep(woodTex(T, '#7A5533', 2)),
        normalMap: stage.keep(bumpyNormal(T, 5, 6)),
        roughness: 0.72, metalness: 0.02
      })
      const counter = new T.Mesh(new T.PlaneGeometry(14, 14), counterMat)
      counter.rotation.x = -Math.PI / 2
      counter.receiveShadow = true
      scene.add(counter)

      /* --- Le four à bois : une vraie voûte en berceau, ouverte vers nous --- */
      const oven = new T.Group()
      const brickTex = stage.keep(bumpyNormal(T, 20, 5))
      const brick = new T.MeshStandardMaterial({
        color: 0xB4553E, roughness: 0.96, normalMap: brickTex, normalScale: new T.Vector2(0.8, 0.8)
      })
      const soot = new T.MeshStandardMaterial({ color: 0x3A2318, roughness: 1, side: T.BackSide })
      const VAULT_R = 0.74, VAULT_L = 1.05, VAULT_Z = OVEN_Z - 0.18

      // Intérieur : demi-cylindre couché, vu de l'intérieur
      const vault = new T.Mesh(
        new T.CylinderGeometry(VAULT_R, VAULT_R, VAULT_L, 22, 1, true, 0, Math.PI),
        soot
      )
      vault.rotation.set(Math.PI / 2, 0, -Math.PI / 2)
      vault.position.set(0, 0, VAULT_Z)
      // Fond du four
      const back = new T.Mesh(
        new T.CircleGeometry(VAULT_R, 22, 0, Math.PI),
        new T.MeshStandardMaterial({ color: 0x33200F, roughness: 1 })
      )
      back.position.set(0, 0, VAULT_Z - VAULT_L / 2)
      // Sole (le sol du four), un peu plus sombre que le plan de travail
      const sole = new T.Mesh(
        new T.PlaneGeometry(VAULT_R * 2, VAULT_L),
        new T.MeshStandardMaterial({ color: 0x6A4B34, roughness: 0.95 })
      )
      sole.rotation.x = -Math.PI / 2
      sole.position.set(0, 0.004, VAULT_Z)
      // Extérieur en brique + encadrement de la bouche
      const shell = new T.Mesh(
        new T.CylinderGeometry(VAULT_R + 0.16, VAULT_R + 0.16, VAULT_L + 0.1, 22, 1, true, 0, Math.PI),
        brick
      )
      shell.rotation.copy(vault.rotation)
      shell.position.copy(vault.position)
      shell.castShadow = true
      const frame = new T.Mesh(new T.RingGeometry(VAULT_R, VAULT_R + 0.16, 22, 1, 0, Math.PI), brick)
      frame.position.set(0, 0, VAULT_Z + VAULT_L / 2 + 0.03)
      const hearth = new T.Mesh(new T.BoxGeometry(VAULT_R * 2 + 0.34, 0.09, VAULT_L + 0.24), brick)
      hearth.position.set(0, -0.045, VAULT_Z)
      hearth.receiveShadow = true

      /* Le feu : de VRAIES langues de flammes qui dansent, pas un rond orange.
         Une texture de flamme (goutte, cœur clair → pointe rouge qui s'éteint)
         sur des sprites additifs : ils se superposent en brillant, chacun avec
         son rythme, plus quelques braises qui montent. */
      const fc = document.createElement('canvas')
      fc.width = 64; fc.height = 128
      const fg = fc.getContext('2d')!
      fg.translate(32, 0)
      const flamePath = new Path2D()
      flamePath.moveTo(0, 8)
      flamePath.bezierCurveTo(26, 52, 25, 88, 0, 120)
      flamePath.bezierCurveTo(-25, 88, -26, 52, 0, 8)
      const fgrad = fg.createLinearGradient(0, 120, 0, 6)
      fgrad.addColorStop(0, 'rgba(255,246,196,0.95)')
      fgrad.addColorStop(0.4, 'rgba(255,176,58,0.9)')
      fgrad.addColorStop(0.78, 'rgba(226,84,30,0.6)')
      fgrad.addColorStop(1, 'rgba(190,40,18,0)')
      fg.fillStyle = fgrad
      fg.fill(flamePath)
      const flameTex = stage.keep(new T.CanvasTexture(fc))
      flameTex.colorSpace = T.SRGBColorSpace
      const fireGroup = new T.Group()
      fireGroup.position.set(0, 0.02, VAULT_Z - VAULT_L / 2 + 0.18)
      const flames: any[] = []
      for (let i = 0; i < 6; i++) {
        const sp = new T.Sprite(new T.SpriteMaterial({
          map: flameTex, blending: T.AdditiveBlending, depthWrite: false,
          transparent: true, opacity: 0.9
        }))
        const base = 0.13 + Math.random() * 0.1
        sp.position.set(-0.26 + i * 0.104 + (Math.random() - 0.5) * 0.03, base, (Math.random() - 0.5) * 0.05)
        fireGroup.add(sp)
        flames.push({ sp, base, phase: Math.random() * 9, speed: 80 + Math.random() * 40 })
      }
      // Braises : des étincelles qui montent et s'éteignent, puis repartent
      const embers: any[] = []
      for (let i = 0; i < 5; i++) {
        const sp = new T.Sprite(new T.SpriteMaterial({
          map: flameTex, blending: T.AdditiveBlending, depthWrite: false,
          transparent: true, opacity: 0.8
        }))
        sp.scale.set(0.014, 0.02, 1)
        sp.position.set((Math.random() - 0.5) * 0.5, Math.random() * 0.3, 0)
        fireGroup.add(sp)
        embers.push({ sp, vy: 0.14 + Math.random() * 0.12, sway: Math.random() * 9 })
      }
      // Bûches
      const logMat = new T.MeshStandardMaterial({ color: 0x4A2E1B, roughness: 1 })
      for (let i = 0; i < 3; i++) {
        const log = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 0.34, 8), logMat)
        log.rotation.z = Math.PI / 2
        log.rotation.y = (i - 1) * 0.3
        log.position.set(-0.32 + i * 0.06, 0.04 + i * 0.05, VAULT_Z - VAULT_L / 2 + 0.2)
        oven.add(log)
      }
      oven.add(vault, back, sole, shell, frame, hearth, fireGroup)
      scene.add(oven)
      const fireLight = new T.PointLight(0xFF7A22, 6, 3.2, 2)
      fireLight.position.copy(fireGroup.position)
      fireLight.position.y = 0.22
      scene.add(fireLight)

      /* --- La pizza : 6 parts indépendantes, pour pouvoir la manger --- */
      const dc = doughCanvas()
      const sauceTex = new T.CanvasTexture(dc.c)
      sauceTex.colorSpace = T.SRGBColorSpace
      sauceTex.anisotropy = 4
      const doughMat = new T.MeshStandardMaterial({ map: sauceTex, roughness: 0.82 })
      const sideMat = new T.MeshStandardMaterial({ color: 0xEBD3A2, roughness: 0.85 })
      const crustMat = new T.MeshStandardMaterial({
        color: 0xE9C88A, roughness: 0.78,
        normalMap: stage.keep(bumpyNormal(T, 14, 3)), normalScale: new T.Vector2(0.5, 0.5)
      })

      const pizzaGroup = new T.Group()
      scene.add(pizzaGroup)
      const step = (Math.PI * 2) / SLICES
      const wedges: any[] = []
      for (let i = 0; i < SLICES; i++) {
        const a0 = i * step
        const g = new T.Group()
        const dough = new T.Mesh(
          new T.CylinderGeometry(PR_IN, PR_IN * 0.97, PH, 22, 1, false, a0, step),
          [sideMat, doughMat, sideMat]
        )
        dough.position.y = PH / 2
        dough.castShadow = true; dough.receiveShadow = true
        g.add(dough)
        // Croûte : un boudin suivant l'arc de la part
        const pts: any[] = []
        for (let k = 0; k <= 8; k++) {
          const a = a0 + (k / 8) * step
          pts.push(new T.Vector3(Math.sin(a) * (PR - 0.05), PH * 0.75, Math.cos(a) * (PR - 0.05)))
        }
        const crust = new T.Mesh(
          new T.TubeGeometry(new T.CatmullRomCurve3(pts), 12, 0.055, 10, false),
          crustMat
        )
        crust.castShadow = true; crust.receiveShadow = true
        g.add(crust)
        pizzaGroup.add(g)
        wedges.push({ group: g, items: [], eaten: false, fade: -1, a0, a1: a0 + step })
      }

      /* --- Physique --- */
      const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -G, 0) })
      world.broadphase = new CANNON.SAPBroadphase(world)
      ;(world.solver as any).iterations = 10
      const matFood = new CANNON.Material('food')
      world.addContactMaterial(new CANNON.ContactMaterial(matFood, matFood, { friction: 0.62, restitution: 0.08 }))
      world.addBody(new CANNON.Body({
        type: CANNON.Body.STATIC, material: matFood, shape: new CANNON.Plane(),
        quaternion: new CANNON.Quaternion().setFromEuler(-Math.PI / 2, 0, 0)
      }))
      // Galette : un cylindre couché (cannon oriente ses cylindres sur Z)
      const disc = new CANNON.Body({ type: CANNON.Body.STATIC, material: matFood })
      disc.addShape(
        new CANNON.Cylinder(PR, PR, PH, 16),
        new CANNON.Vec3(0, PH / 2, 0)
      )
      world.addBody(disc)

      S = {
        stage, CANNON, world, matFood, kit: ingredientKitFallback(T),
        sauce: { g: dc.g, tex: sauceTex },
        doughMat, crustMat, sideMat, pizzaGroup, wedges, flames, embers, fireLight,
        loose: [], melting: [], tool: 'tomato' as ToolId, dropped: 0, eaten: 0,
        bake: 0, inOven: false, ended: false, smokeT: 0,
        phase: 'garnir' as Phase, perfect: false,
        // La jauge doit rester JOUABLE : ~10 s de bout en bout en douce, 4,5 s en expert
        bakeRate: 1 / ctx.byTier(10, 6.5, 4.5), lastDrop: 0, tickT: 0,
        smoke: particles(stage, 200),
        orbit: orbitCam(stage, 1.55, 1.05, [0, 0.06, 0]),
        step: fixedStep()
      }
      setPhase('garnir')

      /* Les vrais modèles remplacent les primitives dès qu'ils sont là. Le jeu
         reste jouable pendant le chargement grâce au jeu de secours. */
      preloadIngredients(T)
        .then(kit => { if (S) { S.kit = kit; S.realModels = true } })
        .catch(() => ctx.toast('Modèles 3D indisponibles, formes simples 🍕'))

      /* --- Toucher la pizza --- */
      const pick = picker(stage)
      let painting = false

      const hitPizza = (e: PointerEvent) => {
        const hits = pick(e, [pizzaGroup], true)
        return hits.length ? hits[0] : null
      }

      const act = (e: PointerEvent, first: boolean) => {
        if (!S || S.ended) return
        const h = hitPizza(e)
        if (!h) return
        // Coordonnées locales de la pizza (le groupe bouge quand elle est au four)
        const p = pizzaGroup.worldToLocal(h.point.clone())
        if (S.tool === 'tomato' || S.tool === 'cream') {
          painting = true
          paintSauce(p.x, p.z, SAUCES[S.tool])
          if (first) tone(240, 0.07, 'sine', 0.06)
          return
        }
        if (S.tool === 'eat') {
          if (!first) return
          let ang = Math.atan2(p.x, p.z)
          if (ang < 0) ang += Math.PI * 2
          eatWedge(Math.min(SLICES - 1, Math.floor(ang / step)))
          return
        }
        if (S.phase === 'cuisson') { if (first) sfx('tick', { vol: 0.3, rate: 0.7 }); return }
        // SAUPOUDRAGE : on garde le doigt posé et on sème un filet d'ingrédients
        // (un tap = un morceau, un glissé = une pluie). Plafonné pour que la
        // physique ne s'effondre pas sous 300 champignons.
        painting = true
        const t = performance.now()
        if (!first && t - S.lastDrop < 110) return
        if (S.dropped >= 140) { if (first) sfx('tick', { vol: 0.25, rate: 0.6 }); return }
        S.lastDrop = t
        // Un peu de dispersion : deux taps au même endroit ne donnent pas deux clones
        drop(S.tool, p.x + (Math.random() - 0.5) * 0.05, p.z + (Math.random() - 0.5) * 0.05)
        S.dropped++
      }

      const onDown = (e: PointerEvent) => act(e, true)
      const onMove = (e: PointerEvent) => { if (painting) act(e, false) }
      const onUp = () => { painting = false }
      stage.renderer.domElement.addEventListener('pointerdown', onDown)
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)

      $('pzTools').querySelectorAll<HTMLElement>('.g3-tool').forEach(b => {
        b.onclick = () => {
          if (!S) return
          S.tool = b.dataset.t as ToolId
          sPop()
          paintUI()
        }
      })
      $('pzOven').onclick = () => toOven()
      $('pzOut').onclick = () => pullOut()
      $('pzEat').onclick = () => { if (S) { S.tool = 'eat'; sPop(); paintUI() } }
      $('pzDone').onclick = () => finish()
      $('pzLeft').onclick = () => { S?.orbit.turn(-0.5); sPop() }
      $('pzRight').onclick = () => { S?.orbit.turn(0.5); sPop() }

      /* --- Boucle --- */
      stage.start((dt, now) => {
        if (!S) return

        // Va-et-vient du four : la pizza glisse, la caméra suit
        const targetZ = S.inOven ? OVEN_Z : 0
        pizzaGroup.position.z += (targetZ - pizzaGroup.position.z) * Math.min(1, dt * 2.2)
        S.orbit.look = [0, 0.06, pizzaGroup.position.z * 0.8]
        S.orbit.dist = 1.5 + Math.abs(pizzaGroup.position.z) * 0.18
        S.orbit.height = 1.02 - Math.abs(pizzaGroup.position.z) * 0.36
        S.orbit.update(dt)

        // Cuisson : la pâte dore, le fromage fond… et si on l'oublie, elle
        // noircit et fume (aucune note : c'est une pizza, pas un examen)
        if (S.phase === 'cuisson' && S.bake < BURNT) {
          S.bake = Math.min(BURNT, S.bake + dt * S.bakeRate)
          const kg = S.bake / BURNT
          const k = Math.min(1, kg / PERFECT_FROM)        // pâle → bien dorée à l'entrée de la zone
          const burn = Math.max(0, (kg - PERFECT_TO) / (1 - PERFECT_TO))
          const tint = (a: number, b: number, cc: number) => {
            const c1 = new T.Color(a), c2 = new T.Color(b), c3 = new T.Color(cc)
            const col = k < 0.55 ? c1.lerp(c2, k / 0.55) : c2.lerp(c3, (k - 0.55) / 0.45)
            return burn > 0 ? col.lerp(new T.Color(0x2A1B12), burn) : col
          }
          S.doughMat.color.copy(tint(0xFFFFFF, 0xE8C793, 0xB98149))
          S.crustMat.color.copy(tint(0xE9C88A, 0xD79E52, 0x9C6027))
          S.sideMat.color.copy(tint(0xEBD3A2, 0xD8A863, 0xA26B33))
          paintGauge(dt)
          if (burn > 0) {
            S.smokeT += dt
            if (S.smokeT > 0.22) {
              S.smokeT = 0
              S.smoke.burst({ x: (Math.random() - 0.5) * 0.5, y: 0.12, z: pizzaGroup.position.z + 0.2 },
                { count: 3, color: [0x5A5A5A, 0x8A8A8A], speed: 0.25, spread: 0.3, life: 1.8, size: 0.16 + burn * 0.1, gravity: -0.35 })
            }
          }
          // L'échelle de base vient de fitModel : on la MULTIPLIE, sinon un
          // glTF ramené à 0.1 repasse à 1 et le fromage avale la pizza
          for (const m of S.melting) {
            if (m.base === undefined) m.base = m.obj.scale.x
            m.obj.scale.set(m.base * (1 + k * 0.25), m.base * Math.max(0.3, 1 - k * 0.7), m.base * (1 + k * 0.25))
          }
        }
        S.smoke.update(dt)

        // Le feu danse : chaque langue a son rythme, les braises montent
        for (const f of S.flames) {
          const k = 0.78 + Math.sin(now / f.speed + f.phase) * 0.2 + Math.sin(now / 39 + f.phase * 2) * 0.09
          f.sp.scale.set(f.base * 0.95 * (1.15 - k * 0.25), f.base * 2.1 * k, 1)
          f.sp.position.y = f.base * 1.02 * k
        }
        for (const e2 of S.embers) {
          e2.sp.position.y += e2.vy * dt
          e2.sp.position.x += Math.sin(now / 300 + e2.sway) * dt * 0.05
          e2.sp.material.opacity = Math.max(0, 0.8 - e2.sp.position.y * 1.6)
          if (e2.sp.position.y > 0.55) e2.sp.position.set((Math.random() - 0.5) * 0.5, 0.02, 0)
        }
        S.fireLight.intensity = 5.4 + Math.sin(now / 90) * 1.3 + Math.sin(now / 37) * 0.6

        // Ingrédients encore en l'air
        S.step(dt, () => world.step(1 / 60))
        for (let i = S.loose.length - 1; i >= 0; i--) {
          const it = S.loose[i]
          it.obj.position.copy(it.body.position as any)
          it.obj.quaternion.copy(it.body.quaternion as any)
          it.t += dt
          if ((it.t > 0.3 && it.body.velocity.length() < 0.12) || it.t > 5) {
            S.loose.splice(i, 1)
            attach(it)
            sfx('tick', { vol: 0.25, rate: 1.4 + Math.random() * 0.3 })
          }
        }

        // Parts mangées : elles rétrécissent et disparaissent
        for (const w of S.wedges) {
          if (!w.eaten || w.fade < 0) continue
          w.fade += dt * 2.6
          if (w.fade >= 1) {
            w.fade = -1
            w.group.visible = false
          } else {
            w.group.scale.setScalar(1 - w.fade)
            w.group.position.y = w.fade * 0.35
          }
        }
      })

      S.cleanup = () => {
        stage.renderer.domElement.removeEventListener('pointerdown', onDown)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        sauceTex.dispose()
        S.smoke.dispose()
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
