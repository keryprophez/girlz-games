import { describe, expect, it } from 'vitest'
import { decoys, isSimpleCV, landing, nameWord, reading, SOUNDS, WORDS, type Word } from './phonics'
import { PHOTOS } from './sprites'

/** Hasard reproductible (mulberry32). */
function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6D2B79F5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ALL: Word[] = [...WORDS.easy, ...WORDS.med, ...WORDS.exp]
const byId = (id: string) => ALL.find(w => w.id === id)!
/** Tout ce que la voix dit en posant le mot cube après cube, puis en le lisant. */
const spoken = (w: Word) => [...w.g.flatMap((_, i) => landing(w, i)), ...reading(w)]

describe('les mots des cubes', () => {
  it('les graphèmes recollés redonnent le mot écrit', () => {
    for (const w of ALL) expect(w.text.toUpperCase()).toBe(w.id)
  })
  it('les syllabes se suivent et couvrent tout le mot', () => {
    for (const w of ALL) {
      expect(w.syl[0].from).toBe(0)
      expect(w.syl[w.syl.length - 1].to).toBe(w.g.length - 1)
      w.syl.forEach((s, k) => {
        if (k) expect(s.from).toBe(w.syl[k - 1].to + 1)
        expect(s.to).toBeGreaterThanOrEqual(s.from)
        expect(s.say.length).toBeGreaterThan(0)
        // Chaque syllabe fait entendre une voyelle
        expect(w.g.slice(s.from, s.to + 1).some(g => g.s && SOUNDS[g.s].vowel)).toBe(true)
      })
    }
  })
  it('chaque mot a sa photo dans l\'imagier', () => {
    for (const w of ALL) expect(PHOTOS.has(w.pic!)).toBe(true)
  })
  it('aucun mot en double, ni d\'un niveau à l\'autre', () => {
    expect(new Set(ALL.map(w => w.id)).size).toBe(ALL.length)
  })
  it('la fleur : des mots courts et réguliers, consonne + voyelle', () => {
    for (const w of WORDS.easy) {
      expect(isSimpleCV(w)).toBe(true)
      expect(w.g.length).toBeLessThanOrEqual(6)
    }
  })
  it('les niveaux s\'allongent : fleur < éclair < flamme', () => {
    const mean = (ws: Word[]) => ws.reduce((a, w) => a + w.text.length, 0) / ws.length
    expect(mean(WORDS.easy)).toBeLessThan(mean(WORDS.med))
    expect(mean(WORDS.med)).toBeLessThan(mean(WORDS.exp))
    // Les longs mots de la flamme d'avant sont toujours là
    for (const id of ['HIPPOPOTAME', 'CHAMPIGNON', 'CITROUILLE', 'KANGOUROU', 'PAPILLON', 'AUBERGINE', 'CONCOMBRE', 'HÉRISSON']) {
      expect(WORDS.exp.some(w => w.id === id)).toBe(true)
    }
  })
  it('un cube tient sur sa face : trois lettres au plus', () => {
    for (const w of ALL) for (const g of w.g) expect(g.t.length).toBeLessThanOrEqual(3)
  })
})

describe('la découpe à la main', () => {
  const cut = (id: string) => byId(id).syl.map(s => byId(id).g.slice(s.from, s.to + 1).map(g => g.t).join(''))
  it('les syllabes écrites du CP', () => {
    expect(cut('LAMA')).toEqual(['la', 'ma'])
    expect(cut('TOMATE')).toEqual(['to', 'ma', 'te'])
    expect(cut('LAPIN')).toEqual(['la', 'pin'])
    expect(cut('COCHON')).toEqual(['co', 'chon'])
    expect(cut('HIPPOPOTAME')).toEqual(['hi', 'ppo', 'po', 'ta', 'me'])
    expect(cut('CHAMPIGNON')).toEqual(['cham', 'pi', 'gnon'])
    expect(cut('CITROUILLE')).toEqual(['ci', 'trouille'])
    expect(cut('ÉLÉPHANT')).toEqual(['é', 'lé', 'phant'])
  })
  it('les graphèmes complexes sont UN cube', () => {
    expect(byId('VACHE').g.map(g => g.t)).toEqual(['v', 'a', 'ch', 'e'])
    expect(byId('KANGOUROU').g.map(g => g.t)).toEqual(['k', 'an', 'g', 'ou', 'r', 'ou'])
    expect(byId('POISSON').g.map(g => g.t)).toEqual(['p', 'oi', 'ss', 'on'])
  })
  it('les lettres muettes ne disent rien', () => {
    expect(byId('HIBOU').g[0]).toMatchObject({ t: 'h', s: null })
    expect(byId('CANARD').g[5]).toMatchObject({ t: 'd', s: null })
    expect(byId('ÉLÉPHANT').g[5]).toMatchObject({ t: 't', s: null })
    expect(landing(byId('HIBOU'), 0)).toEqual([])
  })
  it('le son suit le mot, pas la lettre', () => {
    expect(byId('CITROUILLE').g[0].s).toBe('s')     // c devant i
    expect(byId('GIRAFE').g[0].s).toBe('j')         // g devant i
    expect(byId('COCHON').g[0].s).toBe('k')
    expect(byId('PAPILLON').g[4].s).toBe('y')       // ll de papillon
    expect(byId('PERROQUET').g[1].s).toBe('è')
  })
})

describe('ce que dit la voix', () => {
  it('« mmm », « a », puis « ma » (l\'exemple du père)', () => {
    const w = byId('LAMA')
    expect(landing(w, 0)).toEqual(['llleu'])
    expect(landing(w, 1)).toEqual(['a', 'la'])
    expect(landing(w, 2)).toEqual(['mmm'])
    expect(landing(w, 3)).toEqual(['a', 'ma'])
    expect(reading(w)).toEqual(['la', 'ma', 'lama'])
  })
  it('jamais le NOM d\'une consonne seule (« èm », « pé ») : son son', () => {
    for (const w of ALL) {
      for (const g of w.g) {
        if (!g.s || SOUNDS[g.s].vowel) continue
        const say = SOUNDS[g.s].say
        // Une consonne seule serait lue par son nom : il faut plus d'une lettre
        expect(say.length).toBeGreaterThan(1)
        // Et jamais une suite de consonnes sans voyelle, épelée par certains moteurs (sauf « mmm »)
        if (say !== 'mmm') expect(/[aeiouyéè]/.test(say)).toBe(true)
      }
    }
  })
  it('une syllabe qui n\'est qu\'un son n\'est dite qu\'une fois', () => {
    const k = byId('KOALA')
    expect(landing(k, 2)).toEqual(['a'])
    expect(landing(byId('HIBOU'), 1)).toEqual(['i'])
    expect(landing(byId('ÉLÉPHANT'), 0)).toEqual(['é'])
  })
  it('la syllabe arrive avec son dernier cube, même muet', () => {
    const w = byId('CANARD')
    expect(landing(w, 4)).toEqual(['rrreu'])
    expect(landing(w, 5)).toEqual(['nar'])
  })
  it('la lecture finale : chaque syllabe, puis le mot', () => {
    expect(reading(byId('PAPILLON'))).toEqual(['pa', 'pi', 'yon', 'papillon'])
    expect(reading(byId('HIPPOPOTAME'))).toEqual(['i', 'po', 'po', 'ta', 'me', 'hippopotame'])
  })
  it('les bouts de mots que la voix lirait mal sont réécrits', () => {
    const all = ALL.flatMap(spoken)
    for (const bad of ['com', 'con', 'fan', 'cham', 'ko', 'in']) expect(all).not.toContain(bad)
    expect(spoken(byId('CONCOMBRE'))).toContain("qu'on")
  })
  it('chaque mot se dit en entier, sans trou', () => {
    for (const w of ALL) {
      const said = spoken(w)
      expect(said[said.length - 1]).toBe(w.text)
      expect(said.every(s => s.trim().length > 0)).toBe(true)
    }
  })
})

describe('les leurres', () => {
  it('jamais un cube du mot, jamais deux fois le même', () => {
    const rand = seeded(7)
    for (const tier of ['easy', 'med', 'exp'] as const) {
      for (const w of WORDS[tier]) {
        for (let k = 0; k < 20; k++) {
          const d = decoys(w, 6, tier, rand)
          expect(d.length).toBe(6)
          expect(new Set(d).size).toBe(6)
          for (const t of d) expect(w.g.some(g => g.t === t)).toBe(false)
        }
      }
    }
  })
  it('la fleur : des lettres simples ; dès l\'éclair, des pièges voisins', () => {
    const rand = seeded(3)
    for (let k = 0; k < 30; k++) expect(decoys(byId('BANANE'), 4, 'easy', rand).every(t => t.length === 1)).toBe(true)
    // lapin : le « d » et le « q » miroirs du « p », « an » voisin de « in »
    const seen = new Set<string>()
    for (let k = 0; k < 30; k++) decoys(byId('LAPIN'), 6, 'med', rand).forEach(t => seen.add(t))
    expect(['q', 'b', 'an'].some(t => seen.has(t))).toBe(true)
  })
})

describe('les prénoms', () => {
  it('Jade se compose, un prénom inconnu ne s\'invente pas', () => {
    expect(nameWord('Jade')?.syl.map(s => s.say)).toEqual(['ja', 'de'])
    expect(nameWord('Joyce')?.text).toBe('joyce')
    expect(nameWord('Zoé')).toBeNull()
  })
})
