import type { GameContext, GameDef } from '../core/types'
import { $ } from '../core/utils'
import { sGood, sNope, sPop, sWin, tone } from '../core/audio'
import { confetti } from '../core/fx'
import {
  createStage, loader, orbitCam, snowTex, bumpyNormal, dotTex, picker,
  type Stage
} from '../core/three3d'

/* 🧊 L'Igloo 3D — on taille de vrais blocs de glace TRANSLUCIDES dans une
   coupole : chaque rangée se referme un peu plus, la calotte scelle le sommet,
   puis on allume un feu dedans et tout l'igloo s'illumine de l'intérieur, sous
   une aurore boréale. Trois tailles de blocs : la case qui brille dit laquelle. */

const R = 1.6                 // rayon de la voûte
const SIZES = { L: 0, M: 1, S: 2 }
type SizeId = keyof typeof SIZES

interface Slot {
  size: SizeId
  /** Découpe du bloc sur la sphère : azimut [a0, largeur] et polaire [t0, hauteur]. */
  a0: number; aLen: number; t0: number; tLen: number
  /** Centre du bloc — sert au fantôme et à la caméra. */
  pos: [number, number, number]
  filled: boolean
  ghost: any
  mesh: any
  /** La calotte de faîte : une demi-sphère, pas un bloc. */
  cap?: boolean
}

let ctx: GameContext
let S: any = null

/* ---------- Géométrie de la voûte ---------- */
/* Bandes de la voûte, en angle polaire depuis le sommet.
   Un bloc d'igloo n'est pas un cube : c'est un morceau de sphère taillé.
   On les découpe donc directement dans la sphère — la coupole est vraie. */
const BANDS: [number, number][] = [[1.20, Math.PI / 2], [0.80, 1.20], [0.40, 0.80]]
const CAP_T = 0.44                 // la calotte referme le sommet
const JOINT = 0.965                // léger jeu entre blocs = lignes de joint visibles

function buildSlots(counts: [number, number, number]): Slot[] {
  const slots: Slot[] = []
  BANDS.forEach(([t0, t1], ri) => {
    const n = counts[ri]
    const step = (Math.PI * 2) / n
    const tMid = (t0 + t1) / 2
    for (let i = 0; i < n; i++) {
      // Décalage d'une demi-brique une rangée sur deux : appareillage de maçon
      const a = i * step + (ri % 2 ? step / 2 : 0)
      // La porte occupe le devant de la rangée du bas
      if (ri === 0 && Math.abs(((a + Math.PI) % (Math.PI * 2)) - Math.PI) < step * 0.75) continue
      slots.push({
        size: (['L', 'M', 'S'] as SizeId[])[ri],
        a0: a - step * JOINT / 2, aLen: step * JOINT,
        t0: t0 + (t1 - t0) * (1 - JOINT) / 2, tLen: (t1 - t0) * JOINT,
        pos: [Math.sin(a) * R * Math.sin(tMid), R * Math.cos(tMid), Math.cos(a) * R * Math.sin(tMid)],
        filled: false, ghost: null, mesh: null
      })
    }
  })
  // Calotte de faîte : la dernière pièce, celle qui referme tout
  slots.push({
    size: 'S', a0: 0, aLen: Math.PI * 2, t0: 0, tLen: CAP_T,
    pos: [0, R, 0], filled: false, ghost: null, mesh: null, cap: true
  })
  return slots
}

/** Géométrie d'un emplacement : un morceau de sphère, déjà à sa place. */
function slotGeometry(T: any, s: Slot) {
  const seg = Math.max(3, Math.round(s.aLen * 7)) + 1
  return new T.SphereGeometry(R, seg, s.cap ? 8 : 5, s.a0, s.aLen, s.t0, s.tLen)
}

/* ---------- Décor ---------- */
function aurora(T: any, scene: any) {
  const c = document.createElement('canvas')
  c.width = 512; c.height = 256
  const g = c.getContext('2d')!
  for (let b = 0; b < 5; b++) {
    const x = 40 + b * 95 + Math.random() * 40
    const grad = g.createLinearGradient(0, 0, 0, 256)
    const hue = 130 + Math.random() * 90
    grad.addColorStop(0, `hsla(${hue},85%,65%,0)`)
    grad.addColorStop(0.45, `hsla(${hue},85%,62%,.55)`)
    grad.addColorStop(1, `hsla(${hue + 40},80%,60%,0)`)
    g.fillStyle = grad
    g.beginPath()
    g.moveTo(x, 0)
    g.bezierCurveTo(x + 60, 80, x - 50, 170, x + 20, 256)
    g.lineTo(x + 60, 256)
    g.bezierCurveTo(x + 110, 170, x + 20, 80, x + 55, 0)
    g.closePath(); g.fill()
  }
  const t = new T.CanvasTexture(c)
  t.colorSpace = T.SRGBColorSpace
  const mesh = new T.Mesh(
    new T.CylinderGeometry(26, 26, 14, 40, 1, true),
    new T.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.55, side: T.BackSide, depthWrite: false })
  )
  mesh.position.y = 6
  scene.add(mesh)
  return mesh
}

function stars(T: any, scene: any) {
  const N = 420
  const pos = new Float32Array(N * 3)
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2
    const p = Math.random() * 1.1
    const r = 30
    pos[i * 3] = Math.sin(a) * Math.cos(p) * r
    pos[i * 3 + 1] = Math.abs(Math.sin(p)) * r + 3
    pos[i * 3 + 2] = Math.cos(a) * Math.cos(p) * r
  }
  const geo = new T.BufferGeometry()
  geo.setAttribute('position', new T.BufferAttribute(pos, 3))
  const mat = new T.PointsMaterial({ size: 0.55, map: dotTex(T), transparent: true, depthWrite: false })
  const pts = new T.Points(geo, mat)
  scene.add(pts)
  return pts
}

/* ---------- Poser un bloc ---------- */
function nextSlot(): Slot | null {
  return S.slots.find((s: Slot) => !s.filled) || null
}

function place(slot: Slot) {
  const { T, scene } = S.stage
  const m = new T.Mesh(slotGeometry(T, slot), S.iceMat)
  m.castShadow = true
  m.receiveShadow = true
  scene.add(m)
  slot.mesh = m
  slot.filled = true
  // Entrée en scène : le bloc arrive de l'extérieur et se plaque sur la voûte
  m.scale.setScalar(1.5)
  S.animating.push({ m, t: 0 })
  if (slot.ghost) { slot.ghost.visible = false }
  S.done++
  sGood()
  tone(420 + S.done * 22, 0.09, 'sine', 0.09)
  refreshGhost()
  paintUI()
  if (!nextSlot()) setTimeout(() => S && enterIgloo(), 700)
}

function refreshGhost() {
  for (const s of S.slots as Slot[]) if (s.ghost) s.ghost.visible = false
  const n = nextSlot()
  if (n && n.ghost) n.ghost.visible = true
  S.want = n
}

/* ---------- Fin : on entre dans l'igloo ---------- */
function enterIgloo() {
  if (!S || S.inside) return
  S.inside = true
  const { T, scene } = S.stage
  // On allume un feu à l'intérieur : la glace translucide s'illumine de l'intérieur.
  // C'est le moment que la transmission rend joli — bien mieux que d'y coller la caméra.
  const lamp = new T.PointLight(0xFFA24E, 22, 9, 2)
  lamp.position.set(0, R * 0.35, 0)
  scene.add(lamp)
  const flame = new T.Mesh(
    new T.SphereGeometry(0.16, 14, 12),
    new T.MeshBasicMaterial({ color: 0xFFD79A })
  )
  flame.position.set(0, R * 0.3, 0)
  scene.add(flame)
  S.lamp = lamp
  S.glow = 0
  ;(S.iceMat as any).emissive = new T.Color(0xFF8A2E)
  ;(S.iceMat as any).emissiveIntensity = 0

  // La caméra se rapproche pour admirer l'igloo allumé, et en fait le tour
  S.orbit.look = [0, R * 0.5, 0]
  S.orbit.dist = 4.7
  S.orbit.height = 0.7
  S.orbit.auto = 0.25
  ctx.toast('Ton igloo brille dans la nuit ! 🔥')
  sWin()
  confetti()
  $('igHint').textContent = 'Bravo ! Ton igloo est fini ✨'
  $('igHint').style.opacity = '1'
  ;($('igTools') as HTMLElement).style.display = 'none'
  ;($('igDone') as HTMLElement).style.display = ''
}

function finish() {
  if (!S || S.ended) return
  S.ended = true
  ctx.finish({
    title: 'Ton igloo est terminé ! 🧊',
    msg: `${ctx.playerName} a posé ${S.slots.length} blocs de glace`,
    stars: 3, starsEarned: 3
  })
}

/* ---------- Interface ---------- */
function paintUI() {
  if (!S) return
  $('igCount').textContent = `🧊 ${S.done}/${S.slots.length}`
  const want = S.want as Slot | null
  $('igTools').querySelectorAll<HTMLElement>('.g3-tool').forEach(b => {
    b.classList.toggle('sel', !!want && b.dataset.s === want.size)
  })
}

export const igloo: GameDef = {
  id: 'igloo', name: "L'Igloo", icon: '🧊', sq: 'sq-mint', cat: 'reflexion', music: 'winter',
  subtitle: 'Empile de vrais blocs de glace, referme la voûte et allume le feu !',
  mount(c) {
    ctx = c
    let dead = false
    const counts = c.byTier<[number, number, number]>([7, 6, 4], [9, 7, 5], [11, 9, 6])

    c.root.innerHTML = `
      <div class="topbar">
        <div class="chip" id="igCount">🧊 0/0</div>
        <button class="chip" id="igLeft">◀</button>
        <button class="chip" id="igRight">▶</button>
      </div>
      <div class="arena g3-arena ig-arena" id="igArena">
        <div class="hint g3-hint" id="igHint">Touche la case qui brille, ou choisis le bon bloc 👇</div>
      </div>
      <div class="g3-bar">
        <div class="g3-row" id="igTools">
          <button class="g3-tool" data-s="L"><span class="ig-cube big"></span></button>
          <button class="g3-tool" data-s="M"><span class="ig-cube mid"></span></button>
          <button class="g3-tool" data-s="S"><span class="ig-cube sml"></span></button>
        </div>
        <button class="g3-btn" id="igDone" style="display:none">C'est fini ! ✅</button>
      </div>`

    const arena = $('igArena')
    const hideLoader = loader(arena, '🧊')

    ;(async () => {
      const stage: Stage = await createStage(arena, {
        sky: '#16305A',
        fog: [14, 40], fogColor: '#22467A',
        cam: [0, 2, 5.6], target: [0, 1.1, 0], fov: 52,
        hemi: ['#A8C8F2', '#33527A', 1.15],
        sun: { pos: [-4, 7, 5], color: '#D8E8FF', intensity: 1.9, area: 6, far: 22 },
        fill: 0.35, exposure: 1.25
      })
      if (dead) { stage.dispose(); return }
      hideLoader()
      const T = stage.T
      const scene = stage.scene
      // La réfraction coûte une passe de rendu : on la calcule en demi-résolution
      ;(stage.renderer as any).transmissionResolutionScale = 0.5

      /* Sol de neige nocturne */
      const snowMap = stage.keep(snowTex(T, 10))
      const snowNrm = stage.keep(bumpyNormal(T, 12, 10))
      const ground = new T.Mesh(
        new T.PlaneGeometry(70, 70),
        new T.MeshStandardMaterial({ map: snowMap, normalMap: snowNrm, color: 0xC9DDF2, roughness: 0.8 })
      )
      ground.rotation.x = -Math.PI / 2
      ground.receiveShadow = true
      scene.add(ground)

      const auro = aurora(T, scene)
      stars(T, scene)

      // Lune : la source de lumière visible du décor
      const moon = new T.Mesh(
        new T.SphereGeometry(1.2, 24, 18),
        new T.MeshBasicMaterial({ color: 0xFFF6E0 })
      )
      moon.position.set(-9, 9, -14)
      scene.add(moon)

      /* La glace : translucide, avec un vrai indice de réfraction */
      const iceMat = new T.MeshPhysicalMaterial({
        color: 0xD9F1FF, roughness: 0.14, metalness: 0,
        transmission: 0.72, thickness: 0.4, ior: 1.31, side: T.DoubleSide,
        clearcoat: 0.6, clearcoatRoughness: 0.25,
        normalMap: stage.keep(bumpyNormal(T, 6, 2)),
        normalScale: new T.Vector2(0.35, 0.35)
      })

      const slots = buildSlots(counts)

      /* Fantômes : les cases à remplir, une seule brille à la fois */
      const ghostMat = new T.MeshBasicMaterial({
        color: 0xFFD75E, transparent: true, opacity: 0.42, depthWrite: false, side: T.DoubleSide
      })
      for (const s of slots) {
        const g = new T.Mesh(slotGeometry(T, s), ghostMat)
        g.visible = false
        scene.add(g)
        s.ghost = g
      }

      /* Porte : un petit tunnel devant, toujours ouvert */
      const doorMat = new T.MeshPhysicalMaterial({
        color: 0xCFEBFF, roughness: 0.2, transmission: 0.5, thickness: 0.3, ior: 1.31
      })
      const door = new T.Mesh(new T.CylinderGeometry(R * 0.34, R * 0.34, R * 0.8, 16, 1, true, 0, Math.PI), doorMat)
      door.rotation.z = Math.PI / 2
      door.rotation.y = Math.PI / 2
      door.position.set(0, 0, R * 0.95)
      door.castShadow = true
      scene.add(door)

      /* Un pingouin qui regarde le chantier — la seule « présence » du décor */
      const peng = new T.Group()
      const bodyMat = new T.MeshStandardMaterial({ color: 0x24262E, roughness: 0.7 })
      const bellyMat = new T.MeshStandardMaterial({ color: 0xFFF6E8, roughness: 0.75 })
      const beakMat = new T.MeshStandardMaterial({ color: 0xF0A02E, roughness: 0.5 })
      const bd = new T.Mesh(new T.CapsuleGeometry(0.22, 0.24, 6, 14), bodyMat)
      bd.position.y = 0.35; bd.castShadow = true
      const bl = new T.Mesh(new T.SphereGeometry(0.17, 14, 12), bellyMat)
      bl.position.set(0, 0.33, 0.11); bl.scale.set(1, 1.3, 0.6)
      const bk = new T.Mesh(new T.ConeGeometry(0.05, 0.14, 8), beakMat)
      bk.rotation.x = Math.PI / 2; bk.position.set(0, 0.5, 0.22)
      const eyeGeo = new T.SphereGeometry(0.035, 10, 8)
      const eyeMat = new T.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.3 })
      for (const sx of [-1, 1]) {
        const e = new T.Mesh(eyeGeo, eyeMat)
        e.position.set(sx * 0.08, 0.57, 0.17)
        peng.add(e)
      }
      peng.add(bd, bl, bk)
      peng.position.set(1.65, 0, 1.95)
      peng.rotation.y = -0.62
      peng.scale.setScalar(1.15)
      scene.add(peng)

      S = {
        stage, slots, iceMat, done: 0, want: null, animating: [], peng, auro,
        inside: false, ended: false,
        orbit: orbitCam(stage, 5.4, 0.95, [0, 1.1, 0])
      }
      refreshGhost()
      paintUI()

      /* --- Toucher directement la case qui brille --- */
      const pick = picker(stage)
      const onTap = (e: PointerEvent) => {
        if (!S || S.inside) return
        const want = S.want as Slot | null
        if (!want) return
        const hit = pick(e, [want.ghost])
        if (hit.length) place(want)
      }
      stage.renderer.domElement.addEventListener('pointerdown', onTap)

      /* --- Ou choisir la bonne taille de bloc dans la réserve --- */
      $('igTools').querySelectorAll<HTMLElement>('.g3-tool').forEach(b => {
        b.onclick = () => {
          if (!S || S.inside) return
          const want = S.want as Slot | null
          if (!want) return
          if (b.dataset.s === want.size) place(want)
          else { sNope(); b.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], 260) }
        }
      })

      $('igLeft').onclick = () => { S?.orbit.turn(-0.55); sPop() }
      $('igRight').onclick = () => { S?.orbit.turn(0.55); sPop() }
      $('igDone').onclick = () => finish()

      /* --- Boucle --- */
      stage.start((dt, now) => {
        if (!S) return
        S.orbit.update(dt)
        auro.rotation.y += dt * 0.02
        ;(auro.material as any).opacity = 0.42 + Math.sin(now / 2600) * 0.14

        // Mise en place des blocs : ils se plaquent sur la voûte en ralentissant
        for (let i = S.animating.length - 1; i >= 0; i--) {
          const a = S.animating[i]
          a.t += dt * 2.4
          if (a.t >= 1) {
            a.m.scale.setScalar(1)
            S.animating.splice(i, 1)
          } else {
            const k = 1 - Math.pow(1 - a.t, 3)
            a.m.scale.setScalar(1.5 - 0.5 * k)
          }
        }

        // Le fantôme respire pour attirer l'œil
        const w = S.want as Slot | null
        if (w?.ghost) {
          const p = 0.32 + Math.sin(now / 260) * 0.16
          ;(w.ghost.material as any).opacity = p
          w.ghost.scale.setScalar(1 + Math.sin(now / 260) * 0.05)
        }
        // Le pingouin se dandine
        S.peng.rotation.z = Math.sin(now / 620) * 0.09
        if (S.lamp) {
          S.lamp.intensity = 20 + Math.sin(now / 130) * 4
          S.glow = Math.min(0.55, S.glow + dt * 0.5)
          ;(S.iceMat as any).emissiveIntensity = S.glow + Math.sin(now / 210) * 0.04
        }
      })

      S.cleanup = () => {
        stage.renderer.domElement.removeEventListener('pointerdown', onTap)
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
