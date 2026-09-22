import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { loudStorage, STORE_KEY } from './backup'
import type { Profile, Progress, Tier } from './types'
import type { Look } from './character'
import { setSound } from './audio'

/* Le choix de joueuse est MASQUÉ pour l'instant (demande du 10/09) : l'accueil
   n'est plus qu'une grille de jeux. Tout le bloc de Home.tsx est gardé derrière
   ce drapeau, prêt à revenir. Tant qu'il est à false, personne n'est nommé :
   GameHost passe un prénom vide aux jeux (sinon Joyce s'appelait Jade). */
export const SHOW_PROFILES = false as boolean

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
  setLook(id: string, look: Look): void
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
      }
    }
  )
)

/* Écrit la sauvegarde dès le premier lancement : sinon une famille qui n'a
   encore rien changé n'aurait rien à exporter (voir core/backup.ts). */
try {
  if (!localStorage.getItem(STORE_KEY)) useFerme.setState({})
} catch { /* stockage indisponible : on joue quand même */ }
