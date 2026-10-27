/* LA SAUVEGARDE DE LA FAMILLE (27/10) — sa forme, et la conversion des
   anciennes. Logique pure, testée (`save.test.ts`) : le store la relit à
   chaque ouverture (`merge`) et convertit une sauvegarde d'avant
   (`migrate`).

   Une seule sauvegarde pour la famille : le choix de joueuse (masqué depuis
   le 10/09) et la princesse (partie le 6/10) sont sortis le 27/10. Ce qui
   était à « la joueuse en cours » revient à la famille : sa meilleure note
   par jeu, le look de la petite fille d'Habille-toi, les encouragements
   enregistrés. Les créations faites « par fille » (la Ferme, le Cartable, les
   Monuments) ne sont pas ici : chaque jeu les range sous ses propres clés. */
import { normalizeBeads, type Bead } from './bijoux3d'
import { normalizeLook, type Look } from './character'
import { normalizePiece, type Piece } from './perles'

export const SAVE_VERSION = 1

/** Une création gardée dans la vitrine des Bijoux. */
export interface Creation extends Piece { at: number }
export const CREATIONS_MAX = 24

/** Les deux encouragements qu'on enregistre dans le studio des voix. */
export type ClipSlot = 'bravo' | 'retry'
export const CLIP_SLOTS: ClipSlot[] = ['bravo', 'retry']

export interface SaveData {
  sound: boolean
  /** Minuteur parental : l'heure de fin (null = pas de minuteur). */
  timerEnd: number | null
  /** La meilleure note par jeu, sous sa tuile (règle 1 : rien d'autre). */
  best: Record<string, number>
  /** La petite fille d'Habille-toi. */
  look: Look
  /** La clé sous laquelle l'Atelier range ses dessins et ses coloriages :
      l'identifiant du profil qui était en cours avant le 27/10 (« jade » le
      plus souvent). Elle ne change JAMAIS, sinon le dossier se viderait. */
  owner: string
  /** Le collier enfilé dans les Bijoux, dans l'ordre du fil (la vitrine le
      montre sur son coussin, avec son pendentif). */
  necklace: Bead[]
  /** Le pendentif du collier (null : pas de pendentif). */
  pendant: Piece | null
  /** La vitrine des créations de perles à repasser, les plus récentes d'abord. */
  creations: Creation[]
  /** Les encouragements enregistrés (dataURL audio). */
  voiceClips: Partial<Record<ClipSlot, string>>
}

export function defaultSave(): SaveData {
  return { sound: true, timerEnd: null, best: {}, look: normalizeLook(null), owner: 'jade', necklace: [], pendant: null, creations: [], voiceClips: {} }
}

type Obj = Record<string, unknown>
const obj = (x: unknown): Obj => (x && typeof x === 'object' && !Array.isArray(x) ? x as Obj : {})

function normalizeBest(x: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [id, v] of Object.entries(obj(x))) {
    if (typeof v === 'number' && Number.isFinite(v)) out[id] = Math.max(0, Math.min(3, Math.round(v)))
  }
  return out
}

/** Relit la vitrine : les créations abîmées sont jetées. */
export function normalizeCreations(x: unknown): Creation[] {
  return (Array.isArray(x) ? x : []).flatMap(c => {
    const p = normalizePiece(c)
    const at = obj(c).at
    return p ? [{ ...p, at: typeof at === 'number' && Number.isFinite(at) ? at : 0 }] : []
  }).slice(0, CREATIONS_MAX)
}

/** Relit une sauvegarde à la forme du jour : tout champ absent ou abîmé
    reprend sa valeur par défaut (une vieille sauvegarde ne casse rien). */
export function normalizeSave(x: unknown): SaveData {
  const o = obj(x)
  const d = defaultSave()
  const clips: Partial<Record<ClipSlot, string>> = {}
  for (const slot of CLIP_SLOTS) {
    const v = obj(o.voiceClips)[slot]
    if (typeof v === 'string' && v.startsWith('data:')) clips[slot] = v
  }
  return {
    sound: typeof o.sound === 'boolean' ? o.sound : d.sound,
    timerEnd: typeof o.timerEnd === 'number' && Number.isFinite(o.timerEnd) ? o.timerEnd : null,
    best: normalizeBest(o.best),
    look: normalizeLook(o.look),
    owner: typeof o.owner === 'string' && /^[\w-]{1,32}$/.test(o.owner) ? o.owner : d.owner,
    necklace: normalizeBeads(o.necklace),
    pendant: normalizePiece(o.pendant),
    creations: normalizeCreations(o.creations),
    voiceClips: clips
  }
}

/** Convertit une sauvegarde d'avant le 27/10 (version 0 : des profils, une
    princesse) : on garde ce que la famille voyait à l'écran — les notes, le
    look et les voix de la joueuse en cours, le pendentif de la princesse
    qu'on habillait seule et son collier, la vitrine. */
export function migrateSave(x: unknown, version: number): SaveData {
  if (version >= SAVE_VERSION) return normalizeSave(x)
  const o = obj(x)
  const profiles = (Array.isArray(o.profiles) ? o.profiles : []).map(obj)
  const owner = typeof o.currentId === 'string' && o.currentId ? o.currentId
    : typeof profiles[0]?.id === 'string' ? profiles[0].id as string : 'jade'
  const cur = profiles.find(p => p.id === owner) ?? profiles[0] ?? {}
  const oldClips = obj(o.voiceClips)
  const voiceClips: Obj = {}
  // Le studio rangeait les voix sous « famille: » (profils masqués), et
  // avant le 10/09 sous le prénom de la joueuse
  for (const slot of CLIP_SLOTS) voiceClips[slot] = oldClips['famille:' + slot] ?? oldClips[owner + ':' + slot]
  return normalizeSave({
    sound: o.sound,
    timerEnd: o.timerEnd,
    best: obj(obj(obj(o.progress)[owner]).bestStars),
    look: cur.look,
    owner,
    necklace: obj(obj(o.royals).solo).beads,
    pendant: obj(obj(o.royals).solo).pendant,
    creations: o.creations,
    voiceClips
  })
}
