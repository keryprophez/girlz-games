import type { GameContext, GameDef } from '../core/types'
import { pick } from '../core/utils'
import { sfx, preloadSfx } from '../core/sfx'
import { confetti } from '../core/fx'
import { ICON } from '../core/icons'
import {
  defaultLook, hatIcon, glassesIcon, heldIcon,
  HAIR_COLORS, OUTFIT_COLORS, type Look
} from '../core/character'
import { useFerme } from '../core/store'
import { createStage, loader, type Stage } from '../core/three3d'
import { ground, particles, type Particles } from '../core/scene3d'
import { makeDoll, poseDoll, type Doll } from '../core/doll3d'

/* Habille-toi — en 3D depuis le 23/09. La petite fille des filles, construite
   en formes rondes comme les animaux de la ferme (`core/doll3d.ts`), sur une
   estrade dans un petit décor. On la fait tourner au doigt ; chaque habit
   change pour de vrai (robe évasée, couettes, couronne, ballon…) et elle fait
   un saut de joie dans une pluie d'étincelles. Le look est gardé à chaque
   geste, et elle le porte ensuite dans les autres jeux : au volant du
   tracteur, sur l'écran de fin, en bas de l'accueil. Créer : aucune note. */

/* Quatre décors : le ciel, le sol, la lumière */
const SCENES = [
  { sky: '#9ED3F0', ground: 0x6FA84E, swatch: 'linear-gradient(180deg,#9ED3F0,#6FA84E)' },
  { sky: '#F6BC8C', ground: 0x9A9A55, swatch: 'linear-gradient(180deg,#F6BC8C,#9A9A55)' },
  { sky: '#2F3470', ground: 0x3D5A4A, swatch: 'linear-gradient(180deg,#2F3470,#3D5A4A)' },
  { sky: '#F6C6DA', ground: 0xA8DDBA, swatch: 'linear-gradient(180deg,#F6C6DA,#A8DDBA)' }
]
const HATS: Look['hat'][] = ['none', 'crown', 'cap', 'sunhat', 'party']
const GLASSES: Look['glasses'][] = ['none', 'round', 'sun']
const HELD: Look['held'][] = ['none', 'balloon', 'wand', 'flower', 'icecream']

interface State {
  look: Look
  profileId: string
  running: boolean
  stage: Stage | null
  doll: Doll | null
  fx: Particles | null
  /** Rotation du personnage (au doigt) et son élan. */
  yaw: number
  spin: number
  /** Saut de joie en cours (secondes restantes). */
  hop: number
  t: number
}

let du: State | null = null
let ctx: GameContext

function paintButtons(me: State) {
  document.querySelectorAll<HTMLElement>('.du-opt').forEach(b => {
    b.classList.toggle('sel', (me.look as unknown as Record<string, string>)[b.dataset.k!] === b.dataset.v)
  })
}

/** Reconstruit le personnage avec le nouveau look, en gardant son orientation. */
function rebuild(me: State, joy = true) {
  paintButtons(me)
  const st = me.stage
  if (!st) return
  if (me.doll) { st.scene.remove(me.doll.obj); me.doll.dispose() }
  me.doll = makeDoll(st.T, me.look, 1.25)
  me.doll.obj.position.y = 0.16
  me.doll.obj.rotation.y = me.yaw
  st.scene.add(me.doll.obj)
  if (joy) {
    me.hop = 0.9
    me.fx?.burst({ x: 0, y: 1.1, z: 0.2 }, { count: 26, color: ['#FFD34D', '#FFFFFF', me.look.color], speed: 1.6, spread: 1, life: 0.9, size: 0.1, gravity: 1.2 })
  }
}

/** Chaque geste est sauvé : quitter sans « fini » ne perd plus le look. */
function save(me: State) { useFerme.getState().setLook(me.profileId, { ...me.look }) }

function setLookProp(me: State, k: keyof Look, v: string) {
  if (du !== me || !me.running) return
  if ((me.look as unknown as Record<string, string>)[k] === v) return
  ;(me.look as unknown as Record<string, string>)[k] = v
  sfx('cloth', { vol: 0.4, rate: 1.3 })
  rebuild(me)
  save(me)
}

function setScene(me: State, i: number) {
  const st = me.stage
  document.querySelectorAll('.du-bg').forEach((x, k) => x.classList.toggle('sel', k === i))
  if (!st) return
  const sc = SCENES[i]
  st.scene.background = new st.T.Color(sc.sky)
  if (st.scene.fog) st.scene.fog.color = new st.T.Color(sc.sky)
  ;(st.scene.userData.ground as import('three').Mesh).material = new st.T.MeshStandardMaterial({ color: sc.ground, roughness: 0.95 })
}

function finish(me: State) {
  confetti()
  save(me)
  ctx.finish({
    title: 'Superbe look !',
    msg: 'Ton look est gardé pour la prochaine fois',
    stars: 3
  })
}

export const dressup: GameDef = {
  id: 'dressup', name: 'Habille-toi', icon: '👗', sq: 'sq-lilac', cat: 'creatif', music: 'meadow',
  subtitle: 'Compose ton look — tu le porteras dans les autres jeux !',
  mount(c) {
    ctx = c
    const st0 = useFerme.getState()
    const me: State = {
      look: { ...(st0.profiles.find(p => p.id === st0.currentId)?.look || defaultLook()) }, profileId: st0.currentId,
      running: true, stage: null, doll: null, fx: null, yaw: -0.35, spin: 0, hop: 0, t: 0
    }
    du = me

    const colorChips = (k: string, colors: string[]) => colors.map(col =>
      `<button class="du-opt du-color" data-k="${k}" data-v="${col}" style="background:${col}"></button>`).join('')

    c.root.innerHTML = `
      <div class="arena du-arena">
        <div class="du-scene" id="duScene"></div>
        <div class="du-side">
          <div class="du-top">
            ${SCENES.map((b, i) => `<button class="du-bg du-swatch${i === 0 ? ' sel' : ''}" data-i="${i}" style="background:${b.swatch}" aria-label="Décor"></button>`).join('')}
            <button class="du-tool" id="duRandom" aria-label="Surprise">${ICON.dice}</button>
            <button class="du-tool" id="duReset" aria-label="Look de base">${ICON.replay}</button>
          </div>
      <div class="du-rows">
        <div class="du-row"><span class="du-label">Tenue</span>
          <button class="du-opt" data-k="outfit" data-v="dress"><svg viewBox="55 100 90 125" width="26" height="34"><path d="M79,114 Q100,105 121,114 L137,206 Q139,215 129,215 L71,215 Q61,215 63,206 Z" fill="#FF8FA3" stroke="#D96C81" stroke-width="4"/></svg></button>
          <button class="du-opt" data-k="outfit" data-v="tee"><svg viewBox="55 100 90 120" width="26" height="32"><rect x="70" y="108" width="60" height="52" rx="12" fill="#8CC9F5" stroke="#5FA8DB" stroke-width="4"/><path d="M68,164 L132,164 L141,208 L59,208 Z" fill="#5FA8DB"/></svg></button>
          ${colorChips('color', OUTFIT_COLORS)}
        </div>
        <div class="du-row"><span class="du-label">Cheveux</span>
          <button class="du-opt" data-k="hair" data-v="pigtails"><svg viewBox="40 20 120 90" width="30" height="24"><circle cx="58" cy="62" r="15" fill="#5B3A21"/><circle cx="142" cy="62" r="15" fill="#5B3A21"/><ellipse cx="100" cy="66" rx="32" ry="36" fill="#F6C99F"/><path d="M67,60 Q69,32 100,30 Q131,32 133,60 Q116,44 100,45 Q84,44 67,60 Z" fill="#5B3A21"/></svg></button>
          <button class="du-opt" data-k="hair" data-v="long"><svg viewBox="40 20 120 130" width="26" height="30"><path d="M62,70 Q56,150 74,158 L126,158 Q144,150 138,70 Q138,30 100,27 Q62,30 62,70 Z" fill="#5B3A21"/><ellipse cx="100" cy="66" rx="30" ry="34" fill="#F6C99F"/><path d="M67,60 Q69,32 100,30 Q131,32 133,60 Q116,44 100,45 Q84,44 67,60 Z" fill="#5B3A21"/></svg></button>
          ${colorChips('hairColor', HAIR_COLORS)}
        </div>
        <div class="du-row"><span class="du-label">Chapeau</span>
          ${HATS.map(h => `<button class="du-opt" data-k="hat" data-v="${h}">${hatIcon(h)}</button>`).join('')}
        </div>
        <div class="du-row"><span class="du-label">Lunettes</span>
          ${GLASSES.map(g => `<button class="du-opt" data-k="glasses" data-v="${g}">${glassesIcon(g)}</button>`).join('')}
        </div>
        <div class="du-row"><span class="du-label">À la main</span>
          ${HELD.map(h => `<button class="du-opt" data-k="held" data-v="${h}">${heldIcon(h)}</button>`).join('')}
        </div>
      </div>
        </div>
        <button class="sn-tool go du-done" id="duDone" aria-label="Fini">${ICON.check}</button>
      </div>`
    preloadSfx(['cloth', 'click', 'confirm'])
    paintButtons(me)

    c.root.querySelectorAll<HTMLElement>('.du-opt').forEach(b => {
      b.onclick = () => setLookProp(me, b.dataset.k as keyof Look, b.dataset.v!)
    })
    c.root.querySelectorAll<HTMLElement>('.du-bg').forEach(b => {
      b.onclick = () => { if (me.running) { setScene(me, parseInt(b.dataset.i!)); sfx('click', { vol: 0.4 }) } }
    })
    c.root.querySelector<HTMLElement>('#duRandom')!.onclick = () => {
      if (!me.running) return
      me.look = {
        outfit: pick(['dress', 'tee'] as const), color: pick(OUTFIT_COLORS),
        hair: pick(['pigtails', 'long'] as const), hairColor: pick(HAIR_COLORS),
        hat: pick(HATS), glasses: pick(GLASSES), held: pick(HELD)
      }
      setScene(me, Math.floor(Math.random() * SCENES.length))
      me.spin = 9 // un tour sur elle-même pour la surprise
      sfx('confirm', { vol: 0.6 }); rebuild(me); save(me)
    }
    c.root.querySelector<HTMLElement>('#duReset')!.onclick = () => {
      if (!me.running) return
      me.look = defaultLook()
      setScene(me, 0)
      sfx('click', { vol: 0.4 }); rebuild(me); save(me)
    }
    c.root.querySelector<HTMLElement>('#duDone')!.onclick = () => { if (me.running) finish(me) }

    const holder = c.root.querySelector<HTMLElement>('#duScene')!
    const hideLoader = loader(holder, 'dressup')
    let drag: { x: number; moved: boolean } | null = null
    const onMove = (e: PointerEvent) => {
      if (!drag) return
      const dx = e.clientX - drag.x
      drag.x = e.clientX
      if (Math.abs(dx) > 1) drag.moved = true
      me.yaw += dx * 0.012
      me.spin = dx * 0.6
    }
    const onUp = () => {
      // Un tap sur elle (sans glisser) : un saut de joie
      if (drag && !drag.moved && me.running) { me.hop = 0.9; sfx('pluck', { vol: 0.5, rate: 1.3 }) }
      drag = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)

    ;(async () => {
      const stage = await createStage(holder, {
        sky: SCENES[0].sky, fog: [8, 22], cam: [0, 1.4, 4.1], target: [0, 0.78, 0], fov: 38,
        sun: { pos: [2.5, 5, 3.5], intensity: 2.2 }
      })
      if (!me.running) { stage.dispose(); return }
      hideLoader()
      me.stage = stage
      const T = stage.T
      stage.scene.userData.ground = ground(stage, { color: SCENES[0].ground, radius: 30 })
      // L'estrade : un gros galet crème avec un liseré
      const pod = new T.Mesh(new T.CylinderGeometry(0.8, 0.88, 0.16, 40), new T.MeshStandardMaterial({ color: 0xE9DCC6, roughness: 0.6 }))
      pod.position.y = 0.08; pod.castShadow = true; pod.receiveShadow = true
      const rim = new T.Mesh(new T.TorusGeometry(0.84, 0.03, 8, 48), new T.MeshStandardMaterial({ color: 0xD9A24A, roughness: 0.4 }))
      rim.rotation.x = Math.PI / 2; rim.position.y = 0.14
      stage.scene.add(pod, rim)
      me.fx = particles(stage, 240)
      rebuild(me, false)
      stage.renderer.domElement.addEventListener('pointerdown', e => { drag = { x: e.clientX, moved: false } })
      stage.start(dt => {
        if (!me.doll) return
        me.t += dt
        // Elle tourne au doigt, avec un peu d'élan qui s'éteint
        if (!drag) { me.yaw += me.spin * dt; me.spin *= Math.pow(0.04, dt) }
        me.doll.obj.rotation.y = me.yaw
        if (me.hop > 0) {
          me.hop = Math.max(0, me.hop - dt)
          poseDoll(me.doll, 'cheer', (0.9 - me.hop) * 1.2, dt)
        } else poseDoll(me.doll, 'idle', me.t, dt)
        me.fx?.update(dt)
      })
    })().catch(() => { hideLoader(); ctx.toast('La 3D n\'est pas disponible ici') })

    // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
    if ((window as unknown as { __BOT?: boolean }).__BOT) {
      ;(window as unknown as { __du: unknown }).__du = { get look() { return { ...me.look } }, get ready() { return !!me.doll } }
    }
    return () => {
      me.running = false
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      me.fx?.dispose()
      me.doll?.dispose()
      me.stage?.dispose()
      if (du === me) du = null
    }
  }
}
