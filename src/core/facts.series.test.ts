/* Le moteur de `facts.ts` rendu générique (27/10, « levier 4 ») : les séries
   sans remise de l'Horloge, du Tour du Monde, des Lettres et du Marché. Les
   tests du Potager, eux, restent dans `facts.test.ts`, inchangés. */
import { describe, expect, it } from 'vitest'
import {
  COME_BACK, comeBack, emptyMemory, LV, MEM_MAX, memoryKey, packMemory, planMix, planSeries, prune, recall,
  record, recOf, requeue, unpackMemory, type Item, type Keyed, type Memory, type Shelf
} from './facts'

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

interface Hour extends Keyed { h: number }
const HOURS: Hour[] = Array.from({ length: 12 }, (_, i) => ({ key: `h:${i + 1}`, h: i + 1 }))
const keys = (q: Item<Keyed>[]) => q.map(it => it.fact.key)
const known = (m: Memory, k: string, last: number, gap = 1) => { m.facts[k] = { lv: LV.numbers, last, gap, seen: 2 } }
const missed = (m: Memory, k: string, last: number) => { m.facts[k] = { lv: LV.discover, last, gap: 0, seen: 1 } }

/** Une étagère en mémoire, à la place du localStorage. */
function shelf(): Shelf & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, get: k => data.get(k) ?? null, set: (k, v) => { data.set(k, v) } }
}

describe('une série sans remise', () => {
  it('jamais deux fois la même question, quelle que soit la mémoire', () => {
    for (let s = 0; s < 300; s++) {
      const r = seeded(s)
      const m = emptyMemory(); m.games = 1 + Math.floor(r() * 20)
      for (const f of HOURS) {
        const x = r()
        if (x < 0.3) missed(m, f.key, Math.floor(r() * m.games))
        else if (x < 0.7) known(m, f.key, Math.floor(r() * m.games), 1 + Math.floor(r() * 8))
      }
      const n = 1 + Math.floor(r() * 14)
      const q = planSeries(m, HOURS, n, { rng: seeded(s + 99) })
      expect(q.length).toBe(Math.min(n, HOURS.length))
      expect(new Set(keys(q)).size).toBe(q.length)
      expect(q.some(it => it.kind === 'again')).toBe(false)
    }
  })

  it('toute neuve : des éléments jamais vus, au hasard', () => {
    const m = emptyMemory(); m.games = 1
    const q = planSeries(m, HOURS, 8, { rng: seeded(1) })
    expect(q.every(it => it.kind === 'probe')).toBe(true)
    // Le hasard tourne : deux séries neuves ne posent pas les mêmes heures
    expect(keys(planSeries(m, HOURS, 8, { rng: seeded(2) }))).not.toEqual(keys(q))
  })

  it('ce qui a été raté passe d\'abord', () => {
    const m = emptyMemory(); m.games = 5
    for (const f of HOURS) known(m, f.key, 4)
    missed(m, 'h:7', 4); missed(m, 'h:11', 3); missed(m, 'h:3', 2)
    for (let s = 0; s < 30; s++) {
      expect(keys(planSeries(m, HOURS, 8, { rng: seeded(s) }))).toEqual(expect.arrayContaining(['h:7', 'h:11', 'h:3']))
    }
  })

  it('une série courte (trois mots) garde sa place aux ratés, pas aux révisions', () => {
    const words = ['LAPIN', 'CHEVAL', 'COCHON', 'CANARD', 'HIBOU'].map(key => ({ key }))
    const m = emptyMemory(); m.games = 9
    known(m, 'LAPIN', 1); known(m, 'CHEVAL', 1); known(m, 'COCHON', 1)
    missed(m, 'CANARD', 8); missed(m, 'HIBOU', 8)
    const q = planSeries(m, words, 3, { rng: seeded(4) })
    expect(keys(q)).toEqual(expect.arrayContaining(['CANARD', 'HIBOU']))
  })

  it('six en cours et rien d\'autre : du neuf plutôt que deux fois la même', () => {
    const m = emptyMemory(); m.games = 3
    for (const h of [1, 2, 3, 4, 5, 6, 7]) missed(m, `h:${h}`, 2)
    const q = planSeries(m, HOURS, 12, { rng: seeded(5) })
    expect(q.length).toBe(12)
    expect(new Set(keys(q)).size).toBe(12)
    expect(q.filter(it => it.kind === 'probe').length).toBe(5)
  })

  it('tout est su : ce qu\'on n\'a pas vu depuis le plus longtemps', () => {
    const m = emptyMemory(); m.games = 19
    // Aucune n'est due (écart de 8) : on prend les plus anciennes
    HOURS.forEach((f, i) => known(m, f.key, 12 + (i % 6), 8))
    const q = planSeries(m, HOURS, 4, { rng: seeded(6) })
    expect(keys(q).sort()).toEqual(['h:1', 'h:7', 'h:2', 'h:8'].sort())
    expect(q.every(it => it.kind === 'extra')).toBe(true)
  })

  it('les révisions dues passent avant le jamais vu (une sur quatre au plus)', () => {
    const m = emptyMemory(); m.games = 6
    for (const h of [1, 2, 3, 4]) known(m, `h:${h}`, 5, 1)
    const q = planSeries(m, HOURS, 8, { rng: seeded(7) })
    expect(q.filter(it => it.kind === 'review').length).toBeGreaterThanOrEqual(2)
  })

  it('sans révision (le Marché) : un montant réussi ne revient pas tant qu\'il reste du neuf', () => {
    const pool = Array.from({ length: 200 }, (_, i) => ({ key: `pay:${i + 35}` }))
    const m = emptyMemory(); m.games = 10
    for (let i = 0; i < 30; i++) known(m, pool[i].key, 2, 1)
    missed(m, 'pay:150', 9)
    for (let s = 0; s < 20; s++) {
      const q = planSeries(m, pool, 4, { rng: seeded(s), reviews: 0 })
      expect(keys(q)).toContain('pay:150')
      expect(q.filter(it => it.kind === 'review' || it.kind === 'extra').length).toBe(0)
    }
  })

  it('la plus sûre en tête', () => {
    const m = emptyMemory(); m.games = 4
    m.facts['h:5'] = { lv: LV.heart, last: 3, gap: 1, seen: 6 }
    missed(m, 'h:1', 3); missed(m, 'h:2', 3)
    const q = planSeries(m, HOURS, 8, { rng: seeded(8) })
    expect(q[0].fact.key).toBe('h:5')
  })
})

describe('plusieurs tas mêlés (le Tour du Monde à la fleur)', () => {
  const animals = ['panda', 'tigre', 'girafe', 'zebre', 'lion', 'koala'].map(a => ({ key: `animal:${a}` }))
  const countries = ['France', 'Spain', 'Italy', 'China', 'Japan', 'Brazil', 'Canada'].map(c => ({ key: `pays:${c}` }))
  it('autant de chacun, sans doublon, mêlés', () => {
    const m = emptyMemory(); m.games = 1
    let mixed = 0
    for (let s = 0; s < 40; s++) {
      const q = planMix(m, [{ pool: animals, n: 4 }, { pool: countries, n: 4 }], { rng: seeded(s) })
      expect(q.length).toBe(8)
      expect(new Set(keys(q)).size).toBe(8)
      expect(q.filter(it => it.fact.key.startsWith('animal:')).length).toBe(4)
      if (keys(q).slice(0, 4).some(k => k.startsWith('pays:')) && keys(q).slice(0, 4).some(k => k.startsWith('animal:'))) mixed++
    }
    expect(mixed).toBeGreaterThan(20)
  })
})

describe('un raté revient trois questions plus loin', () => {
  const series = (): Item<Hour>[] => HOURS.slice(0, 8).map(fact => ({ fact, kind: 'probe' }))

  it('deux questions entre les deux, et la série garde sa longueur', () => {
    const q = series()
    expect(comeBack(q, 0)).toBe(true)
    expect(q.length).toBe(8)
    expect(q[COME_BACK]).toMatchObject({ kind: 'again', fact: { key: 'h:1' } })
    const q2 = series()
    expect(comeBack(q2, 4)).toBe(true)
    expect(q2[7]).toMatchObject({ kind: 'again', fact: { key: 'h:5' } })
  })

  it('trop près de la fin : il attendra la série suivante', () => {
    const q = series()
    expect(comeBack(q, 5)).toBe(false)
    expect(keys(q)).toEqual(keys(series()))
    // Une série de trois mots : jamais
    const three = series().slice(0, 3)
    expect(comeBack(three, 0)).toBe(false)
  })

  it('un raté qui revient déjà ne revient pas une troisième fois', () => {
    const q = series()
    comeBack(q, 0)
    expect(comeBack(q, 3)).toBe(false)
  })

  it('le Potager garde son retour au plus tôt (dès la suivante en fin de récolte)', () => {
    const q = series()
    expect(requeue(q, 6, q[6].fact)).toBe(true)
    expect(q[7]).toMatchObject({ kind: 'again', fact: { key: 'h:7' } })
  })

  it('en jouant : une question n\'est jamais posée deux fois, sauf un raté, jamais à la suite', () => {
    const rec = recall('test', shelf())
    const r = seeded(11)
    for (let g = 0; g < 200; g++) {
      const q = rec.series(HOURS, 8, { rng: seeded(g) })
      for (let i = 0; i < q.length; i++) {
        const ok = r() > 0.35
        rec.note(q[i], ok)
        if (!ok) comeBack(q, i)
      }
      expect(q.length).toBe(8)
      const firsts = q.filter(it => it.kind !== 'again')
      expect(new Set(keys(firsts)).size).toBe(firsts.length)
      q.forEach((it, i) => {
        if (it.kind !== 'again') return
        const j = q.findIndex(x => x.fact.key === it.fact.key)
        expect(i - j).toBeGreaterThanOrEqual(COME_BACK)
      })
      for (let i = 1; i < q.length; i++) expect(q[i].fact.key).not.toBe(q[i - 1].fact.key)
    }
  })
})

describe('la mémoire d\'un jeu', () => {
  it('ce qui a été raté revient en tête à la série suivante', () => {
    const rec = recall('clock', shelf())
    const q1 = rec.series(HOURS, 8, { rng: seeded(3) })
    const raté = q1[7]
    q1.forEach(it => rec.note(it, it !== raté))
    expect(recOf(rec.mem, raté.fact.key).lv).toBe(LV.discover)
    for (let s = 0; s < 10; s++) expect(keys(planSeries(rec.mem, HOURS, 8, { rng: seeded(s) }))).toContain(raté.fact.key)
  })

  it('juste du premier coup : su ; puis les révisions s\'espacent, rien ne fane', () => {
    const rec = recall('clock', shelf())
    const it: Item<Hour> = { fact: HOURS[2], kind: 'probe' }
    rec.series(HOURS, 8)
    rec.note(it, true)
    expect(recOf(rec.mem, 'h:3')).toMatchObject({ lv: LV.numbers, gap: 1 })
    for (let g = 0; g < 30; g++) rec.series(HOURS, 8)
    expect(recOf(rec.mem, 'h:3').lv).toBe(LV.numbers)
  })

  it('changer de mode sans répondre ne fait pas passer les parties', () => {
    const sh = shelf()
    const rec = recall('clock', sh)
    for (let k = 0; k < 4; k++) rec.series(HOURS, 8)
    expect(rec.mem.games).toBe(1)
    expect(sh.data.size).toBe(0) // rien n'est gardé tant qu'elle n'a pas répondu
    const q = rec.series(HOURS, 8)
    rec.note(q[0], true)
    expect(rec.mem.games).toBe(1)
    expect(recall('clock', sh).mem.games).toBe(1)
    rec.series(HOURS, 8)
    expect(rec.mem.games).toBe(2)
  })

  it('gardée sous `ferme:memoire:<jeu>`, relue à la réouverture', () => {
    const sh = shelf()
    const a = recall('geo', sh)
    const q = a.series(HOURS, 8, { rng: seeded(1) })
    a.note(q[0], false)
    a.note(q[1], true)
    expect([...sh.data.keys()]).toEqual([memoryKey('geo')])
    expect(memoryKey('geo')).toBe('ferme:memoire:geo')
    const b = recall('geo', sh)
    expect(b.mem).toEqual(a.mem)
    expect(b.mem.games).toBe(1)
  })

  it('compacte : quatre nombres par élément', () => {
    const m = emptyMemory(); m.games = 3
    record(m, { fact: { key: 'q:3:45' }, kind: 'probe' }, { ok: true, fast: true })
    expect(packMemory(m)).toBe('{"v":1,"games":3,"facts":{"q:3:45":[3,3,1,1]}}')
    expect(unpackMemory(packMemory(m))).toEqual(m)
  })

  it('relue prudemment : illisible → neuve ; une entrée abîmée est oubliée, pas les autres', () => {
    for (const raw of [null, '', 'oups', '[]', '42', '{"v":2,"games":1,"facts":{}}', '{"v":1,"games":-1,"facts":{}}',
      '{"v":1,"games":"3","facts":{}}', '{"v":1,"games":3,"facts":[]}', '{"v":1,"games":3}']) {
      expect(unpackMemory(raw)).toEqual(emptyMemory())
    }
    const m = unpackMemory(JSON.stringify({
      v: 1, games: 5,
      facts: {
        'h:1': [3, 4, 2, 3], 'h:2': [9, 4, 2, 3], 'h:3': [1, 4, 2], 'h:4': ['3', 4, 2, 3], 'h:5': [2, 4, 99, 1],
        'h:6': [1, 2.5, 0, 1], 'h:7': [0, 4, 0, 0], 'h:8': [4, 40, 8, 6], [`x${'y'.repeat(80)}`]: [3, 1, 1, 1]
      }
    }))
    expect(m.games).toBe(5)
    expect(Object.keys(m.facts).sort()).toEqual(['h:1', 'h:8'])
    // Une partie « venue du futur » est ramenée à aujourd'hui
    expect(m.facts['h:8'].last).toBe(5)
  })

  it('bornée : on oublie d\'abord les sus les plus anciens, jamais un raté avant eux', () => {
    const m = emptyMemory(); m.games = 1000
    for (let i = 0; i < MEM_MAX + 50; i++) {
      if (i % 10 === 0) missed(m, `pay:${i}`, i)
      else known(m, `pay:${i}`, i)
    }
    prune(m)
    const left = Object.keys(m.facts)
    expect(left.length).toBe(MEM_MAX)
    for (let i = 0; i < MEM_MAX + 50; i += 10) expect(left).toContain(`pay:${i}`)
    expect(left).not.toContain('pay:1')
    expect(left).toContain(`pay:${MEM_MAX + 49}`)
    expect(JSON.parse(packMemory(m)).facts['pay:0']).toEqual([0, 0, 0, 1])
  })

  it('sans stockage (navigateur bloqué) : le jeu reste jouable', () => {
    const rec = recall('market')
    const q = rec.series(HOURS, 4)
    expect(q.length).toBe(4)
    expect(() => rec.note(q[0], false)).not.toThrow()
  })
})
