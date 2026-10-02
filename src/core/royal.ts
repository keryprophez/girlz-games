/* La princesse des filles (27/09) — ce qu'elle porte, en données pures.

   Une tenue n'est plus « une robe » mais des PIÈCES qu'on assemble (haut,
   jupe, traîne, cape, ailes, couronne, collier, lunettes, chaussures, objet
   à la main), et chaque pièce en tissu a sa PEINTURE (couleur + motif) posée
   au doigt avec la teinture magique. Les cheveux sont réglables (coiffure,
   longueur, boucles, barrettes) et un compagnon l'accompagne.

   Tout est disponible dès le début : rien ne se débloque (règle 1). Le rendu
   3D est dans `core/princess3d.ts` et `core/pet3d.ts` ; ici, rien que des
   données, testées (`royal.test.ts`). */
import { LETTER } from './perles'

export type Pattern = 'none' | 'stars' | 'hearts' | 'flowers' | 'dots' | 'sparkle'
export const PATTERNS: Pattern[] = ['none', 'stars', 'hearts', 'flowers', 'dots', 'sparkle']

/** Les pièces qu'on peut teindre. Celles du compagnon commencent par `p`. */
export type Part = 'hair' | 'bodice' | 'sleeves' | 'skirt' | 'under' | 'belt' | 'shoes' | 'cape' | 'wings' | 'pbody' | 'pmane' | 'pbow'
export const PARTS: Part[] = ['hair', 'bodice', 'sleeves', 'skirt', 'under', 'belt', 'shoes', 'cape', 'wings', 'pbody', 'pmane', 'pbow']

export interface Paint { c: string; p: Pattern }

export type HairStyle = 'loose' | 'braid' | 'ponytail' | 'pigtails' | 'bun' | 'afro'
export const HAIR_STYLES: HairStyle[] = ['loose', 'braid', 'ponytail', 'pigtails', 'bun', 'afro']

export type ClipKind = 'flower' | 'star' | 'bow' | 'heart'
export const CLIP_KINDS: ClipKind[] = ['flower', 'star', 'bow', 'heart']
/** Une barrette piquée dans les cheveux, là où le doigt a touché : angles
    sur la tête (az autour, depuis le nez ; th depuis le sommet). */
export interface Clip { az: number; th: number; k: ClipKind; c: string }
export const CLIPS_MAX = 8

export interface Hair {
  style: HairStyle
  /** 0 = au menton (carré), 0,5 = aux épaules, 1 = au milieu du dos,
      1,6 = jusqu'au sol (Raiponce). Le peigne l'allonge, les ciseaux la coupent. */
  len: number
  /** 0 = raides, 1 = très bouclés (le fer et le lisseur). */
  curl: number
  clips: Clip[]
}
export const HAIR_LEN_MAX = 1.6

export type Top = 'puff' | 'bustier' | 'long'
export type Skirt = 'ball' | 'short' | 'mermaid' | 'layers' | 'petals'
export type Cape = 'none' | 'short' | 'royal'
export type Wings = 'none' | 'fairy' | 'butterfly'
export type Crown = 'none' | 'tiara' | 'crown' | 'flowers' | 'bow'
/** `beads` : le collier enfilé dans les Bijoux (30/09), fait perle par perle
    (voir `Royal.beads`). Il n'est pas dans `NECKS` : il n'existe que s'il a
    été fait. */
export type Neck = 'none' | 'pearls' | 'heart' | 'beads'
export type Glasses = 'none' | 'hearts' | 'stars'
export type Shoes = 'flats' | 'boots'
export type Held = 'none' | 'wand' | 'scepter' | 'bouquet' | 'fan'
export type PetKind = 'none' | 'unicorn' | 'pony' | 'kitten' | 'puppy'

export const TOPS: Top[] = ['puff', 'bustier', 'long']
export const SKIRTS: Skirt[] = ['ball', 'short', 'mermaid', 'layers', 'petals']
export const CAPES: Cape[] = ['none', 'short', 'royal']
export const WINGS: Wings[] = ['none', 'fairy', 'butterfly']
export const CROWNS: Crown[] = ['none', 'tiara', 'crown', 'flowers', 'bow']
/** Les colliers de la garde-robe (le collier de perles enfilé s'y ajoute
    quand il existe). */
export const NECKS: Neck[] = ['none', 'pearls', 'heart']
export const GLASSES: Glasses[] = ['none', 'hearts', 'stars']
export const SHOES: Shoes[] = ['flats', 'boots']
export const HELDS: Held[] = ['none', 'wand', 'scepter', 'bouquet', 'fan']
export const PETS: PetKind[] = ['none', 'unicorn', 'pony', 'kitten', 'puppy']

/* ---- Le collier de perles des Bijoux (30/09) ----
   Chaque perle enfilée : sa sorte (celle d'un compartiment du boîtier) et
   sa couleur, dans l'ordre du fil — du fermoir vers l'aiguille. */
export type BeadKind = 'pearl' | 'glass' | 'crystal' | 'heart' | 'star' | 'flower' | 'spacer' | 'cube'
export const BEAD_KINDS: BeadKind[] = ['pearl', 'glass', 'crystal', 'heart', 'star', 'flower', 'spacer', 'cube']
export interface Bead { k: BeadKind; c: string }
/** Un fil plein d'intercalaires dorés en tient à peu près autant. */
export const BEADS_MAX = 80

/* ---- Le pendentif (1/10) : une création de perles à repasser ----
   Posée sur une plaque à picots des Bijoux, fondue au fer, elle se garde
   en lignes, une lettre par perle (les pots de `perles.ts` : R rouge, P rose…,
   `.` sans perle), recadrée sur ses perles. Accrochée au milieu du collier
   par un petit anneau doré ; la même forme range la vitrine des créations. */
export interface Piece { rows: string[] }
/** La plus grande plaque fait 17 picots ; de la marge pour une plaque à venir. */
export const PIECE_MAX = 29
const INKS = new Set(Object.keys(LETTER))

export interface Royal {
  v: 2
  skin: string
  eyes: string
  freckles: boolean
  hair: Hair
  top: Top
  skirt: Skirt
  train: boolean
  cape: Cape
  wings: Wings
  crown: Crown
  neck: Neck
  glasses: Glasses
  shoes: Shoes
  held: Held
  pet: PetKind
  paint: Record<Part, Paint>
  /** Le collier enfilé dans les Bijoux (vide : il n'y en a pas encore).
      Elle le porte quand `neck` vaut `beads`. */
  beads: Bead[]
  /** Son pendentif, au milieu du collier (null : pas de pendentif). Avec un
      pendentif et sans perles, c'est un simple fil de soie qui le porte. */
  pendant: Piece | null
}

/* ---- Palettes (hexadécimaux sRGB ; le rendu les assombrit pour l'ACES) ---- */
export const SKINS = ['#F6D5BD', '#EDBB98', '#D9A07A', '#B97C55', '#8E5A3A', '#63402A']
export const EYES = ['#6B4226', '#9A6B2E', '#3E7A4A', '#3F78B8', '#7A55B0', '#4A4A58']
export const HAIRS = ['#5B3A21', '#2A1D15', '#E0B050', '#F1DDB0', '#A8482A', '#D8779A', '#8C6FC8', '#4FA7C9']
/** Les pots de teinture. */
export const DYES = [
  '#E0607E', '#F2A0B8', '#C8386A', '#D83A3A', '#F08A4B', '#F2C84B', '#8CCB6A',
  '#3E9E6E', '#4CC3C0', '#6FB6EA', '#3F63C8', '#B79AE8', '#7A4FC0', '#F4F0EA'
]

export function defaultRoyal(): Royal {
  return {
    v: 2,
    skin: SKINS[1], eyes: EYES[0], freckles: false,
    hair: { style: 'loose', len: 0.9, curl: 0.35, clips: [] },
    top: 'puff', skirt: 'ball', train: false, cape: 'none', wings: 'none',
    crown: 'tiara', neck: 'pearls', glasses: 'none', shoes: 'flats', held: 'none', pet: 'none',
    paint: {
      hair: { c: HAIRS[0], p: 'none' },
      bodice: { c: '#E0607E', p: 'none' },
      sleeves: { c: '#E0607E', p: 'none' },
      skirt: { c: '#E0607E', p: 'stars' },
      under: { c: '#F4F0EA', p: 'none' },
      belt: { c: '#F2C84B', p: 'none' },
      shoes: { c: '#E0607E', p: 'none' },
      cape: { c: '#3F63C8', p: 'none' },
      wings: { c: '#B79AE8', p: 'none' },
      pbody: { c: '#F4F0EA', p: 'none' },
      pmane: { c: '#F2A0B8', p: 'none' },
      pbow: { c: '#B79AE8', p: 'none' }
    },
    beads: [],
    pendant: null
  }
}

/** Une deuxième princesse bien différente de la première (le duo). */
export function secondRoyal(): Royal {
  const r = defaultRoyal()
  r.skin = SKINS[0]; r.eyes = EYES[3]
  r.hair = { style: 'braid', len: 1, curl: 0, clips: [] }
  r.crown = 'crown'; r.neck = 'none'; r.held = 'wand'
  r.paint.hair = { c: HAIRS[3], p: 'none' }
  for (const k of ['bodice', 'sleeves', 'skirt'] as Part[]) r.paint[k] = { c: '#6FB6EA', p: 'none' }
  r.paint.skirt.p = 'sparkle'
  return r
}

const HEX = /^#[0-9a-fA-F]{6}$/
const pick = <T>(list: readonly T[], v: unknown, d: T): T => (list.includes(v as T) ? (v as T) : d)
const num = (v: unknown, lo: number, hi: number, d: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d
const hex = (v: unknown, d: string) => (typeof v === 'string' && HEX.test(v) ? v : d)

/** Relit une création de perles à repasser : des lignes de même longueur,
    des lettres de pots connues, au moins une perle, recadrée sur ses perles.
    Tout le reste (abîmé, vide, trop grand) : null. */
export function normalizePiece(x: unknown): Piece | null {
  if (!x || typeof x !== 'object') return null
  const rows = (x as Record<string, unknown>).rows
  if (!Array.isArray(rows) || !rows.length || rows.length > PIECE_MAX) return null
  const w = typeof rows[0] === 'string' ? rows[0].length : 0
  if (!w || w > PIECE_MAX) return null
  for (const row of rows) {
    if (typeof row !== 'string' || row.length !== w) return null
    for (const ch of row) if (ch !== '.' && !INKS.has(ch)) return null
  }
  const lines = rows as string[]
  const full = (s: string) => /[^.]/.test(s)
  const col = (c: number) => lines.some(l => l[c] !== '.')
  let r0 = 0, r1 = lines.length - 1, c0 = 0, c1 = w - 1
  while (r0 <= r1 && !full(lines[r0])) r0++
  if (r0 > r1) return null
  while (!full(lines[r1])) r1--
  while (!col(c0)) c0++
  while (!col(c1)) c1--
  return { rows: lines.slice(r0, r1 + 1).map(l => l.slice(c0, c1 + 1)) }
}

/** Le nombre de perles d'une création. */
export const pieceSize = (p: Piece) => p.rows.reduce((n, l) => n + l.replace(/\./g, '').length, 0)

/** A-t-elle un collier des Bijoux (des perles enfilées, ou un pendentif) ? */
export const hasNecklace = (r: Pick<Royal, 'beads' | 'pendant'>) => r.beads.length > 0 || !!r.pendant

/** Relit une princesse venue du stockage : tout champ absent, inconnu ou
    abîmé reprend sa valeur par défaut (une vieille sauvegarde ne casse rien). */
export function normalizeRoyal(x: unknown): Royal {
  const d = defaultRoyal()
  if (!x || typeof x !== 'object') return d
  const o = x as Record<string, unknown>
  const h = (o.hair && typeof o.hair === 'object' ? o.hair : {}) as Record<string, unknown>
  const clips = Array.isArray(h.clips) ? h.clips : []
  const paintIn = (o.paint && typeof o.paint === 'object' ? o.paint : {}) as Record<string, unknown>
  const paint = {} as Record<Part, Paint>
  for (const k of PARTS) {
    const p = (paintIn[k] && typeof paintIn[k] === 'object' ? paintIn[k] : {}) as Record<string, unknown>
    paint[k] = { c: hex(p.c, d.paint[k].c), p: pick(PATTERNS, p.p, d.paint[k].p) }
  }
  // Le collier enfilé : une perle abîmée (sorte inconnue) est jetée, pas remplacée
  const beads = (Array.isArray(o.beads) ? o.beads : []).flatMap(b => {
    if (!b || typeof b !== 'object') return []
    const q = b as Record<string, unknown>
    if (!BEAD_KINDS.includes(q.k as BeadKind)) return []
    return [{ k: q.k as BeadKind, c: hex(q.c, '#F4F0EA') }]
  }).slice(0, BEADS_MAX)
  // Le pendentif (1/10) : une vieille sauvegarde n'en a pas, rien ne change
  const pendant = normalizePiece(o.pendant)
  return {
    v: 2,
    skin: hex(o.skin, d.skin),
    eyes: hex(o.eyes, d.eyes),
    freckles: o.freckles === true,
    hair: {
      style: pick(HAIR_STYLES, h.style, d.hair.style),
      len: num(h.len, 0, HAIR_LEN_MAX, d.hair.len),
      curl: num(h.curl, 0, 1, d.hair.curl),
      clips: clips.slice(-CLIPS_MAX).flatMap(c => {
        if (!c || typeof c !== 'object') return []
        const q = c as Record<string, unknown>
        if (typeof q.az !== 'number' || typeof q.th !== 'number') return []
        return [{ az: num(q.az, -Math.PI, Math.PI, 0), th: num(q.th, 0, Math.PI, 0.5), k: pick(CLIP_KINDS, q.k, 'flower'), c: hex(q.c, '#F2A0B8') }]
      })
    },
    top: pick(TOPS, o.top, d.top),
    skirt: pick(SKIRTS, o.skirt, d.skirt),
    train: o.train === true,
    cape: pick(CAPES, o.cape, d.cape),
    wings: pick(WINGS, o.wings, d.wings),
    crown: pick(CROWNS, o.crown, d.crown),
    // Porter le collier enfilé… à condition qu'il existe
    neck: o.neck === 'beads' && hasNecklace({ beads, pendant }) ? 'beads' : pick(NECKS, o.neck, d.neck),
    glasses: pick(GLASSES, o.glasses, d.glasses),
    shoes: pick(SHOES, o.shoes, d.shoes),
    held: pick(HELDS, o.held, d.held),
    pet: pick(PETS, o.pet, d.pet),
    paint,
    beads,
    pendant
  }
}

/** Le collier des Bijoux passé à son cou (une copie : `r` ne change pas).
    Son pendentif, s'il en a un, reste au milieu du nouveau fil. Un fil vide
    sans pendentif le lui retire. */
export function wearBeads(r: Royal, beads: Bead[]): Royal {
  const out = cloneRoyal(r)
  out.beads = normalizeRoyal({ beads }).beads
  if (hasNecklace(out)) out.neck = 'beads'
  else if (out.neck === 'beads') out.neck = 'none'
  return out
}

/** Le pendentif accroché au milieu de son collier (une copie). Sans perles
    enfilées, un fil de soie le porte ; `null` le décroche. */
export function wearPendant(r: Royal, p: Piece | null): Royal {
  const out = cloneRoyal(r)
  out.pendant = normalizePiece(p)
  if (hasNecklace(out)) out.neck = 'beads'
  else if (out.neck === 'beads') out.neck = 'none'
  return out
}

/** Une copie profonde (les jeux modifient leur princesse en place). */
export const cloneRoyal = (r: Royal): Royal => JSON.parse(JSON.stringify(r)) as Royal

/** Une clé stable pour les caches de portraits. */
export const royalKey = (r: Royal) => JSON.stringify(r)

/* ---- La surprise : une tenue au hasard, mais qui va ensemble ---- */
/** Des familles de couleurs qui s'accordent : principale, jupon, rubans. */
const HARMONIES: [string, string, string][] = [
  ['#E0607E', '#F4F0EA', '#F2C84B'], ['#6FB6EA', '#F4F0EA', '#B79AE8'],
  ['#B79AE8', '#F2A0B8', '#F4F0EA'], ['#F2C84B', '#F4F0EA', '#E0607E'],
  ['#3E9E6E', '#F2C84B', '#F4F0EA'], ['#4CC3C0', '#F2A0B8', '#F4F0EA'],
  ['#C8386A', '#F2A0B8', '#F2C84B'], ['#3F63C8', '#6FB6EA', '#F2C84B'],
  ['#7A4FC0', '#B79AE8', '#F2C84B'], ['#F08A4B', '#F2C84B', '#F4F0EA']
]

export function randomRoyal(base: Royal, rnd: () => number = Math.random): Royal {
  const r = cloneRoyal(base)
  const any = <T>(l: readonly T[]) => l[Math.floor(rnd() * l.length)]
  const [main, soft, trim] = any(HARMONIES)
  r.top = any(TOPS)
  r.skirt = any(SKIRTS)
  r.train = (r.skirt === 'ball' || r.skirt === 'mermaid') && rnd() < 0.35
  r.cape = rnd() < 0.25 ? any(['short', 'royal'] as Cape[]) : 'none'
  r.wings = rnd() < 0.3 ? any(['fairy', 'butterfly'] as Wings[]) : 'none'
  r.crown = any(CROWNS.slice(1))
  // Son collier de perles fait partie des surprises, s'il existe
  r.neck = any(hasNecklace(r) ? [...NECKS, 'beads'] as Neck[] : NECKS)
  r.glasses = rnd() < 0.12 ? any(['hearts', 'stars'] as Glasses[]) : 'none'
  r.shoes = any(SHOES)
  r.held = any(HELDS)
  r.hair = { style: any(HAIR_STYLES), len: 0.3 + rnd() * 1.1, curl: rnd(), clips: [] }
  const pat = rnd() < 0.55 ? any(PATTERNS.slice(1)) : 'none'
  r.paint.bodice = { c: main, p: 'none' }
  r.paint.sleeves = { c: rnd() < 0.5 ? main : soft, p: 'none' }
  r.paint.skirt = { c: main, p: pat }
  r.paint.under = { c: soft, p: 'none' }
  r.paint.belt = { c: trim, p: 'none' }
  r.paint.shoes = { c: rnd() < 0.5 ? main : trim, p: 'none' }
  r.paint.cape = { c: any(DYES), p: 'none' }
  r.paint.wings = { c: soft === '#F4F0EA' ? '#B79AE8' : soft, p: 'none' }
  if (rnd() < 0.15) r.paint.hair = { c: any(HAIRS), p: 'none' }
  return r
}

/* ---- Ce que la princesse pense de ce qu'on lui met ---- */
export type Mood = 'joy' | 'love' | 'wow' | 'funny'
/** Sa réaction à une pièce qu'on vient de lui mettre : les lunettes
    rigolotes la font pouffer, une couronne ou des ailes l'émerveillent. */
export function moodFor(field: keyof Royal | 'hair', value: unknown, rnd: () => number = Math.random): Mood {
  if (field === 'glasses' && value !== 'none') return 'funny'
  if ((field === 'crown' || field === 'wings' || field === 'cape') && value !== 'none') return 'wow'
  if (field === 'pet' && value !== 'none') return 'love'
  return rnd() < 0.5 ? 'love' : 'joy'
}

/** Les pièces de tissu qui existent vraiment avec cette tenue (on ne teint
    pas des manches absentes). */
export function partsPresent(r: Royal): Part[] {
  const out: Part[] = ['hair', 'bodice', 'skirt', 'under', 'belt']
  if (r.top !== 'bustier') out.push('sleeves')
  if (r.skirt === 'short' || r.skirt === 'petals' || r.shoes === 'boots') out.push('shoes')
  if (r.cape !== 'none') out.push('cape')
  if (r.wings !== 'none') out.push('wings')
  if (r.pet !== 'none') out.push('pbody', 'pmane', 'pbow')
  return out
}
