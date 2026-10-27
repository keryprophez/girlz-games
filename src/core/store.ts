import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { loudStorage, OLD_STORE_KEY, STORE_KEY } from './backup'
import { normalizeBeads, type Bead } from './bijoux3d'
import type { Look } from './character'
import { normalizePiece, type Piece } from './perles'
import { CREATIONS_MAX, SAVE_VERSION, defaultSave, migrateSave, normalizeSave, type ClipSlot, type SaveData } from './save'
import { setSound } from './audio'

/* La sauvegarde de la famille (sa forme et sa conversion : `core/save.ts`).
   Le choix de joueuse et la princesse sont sortis le 27/10 : une seule
   sauvegarde, sans prénom ni photo. */

export type { Creation } from './save'
export { CREATIONS_MAX }

interface FermeState extends SaveData {
  setTimerEnd(t: number | null): void
  /** Le look de la petite fille d'Habille-toi : chaque geste est sauvé. */
  setLook(look: Look): void
  /** Le collier fermé dans les Bijoux. */
  setNecklace(beads: Bead[]): void
  /** Le pendentif du collier des Bijoux (une création de perles à repasser). */
  setPendant(p: Piece | null): void
  /** La vitrine des créations (les plus récentes d'abord, `CREATIONS_MAX` au
      plus : la plus ancienne laisse sa place). */
  keepCreation(p: Piece): void
  setVoiceClip(slot: ClipSlot, dataUrl: string | null): void
  toggleSound(): void
  /** Retient la meilleure note du jeu (affichée sous sa tuile). Rien d'autre :
      ni total d'étoiles ni autocollants à débloquer (règle 1). */
  recordBest(gameId: string, stars: number): void
}

export const useFerme = create<FermeState>()(
  persist(
    (set, get) => ({
      ...defaultSave(),
      setTimerEnd(t) { set({ timerEnd: t }) },
      setLook(look) { set({ look: { ...look } }) },
      setNecklace(beads) { set({ necklace: normalizeBeads(beads) }) },
      setPendant(p) { set({ pendant: normalizePiece(p) }) },
      keepCreation(p) {
        const piece = normalizePiece(p)
        if (!piece) return
        set(s => ({ creations: [{ ...piece, at: Date.now() }, ...s.creations].slice(0, CREATIONS_MAX) }))
      },
      setVoiceClip(slot, dataUrl) {
        set(s => {
          const voiceClips = { ...s.voiceClips }
          if (dataUrl) voiceClips[slot] = dataUrl
          else delete voiceClips[slot]
          return { voiceClips }
        })
      },
      toggleSound() {
        const on = !get().sound
        setSound(on)
        set({ sound: on })
      },
      recordBest(gameId, stars) {
        const best = get().best
        if ((best[gameId] || 0) >= stars) return
        set({ best: { ...best, [gameId]: stars } })
      }
    }),
    {
      name: STORE_KEY,
      version: SAVE_VERSION,
      // Sans ça, un dépassement de quota fait échouer l'enregistrement en silence ;
      // la toute première fois, la sauvegarde d'avant est lue sous son ancienne clé
      storage: createJSONStorage(() => ({ ...loudStorage, getItem: (name: string) => loudStorage.getItem(name) ?? loudStorage.getItem(OLD_STORE_KEY) })),
      // Une sauvegarde d'avant le 27/10 (des profils, une princesse) est convertie…
      migrate: (old, version) => migrateSave(old, version),
      // … et toute sauvegarde est relue prudemment
      merge: (saved, current) => ({ ...current, ...normalizeSave(saved) }),
      onRehydrateStorage: () => state => { if (state) setSound(state.sound) }
    }
  )
)

/** La petite fille d'Habille-toi (accueil, écran de fin, Atelier, Cartable). */
export const familyDoll = (s: Pick<SaveData, 'look'>): Look => s.look

/* Écrit la sauvegarde dès le premier lancement (une famille qui n'a encore
   rien changé a quand même sa sauvegarde, à la forme du jour). */
try {
  if (!localStorage.getItem(STORE_KEY)) useFerme.setState({})
} catch { /* stockage indisponible : on joue quand même */ }
