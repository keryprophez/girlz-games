import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Profile, Progress, Tier } from './types'
import type { Look } from './character'
import { COLLECT } from './utils'
import { setSound } from './audio'

interface FermeState {
  profiles: Profile[]
  currentId: string
  progress: Record<string, Progress>
  sound: boolean

  current(): Profile
  progressOf(id?: string): Progress
  selectProfile(id: string): void
  setAvatar(id: string, dataUrl: string | null): void
  setTier(id: string, tier: Tier): void
  updateProfile(id: string, patch: Partial<Pick<Profile, 'name' | 'age'>>): void
  setLook(id: string, look: Look): void
  toggleSound(): void
  /** Ajoute les étoiles gagnées et débloque éventuellement un sticker. Renvoie le sticker débloqué. */
  reward(gameId: string, starsEarned: number, stars: number, profileId?: string): string | null
}

const emptyProgress = (): Progress => ({ stars: 0, stickers: [], bestStars: {} })

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
      toggleSound() {
        const on = !get().sound
        setSound(on)
        set({ sound: on })
      },
      reward(gameId, starsEarned, stars, profileId) {
        const s = get()
        const id = profileId || s.currentId
        const prog = s.progress[id] || emptyProgress()
        let newSticker: string | null = null
        const stickers = [...prog.stickers]
        if (stars >= 2) {
          const locked = COLLECT.find(e => !stickers.includes(e))
          if (locked) { stickers.push(locked); newSticker = locked }
        }
        const bestStars = { ...prog.bestStars }
        bestStars[gameId] = Math.max(bestStars[gameId] || 0, stars)
        set({
          progress: {
            ...s.progress,
            [id]: { stars: prog.stars + starsEarned, stickers, bestStars }
          }
        })
        return newSticker
      }
    }),
    {
      name: 'ferme:v2',
      onRehydrateStorage: () => state => { if (state) setSound(state.sound) }
    }
  )
)
