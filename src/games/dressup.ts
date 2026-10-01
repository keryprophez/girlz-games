import type { GameContext, GameDef } from '../core/types'
import { diskGet, diskPut } from '../core/diskcache'
import { sfx, preloadSfx, cry, preloadCries, type AnimalVoice } from '../core/sfx'
import { tone } from '../core/audio'
import { playMusic } from '../core/music'
import { confetti } from '../core/fx'
import { ICON } from '../core/icons'
import { useFerme, soloRoyal, type RoyalSlot } from '../core/store'
import { createStage, loader, loadThree, type Stage, type T3 } from '../core/three3d'
import { particles, type Particles, toScreen } from '../core/scene3d'
import { makePrincess, posePrincess, MOVES, type Princess, type Pose, type Expr } from '../core/princess3d'
import { makePet, type Pet } from '../core/pet3d'
import { makeDecor, type Decor, type DecorId } from '../core/castle3d'
import { addPrincessPage, idbPut } from '../core/atelierdb'
import { mountDoll } from './doll'
import {
  CAPES, CLIP_KINDS, CLIPS_MAX, CROWNS, DYES, EYES, GLASSES, HAIR_LEN_MAX, HAIR_STYLES, HAIRS, HELDS, NECKS, PATTERNS, PETS,
  SHOES, SKINS, SKIRTS, TOPS, WINGS, cloneRoyal, moodFor, partsPresent, randomRoyal, royalKey, secondRoyal,
  type ClipKind, type Paint, type Part, type Pattern, type Royal
} from '../core/royal'
import { some, visible } from '../core/hand'

/* LA PRINCESSE (27/09) — Habille-toi devenu un vrai jeu, en dix idées :
   1. la garde-robe : on PREND un habit au doigt et on le GLISSE sur elle
      (un simple toucher marche aussi) ; il s'enfile dans un tourbillon ;
   2. la tenue en pièces : haut, jupe, traîne, cape, ailes, couronne,
      collier, lunettes, chaussures, objet — tout se combine ;
   3. la teinture magique : un pot de couleur (et un motif), un toucher sur
      la jupe, les manches, les cheveux… la couleur se répand depuis le doigt ;
   4. elle est vivante : ses yeux suivent le doigt, elle cligne, rit quand on
      la chatouille, a des cœurs dans les yeux, pouffe devant des lunettes ;
   5. le BAL : la salle s'illumine, la valse démarre, on choisit six pas de
      danse (icônes), elle les enchaîne, puis salue — c'est la fin (aucune note) ;
   6. à deux : deux princesses côte à côte, celles de Jade et de Joyce ;
   7. un compagnon : licorne, poney, chaton ou chiot, qu'on teint aussi ;
   8. le salon de coiffure : peigne (plus long, jusqu'au sol), ciseaux,
      fer à boucler, lisseur, barrettes piquées où l'on veut ;
   9. des décors qu'on touche : lustre, rideaux, nuit et feu d'artifice,
      fontaine, rosiers, papillons, et une porte vers l'autre décor ;
   10. la photo : un flash, et elle devient un coloriage de l'Atelier (et
      un dessin de son dossier).
   Rien à lire (les prénoms des cartes sont les seuls mots), rien à débloquer.
   Et depuis le 28/09, un petit bouton rond (la petite fille à couettes) en
   bas à gauche de la scène : l'ANCIENNE VERSION, Habille-toi (`doll.ts`),
   « qu'on puisse quand même la faire ». Une couronne y ramène ; le dernier
   choix est retenu. */

type Tab = 'face' | 'hair' | 'dress' | 'dye' | 'crown' | 'magic' | 'pet' | 'decor'
type Tool = 'dye' | 'comb' | 'scissors' | 'curl' | 'straight' | 'clip'
type MoveId = keyof typeof MOVES
type V3 = import('three').Vector3
type Obj3 = import('three').Object3D

const TABS: Tab[] = ['face', 'hair', 'dress', 'dye', 'crown', 'magic', 'pet', 'decor']
const DANCE: MoveId[] = ['spin', 'curtsy', 'jump', 'waltz', 'arms', 'twirl']
/** Le petit nom sous chaque onglet (30/09 : « un label en plus du symbole ») */
const TAB_CAP: Record<Tab, string> = {
  face: 'Visage', hair: 'Cheveux', dress: 'Habits', dye: 'Teinture', crown: 'Bijoux', magic: 'Magie', pet: 'Animal', decor: 'Décor'
}
const BALL_STEPS = 6
const CLIP_COLORS = ['#F2A0B8', '#F4F0EA', '#F2C84B', '#B79AE8', '#6FB6EA', '#E0607E']

/* ---- Les icônes du jeu (traits ronds, viewBox 48) ---- */
const stroke = (body: string, c = '#B04A74', w = 3) =>
  `<svg viewBox="0 0 48 48" width="44" height="44" fill="none" stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round">${body}</svg>`
const I: Record<string, string> = {
  face: '<circle cx="24" cy="24" r="15"/><circle cx="19" cy="22" r="1.8" fill="currentColor"/><circle cx="29" cy="22" r="1.8" fill="currentColor"/><path d="M18 29 Q24 34 30 29"/>',
  hair: '<path d="M12 38 Q8 12 24 9 Q40 12 36 38"/><path d="M17 17 Q24 24 31 17"/><path d="M14 30 Q16 39 20 41 M34 30 Q32 39 28 41"/>',
  dress: '<path d="M17 6 L20 12 L28 12 L31 6"/><path d="M20 12 L19 20 L28 20 L28 12"/><path d="M19 20 Q12 30 8 41 Q24 45 40 41 Q36 30 29 20"/><path d="M19 20 Q24 23 29 20"/>',
  dye: '<path d="M14 20 h20 v14 a6 6 0 0 1 -6 6 h-8 a6 6 0 0 1 -6 -6 z"/><path d="M24 20 V10 M20 8 h8"/><path d="M18 28 q6 4 12 0"/>',
  crown: '<path d="M9 34 L12 16 L19 25 L24 12 L29 25 L36 16 L39 34 Z"/><path d="M10 39 L38 39"/>',
  magic: '<path d="M24 22 Q10 4 7 16 Q6 26 24 24 Q8 30 12 38 Q18 42 24 26 Q30 42 36 38 Q40 30 24 24 Q42 26 41 16 Q38 4 24 22 Z"/>',
  pet: '<path d="M14 38 V24 Q14 14 24 14 Q34 14 34 24 V38"/><path d="M19 14 L17 6 L22 12 M29 14 L31 6 L26 12"/><circle cx="20" cy="24" r="1.6" fill="currentColor"/><circle cx="28" cy="24" r="1.6" fill="currentColor"/>',
  decor: '<path d="M8 40 V18 L13 12 L18 18 V40 M30 40 V18 L35 12 L40 18 V40 M18 26 H30 V40 M22 40 V33 Q24 30 26 33 V40"/>',
  comb: '<path d="M8 18 H40 V24 H8 Z"/><path d="M11 24 V36 M16 24 V36 M21 24 V36 M26 24 V36 M31 24 V36 M36 24 V36"/>',
  scissors: '<circle cx="14" cy="34" r="6"/><circle cx="34" cy="34" r="6"/><path d="M18 30 L34 8 M30 30 L14 8"/>',
  curl: '<path d="M24 8 C34 8 34 18 24 18 C14 18 14 28 24 28 C34 28 34 38 24 38"/>',
  straight: '<path d="M16 8 V40 M24 8 V40 M32 8 V40"/>',
  clip: '<circle cx="24" cy="24" r="5"/><circle cx="24" cy="13" r="6"/><circle cx="34" cy="21" r="6"/><circle cx="30" cy="33" r="6"/><circle cx="18" cy="33" r="6"/><circle cx="14" cy="21" r="6"/>',
  none: '<circle cx="24" cy="24" r="15"/><path d="M13 35 L35 13"/>',
  disk: '<path d="M11 8 h22 l6 6 v26 h-28 z"/><path d="M16 8 v10 h14 v-10 M16 40 v-12 h16 v12"/>',
  camera: '<rect x="7" y="15" width="34" height="23" rx="5"/><path d="M17 15 l3 -5 h8 l3 5"/><circle cx="24" cy="26" r="6"/>',
  dice: '<rect x="9" y="9" width="30" height="30" rx="7"/><circle cx="17" cy="17" r="2.2" fill="currentColor"/><circle cx="31" cy="31" r="2.2" fill="currentColor"/><circle cx="24" cy="24" r="2.2" fill="currentColor"/><circle cx="31" cy="17" r="2.2" fill="currentColor"/><circle cx="17" cy="31" r="2.2" fill="currentColor"/>',
  ball: '<path d="M24 6 l3 5 5 1 -4 4 1 5 -5 -2.5 -5 2.5 1 -5 -4 -4 5 -1 z" fill="currentColor"/><path d="M14 44 L18 30 L24 26 L30 30 L34 44"/><path d="M18 30 Q12 26 10 20 M30 30 Q36 26 38 20"/>',
  sun: '<circle cx="24" cy="24" r="8"/><path d="M24 6 V11 M24 37 V42 M6 24 H11 M37 24 H42 M11 11 L14.5 14.5 M33.5 33.5 L37 37 M37 11 L33.5 14.5 M14.5 33.5 L11 37"/>',
  moon: '<path d="M31 8 A16 16 0 1 0 40 32 A13 13 0 0 1 31 8 Z"/>',
  bal: '<path d="M10 40 V16 Q24 4 38 16 V40 Z"/><path d="M17 40 V24 Q24 17 31 24 V40"/><circle cx="24" cy="11" r="2"/>',
  jardin: '<path d="M24 40 V26"/><circle cx="24" cy="18" r="9"/><path d="M8 40 Q12 32 16 40 M32 40 Q36 32 40 40"/>',
  train: '<path d="M20 8 L28 8 L27 18 L34 30 L44 42 L10 42 L21 18 Z"/>',
  freckles: '<circle cx="24" cy="24" r="15"/><circle cx="16" cy="28" r="1.3" fill="currentColor"/><circle cx="19" cy="31" r="1.3" fill="currentColor"/><circle cx="32" cy="28" r="1.3" fill="currentColor"/><circle cx="29" cy="31" r="1.3" fill="currentColor"/><circle cx="19" cy="21" r="1.6" fill="currentColor"/><circle cx="29" cy="21" r="1.6" fill="currentColor"/>',
  spin: '<path d="M12 24 A12 12 0 1 1 24 36"/><path d="M24 30 L24 36 L30 36"/><circle cx="24" cy="24" r="3" fill="currentColor"/>',
  curtsy: '<circle cx="24" cy="10" r="4"/><path d="M24 14 Q20 22 24 24 Q28 22 24 14"/><path d="M12 42 Q24 26 36 42 Z"/><path d="M18 22 L10 28 M30 22 L38 28"/>',
  jump: '<circle cx="24" cy="9" r="4"/><path d="M24 13 V26"/><path d="M24 17 L14 9 M24 17 L34 9"/><path d="M24 26 L18 33 M24 26 L30 33"/><path d="M12 42 H36"/>',
  waltz: '<path d="M8 30 Q16 18 24 30 Q32 42 40 30"/><circle cx="12" cy="14" r="3" fill="currentColor"/><circle cx="24" cy="10" r="3" fill="currentColor"/><circle cx="36" cy="14" r="3" fill="currentColor"/>',
  arms: '<circle cx="24" cy="18" r="4"/><path d="M24 22 V34 M24 34 L18 42 M24 34 L30 42"/><path d="M24 25 Q14 18 12 6 M24 25 Q34 18 36 6"/>',
  twirl: '<path d="M24 8 C40 8 40 30 24 30 C12 30 12 16 24 16 C30 16 30 24 24 24"/><path d="M14 40 H34"/>',
  heart: '<path d="M24 40 C8 28 8 12 18 12 C22 12 24 16 24 16 C24 16 26 12 30 12 C40 12 40 28 24 40 Z" fill="currentColor"/>'
}
const icon = (k: string, c = '#B04A74', w = 3) => stroke(I[k], c, w)

/* ---- La scène ---- */
interface Doll {
  slot: RoyalSlot
  look: Royal
  p: Princess | null
  pet: Pet | null
  petKind: string
  x: number
  yaw: number
  spin: number
  pose: Pose
  poseT: number
  poseDur: number
  yawAdd: number
  lookUntil: number
  /** Dernière fois qu'on l'a tournée au doigt : elle revient de face ensuite. */
  touchedAt: number
}

interface BallState {
  moveEnd: number
  moves: MoveId[]
  queue: MoveId[]
  playing: MoveId | null
  finale: boolean
  t: number
}

interface State {
  running: boolean
  duo: boolean
  stage: Stage | null
  T: T3 | null
  fx: Particles | null
  decor: Decor | null
  decorId: DecorId
  dolls: Doll[]
  active: number
  tab: Tab
  tool: Tool | null
  pot: Paint
  clipKind: ClipKind
  clipColor: number
  t: number
  camPos: V3 | null
  camTgt: V3 | null
  ring: import('three').Mesh | null
  ball: BallState | null
  photos: number
  thumbs: Thumbs | null
  switching: boolean
  /** Le peigne en cours : où le doigt a commencé. */
  combY: number | null
  combAcc: number
  combBuild: number
  ended: boolean
}

let pr: State | null = null
let ctx: GameContext

function save(me: State, i: number) {
  const d = me.dolls[i]
  useFerme.getState().setRoyal(d.slot, d.look)
}

/* =====================================================================
   Les vignettes 3D (la garde-robe) : une princesse hors écran qu'on habille
   de chaque habit et qu'on photographie, un habit à la fois.
   ===================================================================== */
type Frame = 'head' | 'bust' | 'body' | 'back' | 'hand' | 'feet' | 'pet' | 'card'
/* Les vignettes sont GARDÉES d'une ouverture à l'autre (`core/diskcache.ts`) :
   la garde-robe est pleine tout de suite dès la deuxième fois. Changer ce
   numéro quand l'allure des habits, de la princesse ou du cadrage change,
   sinon les anciennes vignettes resteraient. */
const VIGNETTE = 'v1:'
interface Job { key: string; look: Royal; frame: Frame; done: (url: string) => void }
interface Thumbs { want(j: Job): void; clear(): void; dispose(): void; pending(): number; stats: { disk: number; rendered: number } }

async function makeThumbs(T: T3, alive: () => boolean): Promise<Thumbs> {
  const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js')
  const S = 220
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1)
  renderer.setSize(S, S, false)
  renderer.setClearColor(0x000000, 0)
  renderer.toneMapping = T.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.outputColorSpace = T.SRGBColorSpace
  const pm = new T.PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  const env = pm.fromScene(room as unknown as import('three').Scene, 0.04).texture
  const scene = new T.Scene()
  scene.environment = env
  scene.environmentIntensity = 0.7
  scene.add(new T.HemisphereLight('#FFF4FA', '#C9A6B8', 0.4))
  const sun = new T.DirectionalLight('#FFF1D0', 2.2); sun.position.set(2, 3, 4); scene.add(sun)
  const cam = new T.PerspectiveCamera(30, 1, 0.01, 20)
  const cache = new Map<string, string>()
  const stats = { disk: 0, rendered: 0 }
  let gen = 0 // change à chaque `clear()` : une lecture arrivée après ne remet rien en file
  let princess: Princess | null = null
  let pet: Pet | null = null
  let petKind = ''
  const queue: Job[] = []
  let busy = false
  let dead = false
  /* Elles ne gênent jamais le jeu (30/09, « hyper saccadé ») : pas pendant
     qu'un doigt touche l'écran, une toutes les 250 ms au plus, et l'image
     s'encode en arrière-plan (`toBlob`) — `toDataURL` bloquait la page le
     temps de compresser chaque vignette. */
  let touching = 0
  const down = () => { touching++ }
  const up = () => { touching = Math.max(0, touching - 1) }
  window.addEventListener('pointerdown', down, true)
  window.addEventListener('pointerup', up, true)
  window.addEventListener('pointercancel', up, true)
  const pause = (ms: number) => new Promise<void>(res => { ctx.after(ms, () => res()) })
  const encode = (cv: HTMLCanvasElement) => new Promise<string | null>(res => {
    cv.toBlob(b => {
      if (!b) { res(null); return }
      const fr = new FileReader()
      fr.onload = () => res(typeof fr.result === 'string' ? fr.result : null)
      fr.onerror = () => res(null)
      fr.readAsDataURL(b)
    }, 'image/webp', 0.9)
  })
  const frameCam = (f: Frame, kind: string) => {
    const at = (px: number, py: number, pz: number, lx: number, ly: number, lz: number, fov = 30) => {
      cam.fov = fov; cam.updateProjectionMatrix(); cam.position.set(px, py, pz); cam.lookAt(lx, ly, lz)
    }
    // Cadrés sur elle : la hauteur de sa tête donne l'échelle
    const hy = princess?.headY ?? 0.98
    if (f === 'head') at(0, hy + 0.06, 0.78, 0, hy - 0.02, 0)
    else if (f === 'bust') at(0, hy - 0.1, 1.2, 0, hy - 0.24, 0)
    else if (f === 'body' || f === 'card') at(0, hy * 0.76, 2.8, 0, hy * 0.6, 0)
    else if (f === 'back') at(0, hy * 0.8, 2.95, 0, hy * 0.6, 0)
    else if (f === 'hand') at(-0.14, hy * 0.8, 1.3, -0.12, hy * 0.66, 0)
    else if (f === 'feet') at(0, 0.3, 1.3, 0, 0.16, 0)
    else {
      const big = kind === 'unicorn' || kind === 'pony'
      at(0.2, big ? 0.62 : 0.3, big ? 1.9 : 1.0, 0, big ? 0.45 : 0.17, 0)
    }
  }
  const pump = async () => {
    if (busy) return
    busy = true
    try {
      while (queue.length && !dead && alive()) {
        // Le doigt d'abord : on attend qu'il se lève
        while (touching && !dead && alive()) await pause(150)
        if (dead || !alive()) break
        const j = queue.shift()
        if (!j) break
        const hit = cache.get(j.key)
        if (hit) { j.done(hit); continue }
        if (j.frame === 'pet') {
          if (princess) princess.obj.visible = false
          if (j.look.pet === 'none') continue
          if (!pet || petKind !== j.look.pet) {
            pet?.dispose()
            pet = await makePet(T, j.look.pet, j.look)
            petKind = j.look.pet
            pet.obj.rotation.y = 0.7
            scene.add(pet.obj)
          } else {
            for (const k of ['pbody', 'pmane', 'pbow'] as const) pet.dye(k, j.look.paint[k], new T.Vector3(0, 0, 0))
            pet.update(5)
          }
          pet.obj.visible = true
          pet.pose('idle', 0.3); pet.update(0)
        } else {
          if (pet) pet.obj.visible = false
          if (!princess) {
            princess = await makePrincess(T, j.look, { live: false })
            scene.add(princess.obj)
          } else princess.set(j.look)
          princess.obj.visible = true
          const pose: Pose = j.frame === 'hand' ? 'idle' : 'idle'
          posePrincess(princess, pose, 0.6)
          princess.update(0)
          princess.obj.rotation.y = j.frame === 'back' ? 2.55 : j.frame === 'hand' ? -0.5 : j.frame === 'card' ? -0.25 : -0.3
          princess.face.expr(j.frame === 'card' ? 'joy' : 'neutral', 99)
          princess.face.redraw()
        }
        if (dead || !alive()) break
        frameCam(j.frame, j.look.pet)
        renderer.render(scene, cam)
        // WebP (transparence gardée) : quatre fois plus léger à garder que le PNG
        const url = await encode(renderer.domElement)
        if (dead || !alive()) break
        stats.rendered++
        if (url) {
          cache.set(j.key, url)
          void diskPut('vignette', VIGNETTE + j.key, url, 600)
          j.done(url)
        }
        // Laisser respirer le jeu entre deux vignettes
        await pause(250)
      }
    } catch { /* WebGL perdu : les tuiles gardent leur icône */ }
    busy = false
  }
  return {
    want(j) {
      const hit = cache.get(j.key)
      if (hit) { j.done(hit); return }
      // Les vignettes gardées se lisent toutes en même temps, sans attendre la
      // file : seules celles qui manquent passent par la 3D
      const g = gen
      void diskGet('vignette', VIGNETTE + j.key).then(kept => {
        if (dead || !alive()) return
        if (kept) { stats.disk++; cache.set(j.key, kept); j.done(kept); return }
        if (g !== gen) return
        queue.push(j)
        void pump()
      })
    },
    clear() { queue.length = 0; gen++ },
    pending: () => queue.length + (busy ? 1 : 0),
    stats,
    dispose() {
      dead = true
      queue.length = 0
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', up, true)
      princess?.dispose(); pet?.dispose()
      env.dispose(); pm.dispose()
      room.traverse((o: Obj3) => {
        const m = o as import('three').Mesh
        if (m.geometry) m.geometry.dispose()
        if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => x.dispose())
      })
      renderer.dispose()
      renderer.forceContextLoss()
    }
  }
}

/* =====================================================================
   Le panneau (la garde-robe)
   ===================================================================== */
interface TileDef { k: string; v: string; frame: Frame; with: (r: Royal) => void; preview?: (r: Royal) => void; icon?: string }

/** Les habits d'un onglet, chacun avec la façon de l'essayer sur une copie.
    `r` : la princesse habillée (son collier de perles enfilé, s'il existe,
    rejoint les colliers). */
function tilesFor(tab: Tab, r?: Royal): { title: string; tiles: TileDef[] }[] {
  const t = (k: keyof Royal, v: string, frame: Frame, extra?: (r: Royal) => void, preview?: (r: Royal) => void): TileDef => ({
    k, v, frame, preview,
    icon: v === 'none' ? icon('none', '#C9A8B8') : undefined,
    with: r => { (r as unknown as Record<string, unknown>)[k] = v === 'true' ? true : v === 'false' ? false : v; extra?.(r) }
  })
  if (tab === 'hair') return [{ title: 'style', tiles: HAIR_STYLES.map(s => ({ k: 'hairStyle', v: s, frame: 'head' as Frame, with: (r: Royal) => { r.hair.style = s }, preview: (r: Royal) => { r.crown = 'none'; r.hair.clips = [] } })) }]
  if (tab === 'dress') return [
    { title: 'top', tiles: TOPS.map(v => t('top', v, 'bust')) },
    { title: 'skirt', tiles: SKIRTS.map(v => t('skirt', v, 'body', r => { if (v !== 'ball' && v !== 'mermaid') r.train = false })) },
    { title: 'train', tiles: [t('train', 'false', 'back'), t('train', 'true', 'back', r => { if (r.skirt !== 'ball' && r.skirt !== 'mermaid') r.skirt = 'ball' }, r => { r.cape = 'none'; r.wings = 'none' })] },
    { title: 'shoes', tiles: SHOES.map(v => t('shoes', v, 'feet', undefined, r => { r.skirt = 'short'; r.train = false })) }
  ]
  if (tab === 'crown') return [
    { title: 'crown', tiles: CROWNS.map(v => t('crown', v, 'head')) },
    { title: 'glasses', tiles: GLASSES.map(v => t('glasses', v, 'head')) },
    { title: 'neck', tiles: [...NECKS, ...(r?.beads.length ? ['beads' as const] : [])].map(v => t('neck', v, 'bust')) }
  ]
  if (tab === 'magic') return [
    { title: 'wings', tiles: WINGS.map(v => t('wings', v, 'back')) },
    { title: 'cape', tiles: CAPES.map(v => t('cape', v, 'back')) },
    { title: 'held', tiles: HELDS.map(v => t('held', v, 'hand')) }
  ]
  if (tab === 'pet') return [{ title: 'pet', tiles: PETS.map(v => t('pet', v, 'pet')) }]
  return []
}

function isOn(r: Royal, d: TileDef): boolean {
  if (d.k === 'hairStyle') return r.hair.style === d.v
  const v = (r as unknown as Record<string, unknown>)[d.k]
  return String(v) === d.v
}

/** Une pastille de motif (pour les pots de teinture) : le motif sur la couleur. */
function patternSwatch(p: Pattern, c: string): string {
  const cv = document.createElement('canvas')
  cv.width = cv.height = 96
  const g = cv.getContext('2d')!
  g.fillStyle = c; g.beginPath(); g.arc(48, 48, 46, 0, Math.PI * 2); g.fill()
  g.save(); g.beginPath(); g.arc(48, 48, 46, 0, Math.PI * 2); g.clip()
  const light = (() => { const n = parseInt(c.slice(1), 16); return (((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) > 184 })()
  g.fillStyle = p === 'stars' ? (light ? '#D9A93A' : '#F8DC84') : light ? '#E0607E' : '#FFFFFF'
  const star = (x: number, y: number, r: number) => {
    g.beginPath()
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) }
    g.fill()
  }
  const heart = (x: number, y: number, r: number) => {
    g.beginPath(); g.moveTo(x, y + r * 0.9)
    g.bezierCurveTo(x - r * 1.4, y - r * 0.2, x - r * 0.6, y - r * 1.2, x, y - r * 0.4)
    g.bezierCurveTo(x + r * 0.6, y - r * 1.2, x + r * 1.4, y - r * 0.2, x, y + r * 0.9); g.fill()
  }
  const spots: [number, number][] = [[28, 30], [66, 34], [46, 64], [22, 70], [74, 72]]
  for (const [x, y] of spots) {
    if (p === 'stars') star(x, y, 11)
    else if (p === 'hearts') heart(x, y, 10)
    else if (p === 'dots') { g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill() }
    else if (p === 'flowers') { for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; g.beginPath(); g.arc(x + Math.cos(a) * 6, y + Math.sin(a) * 6, 4.5, 0, Math.PI * 2); g.fill() } }
    else if (p === 'sparkle') { for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(x + (i * 7) % 15 - 7, y + (i * 11) % 13 - 6, 1.8, 0, Math.PI * 2); g.fill() } }
  }
  g.restore()
  return cv.toDataURL()
}

function renderPane(me: State) {
  const pane = document.getElementById('prPane')
  if (!pane) return
  document.querySelectorAll<HTMLElement>('.pr-tab').forEach(b => b.classList.toggle('on', b.dataset.t === me.tab))
  const d = me.dolls[me.active]
  const r = d.look
  let html = ''
  // En attendant sa vignette 3D, une tuile montre la silhouette pâle de son onglet
  const ghost = I[me.tab] ? icon(me.tab, '#EBC3D5', 2.6) : ''
  const tileHtml = (td: TileDef, sectionIdx: number, i: number) =>
    `<button class="pr-tile${isOn(r, td) ? ' on' : ''}${td.icon ? ' ico' : ' wait'}" data-s="${sectionIdx}" data-i="${i}" aria-label="Habit">${td.icon || ghost}</button>`
  if (me.tab === 'face') {
    html += `<div class="pr-row">${SKINS.map(c => `<button class="pr-dot${r.skin === c ? ' on' : ''}" data-skin="${c}" style="background:${c}" aria-label="Peau"></button>`).join('')}</div>`
    html += `<div class="pr-sep"></div><div class="pr-row">${EYES.map(c => `<button class="pr-dot eye${r.eyes === c ? ' on' : ''}" data-eyes="${c}" style="--c:${c}" aria-label="Yeux"><i></i></button>`).join('')}</div>`
    html += `<div class="pr-sep"></div><div class="pr-row"><button class="pr-tool${r.freckles ? ' on' : ''}" id="prFreckles" aria-label="Taches de rousseur">${icon('freckles')}</button></div>`
  } else if (me.tab === 'hair') {
    const secs = tilesFor('hair')
    html += `<div class="pr-row">${secs[0].tiles.map((td, i) => tileHtml(td, 0, i)).join('')}</div>`
    html += `<div class="pr-sep"></div><div class="pr-row">${HAIRS.map(c => `<button class="pr-dot${r.paint.hair.c === c ? ' on' : ''}" data-hair="${c}" style="background:${c}" aria-label="Cheveux"></button>`).join('')}</div>`
    html += `<div class="pr-sep"></div><div class="pr-row">${(['comb', 'scissors', 'curl', 'straight', 'clip'] as Tool[]).map(k => `<button class="pr-tool${me.tool === k ? ' on' : ''}" data-tool="${k}" aria-label="Outil">${icon(k)}</button>`).join('')}</div>`
    if (me.tool === 'clip') {
      html += `<div class="pr-row">${CLIP_KINDS.map(k => `<button class="pr-tool small${me.clipKind === k ? ' on' : ''}" data-clip="${k}" aria-label="Barrette">${clipIcon(k, CLIP_COLORS[me.clipColor])}</button>`).join('')}
        ${CLIP_COLORS.map((c, i) => `<button class="pr-dot small${me.clipColor === i ? ' on' : ''}" data-clipc="${i}" style="background:${c}" aria-label="Couleur"></button>`).join('')}</div>`
    }
  } else if (me.tab === 'dye') {
    html += `<div class="pr-pot-now"><img src="${patternSwatch(me.pot.p, me.pot.c)}" alt=""></div>`
    html += `<div class="pr-row pots">${DYES.map(c => `<button class="pr-dot${me.pot.c === c ? ' on' : ''}" data-dye="${c}" style="background:${c}" aria-label="Couleur"></button>`).join('')}</div>`
    html += `<div class="pr-sep"></div><div class="pr-row pots">${PATTERNS.map(p => `<button class="pr-dot pat${me.pot.p === p ? ' on' : ''}" data-pat="${p}" aria-label="Motif"><img src="${patternSwatch(p, me.pot.c)}" alt=""></button>`).join('')}</div>`
  } else if (me.tab === 'decor') {
    html += `<div class="pr-row">
      <button class="pr-tile ico${me.decorId === 'bal' ? ' on' : ''}" data-decor="bal" aria-label="Salle de bal">${icon('bal', '#B04A74', 2.6)}</button>
      <button class="pr-tile ico${me.decorId === 'jardin' ? ' on' : ''}" data-decor="jardin" aria-label="Jardin">${icon('jardin', '#3E7A4A', 2.6)}</button>
    </div><div class="pr-sep"></div><div class="pr-row">
      <button class="pr-tile ico${me.decor?.night ? '' : ' on'}" data-night="0" aria-label="Jour">${icon('sun', '#E0A020', 2.6)}</button>
      <button class="pr-tile ico${me.decor?.night ? ' on' : ''}" data-night="1" aria-label="Nuit">${icon('moon', '#3F63C8', 2.6)}</button>
    </div>`
  } else {
    tilesFor(me.tab, r).forEach((sec, si) => {
      if (si) html += '<div class="pr-sep"></div>'
      html += `<div class="pr-row">${sec.tiles.map((td, i) => tileHtml(td, si, i)).join('')}</div>`
    })
  }
  pane.innerHTML = html
  wirePane(me)
  requestThumbs(me)
}

function clipIcon(k: ClipKind, c: string) {
  if (k === 'flower') return `<svg viewBox="0 0 48 48" width="40" height="40">${[0, 1, 2, 3, 4].map(i => { const a = i / 5 * Math.PI * 2; return `<circle cx="${24 + Math.cos(a) * 9}" cy="${24 + Math.sin(a) * 9}" r="7" fill="${c}"/>` }).join('')}<circle cx="24" cy="24" r="5" fill="#E3B04B"/></svg>`
  if (k === 'star') return `<svg viewBox="0 0 48 48" width="40" height="40"><path d="M24 6 l5 11 12 1 -9 8 3 12 -11 -6 -11 6 3 -12 -9 -8 12 -1 z" fill="#E3B04B"/></svg>`
  if (k === 'bow') return `<svg viewBox="0 0 48 48" width="40" height="40"><path d="M24 24 L8 14 V34 Z M24 24 L40 14 V34 Z" fill="${c}"/><circle cx="24" cy="24" r="5" fill="${c}"/></svg>`
  return `<svg viewBox="0 0 48 48" width="40" height="40">${I.heart.replace('currentColor', c)}</svg>`
}

/** Demande les vignettes 3D des tuiles visibles (la princesse avec cet habit). */
function requestThumbs(me: State) {
  if (!me.thumbs) return
  me.thumbs.clear()
  const d = me.dolls[me.active]
  const secs = me.tab === 'hair' || me.tab === 'dress' || me.tab === 'crown' || me.tab === 'magic' || me.tab === 'pet' ? tilesFor(me.tab, d.look) : []
  secs.forEach((sec, si) => sec.tiles.forEach((td, i) => {
    if (td.icon) return
    const r = cloneRoyal(d.look)
    td.with(r)
    td.preview?.(r)
    me.thumbs!.want({
      key: td.frame + ':' + royalKey(r), look: r, frame: td.frame,
      done: url => {
        const b = document.querySelector<HTMLElement>(`.pr-tile[data-s="${si}"][data-i="${i}"]`)
        if (!b || pr !== me || me.tab === 'face') return
        b.classList.remove('wait')
        b.innerHTML = `<img src="${url}" alt="" draggable="false">`
      }
    })
  }))
  refreshCards(me)
}

/** Les cartes « Jade » et « Joyce » : le portrait de la princesse gardée. */
function refreshCards(me: State) {
  const st = useFerme.getState()
  for (const slot of ['jade', 'joyce'] as const) {
    const card = document.querySelector<HTMLElement>(`.pr-card[data-slot="${slot}"]`)
    if (!card) continue
    const i = me.duo ? (slot === 'jade' ? 0 : 1) : -1
    card.classList.toggle('on', me.duo && me.active === i)
    const r = me.duo ? me.dolls[i].look : st.royals[slot]
    const box = card.querySelector<HTMLElement>('.pr-face')!
    if (!r) { box.innerHTML = icon('dress', '#E3C2D2', 2.4); continue }
    me.thumbs?.want({
      key: 'card:' + royalKey(r), look: r, frame: 'card',
      done: url => { if (pr === me) box.innerHTML = `<img src="${url}" alt="">` }
    })
  }
}

/* =====================================================================
   Habiller, teindre, coiffer
   ===================================================================== */

/** Met une pièce sur la princesse n° i, avec le tourbillon et sa réaction. */
function applyTile(me: State, i: number, td: TileDef) {
  const d = me.dolls[i]
  if (!d.p) return
  const r = cloneRoyal(d.look)
  td.with(r)
  if (royalKey(r) === royalKey(d.look)) return
  setLook(me, i, r, td.k === 'hairStyle' ? 'hair' : td.k as keyof Royal, td.v)
}

function setLook(me: State, i: number, r: Royal, field: keyof Royal | 'hair', value: unknown, quiet = false) {
  const d = me.dolls[i]
  d.look = r
  d.p?.set(r)
  if (field === 'pet' || d.petKind !== r.pet) void rebuildPet(me, i)
  save(me, i)
  if (!quiet) {
    swirl(me, i)
    const mood = moodFor(field, value)
    react(me, i, mood === 'funny' ? 'funny' : mood === 'wow' ? 'wow' : mood === 'love' ? 'love' : 'joy', 1.8)
    sfx('cloth', { vol: 0.45, rate: 1.2 })
    tone(988, 0.12, 'sine', 0.05); tone(1319, 0.14, 'sine', 0.05, 0.08); tone(1760, 0.16, 'sine', 0.04, 0.16)
    // Un tour complet sur elle-même (elle revient de face)
    if (d.pose === 'idle') doPose(d, 'spin', MOVES.spin)
  }
  if (i === me.active && !quiet) renderPane(me)
  else if (!quiet) refreshCards(me)
  else scheduleCards(me)
}

/** Les cartes (portraits) se mettent à jour un peu après la dernière retouche. */
let cardsT = 0
function scheduleCards(me: State) {
  if (cardsT) ctx.cancel(cardsT)
  cardsT = ctx.after(500, () => { cardsT = 0; if (pr === me) refreshCards(me) })
}

/** Le tourbillon d'étincelles qui habille. */
function swirl(me: State, i: number) {
  const d = me.dolls[i]
  if (!me.fx || !d.p) return
  for (let k = 0; k < 10; k++) {
    const a = k / 10 * Math.PI * 2
    me.fx.burst({ x: d.x + Math.cos(a) * 0.35, y: 0.15 + k * 0.08, z: Math.sin(a) * 0.35 },
      { count: 5, color: ['#FFD34D', '#FFFFFF', '#F2A0B8'], speed: 0.7, spread: 0.6, life: 0.8, size: 0.07, gravity: -0.3 })
  }
}

function react(me: State, i: number, e: Expr, sec = 1.6) {
  const d = me.dolls[i]
  d.p?.face.expr(e, sec)
}

/** Une pose d'un moment (chatouilles, photo, pas de danse). */
function doPose(d: Doll, pose: Pose, dur: number) {
  d.pose = pose; d.poseT = 0; d.poseDur = dur
}

async function rebuildPet(me: State, i: number) {
  const d = me.dolls[i]
  const st = me.stage
  if (!st) return
  const kind = d.look.pet
  d.petKind = kind
  if (d.pet) {
    me.fx?.burst({ x: d.pet.obj.position.x, y: 0.3, z: d.pet.obj.position.z }, { count: 26, color: ['#FFFFFF', '#F2A0B8'], speed: 1.2, spread: 1, life: 0.8, size: 0.09, gravity: 0 })
    d.pet.dispose(); d.pet = null
  }
  if (kind === 'none') return
  const pet = await makePet(st.T, kind, d.look)
  if (pr !== me || !me.running || d.look.pet !== kind || d.pet) { pet.dispose(); return }
  d.pet = pet
  placePet(me, i)
  st.scene.add(pet.obj)
  me.fx?.burst({ x: pet.obj.position.x, y: 0.3, z: pet.obj.position.z }, { count: 30, color: ['#FFD34D', '#FFFFFF', '#B79AE8'], speed: 1.3, spread: 1, life: 1, size: 0.08, gravity: 0.3 })
  const v = petVoice(kind)
  if (v) cry(v, { vol: 0.5, max: 1.2 })
}

const petVoice = (k: string): AnimalVoice | null => k === 'kitten' ? 'chat' : k === 'puppy' ? 'chien' : k === 'unicorn' || k === 'pony' ? 'cheval' : null

function placePet(me: State, i: number) {
  const d = me.dolls[i]
  if (!d.pet) return
  const fy = me.decor?.floorY ?? 0
  const big = d.look.pet === 'unicorn' || d.look.pet === 'pony'
  if (me.duo) d.pet.obj.position.set(i === 0 ? -0.95 : 0.95, fy, 0.08)
  else d.pet.obj.position.set(big ? 0.62 : 0.42, fy, big ? 0.05 : 0.22)
  d.pet.obj.rotation.y = me.duo ? (i === 0 ? 0.9 : -0.9) : -0.9
}

/** La teinture magique sur ce que le doigt touche. */
function dyeAt(me: State, i: number, part: Part, at: V3, onPet: boolean) {
  const d = me.dolls[i]
  const paint = { ...me.pot }
  if (onPet) {
    if (!d.pet) return
    d.look.paint[part] = paint
    d.pet.dye(part as 'pbody' | 'pmane' | 'pbow', paint, at)
  } else {
    if (!d.p || !partsPresent(d.look).includes(part)) return
    d.p.dye(part, paint, at)
    d.look = d.p.look
  }
  save(me, i)
  scheduleCards(me)
  me.fx?.burst(at, { count: 22, color: [paint.c, '#FFFFFF', '#FFD34D'], speed: 1, spread: 1, life: 0.8, size: 0.06, gravity: 0.2 })
  sfx('drop', { vol: 0.5, rate: 1.4 })
  tone(660, 0.1, 'sine', 0.05); tone(990, 0.12, 'sine', 0.05, 0.07)
  if (!onPet) react(me, i, Math.random() < 0.5 ? 'love' : 'joy', 1.4)
}

/** Les outils du salon de coiffure. */
function hairTool(me: State, i: number, tool: Tool, at: V3) {
  const d = me.dolls[i]
  if (!d.p) return
  const r = cloneRoyal(d.look)
  const h = r.hair
  if (tool === 'scissors') {
    if (h.len <= 0.02) { tone(220, 0.1, 'sine', 0.05); return }
    h.len = Math.max(0, h.len - 0.18)
    sfx('slice', { vol: 0.5, rate: 1.7 })
    me.fx?.burst(at, { count: 26, color: [r.paint.hair.c], speed: 0.6, spread: 1, life: 1.2, size: 0.05, gravity: 2 })
  } else if (tool === 'curl' || tool === 'straight') {
    const next = Math.max(0, Math.min(1, h.curl + (tool === 'curl' ? 0.34 : -0.34)))
    if (next === h.curl) { tone(220, 0.1, 'sine', 0.05); return }
    h.curl = next
    sfx('pluck', { vol: 0.45, rate: tool === 'curl' ? 1.4 : 0.9 })
    me.fx?.burst(at, { count: 18, color: ['#FFFFFF', '#E8E8E8'], speed: 0.5, spread: 1, life: 1, size: 0.08, gravity: -0.6 })
  } else if (tool === 'clip') {
    const loc = d.p.head.worldToLocal(at.clone())
    const az = Math.atan2(loc.x, loc.z)
    const th = Math.acos(Math.max(-1, Math.min(1, loc.y / Math.max(1e-4, loc.length()))))
    if (th > Math.PI * 0.62) { tone(220, 0.1, 'sine', 0.05); return }
    h.clips = [...h.clips, { az, th, k: me.clipKind, c: CLIP_COLORS[me.clipColor] }].slice(-CLIPS_MAX)
    sfx('click', { vol: 0.5, rate: 1.3 })
    me.fx?.burst(at, { count: 14, color: [CLIP_COLORS[me.clipColor], '#FFFFFF'], speed: 0.6, spread: 1, life: 0.7, size: 0.05, gravity: 0 })
  }
  setLook(me, i, r, 'hair', h, true)
  react(me, i, tool === 'scissors' ? 'wow' : 'love', 1.2)
}

/* =====================================================================
   Le toucher dans la scène
   ===================================================================== */
interface Hit { kind: 'doll' | 'pet' | 'decor' | 'none'; i: number; part: string | null; point: V3 | null; obj: Obj3 | null }

function pick(me: State, x: number, y: number): Hit {
  const st = me.stage
  if (!st) return { kind: 'none', i: -1, part: null, point: null, obj: null }
  const T = st.T
  const rect = st.renderer.domElement.getBoundingClientRect()
  const nd = new T.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1)
  const rc = new T.Raycaster()
  rc.setFromCamera(nd, st.camera)
  const targets: Obj3[] = []
  me.dolls.forEach(d => { if (d.p) targets.push(d.p.obj); if (d.pet) targets.push(d.pet.obj) })
  if (me.decor) targets.push(me.decor.group)
  const shown = (o: Obj3 | null): boolean => !o || (o.visible && shown(o.parent))
  const hits = rc.intersectObjects(targets, true).filter(h => shown(h.object))
  for (const h of hits) {
    for (let i = 0; i < me.dolls.length; i++) {
      const d = me.dolls[i]
      if (d.p) {
        const part = d.p.partOf(h.object)
        if (part) return { kind: 'doll', i, part, point: h.point, obj: h.object }
      }
      if (d.pet) {
        const part = d.pet.partOf(h.object)
        if (part) return { kind: 'pet', i, part, point: h.point, obj: h.object }
      }
    }
    if (me.decor) {
      const a = me.decor.actionOf(h.object)
      if (a) return { kind: 'decor', i: -1, part: a.act, point: h.point, obj: a.obj }
    }
    return { kind: 'none', i: -1, part: null, point: h.point, obj: null }
  }
  return { kind: 'none', i: -1, part: null, point: null, obj: null }
}

/** Un point du monde sous le doigt, à hauteur de visage (pour le regard). */
function fingerPoint(me: State, x: number, y: number): V3 | null {
  const st = me.stage
  if (!st) return null
  const T = st.T
  const rect = st.renderer.domElement.getBoundingClientRect()
  const nd = new T.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1)
  const rc = new T.Raycaster()
  rc.setFromCamera(nd, st.camera)
  const plane = new T.Plane(new T.Vector3(0, 0, 1), -0.5)
  const out = new T.Vector3()
  return rc.ray.intersectPlane(plane, out) ? out : null
}

function giggle() {
  const base = 1050 + Math.random() * 120
  for (let k = 0; k < 5; k++) tone(base - k * 45 + (k % 2) * 90, 0.07, 'triangle', 0.045, k * 0.09)
}

function onTap(me: State, h: Hit) {
  if (h.kind === 'doll') {
    const d = me.dolls[h.i]
    if (me.duo && me.active !== h.i) { me.active = h.i; renderPane(me); sfx('select', { vol: 0.4 }) }
    if (h.part === 'face' || h.part === 'hair' || (h.point && d.p && h.point.y > (me.decor?.floorY ?? 0) + d.p.headY - 0.12)) {
      const e: Expr[] = ['wink', 'kiss', 'love', 'joy']
      react(me, h.i, e[Math.floor(Math.random() * e.length)], 1.6)
      tone(1180, 0.08, 'sine', 0.05); tone(1480, 0.1, 'sine', 0.05, 0.08)
      if (h.point) me.fx?.burst(h.point, { count: 10, color: ['#FF8FB1', '#FFFFFF'], speed: 0.6, spread: 1, life: 0.8, size: 0.06, gravity: -0.4 })
    } else {
      // Des chatouilles !
      react(me, h.i, 'laugh', 1.3)
      doPose(d, 'laugh', 1.3)
      giggle()
    }
  } else if (h.kind === 'pet') {
    const d = me.dolls[h.i]
    if (!d.pet) return
    d.pet.pose('happy', 0)
    petHappy = 1.2
    const v = petVoice(d.look.pet)
    if (v) cry(v, { vol: 0.55, max: 1.2 })
    if (h.point) me.fx?.burst(h.point, { count: 16, color: ['#FF8FB1', '#FFFFFF', '#FFD34D'], speed: 0.8, spread: 1, life: 0.9, size: 0.06, gravity: -0.3 })
  } else if (h.kind === 'decor' && me.decor && h.obj && h.point) {
    const a = h.part as Parameters<Decor['act']>[0]
    if (a === 'porte') { switchDecor(me, me.decorId === 'bal' ? 'jardin' : 'bal'); sfx('creak', { vol: 0.5 }); return }
    let at = h.point
    if (a === 'papillon') {
      // Le papillon vient se poser sur la tête de la princesse active
      const p = me.dolls[me.active].p
      if (p) at = p.head.localToWorld(new me.stage!.T.Vector3(0.04, 0.14, 0.03))
      tone(1568, 0.06, 'sine', 0.04); tone(2093, 0.08, 'sine', 0.04, 0.06)
      react(me, me.active, 'wow', 1.5)
    }
    me.decor.act(a, h.obj, at)
    const snd: Record<string, () => void> = {
      lustre: () => sfx('glass', { vol: 0.45 }),
      rideau: () => sfx('cloth', { vol: 0.5, rate: 0.8 }),
      bouquet: () => sfx('pluck', { vol: 0.4, rate: 1.5 }),
      fenetre: () => { tone(523, 0.3, 'sine', 0.05); tone(659, 0.3, 'sine', 0.05, 0.12); tone(784, 0.4, 'sine', 0.05, 0.24) },
      fontaine: () => sfx('drop', { vol: 0.6, rate: 0.8 }),
      rosier: () => sfx('pluck', { vol: 0.45, rate: 1.2 }),
      lanterne: () => sfx('switch', { vol: 0.5 })
    }
    snd[a]?.()
    if (a === 'fenetre') renderPane(me)
  }
}
let petHappy = 0

/* =====================================================================
   Les décors
   ===================================================================== */
function switchDecor(me: State, id: DecorId, night?: boolean) {
  const st = me.stage
  if (!st || !me.fx || me.switching) return
  me.switching = true
  const wasNight = night ?? me.decor?.night ?? false
  me.decor?.dispose()
  me.decor = makeDecor(st, id, me.fx)
  me.decorId = id
  if (wasNight) me.decor.setNight(true)
  const fy = me.decor.floorY
  me.dolls.forEach((d, i) => { if (d.p) d.p.obj.position.y = fy; placePet(me, i) })
  if (me.ring) me.ring.position.y = fy + 0.004
  st.scene.fog = new st.T.Fog(id === 'bal' ? '#F3E4EA' : wasNight ? '#1B2258' : '#BFE0F4', 7, id === 'bal' ? 16 : 30)
  me.switching = false
  renderPane(me)
}

/* =====================================================================
   La photo : un flash, un dessin du dossier, un coloriage de l'Atelier
   ===================================================================== */
async function takePhoto(me: State) {
  const st = me.stage
  if (!st || me.ball) return
  me.dolls.forEach(d => { doPose(d, 'photo', 2.2); d.p?.face.expr('joy', 2.2) })
  sfx('click', { vol: 0.6, rate: 0.8 })
  const flash = document.getElementById('prFlash')
  flash?.classList.remove('go'); void flash?.offsetWidth; flash?.classList.add('go')
  // On attend que la pose soit prise (quelques images)
  await wait(me, 450)
  if (pr !== me || !me.running) return
  posAll(me, 0)
  st.renderer.render(st.scene, st.camera)
  const photoUrl = st.renderer.domElement.toDataURL('image/jpeg', 0.9)
  const lines = lineArt(me)
  me.photos++
  showPolaroid(photoUrl)
  tone(1319, 0.1, 'sine', 0.05, 0.2); tone(1568, 0.14, 'sine', 0.05, 0.3)
  // Rangés dans l'Atelier : le dessin (la photo, à décorer) et le coloriage
  void (async () => {
    const photo = await imgOf(photoUrl)
    const page = document.createElement('canvas'); page.width = 1500; page.height = 1000
    const g = page.getContext('2d')!
    g.fillStyle = '#FFFDF8'; g.fillRect(0, 0, 1500, 1000)
    const k = Math.max(1500 / photo.width, 1000 / photo.height)
    g.drawImage(photo, (1500 - photo.width * k) / 2, (1000 - photo.height * k) / 2, photo.width * k, photo.height * k)
    const thumb = document.createElement('canvas'); thumb.width = 300; thumb.height = 200
    thumb.getContext('2d')!.drawImage(page, 0, 0, 300, 200)
    const paint = await blobOf(page, 'image/jpeg', 0.9)
    const th = await blobOf(thumb, 'image/jpeg', 0.8)
    if (paint && th) {
      const st2 = useFerme.getState()
      await idbPut('gallery', { id: Date.now(), profile: st2.currentId, page: 'blanche', paper: '#FFFDF8', paint, thumb: th, frames: [], at: Date.now() })
    }
    if (lines) {
      const b = await blobOf(lines, 'image/png')
      if (b) await addPrincessPage(b)
    }
  })()
}

function showPolaroid(url: string) {
  const host = document.getElementById('prScene')
  if (!host) return
  const el = document.createElement('div')
  el.className = 'pr-polaroid'
  el.innerHTML = `<img src="${url}" alt=""><span>${ICON.pencil || ''}</span>`
  host.appendChild(el)
  ctx.after(2600, () => el.remove())
}

const imgOf = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src })
const blobOf = (cv: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob | null>(res => cv.toBlob(b => res(b), type, q))
const wait = (_me: State, ms: number) => new Promise<void>(res => { ctx.after(ms, () => res()) })

/** Le coloriage : un rendu « par pièces » (une couleur unie par pièce) dont
    on garde les bords, plus les traits sombres du visage — un vrai trait de
    coloriage, noir sur transparent, 1500 × 1000 comme les feuilles de l'Atelier. */
function lineArt(me: State): HTMLCanvasElement | null {
  const st = me.stage
  if (!st) return null
  const T = st.T
  const W = me.duo ? 1000 : 720, H = 1000
  const rt = new T.WebGLRenderTarget(W, H)
  const cam = new T.PerspectiveCamera(30, W / H, 0.05, 50)
  const fy = me.decor?.floorY ?? 0
  const petBig = me.dolls.some(d => d.look.pet === 'unicorn' || d.look.pet === 'pony')
  cam.position.set(me.duo ? 0 : 0.14, fy + 0.78, me.duo || petBig ? 3.9 : 2.95)
  cam.lookAt(me.duo ? 0 : 0.14, fy + 0.59, 0)
  const saved: { m: import('three').Mesh; mat: import('three').Material | import('three').Material[]; vis: boolean }[] = []
  const meshes: import('three').Mesh[] = []
  me.dolls.forEach(d => {
    d.p?.obj.traverse(o => { const m = o as import('three').Mesh; if (m.isMesh) meshes.push(m) })
    d.pet?.obj.traverse(o => { const m = o as import('three').Mesh; if (m.isMesh) meshes.push(m) })
  })
  meshes.forEach(m => saved.push({ m, mat: m.material, vis: m.visible }))
  const decorVis = me.decor?.group.visible ?? false
  if (me.decor) me.decor.group.visible = false
  const bg = st.scene.background, fog = st.scene.fog
  st.scene.background = new T.Color(0xffffff); st.scene.fog = null
  const fxObj = st.scene.children.filter(o => (o as import('three').Points).isPoints)
  fxObj.forEach(o => { o.visible = false })
  const ringVis = me.ring?.visible ?? false
  if (me.ring) me.ring.visible = false
  const tmp: import('three').Material[] = []
  const basic = (c: number, map?: import('three').Texture | null) => { const m = new T.MeshBasicMaterial({ color: c, map: map ?? null, transparent: !!map, side: T.DoubleSide }); tmp.push(m); return m }
  const read = () => {
    st.renderer.setRenderTarget(rt)
    st.renderer.render(st.scene, cam)
    const px = new Uint8Array(W * H * 4)
    st.renderer.readRenderTargetPixels(rt, 0, 0, W, H, px)
    st.renderer.setRenderTarget(null)
    return px
  }
  let idPx: Uint8Array, facePx: Uint8Array
  try {
    // 1. Chaque pièce dans sa couleur
    const ids = new Map<string, number>()
    let n = 1
    meshes.forEach((m, k) => {
      const face = !!m.userData.feature
      m.visible = saved[k].vis && !face
      let key = String(m.userData.part || 'x')
      if (key === 'deco' || key === 'x') key += m.id
      let id = ids.get(key)
      if (!id) { id = n++ * 7919; ids.set(key, id) }
      m.material = basic(((id * 2654435761) >>> 8) & 0xffffff)
    })
    idPx = read()
    // 2. Le visage (yeux, bouche) sur un corps blanc
    meshes.forEach((m, k) => {
      const face = !!m.userData.feature
      m.visible = saved[k].vis
      const src = (Array.isArray(saved[k].mat) ? saved[k].mat[0] : saved[k].mat) as import('three').MeshStandardMaterial
      m.material = face ? basic(0xffffff, src.map) : basic(0xffffff)
    })
    facePx = read()
  } finally {
    saved.forEach(s => { s.m.material = s.mat; s.m.visible = s.vis })
    tmp.forEach(x => x.dispose())
    if (me.decor) me.decor.group.visible = decorVis
    st.scene.background = bg; st.scene.fog = fog
    fxObj.forEach(o => { o.visible = true })
    if (me.ring) me.ring.visible = ringVis
    rt.dispose()
  }
  // Les bords : là où la pièce change, et les traits sombres du visage
  const edge = new Uint8Array(W * H)
  const at = (x: number, y: number) => (y * W + x) * 4
  const lum = (px: Uint8Array, i: number) => px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
    const i = at(x, y), r = at(x + 1, y), b = at(x, y + 1)
    const diff = (a: number, c: number) => idPx[a] !== idPx[c] || idPx[a + 1] !== idPx[c + 1] || idPx[a + 2] !== idPx[c + 2]
    const fl = lum(facePx, i)
    if (diff(i, r) || diff(i, b) || fl < 95 || Math.abs(fl - lum(facePx, r)) > 60 || Math.abs(fl - lum(facePx, b)) > 60) edge[y * W + x] = 1
  }
  // Un trait un peu épais (3 px), comme un vrai coloriage, et la page à l'endroit
  const out = document.createElement('canvas'); out.width = 1500; out.height = 1000
  const g = out.getContext('2d')!
  const img = g.createImageData(W, H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let on = false
    for (let dy = -1; dy <= 1 && !on; dy++) for (let dx = -1; dx <= 1 && !on; dx++) {
      const xx = x + dx, yy = y + dy
      if (xx >= 0 && yy >= 0 && xx < W && yy < H && edge[yy * W + xx]) on = true
    }
    if (on) {
      const o = ((H - 1 - y) * W + x) * 4
      img.data[o] = 0x3A; img.data[o + 1] = 0x2E; img.data[o + 2] = 0x25; img.data[o + 3] = 255
    }
  }
  const tmpCv = document.createElement('canvas'); tmpCv.width = W; tmpCv.height = H
  tmpCv.getContext('2d')!.putImageData(img, 0, 0)
  g.drawImage(tmpCv, (1500 - W) / 2, 0)
  return out
}

/* =====================================================================
   Le bal
   ===================================================================== */
function startBall(me: State) {
  if (me.ball || !me.stage) return
  me.tool = null
  document.querySelector('.pr-arena')?.classList.add('ball')
  if (me.decorId !== 'bal') switchDecor(me, 'bal', true)
  else if (!me.decor?.night) { me.decor?.setNight(true) }
  me.ball = { moveEnd: 0, moves: [], queue: [], playing: null, finale: false, t: 0 }
  playMusic('ball')
  me.dolls.forEach(d => { d.yaw = 0; d.spin = 0; d.p?.face.expr('joy', 2) })
  const strip = document.getElementById('prStrip')!
  strip.innerHTML = Array.from({ length: BALL_STEPS }, () => '<i class="pr-slot"></i>').join('')
  const bar = document.getElementById('prDance')!
  bar.innerHTML = DANCE.map(m => `<button class="pr-move" data-m="${m}" aria-label="Pas">${icon(m, '#B04A74', 3.2)}</button>`).join('')
  bar.querySelectorAll<HTMLElement>('.pr-move').forEach(b => {
    b.onclick = () => queueMove(me, b.dataset.m as MoveId)
  })
  tone(523, 0.2, 'sine', 0.06); tone(659, 0.2, 'sine', 0.06, 0.15); tone(784, 0.2, 'sine', 0.06, 0.3); tone(1047, 0.4, 'sine', 0.06, 0.45)
}

function queueMove(me: State, m: MoveId) {
  const b = me.ball
  if (!b || b.finale || b.moves.length + b.queue.length >= BALL_STEPS || b.queue.length >= 1) return
  b.queue.push(m)
  sfx('select', { vol: 0.4 })
}

function stepBall(me: State, dt: number) {
  const b = me.ball
  if (!b) return
  b.t += dt
  if (b.playing) {
    if (b.t >= b.moveEnd) {
      b.playing = null
      if (b.moves.length >= BALL_STEPS && !b.finale) finale(me)
    }
    return
  }
  const next = b.queue.shift()
  if (!next) return
  b.playing = next
  b.moveEnd = b.t + MOVES[next] + 0.15
  b.moves.push(next)
  const slot = document.querySelectorAll<HTMLElement>('#prStrip .pr-slot')[b.moves.length - 1]
  if (slot) { slot.classList.add('done'); slot.innerHTML = icon(next, '#B04A74', 3.4) }
  me.dolls.forEach((d, i) => {
    doPose(d, next, MOVES[next])
    d.p?.face.expr(next === 'curtsy' ? 'kiss' : i % 2 ? 'joy' : 'love', MOVES[next])
  })
  me.dolls.forEach(d => { if (d.pet) d.pet.pose('dance', 0) })
  const fx = me.fx
  me.dolls.forEach(d => fx?.burst({ x: d.x, y: 0.6, z: 0.1 }, { count: 30, color: ['#FFD34D', '#FFFFFF', '#FF8FB1', '#B79AE8'], speed: 1.4, spread: 1, life: 1.2, size: 0.07, gravity: 0.5 }))
  tone(784 + b.moves.length * 60, 0.15, 'triangle', 0.05)
}

function finale(me: State) {
  const b = me.ball!
  b.finale = true
  me.dolls.forEach(d => { doPose(d, 'bow', 2.4); d.p?.face.expr('joy', 3) })
  confetti()
  // Applaudissements : une pluie de petits claquements, et un accord
  for (let k = 0; k < 28; k++) tone(1800 + Math.random() * 1400, 0.03, 'square', 0.012, 0.1 + Math.random() * 1.6)
  tone(523, 0.6, 'sine', 0.06, 0.2); tone(659, 0.6, 'sine', 0.06, 0.2); tone(784, 0.8, 'sine', 0.06, 0.2)
  for (let k = 0; k < 6; k++) {
    ctx.after(200 + k * 260, () => {
      const c = ['#FF6B81', '#FFD34D', '#6FB6EA', '#B79AE8', '#8CCB6A', '#FFFFFF'][k]
      me.fx?.burst({ x: (Math.random() - 0.5) * 1.6, y: 1.5 + Math.random() * 0.4, z: -0.6 }, { count: 50, color: [c, '#FFFFFF'], speed: 1.6, spread: 1, life: 1.4, size: 0.08, gravity: 0.6 })
    })
  }
  me.ended = true
  ctx.after(2200, () => {
    if (pr !== me) return
    ctx.finish({
      title: 'Quel bal !',
      msg: me.duo ? 'Vous avez dansé comme de vraies princesses' : 'Tu as dansé comme une vraie princesse',
      stars: 3,
      outroMs: 600
    })
  })
}

/* =====================================================================
   Le montage
   ===================================================================== */
function posAll(me: State, dt: number) {
  const b = me.ball
  me.dolls.forEach((d, i) => {
    const p = d.p
    if (!p) return
    d.poseT += dt
    let pose: Pose = 'idle'
    if (d.pose !== 'idle' && d.poseT < d.poseDur) pose = d.pose
    else if (d.pose !== 'idle') { d.pose = 'idle'; d.poseT = 0 }
    const t = pose === 'idle' ? me.t + i * 1.3 : d.poseT
    const yawAdd = posePrincess(p, pose, t)
    // Duo : la deuxième fait les pas en miroir
    p.rig.rotation.y = me.duo && i === 1 ? -yawAdd : yawAdd
    if (!b) {
      d.yaw += d.spin * dt
      d.spin *= Math.pow(0.05, dt)
      // Au bout de trois secondes sans doigt, elle se remet de face
      if (me.t - d.touchedAt > 3 && Math.abs(d.spin) < 0.2) {
        d.yaw = Math.atan2(Math.sin(d.yaw), Math.cos(d.yaw))
        d.yaw -= d.yaw * Math.min(1, dt * 1.6)
      }
    } else d.yaw = 0
    const baseYaw = me.duo ? (i === 0 ? 0.28 : -0.28) : -0.28
    p.obj.rotation.y = baseYaw + d.yaw
    p.update(dt)
    if (d.pet) {
      if (!b && petHappy <= 0) d.pet.pose('idle', me.t)
      else d.pet.pose(b ? 'dance' : 'happy', me.t)
      d.pet.update(dt)
    }
  })
}

/** Le bouton de l'ancienne version : la petite fille à couettes d'Habille-toi. */
const DOLL_ICON = `<svg viewBox="40 22 120 96" width="42" height="34"><circle cx="58" cy="62" r="15" fill="#5B3A21"/><circle cx="142" cy="62" r="15" fill="#5B3A21"/><ellipse cx="100" cy="68" rx="32" ry="34" fill="#F6C99F"/><path d="M67,60 Q69,30 100,28 Q131,30 133,60 Q116,44 100,45 Q84,44 67,60 Z" fill="#5B3A21"/><circle cx="88" cy="70" r="4.2" fill="#2B2118"/><circle cx="112" cy="70" r="4.2" fill="#2B2118"/><circle cx="80" cy="82" r="5" fill="#FF9CB1" opacity=".75"/><circle cx="120" cy="82" r="5" fill="#FF9CB1" opacity=".75"/><path d="M91,84 Q100,92 109,84" stroke="#2B2118" stroke-width="3.5" fill="none" stroke-linecap="round"/></svg>`

type Mode = 'princesse' | 'poupee'
const MODE_KEY = 'ferme:princesse:mode'
function readMode(): Mode {
  try { return localStorage.getItem(MODE_KEY) === 'poupee' ? 'poupee' : 'princesse' } catch { return 'princesse' }
}
function keepMode(m: Mode) {
  try { localStorage.setItem(MODE_KEY, m) } catch { /* choix non retenu : on rouvrira la princesse */ }
}

/** Un contexte de partie à soi, pour une version : ses timers meurent quand
    on passe à l'autre version (la partie, elle, continue). */
function scoped(c: GameContext): { ctx: GameContext; end(): void } {
  const ids = new Set<number>()
  let on = true
  const sub: GameContext = {
    ...c,
    after: (ms, fn) => { const id = c.after(ms, () => { ids.delete(id); if (on) fn() }); ids.add(id); return id },
    every: (ms, fn) => { const id = c.every(ms, () => { if (on) fn() }); ids.add(id); return id },
    cancel: id => { ids.delete(id); c.cancel(id) },
    alive: () => on && c.alive()
  }
  return { ctx: sub, end() { on = false; ids.forEach(id => c.cancel(id)); ids.clear() } }
}

export const dressup: GameDef = {
  id: 'dressup', name: 'La Princesse', icon: '👑', sq: 'sq-lilac', cat: 'creatif', music: 'palace', duo: true, noTier: true,
  subtitle: 'Habille ta princesse, teins sa robe, coiffe-la… et au bal !',
  // La main : un habit glissé de la garde-robe sur la princesse ; au bal,
  // « l'un de ces pas-là » ; dans l'ancienne version, une case d'habit
  hand: root => {
    if (root.querySelector('.du-arena')) {
      const opts = visible(root, '.du-opt')
      return opts.length ? { tap: some(opts, 1)[0] } : null
    }
    const me = pr
    const st = me?.stage
    const d = me?.dolls[me.active]
    if (!me || !st || !d?.p || !me.running || me.switching || me.ended || !me.thumbs) return null
    if (me.ball) {
      const moves = visible(root, '#prDance .pr-move')
      return !me.ball.finale && !me.ball.playing && !me.ball.queue.length && moves.length ? { choose: moves } : null
    }
    const tiles = visible(root, '#prPane .pr-tile[data-s]')
    if (!tiles.length) return null
    const skirt = toScreen(st, d.p.obj.localToWorld(new st.T.Vector3(0.1, 0.4, 0.15)))
    return { drag: [some(tiles, 1)[0], skirt], ghost: true }
  },
  mount(c) {
    // La princesse, ou l'ancienne version (Habille-toi) : un petit bouton passe de l'une à l'autre
    let stop: (() => void) | null = null
    let sub: ReturnType<typeof scoped> | null = null
    const end = () => { stop?.(); stop = null; sub?.end(); sub = null }
    const go = (m: Mode) => {
      end()
      keepMode(m)
      sub = scoped(c)
      c.root.innerHTML = ''
      stop = m === 'poupee' ? mountDoll(sub.ctx, () => go('princesse')) : mountPrincess(sub.ctx, () => go('poupee'))
    }
    go(readMode())
    return end
  }
}

/** Monte la princesse dans `c.root` ; `toDoll` passe à l'ancienne version. */
function mountPrincess(c: GameContext, toDoll: () => void): () => void {
  {
    ctx = c
    const st0 = useFerme.getState()
    const duo = c.duo
    const looks: [RoyalSlot, Royal][] = duo
      ? [['jade', st0.royals.jade || soloRoyal(st0)], ['joyce', st0.royals.joyce || secondRoyal()]]
      : [['solo', soloRoyal(st0)]]
    const me: State = {
      running: true, duo, stage: null, T: null, fx: null, decor: null, decorId: 'bal',
      dolls: looks.map(([slot, l], i) => ({
        slot, look: cloneRoyal(l), p: null, pet: null, petKind: 'none',
        x: duo ? (i === 0 ? -0.4 : 0.4) : 0, yaw: 0, spin: 0, pose: 'idle' as Pose, poseT: 0, poseDur: 0, yawAdd: 0, lookUntil: 0, touchedAt: 0
      })),
      active: 0, tab: 'dress', tool: null, pot: { c: DYES[0], p: 'none' }, clipKind: 'flower', clipColor: 0,
      t: 0, camPos: null, camTgt: null, ring: null, ball: null, photos: 0, thumbs: null, switching: false,
      combY: null, combAcc: 0, combBuild: 0, ended: false
    }
    pr = me
    me.dolls.forEach((_, i) => save(me, i))

    c.root.innerHTML = `
      <div class="arena pr-arena">
        <div class="pr-scene" id="prScene">
          <button class="pr-switch" id="prSwitch" aria-label="L'ancienne version">${DOLL_ICON}</button>
          <div class="pr-flash" id="prFlash"></div>
          <div class="pr-strip" id="prStrip"></div>
          <div class="pr-dance" id="prDance"></div>
        </div>
        <div class="pr-side">
          <div class="pr-saves">
            ${(['jade', 'joyce'] as const).map(s => `<div class="pr-card" data-slot="${s}"><button class="pr-face" aria-label="Princesse"></button><b>${s === 'jade' ? 'Jade' : 'Joyce'}</b>${duo ? '' : `<button class="pr-disk" data-slot="${s}" aria-label="Garder">${icon('disk', '#FFFFFF', 2.8)}</button>`}</div>`).join('')}
          </div>
          <div class="pr-body">
            <div class="pr-tabs">${TABS.map(t => `<span class="tool-item"><button class="pr-tab" data-t="${t}" aria-label="${TAB_CAP[t]}">${icon(t)}</button><i class="tool-cap">${TAB_CAP[t]}</i></span>`).join('')}</div>
            <div class="pr-pane" id="prPane"></div>
          </div>
          <div class="pr-actions">
            <span class="tool-item"><button class="pr-btn" id="prDice" aria-label="Surprise">${icon('dice')}</button><i class="tool-cap">Surprise</i></span>
            <span class="tool-item"><button class="pr-btn" id="prPhoto" aria-label="Photo">${icon('camera')}</button><i class="tool-cap">Photo</i></span>
            <span class="tool-item pr-ballitem"><button class="pr-ballbtn" id="prBall" aria-label="Au bal">${icon('ball', '#FFFFFF', 2.6)}</button><i class="tool-cap">Au bal</i></span>
          </div>
        </div>
      </div>`
    preloadSfx(['cloth', 'click', 'confirm', 'drop', 'slice', 'pluck', 'glass', 'switch', 'creak', 'select'])
    preloadCries(['cheval', 'chat', 'chien'])

    /* --- Les onglets, les cartes, les boutons --- */
    c.root.querySelectorAll<HTMLElement>('.pr-tab').forEach(b => {
      b.onclick = () => {
        if (!me.running || me.ball) return
        me.tab = b.dataset.t as Tab
        me.tool = me.tab === 'dye' ? 'dye' : me.tab === 'hair' ? me.tool && me.tool !== 'dye' ? me.tool : null : null
        sfx('click', { vol: 0.35 })
        renderPane(me)
      }
    })
    c.root.querySelectorAll<HTMLElement>('.pr-card').forEach(card => {
      const slot = card.dataset.slot as 'jade' | 'joyce'
      card.querySelector<HTMLElement>('.pr-face')!.onclick = () => {
        if (!me.running || me.ball) return
        if (me.duo) { me.active = slot === 'jade' ? 0 : 1; sfx('select', { vol: 0.4 }); renderPane(me); return }
        const saved = useFerme.getState().royals[slot]
        if (!saved) { tone(330, 0.12, 'sine', 0.05); card.classList.add('nudge'); c.after(500, () => card.classList.remove('nudge')); return }
        setLook(me, 0, cloneRoyal(saved), 'crown', saved.crown)
        doPose(me.dolls[0], 'twirl', MOVES.twirl)
      }
      const disk = card.querySelector<HTMLElement>('.pr-disk')
      if (disk) disk.onclick = () => {
        if (!me.running || me.ball) return
        useFerme.getState().setRoyal(slot, cloneRoyal(me.dolls[0].look))
        card.classList.remove('saved'); void card.offsetWidth; card.classList.add('saved')
        sfx('confirm', { vol: 0.55 })
        react(me, 0, 'love', 1.6)
        refreshCards(me)
      }
    })
    // L'ancienne version (Habille-toi) : pas pendant le bal
    c.root.querySelector<HTMLElement>('#prSwitch')!.onclick = () => {
      if (!me.running || me.ball || me.ended) return
      sfx('switch', { vol: 0.5 })
      toDoll()
    }
    c.root.querySelector<HTMLElement>('#prDice')!.onclick = () => {
      if (!me.running || me.ball) return
      const i = me.active
      const r = randomRoyal(me.dolls[i].look)
      r.pet = me.dolls[i].look.pet
      setLook(me, i, r, 'crown', r.crown)
      doPose(me.dolls[i], 'twirl', MOVES.twirl)
      react(me, i, 'wow', 1.6)
      sfx('confirm', { vol: 0.5 })
    }
    c.root.querySelector<HTMLElement>('#prPhoto')!.onclick = () => { if (me.running) void takePhoto(me) }
    c.root.querySelector<HTMLElement>('#prBall')!.onclick = () => { if (me.running) startBall(me) }

    /* --- Glisser un habit de la garde-robe sur la princesse --- */
    let hand: { td: TileDef; x: number; y: number; ghost: HTMLElement | null; id: number; tile: HTMLElement } | null = null
    const onTileDown = (e: PointerEvent) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('.pr-tile[data-s]')
      if (!b || !me.running || me.ball) return
      const secs = tilesFor(me.tab, me.dolls[me.active].look)
      const td = secs[+b.dataset.s!]?.tiles[+b.dataset.i!]
      if (!td) return
      hand = { td, x: e.clientX, y: e.clientY, ghost: null, id: e.pointerId, tile: b }
    }
    const onMove = (e: PointerEvent) => {
      if (hand && e.pointerId === hand.id) {
        const dx = e.clientX - hand.x, dy = e.clientY - hand.y
        if (!hand.ghost && dx * dx + dy * dy > 144) {
          const gh = document.createElement('div')
          gh.className = 'pr-ghost'
          gh.innerHTML = hand.tile.innerHTML
          document.body.appendChild(gh)
          hand.ghost = gh
          sfx('cloth', { vol: 0.3, rate: 1.5 })
        }
        if (hand.ghost) { hand.ghost.style.left = e.clientX + 'px'; hand.ghost.style.top = e.clientY + 'px' }
      }
      onScenePointerMove(e)
    }
    const onUp = (e: PointerEvent) => {
      if (hand && e.pointerId === hand.id) {
        const h = hand
        hand = null
        if (h.ghost) {
          h.ghost.remove()
          // Lâché sur une princesse : elle l'enfile
          const hit = pick(me, e.clientX, e.clientY)
          if (hit.kind === 'doll' || (hit.kind === 'pet' && h.td.k === 'pet')) { if (me.duo) me.active = hit.i; applyTile(me, hit.i, h.td) }
          else if (!me.duo && hit.kind === 'pet') applyTile(me, 0, h.td)
          else { tone(300, 0.1, 'sine', 0.04) }
        } else {
          applyTile(me, me.active, h.td)
        }
      }
      onScenePointerUp(e)
    }
    c.root.addEventListener('pointerdown', onTileDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)

    /* --- Le toucher dans la scène --- */
    let touch: { x: number; y: number; id: number; moved: boolean; hit: Hit; lastX: number } | null = null
    const holder = c.root.querySelector<HTMLElement>('#prScene')!
    const onSceneDown = (e: PointerEvent) => {
      if (!me.running || !me.stage || (e.target as HTMLElement).closest('.pr-dance')) return
      if (me.ball) return
      const hit = pick(me, e.clientX, e.clientY)
      touch = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, hit, lastX: e.clientX }
      const tool = me.tool
      if (tool === 'dye' && hit.point && (hit.kind === 'doll' || hit.kind === 'pet')) {
        const part = hit.part as Part
        const petPart = hit.kind === 'pet'
        const ok = petPart ? (part === 'pbody' || part === 'pmane' || part === 'pbow') : partsPresent(me.dolls[hit.i].look).includes(part)
        if (ok) { if (me.duo) me.active = hit.i; dyeAt(me, hit.i, part, hit.point, petPart); touch.moved = true }
        else if (hit.kind === 'doll') { react(me, hit.i, 'laugh', 1); giggle(); touch.moved = true }
        return
      }
      if (tool && tool !== 'dye' && hit.kind === 'doll' && hit.point) {
        if (me.duo) me.active = hit.i
        if (tool === 'comb') { me.combY = e.clientY; me.combAcc = 0; sfx('cloth', { vol: 0.35, rate: 1.3 }) }
        else hairTool(me, hit.i, tool, hit.point)
        touch.moved = true
      }
    }
    function onScenePointerMove(e: PointerEvent) {
      if (!me.running || !me.stage) return
      // Les yeux suivent le doigt
      const fp = fingerPoint(me, e.clientX, e.clientY)
      if (fp && !me.ball) me.dolls.forEach(d => { d.p?.face.lookAt(fp); d.lookUntil = me.t + 1.6 })
      if (!touch || e.pointerId !== touch.id) return
      const dx = e.clientX - touch.x
      if (me.tool === 'comb' && me.combY !== null) {
        // Le peigne : tirer vers le bas allonge les cheveux (vers le haut, raccourcit un peu)
        const dy = e.clientY - me.combY
        me.combY = e.clientY
        me.combAcc += dy / 420
        return
      }
      if (me.tool) return
      if (!touch.moved && Math.abs(dx) > 10) touch.moved = true
      if (touch.moved) {
        // Faire tourner la princesse au doigt
        const d = me.dolls[me.active]
        d.touchedAt = me.t
        const mx = e.clientX - touch.lastX
        d.yaw += mx * 0.012
        d.spin = mx * 0.6
      }
      touch.lastX = e.clientX
    }
    function onScenePointerUp(e: PointerEvent) {
      if (!touch || e.pointerId !== touch.id) return
      const t0 = touch
      touch = null
      if (me.combY !== null) { me.combY = null; return }
      if (!t0.moved && !me.ball) onTap(me, t0.hit)
    }
    holder.addEventListener('pointerdown', onSceneDown)

    /* --- La 3D --- */
    const hideLoader = loader(holder, 'dressup')
    ;(async () => {
      const stage = await createStage(holder, {
        sky: '#F3E4EA', fog: [7, 16], cam: duo ? [0, 1.28, 3.8] : [0.15, 1.2, 3.0], target: duo ? [0, 0.7, 0] : [0.05, 0.72, 0], fov: 40,
        sun: { pos: [1.8, 4.2, 3.2], intensity: 2.1 }, hemi: ['#FFF4FA', '#C9A6B8', 1], exposure: 1.0
      })
      if (!me.running) { stage.dispose(); return }
      me.stage = stage
      me.T = stage.T
      me.fx = particles(stage, 700)
      me.decor = makeDecor(stage, me.decorId, me.fx)
      const fy = me.decor.floorY
      for (let i = 0; i < me.dolls.length; i++) {
        const d = me.dolls[i]
        d.p = await makePrincess(stage.T, d.look)
        if (!me.running) { stage.dispose(); return }
        d.p.obj.position.set(d.x, fy, 0)
        stage.scene.add(d.p.obj)
        if (d.look.pet !== 'none') void rebuildPet(me, i)
      }
      if (duo) {
        // L'anneau lumineux sous la princesse qu'on habille
        const ring = new stage.T.Mesh(new stage.T.TorusGeometry(0.3, 0.012, 8, 64), new stage.T.MeshBasicMaterial({ color: 0xFFD27A, transparent: true, opacity: 0.8 }))
        ring.rotation.x = Math.PI / 2
        ring.position.y = fy + 0.004
        stage.scene.add(ring)
        me.ring = ring
      }
      me.camPos = stage.camera.position.clone()
      me.camTgt = new stage.T.Vector3(...(duo ? [0, 0.7, 0] : [0.05, 0.72, 0]) as [number, number, number])
      hideLoader()
      me.thumbs = await makeThumbs(await loadThree(), () => me.running && pr === me)
      renderPane(me)
      stage.start(dt => {
        me.t += dt
        petHappy = Math.max(0, petHappy - dt)
        stepBall(me, dt)
        posAll(me, dt)
        // Le peigne : les cheveux poussent sous le doigt (reconstruits 8 fois par seconde)
        if (me.combY !== null || Math.abs(me.combAcc) > 0.001) {
          me.combBuild -= dt
          if (me.combBuild <= 0 && Math.abs(me.combAcc) > 0.01) {
            me.combBuild = 0.12
            const d = me.dolls[me.active]
            const r = cloneRoyal(d.look)
            const before = r.hair.len
            r.hair.len = Math.max(0, Math.min(HAIR_LEN_MAX, r.hair.len + me.combAcc))
            me.combAcc = 0
            if (r.hair.len !== before) {
              setLook(me, me.active, r, 'hair', r.hair, true)
              if (d.p) me.fx?.burst(d.p.head.localToWorld(new stage.T.Vector3(0.08, -0.1, 0.05)), { count: 4, color: ['#FFFFFF', '#FFE08A'], speed: 0.4, spread: 1, life: 0.6, size: 0.05, gravity: 0 })
              if (Math.random() < 0.3) sfx('cloth', { vol: 0.25, rate: 1.4 })
            }
          }
        }
        // Le regard revient droit devant quand le doigt s'en va
        me.dolls.forEach(d => { if (d.lookUntil && me.t > d.lookUntil) { d.p?.face.lookAt(null); d.lookUntil = 0 } })
        // L'anneau suit la princesse active
        if (me.ring) {
          me.ring.visible = !me.ball
          me.ring.position.x += (me.dolls[me.active].x - me.ring.position.x) * Math.min(1, dt * 8)
          ;(me.ring.material as import('three').MeshBasicMaterial).opacity = 0.55 + Math.sin(me.t * 4) * 0.25
        }
        me.decor?.update(dt)
        me.fx?.update(dt)
        // La caméra : plus près du visage pour la coiffure et le visage, large au bal
        const T = stage.T
        const ad = me.dolls[me.active]
        const fy2 = me.decor?.floorY ?? 0
        let goalP: V3, goalT: V3
        if (me.ball) {
          const a = me.ball.t * 0.18
          goalP = new T.Vector3(Math.sin(a) * 1.05, fy2 + 1.35, 3.8 + Math.cos(a) * 0.35)
          goalT = new T.Vector3(0, fy2 + 0.72, 0)
        } else if (me.tab === 'hair' || me.tab === 'face') {
          // Le visage en grand : sa tête au tiers haut de l'écran
          const hy = ad.p?.headY ?? 0.98
          goalP = new T.Vector3(ad.x + 0.05, fy2 + hy + 0.12, 1.6)
          goalT = new T.Vector3(ad.x, fy2 + hy - 0.13, 0)
        } else if (duo) {
          goalP = new T.Vector3(0, fy2 + 1.18, 3.8); goalT = new T.Vector3(0, fy2 + 0.65, 0)
        } else {
          goalP = new T.Vector3(0.15, fy2 + 1.1, 3.0); goalT = new T.Vector3(0.05, fy2 + 0.63, 0)
        }
        me.camPos!.lerp(goalP, Math.min(1, dt * 2.5))
        me.camTgt!.lerp(goalT, Math.min(1, dt * 2.5))
        stage.camera.position.copy(me.camPos!)
        stage.camera.lookAt(me.camTgt!)
        // La tablette qui peine : c'est le socle qui baisse la qualité (three3d)
      })
    })().catch(() => { hideLoader(); ctx.toast('La 3D n\'est pas disponible ici') })

    // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
    if ((window as unknown as { __BOT?: boolean }).__BOT) {
      ;(window as unknown as { __pr: unknown }).__pr = {
        get ready() { return !!me.thumbs && me.dolls.every(d => !!d.p) },
        /** Où en est le chargement (le bot le cite quand il attend trop). */
        get dbg() { return { stage: !!me.stage, thumbs: !!me.thumbs, dolls: me.dolls.map(d => !!d.p), running: me.running } },
        get looks() { return me.dolls.map(d => cloneRoyal(d.look)) },
        /** Les maillages du collier enfilé dans les Bijoux, porté par chacune. */
        get collier() {
          return me.dolls.map(d => {
            let n = 0
            d.p?.obj.getObjectByName('collier')?.traverse(o => { if ((o as import('three').Mesh).isMesh) n++ })
            return n
          })
        },
        get active() { return me.active },
        get tab() { return me.tab },
        get tool() { return me.tool },
        get pending() { return me.thumbs?.pending() ?? 0 },
        /** Vignettes lues dans le cache ou calculées en 3D (depuis l'ouverture). */
        get thumbStats() { return me.thumbs ? { ...me.thumbs.stats } : null },
        get photos() { return me.photos },
        get ball() { return me.ball ? { moves: me.ball.moves.length, finale: me.ball.finale } : null },
        /** Un point de l'écran sur une pièce de la princesse n° i : on part
            d'un point probable et on cherche autour, au toucher (les jupes
            n'ont pas toutes la même forme). */
        screenOf(what: 'skirt' | 'head' | 'hair' | 'bodice', i = 0) {
          const st = me.stage, d = me.dolls[i]
          if (!st || !d.p) return null
          const T = st.T
          const hy = d.p.headY
          const local = what === 'skirt' ? new T.Vector3(0.1, 0.4, 0.15) : what === 'bodice' ? new T.Vector3(0, hy * 0.72, 0.08) : what === 'hair' ? new T.Vector3(0.05, hy + 0.1, 0) : new T.Vector3(0, hy - 0.02, 0.1)
          const rect = st.renderer.domElement.getBoundingClientRect()
          const scr = (v: V3) => { const w = d.p!.obj.localToWorld(v.clone()).project(st.camera); return { x: rect.left + (w.x + 1) / 2 * rect.width, y: rect.top + (1 - w.y) / 2 * rect.height } }
          const c = scr(local)
          const want = what === 'head' ? ['face', 'skin'] : [what]
          for (let r = 0; r <= 8; r++) {
            for (let a = 0; a < Math.max(1, r * 6); a++) {
              const q = { x: c.x + Math.cos(a / Math.max(1, r * 6) * Math.PI * 2) * r * 9, y: c.y + Math.sin(a / Math.max(1, r * 6) * Math.PI * 2) * r * 9 }
              const h = pick(me, q.x, q.y)
              if (h.kind === 'doll' && h.i === i && want.includes(h.part || '')) return q
            }
          }
          return c
        }
      }
    }

    return () => {
      me.running = false
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      document.querySelectorAll('.pr-ghost').forEach(g => g.remove())
      me.thumbs?.dispose()
      me.dolls.forEach(d => { d.p?.dispose(); d.pet?.dispose() })
      me.decor?.dispose()
      me.fx?.dispose()
      me.stage?.dispose()
      if (pr === me) pr = null
      // Le crochet des bots ne survit pas à sa partie (bot sur une valeur périmée)
      const w = window as unknown as { __pr?: unknown }
      if (w.__pr) delete w.__pr
    }
  }
}

/* ---- Le panneau : les réglages sans 3D (couleurs, outils) ---- */
function wirePane(me: State) {
  const pane = document.getElementById('prPane')
  if (!pane) return
  const i = () => me.active
  const edit = (f: (r: Royal) => void, field: keyof Royal | 'hair', value: unknown) => {
    const r = cloneRoyal(me.dolls[i()].look)
    f(r)
    setLook(me, i(), r, field, value)
  }
  pane.querySelectorAll<HTMLElement>('[data-skin]').forEach(b => { b.onclick = () => edit(r => { r.skin = b.dataset.skin! }, 'skin', 0) })
  pane.querySelectorAll<HTMLElement>('[data-eyes]').forEach(b => { b.onclick = () => edit(r => { r.eyes = b.dataset.eyes! }, 'eyes', 0) })
  pane.querySelector<HTMLElement>('#prFreckles')?.addEventListener('click', () => edit(r => { r.freckles = !r.freckles }, 'freckles', 0))
  pane.querySelectorAll<HTMLElement>('[data-hair]').forEach(b => {
    b.onclick = () => {
      const d = me.dolls[i()]
      if (d.p) d.p.dye('hair', { c: b.dataset.hair!, p: 'none' }, d.p.head.localToWorld(new (me.T!).Vector3(0, 0.12, 0)))
      d.look = d.p ? d.p.look : d.look
      save(me, i())
      react(me, i(), 'love', 1.2)
      sfx('drop', { vol: 0.45, rate: 1.3 })
      renderPane(me)
    }
  })
  pane.querySelectorAll<HTMLElement>('[data-tool]').forEach(b => {
    b.onclick = () => {
      const t = b.dataset.tool as Tool
      me.tool = me.tool === t ? null : t
      sfx('click', { vol: 0.35 })
      renderPane(me)
    }
  })
  pane.querySelectorAll<HTMLElement>('[data-clip]').forEach(b => { b.onclick = () => { me.clipKind = b.dataset.clip as ClipKind; me.tool = 'clip'; renderPane(me) } })
  pane.querySelectorAll<HTMLElement>('[data-clipc]').forEach(b => { b.onclick = () => { me.clipColor = +b.dataset.clipc!; renderPane(me) } })
  pane.querySelectorAll<HTMLElement>('[data-dye]').forEach(b => { b.onclick = () => { me.pot = { ...me.pot, c: b.dataset.dye! }; me.tool = 'dye'; sfx('drop', { vol: 0.3, rate: 1.6 }); renderPane(me) } })
  pane.querySelectorAll<HTMLElement>('[data-pat]').forEach(b => { b.onclick = () => { me.pot = { ...me.pot, p: b.dataset.pat as Pattern }; me.tool = 'dye'; sfx('click', { vol: 0.35 }); renderPane(me) } })
  pane.querySelectorAll<HTMLElement>('[data-decor]').forEach(b => {
    b.onclick = () => { const id = b.dataset.decor as DecorId; if (id !== me.decorId) { switchDecor(me, id); sfx('creak', { vol: 0.45 }) } }
  })
  pane.querySelectorAll<HTMLElement>('[data-night]').forEach(b => {
    b.onclick = () => {
      const n = b.dataset.night === '1'
      if (!me.decor || me.decor.night === n) return
      me.decor.setNight(n)
      if (me.stage) me.stage.scene.fog = new me.stage.T.Fog(me.decorId === 'bal' ? '#F3E4EA' : n ? '#1B2258' : '#BFE0F4', 7, me.decorId === 'bal' ? 16 : 30)
      tone(n ? 392 : 523, 0.3, 'sine', 0.05); tone(n ? 330 : 659, 0.3, 'sine', 0.05, 0.12)
      renderPane(me)
    }
  })
}

