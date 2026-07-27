import type { GameContext, GameDef } from '../core/types'
import { $ } from '../core/utils'
import { sGood, sSplash, sWin } from '../core/audio'
import { impact } from '../core/impact'
import {
  createStage, loadThree, loader, loadModel, fitModel,
  type Stage
} from '../core/three3d'

/* 🎣 Pêche Précise, en 3D — le poisson EST le curseur : un vrai modèle qui
   nage sous la surface, de plus en plus vite. Un halo de lumière flotte sur
   l'eau. Tape quand le poisson passe dedans : il est FERRÉ et jaillit hors
   de l'eau en parabole, éclaboussures comprises. Rater coûte un cœur —
   trois ratés et c'est fini. À chaque prise, le poisson accélère et le halo
   rétrécit : le même timing que l'ancienne barre, mais incarné. */

const WATER_Y = 0            // surface de l'eau
const SWIM_Y = -0.16         // profondeur de nage
const LANE = 1.5             // demi-longueur de l'aller-retour

let fh: any = null
let ctx: GameContext

function hud() {
  $('fhScore').textContent = '🐟 ' + fh.score
  $('fhLives').textContent = '❤️'.repeat(Math.max(0, fh.lives)) || '—'
}

function hookAttempt() {
  if (!fh || !fh.running || fh.lock) return
  fh.lock = true
  const inZone = Math.abs(fh.fishX - fh.zoneX) < fh.zoneR
  if (inZone) {
    fh.score++
    sGood()
    impact(0.45, { matter: 'neige', noShake: true })
    hud()
    // Ferré : le poisson jaillit en parabole, la suite attend qu'il retombe
    fh.jump = { t: 0, x0: fh.fishX, vy: 4.6, vx: (Math.random() - 0.5) * 1.2 }
    fh.splashAt(fh.fishX, 1)
    // Plus dur à chaque prise : c'est le plafond d'adresse
    fh.speed *= 1.09
    fh.zoneR = Math.max(0.22, fh.zoneR * 0.9)
  } else {
    fh.lives--
    sSplash()
    impact(0.6, { matter: 'pate' })
    fh.splashAt(fh.zoneX, 0.6)
    hud()
    if (fh.lives <= 0) { finish(); return }
    setTimeout(() => { if (fh) { fh.placeZone(); fh.lock = false } }, 420)
  }
}

function finish() {
  if (!fh || !fh.running) return
  fh.running = false
  sWin()
  const score = fh.score
  const th = ctx.byTier([8, 5], [9, 6], [10, 7])
  const stars = score >= th[0] ? 3 : score >= th[1] ? 2 : 1
  ctx.finish({
    title: score >= th[0] ? 'Pêche de championne !' : 'Belle pêche !',
    msg: `${ctx.playerName} a attrapé ${score} poisson${score > 1 ? 's' : ''} 🎣`,
    stars: stars as 1 | 2 | 3, starsEarned: stars
  })
}

export const fishGame: GameDef = {
  id: 'fish', name: 'Pêche Précise', icon: '🎣', sq: 'sq-sun', cat: 'action', music: 'meadow',
  subtitle: 'Tape quand le poisson passe dans le halo de lumière !',
  mount(c) {
    ctx = c
    let dead = false
    c.root.innerHTML = `
      <div class="topbar">
        <div class="chip" id="fhScore">🐟 0</div>
        <div class="chip" id="fhLives">❤️❤️❤️</div>
      </div>
      <div class="arena g3-arena fh-arena" id="fhArena">
        <div class="hint g3-hint" id="fhHint">Tape quand le poisson passe dans le rond ! 🎣</div>
      </div>`

    const arena = $('fhArena')
    const hideLoader = loader(arena, '🎣')

    ;(async () => {
      const T = await loadThree()
      if (dead) return
      const stage: Stage = await createStage(arena, {
        sky: '#152A42',
        fog: [7, 18], fogColor: '#152A42',
        cam: [0, 2.9, 4.0], target: [0, -0.25, 0], fov: 44,
        hemi: ['#BBD8F0', '#16283C', 0.8],
        sun: { pos: [2.4, 5, 3.2], color: '#FFEFCF', intensity: 1.9, area: 4.5, far: 13 },
        fill: 0.3, exposure: 0.95, iblIntensity: 0.55
      })
      if (dead) { stage.dispose(); return }
      hideLoader()
      const scene = stage.scene

      /* Fond de l'étang, puis la surface : un plan translucide au-dessus.
         Le poisson nage ENTRE les deux — on le voit à travers l'eau. */
      const bed = new T.Mesh(
        new T.PlaneGeometry(14, 14),
        new T.MeshStandardMaterial({ color: 0x0E2233, roughness: 0.95 })
      )
      bed.rotation.x = -Math.PI / 2
      bed.position.y = -0.5
      bed.receiveShadow = true
      scene.add(bed)
      const water = new T.Mesh(
        new T.CircleGeometry(3.2, 48),
        new T.MeshStandardMaterial({
          color: 0x2E6E9E, roughness: 0.12, metalness: 0.1,
          transparent: true, opacity: 0.62
        })
      )
      water.rotation.x = -Math.PI / 2
      water.position.y = WATER_Y
      scene.add(water)
      // Berge : un anneau d'herbe sombre autour de l'étang
      const bank = new T.Mesh(
        new T.RingGeometry(3.2, 7, 48),
        new T.MeshStandardMaterial({ color: 0x1E3C2A, roughness: 0.95 })
      )
      bank.rotation.x = -Math.PI / 2
      bank.position.y = WATER_Y + 0.005
      bank.receiveShadow = true
      scene.add(bank)
      // Roseaux
      const reedMat = new T.MeshStandardMaterial({ color: 0x2E5C38, roughness: 0.9 })
      for (let i = 0; i < 10; i++) {
        const a = Math.PI * (0.15 + Math.random() * 0.7) + (i % 2 ? Math.PI : 0)
        const d = 3.25 + Math.random() * 0.5
        const reed = new T.Mesh(new T.CylinderGeometry(0.02, 0.03, 0.5 + Math.random() * 0.5, 6), reedMat)
        reed.position.set(Math.sin(a) * d, 0.28, Math.cos(a) * d)
        reed.rotation.z = (Math.random() - 0.5) * 0.2
        reed.castShadow = true
        scene.add(reed)
      }

      /* Le halo de visée : un anneau lumineux posé sur l'eau */
      const zone = new T.Mesh(
        new T.RingGeometry(0.8, 1, 40),
        new T.MeshBasicMaterial({ color: 0xFFE9A0, transparent: true, opacity: 0.9, side: T.DoubleSide, depthWrite: false })
      )
      zone.rotation.x = -Math.PI / 2
      zone.position.y = WATER_Y + 0.012
      scene.add(zone)

      /* Le poisson : un vrai modèle qui nage sous la surface */
      const fishObj = await loadModel('food', 'fish')
      fitModel(T, fishObj, 0.52)
      fishObj.position.set(0, SWIM_Y, 0)
      scene.add(fishObj)
      if (dead) { stage.dispose(); return }

      /* Éclaboussures : gouttes qui montent puis retombent, recyclées */
      const dropGeo = new T.SphereGeometry(0.03, 8, 6)
      const dropMat = new T.MeshBasicMaterial({ color: 0xA8D8F0, transparent: true, opacity: 0.9 })
      const drops: any[] = []
      const splashAt = (x: number, power: number) => {
        for (let i = 0; i < 10 * power; i++) {
          const m = new T.Mesh(dropGeo, dropMat)
          m.position.set(x, WATER_Y, 0)
          scene.add(m)
          const a = Math.random() * Math.PI * 2
          drops.push({ m, vx: Math.cos(a) * 0.8 * power, vy: 1.6 + Math.random() * 1.6 * power, vz: Math.sin(a) * 0.5, t: 0 })
        }
      }

      fh = {
        stage, score: 0, lives: 3, running: true, lock: false,
        fishX: 0, dir: 1, phase: 0,
        speed: c.byTier(0.9, 1.15, 1.45),
        zoneR: c.byTier(0.52, 0.44, 0.36),
        zoneX: 0.4, jump: null, splashAt,
        placeZone() {
          fh.zoneX = (Math.random() * 2 - 1) * (LANE - fh.zoneR - 0.1)
          zone.position.x = fh.zoneX
          zone.scale.setScalar(fh.zoneR)
        }
      }
      fh.placeZone()
      hud()

      /* Un seul geste : taper n'importe où */
      const onTap = () => { $('fhHint').style.opacity = '0'; hookAttempt() }
      stage.renderer.domElement.addEventListener('pointerdown', onTap)
      const onKey = (e: KeyboardEvent) => { if (e.code === 'Space') { e.preventDefault(); hookAttempt() } }
      window.addEventListener('keydown', onKey)

      /* --- Boucle --- */
      stage.start((dt, now) => {
        if (!fh) return

        if (fh.jump) {
          // Le poisson ferré jaillit en parabole au-dessus de l'eau
          const j = fh.jump
          j.t += dt
          const y = j.vy * j.t - 0.5 * 9.5 * j.t * j.t
          fishObj.position.set(j.x0 + j.vx * j.t, SWIM_Y + y, 0)
          fishObj.rotation.z = Math.min(2.6, j.t * 5) * (j.vx >= 0 ? -1 : 1)
          if (y < -0.25) {
            fh.splashAt(fishObj.position.x, 1.2)
            impact(0.5, { matter: 'pate', noShake: true })
            fh.jump = null
            fishObj.rotation.z = 0
            fishObj.position.y = SWIM_Y
            fh.placeZone()
            fh.lock = false
          }
        } else {
          // Nage : aller-retour, ondulation du corps, cap selon la direction
          fh.fishX += fh.dir * fh.speed * dt
          if (fh.fishX > LANE) { fh.fishX = LANE; fh.dir = -1 }
          if (fh.fishX < -LANE) { fh.fishX = -LANE; fh.dir = 1 }
          fh.phase += dt * 9
          fishObj.position.set(fh.fishX, SWIM_Y + Math.sin(fh.phase * 0.55) * 0.02, Math.sin(fh.phase * 0.3) * 0.12)
          fishObj.rotation.y = fh.dir > 0 ? Math.PI / 2 : -Math.PI / 2
          fishObj.rotation.z = Math.sin(fh.phase) * 0.1
        }

        // Le halo respire pour attirer l'œil
        ;(zone.material as any).opacity = 0.6 + Math.sin(now / 260) * 0.25

        // Vie des gouttes
        for (let i = drops.length - 1; i >= 0; i--) {
          const d = drops[i]
          d.t += dt
          d.vy -= 7.5 * dt
          d.m.position.x += d.vx * dt
          d.m.position.y += d.vy * dt
          d.m.position.z += d.vz * dt
          if (d.m.position.y < WATER_Y - 0.05) { scene.remove(d.m); drops.splice(i, 1) }
        }
      })

      fh.cleanup = () => {
        stage.renderer.domElement.removeEventListener('pointerdown', onTap)
        window.removeEventListener('keydown', onKey)
        dropGeo.dispose(); dropMat.dispose()
        stage.dispose()
      }
    })().catch(() => { hideLoader(); ctx.toast('La 3D n\'est pas disponible ici 😕') })

    return () => {
      dead = true
      if (fh) {
        fh.running = false
        try { fh.cleanup?.() } catch { /* déjà démonté */ }
        fh = null
      }
    }
  }
}
