import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { loudStorage, STORE_KEY } from './backup'
import type { Profile, Progress, Tier } from './types'
import { defaultRoyal, normalizeRoyal, wearBeads, type Bead, type Royal } from './royal'
import type { Look } from './character'
import { setSound } from './audio'

/* Le choix de joueuse est MASQUÉ pour l'instant (demande du 10/09) : l'accueil
   n'est plus qu'une grille de jeux. Tout le bloc de Home.tsx est gardé derrière
   ce drapeau, prêt à revenir. Tant qu'il est à false, personne n'est nommé :
   GameHost passe un prénom vide aux jeux (sinon Joyce s'appelait Jade). */
export const SHOW_PROFILES = false as boolean

export type RoyalSlot = 'solo' | 'jade' | 'joyce'

/** Les princesses à montrer (accueil, écran de fin) : les deux sœurs dès
    qu'elles ont gardé la leur, sinon la princesse qu'on habille seule. */
export function familyLooks(r: Record<RoyalSlot, Royal | null>): Royal[] {
  const both = [r.jade, r.joyce].filter((x): x is Royal => !!x)
  return both.length ? both : [r.solo || defaultRoyal()]
}

/** La princesse qu'on habille seule (jamais nulle). */
export const soloRoyal = (s: { royals: Record<RoyalSlot, Royal | null> }) => s.royals.solo || defaultRoyal()

/** L'ancien look d'Habille-toi (avant le 27/09) devient une princesse :
    on garde la couleur de la robe, celle des cheveux et la coiffure. */
function fromOldLook(look: unknown): Royal {
  const r = defaultRoyal()
  if (!look || typeof look !== 'object') return r
  const l = look as Record<string, string>
  const hex = /^#[0-9a-fA-F]{6}$/
  if (hex.test(l.color || '')) for (const k of ['bodice', 'sleeves', 'skirt'] as const) r.paint[k].c = l.color
  if (hex.test(l.hairColor || '')) r.paint.hair.c = l.hairColor
  if (l.hair === 'pigtails') r.hair.style = 'pigtails'
  if (l.outfit === 'tee') r.skirt = 'short'
  if (l.hat === 'crown') r.crown = 'crown'
  if (l.held === 'wand') r.held = 'wand'
  if (l.held === 'flower') r.held = 'bouquet'
  return r
}

interface FermeState {
  profiles: Profile[]
  currentId: string
  progress: Record<string, Progress>
  sound: boolean
  /** Minuteur parental : timestamp de fin de jeu (null = pas de minuteur). */
  timerEnd: number | null
  setTimerEnd(t: number | null): void

  current(): Profile
  progressOf(id?: string): Progress
  selectProfile(id: string): void
  setAvatar(id: string, dataUrl: string | null): void
  setTier(id: string, tier: Tier): void
  updateProfile(id: string, patch: Partial<Pick<Profile, 'name' | 'age'>>): void
  /** Le look de la petite fille d'Habille-toi (l'ancienne version, 28/09). */
  setLook(id: string, look: Look): void
  /** Les princesses (27/09) : celle qu'on habille seule, et les deux
      sauvegardes « Jade » et « Joyce » (null tant qu'on n'a rien gardé). */
  royals: Record<RoyalSlot, Royal | null>
  setRoyal(slot: RoyalSlot, r: Royal | null): void
  /** Le collier enfilé dans les Bijoux (30/09) : la princesse qu'on habille
      seule le met aussitôt ; celles de Jade et de Joyce, si elles existent,
      le trouvent dans leur garde-robe (on ne leur retire rien). */
  wearNecklace(beads: Bead[]): void
  /** Dernière photo choisie pour le Puzzle (indépendante de l'avatar). */
  puzzleImgs: Record<string, string>
  setPuzzleImg(id: string, img: string): void
  /** Encouragements enregistrés par la famille (clé profil:slot → dataURL audio). */
  voiceClips: Record<string, string>
  setVoiceClip(key: string, dataUrl: string): void
  toggleSound(): void
  /** Retient la meilleure note du jeu (affichée sous sa tuile). Rien d'autre :
      ni total d'étoiles ni autocollants à débloquer (règle 1). */
  recordBest(gameId: string, stars: number, profileId?: string): void
}

const emptyProgress = (): Progress => ({ bestStars: {} })

export const useFerme = create<FermeState>()(
  persist(
    (set, get) => ({
      profiles: [
        { id: 'jade', name: 'Jade', age: 6, avatar: null, tier: 'easy' },
        { id: 'joyce', name: 'Joyce', age: 8, avatar: null, tier: 'med' }
      ],
      currentId: 'jade',
      progress: { jade: emptyProgress(), joyce: emptyProgress() },
      sound: true,
      timerEnd: null,
      setTimerEnd(t) { set({ timerEnd: t }) },

      current() {
        const s = get()
        return s.profiles.find(p => p.id === s.currentId) || s.profiles[0]
      },
      progressOf(id) {
        const s = get()
        return s.progress[id || s.currentId] || emptyProgress()
      },
      selectProfile(id) { set({ currentId: id }) },
      setAvatar(id, dataUrl) {
        set(s => ({ profiles: s.profiles.map(p => (p.id === id ? { ...p, avatar: dataUrl } : p)) }))
      },
      setTier(id, tier) {
        set(s => ({ profiles: s.profiles.map(p => (p.id === id ? { ...p, tier } : p)) }))
      },
      updateProfile(id, patch) {
        set(s => ({ profiles: s.profiles.map(p => (p.id === id ? { ...p, ...patch } : p)) }))
      },
      setLook(id, look) {
        set(s => ({ profiles: s.profiles.map(p => (p.id === id ? { ...p, look } : p)) }))
      },
      royals: { solo: null, jade: null, joyce: null },
      setRoyal(slot, r) {
        set(s => ({ royals: { ...s.royals, [slot]: r ? normalizeRoyal(r) : null } }))
      },
      wearNecklace(beads) {
        set(s => {
          const solo = wearBeads(soloRoyal(s), beads)
          // Les deux sœurs : le même collier dans la garde-robe, porté s'il l'était déjà
          const offer = (r: Royal | null) => {
            if (!r) return null
            const w = wearBeads(r, solo.beads)
            if (r.neck !== 'beads') w.neck = r.neck
            return w
          }
          return { royals: { solo, jade: offer(s.royals.jade), joyce: offer(s.royals.joyce) } }
        })
      },
      puzzleImgs: {},
      setPuzzleImg(id, img) {
        set(s => ({ puzzleImgs: { ...s.puzzleImgs, [id]: img } }))
      },
      voiceClips: {},
      setVoiceClip(key, dataUrl) {
        set(s => {
          const voiceClips = { ...s.voiceClips }
          if (dataUrl) voiceClips[key] = dataUrl
          else delete voiceClips[key]
          return { voiceClips }
        })
      },
      toggleSound() {
        const on = !get().sound
        setSound(on)
        set({ sound: on })
      },
      recordBest(gameId, stars, profileId) {
        const s = get()
        const id = profileId || s.currentId
        const prog = s.progress[id] || emptyProgress()
        if ((prog.bestStars[gameId] || 0) >= stars) return
        set({ progress: { ...s.progress, [id]: { bestStars: { ...prog.bestStars, [gameId]: stars } } } })
      }
    }),
    {
      name: STORE_KEY,
      // Sans ça, un dépassement de quota fait échouer l'enregistrement en silence
      storage: createJSONStorage(() => loudStorage),
      onRehydrateStorage: () => state => {
        if (!state) return
        setSound(state.sound)
        // Le 22/09 l'album d'autocollants, le total d'étoiles et la difficulté
        // adaptative sont sortis : on ne garde que les meilleures notes
        const prog = state.progress || {}
        let dirty = false
        const next: typeof prog = {}
        for (const [id, p] of Object.entries(prog)) {
          if (p && Object.keys(p).some(k => k !== 'bestStars')) dirty = true
          next[id] = { bestStars: p?.bestStars || {} }
        }
        if (dirty) queueMicrotask(() => useFerme.setState({ progress: next }))
        // Les princesses : relues prudemment ; la toute première reprend l'ancien look
        const rs = (state.royals || {}) as Partial<Record<RoyalSlot, unknown>>
        const old = state.profiles?.find(p => p.id === state.currentId)?.look
        const royals: Record<RoyalSlot, Royal | null> = {
          solo: rs.solo ? normalizeRoyal(rs.solo) : old ? fromOldLook(old) : null,
          jade: rs.jade ? normalizeRoyal(rs.jade) : null,
          joyce: rs.joyce ? normalizeRoyal(rs.joyce) : null
        }
        queueMicrotask(() => useFerme.setState({ royals }))
      }
    }
  )
)

/* Écrit la sauvegarde dès le premier lancement : sinon une famille qui n'a
   encore rien changé n'aurait rien à exporter (voir core/backup.ts). */
try {
  if (!localStorage.getItem(STORE_KEY)) useFerme.setState({})
} catch { /* stockage indisponible : on joue quand même */ }
