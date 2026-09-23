import { describe, expect, it } from 'vitest'
import {
  beginGame, divChoices, divFact, divPool, emptyMemory, factEase, HARVEST, isFast, LV, mulChoices, mulEase, mulKey, mulPool,
  nearMiss, orient, planHarvest, record, recOf, requeue, viewLevel, WORK_MAX, type Fact, type Item, type Memory
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

const fact = (a: number, b: number): Fact => ({ key: mulKey(a, b), a: Math.min(a, b), b: Math.max(a, b), op: 'mul' })
const item = (a: number, b: number, kind: Item['kind'] = 'learn'): Item => ({ fact: fact(a, b), kind })

describe('les calculs de la multiplication', () => {
  it('7 × 8 et 8 × 7 sont un seul calcul', () => {
    expect(mulKey(7, 8)).toBe(mulKey(8, 7))
  })
  it('les tables demandées, sans doublon', () => {
    expect(mulPool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).length).toBe(55)
    const fleur = mulPool([2, 5, 10])
    expect(fleur.length).toBe(27)
    expect(fleur.every(f => [2, 5, 10].includes(f.a) || [2, 5, 10].includes(f.b))).toBe(true)
    expect(new Set(fleur.map(f => f.key)).size).toBe(fleur.length)
  })
  it('une fois retirés ×1, ×2, ×5, ×10 et les doublons, il en reste 21', () => {
    expect(mulPool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).filter(f => mulEase(f) >= 2).length).toBe(21)
  })
})

describe('noter une réponse', () => {
  it('un calcul jamais vu, su tout de suite, saute aux « Nombres seuls »', () => {
    const m = emptyMemory(); beginGame(m)
    record(m, item(3, 4, 'probe'), { ok: true, fast: true })
    expect(recOf(m, mulKey(3, 4)).lv).toBe(LV.numbers)
    expect(recOf(m, mulKey(3, 4)).gap).toBe(1)
  })
  it('un calcul jamais vu, raté, part en Découverte', () => {
    const m = emptyMemory(); beginGame(m)
    record(m, item(7, 8, 'probe'), { ok: false, fast: false })
    expect(recOf(m, mulKey(7, 8)).lv).toBe(LV.discover)
  })
  it('en comptant les légumes, la lenteur ne bloque pas', () => {
    const m = emptyMemory(); beginGame(m)
    m.facts[mulKey(7, 8)] = { lv: LV.discover, last: 0, gap: 0, seen: 1 }
    record(m, item(7, 8), { ok: true, fast: false })
    expect(recOf(m, mulKey(7, 8)).lv).toBe(LV.plants)
    record(m, item(7, 8), { ok: true, fast: false })
    expect(recOf(m, mulKey(7, 8)).lv).toBe(LV.outline)
  })
  it('à partir du Contour, il faut répondre sans recompter pour monter', () => {
    const m = emptyMemory(); beginGame(m)
    m.facts[mulKey(7, 8)] = { lv: LV.outline, last: 0, gap: 0, seen: 3 }
    record(m, item(7, 8), { ok: true, fast: false })
    expect(recOf(m, mulKey(7, 8)).lv).toBe(LV.outline)
    record(m, item(7, 8), { ok: true, fast: true })
    expect(recOf(m, mulKey(7, 8)).lv).toBe(LV.numbers)
  })
  it('une erreur ramène aux légumes, d\'où qu\'on vienne', () => {
    const m = emptyMemory(); beginGame(m)
    m.facts[mulKey(7, 8)] = { lv: LV.heart, last: 0, gap: 8, seen: 9 }
    record(m, item(7, 8), { ok: false, fast: true })
    expect(recOf(m, mulKey(7, 8))).toMatchObject({ lv: LV.plants, gap: 0 })
  })
  it('un calcul su revient après 1, 2, 4 puis 8 parties', () => {
    const m = emptyMemory(); beginGame(m)
    m.facts[mulKey(6, 7)] = { lv: LV.outline, last: 0, gap: 0, seen: 3 }
    const gaps: number[] = []
    for (let i = 0; i < 5; i++) { record(m, item(6, 7), { ok: true, fast: true }); gaps.push(recOf(m, mulKey(6, 7)).gap) }
    expect(gaps).toEqual([1, 2, 4, 8, 8])
    expect(recOf(m, mulKey(6, 7)).lv).toBe(LV.heart)
  })
  it('un calcul raté qui revient dans la récolte ne change pas de niveau', () => {
    const m = emptyMemory(); beginGame(m)
    m.facts[mulKey(7, 8)] = { lv: LV.plants, last: 1, gap: 0, seen: 2 }
    record(m, item(7, 8, 'again'), { ok: true, fast: true })
    expect(recOf(m, mulKey(7, 8)).lv).toBe(LV.plants)
    expect(recOf(m, mulKey(7, 8)).seen).toBe(3)
  })
  it('le pavé laisse plus de temps que les boutons', () => {
    expect(isFast(6000, false)).toBe(false)
    expect(isFast(6000, true)).toBe(true)
  })
})

describe('composer une récolte', () => {
  const pool = mulPool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

  it('toute neuve : douze calculs jamais vus, les faciles d\'abord', () => {
    const m = emptyMemory(); beginGame(m)
    const plan = planHarvest(m, pool, { ease: mulEase, rng: seeded(1) })
    expect(plan.length).toBe(HARVEST)
    expect(plan.every(it => it.kind === 'probe')).toBe(true)
    expect(new Set(plan.map(it => it.fact.key)).size).toBe(HARVEST)
    // Sondés en « Nombres seuls », et la première question est facile
    expect(plan.every(it => viewLevel(m, it) === LV.numbers)).toBe(true)
    expect(mulEase(plan[0].fact)).toBe(0)
  })

  it('les calculs en cours passent avant tout, et les révisions gardent leur place', () => {
    const m = emptyMemory()
    m.games = 10
    const learning = [fact(7, 8), fact(6, 7), fact(6, 8)]
    learning.forEach(f => { m.facts[f.key] = { lv: LV.plants, last: 9, gap: 0, seen: 2 } })
    const known = [fact(3, 4), fact(4, 6), fact(3, 7), fact(4, 8)]
    known.forEach(f => { m.facts[f.key] = { lv: LV.heart, last: 5, gap: 2, seen: 6 } })
    const plan = planHarvest(m, pool, { ease: mulEase, rng: seeded(2) })
    const keys = plan.map(it => it.fact.key)
    for (const f of learning) expect(keys).toContain(f.key)
    expect(plan.filter(it => it.kind === 'review').length).toBeGreaterThanOrEqual(3)
    expect(plan.filter(it => it.kind === 'probe').length).toBeGreaterThan(0)
  })

  it('pas de calcul nouveau quand six sont déjà en cours', () => {
    const m = emptyMemory(); m.games = 4
    const learning = [fact(7, 8), fact(6, 7), fact(6, 8), fact(7, 9), fact(8, 9), fact(6, 9)]
    expect(learning.length).toBe(WORK_MAX)
    learning.forEach(f => { m.facts[f.key] = { lv: LV.discover, last: 3, gap: 0, seen: 1 } })
    const plan = planHarvest(m, mulPool([6, 7, 8, 9]), { ease: mulEase, rng: seeded(3) })
    // Six calculs en cours et rien d'autre de connu : ils reviennent une
    // seconde fois plutôt que d'en ouvrir de nouveaux
    expect(plan.length).toBe(HARVEST)
    expect(plan.filter(it => it.kind === 'learn').length).toBe(WORK_MAX)
    expect(plan.filter(it => it.kind === 'probe').length).toBe(0)
    expect(plan.filter(it => it.kind === 'again').length).toBe(HARVEST - WORK_MAX)
    for (let i = 1; i < plan.length; i++) expect(plan[i].fact.key).not.toBe(plan[i - 1].fact.key)
  })

  it('un calcul su dont ce n\'est pas le tour ne revient pas en révision', () => {
    const m = emptyMemory(); m.games = 6
    m.facts[mulKey(3, 4)] = { lv: LV.heart, last: 5, gap: 8, seen: 8 }
    const plan = planHarvest(m, pool, { ease: mulEase, rng: seeded(4) })
    const it = plan.find(x => x.fact.key === mulKey(3, 4))
    expect(it?.kind).not.toBe('review')
  })

  it('tout est su : la récolte se complète avec les plus anciens', () => {
    const m = emptyMemory(); m.games = 3
    const small = mulPool([10])
    small.forEach((f, i) => { m.facts[f.key] = { lv: LV.heart, last: 2, gap: 8, seen: 5 + i } })
    const plan = planHarvest(m, small, { ease: mulEase, rng: seeded(5) })
    expect(plan.length).toBe(Math.min(HARVEST, small.length))
    expect(plan.every(it => it.kind === 'extra')).toBe(true)
  })
})

describe('un calcul raté revient', () => {
  it('trois questions plus loin, et la récolte garde sa longueur', () => {
    const q: Item[] = [item(2, 3), item(3, 4), item(4, 5), item(5, 6), item(6, 7, 'probe'), item(7, 8, 'extra')]
    expect(requeue(q, 0, fact(2, 3))).toBe(true)
    expect(q.length).toBe(6)
    expect(q[3]).toMatchObject({ kind: 'again', fact: { key: mulKey(2, 3) } })
    // C'est la question la moins importante qui a cédé sa place
    expect(q.some(it => it.kind === 'extra')).toBe(false)
  })
  it('pas de place à la dernière question', () => {
    const q: Item[] = [item(2, 3), item(3, 4)]
    expect(requeue(q, 1, fact(3, 4))).toBe(false)
  })
  it('un calcul qui revient n\'est jamais chassé par un autre', () => {
    const q: Item[] = [item(2, 3), item(3, 4, 'again')]
    expect(requeue(q, 0, fact(2, 3))).toBe(false)
  })
})

describe('les réponses proposées', () => {
  it('la bonne, sans doublon, et des voisines pour pièges', () => {
    for (let s = 0; s < 50; s++) {
      const ch = mulChoices(7, 8, 4, seeded(s))
      expect(ch).toContain(56)
      expect(new Set(ch).size).toBe(4)
      expect(ch.filter(v => [49, 63, 48, 64].includes(v)).length).toBeGreaterThanOrEqual(2)
    }
  })
  it('même pour 1 × 1, et sans la réponse déjà écartée', () => {
    const ch = mulChoices(1, 1, 4, seeded(9))
    expect(ch).toContain(1)
    expect(ch.every(v => v >= 1)).toBe(true)
    expect(new Set(ch).size).toBe(4)
    expect(mulChoices(7, 8, 3, seeded(3), [49])).not.toContain(49)
  })
})

describe('le presque', () => {
  it('49 pour 7 × 8 : une colonne de moins', () => {
    expect(nearMiss(7, 8, 49)).toEqual({ r: 7, c: 7 })
  })
  it('48 pour 7 × 8 : une rangée de moins ; 63 : une colonne de trop', () => {
    expect(nearMiss(7, 8, 48)).toEqual({ r: 6, c: 8 })
    expect(nearMiss(7, 8, 63)).toEqual({ r: 7, c: 9 })
  })
  it('une réponse sans rapport n\'est pas un presque', () => {
    expect(nearMiss(7, 8, 54)).toBeNull()
    expect(nearMiss(7, 8, 56)).toBeNull()
  })
})

describe('la mémoire se relit', () => {
  it('aller-retour en JSON', () => {
    const m: Memory = emptyMemory(); beginGame(m)
    record(m, item(7, 8, 'probe'), { ok: false, fast: false })
    const back = JSON.parse(JSON.stringify(m)) as Memory
    expect(recOf(back, mulKey(8, 7)).lv).toBe(LV.discover)
  })
})

describe('les divisions : la table lue à l\'envers', () => {
  it('56 ÷ 7 = 8, clé orientée, jamais retournée', () => {
    const d = divFact(7, 8)
    expect(d).toMatchObject({ key: '56:7', a: 7, b: 8, op: 'div' })
    for (let i = 0; i < 20; i++) expect(orient(d, Math.random)).toEqual([7, 8])
  })
  it('ne s\'ouvrent que pour les multiplications sues, sans ÷ 1', () => {
    const m = emptyMemory()
    m.facts[mulKey(7, 8)] = { lv: LV.numbers, last: 0, gap: 1, seen: 4 }
    m.facts[mulKey(6, 7)] = { lv: LV.plants, last: 0, gap: 0, seen: 2 }
    m.facts[mulKey(1, 5)] = { lv: LV.heart, last: 0, gap: 4, seen: 6 }
    m.facts[mulKey(4, 4)] = { lv: LV.heart, last: 0, gap: 4, seen: 6 }
    const keys = divPool(mulPool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), m).map(f => f.key).sort()
    expect(keys).toEqual(['16:4', '56:7', '56:8', '5:5'])
  })
  it('les réponses : le quotient et ses voisins, dans la table', () => {
    for (let s = 0; s < 30; s++) {
      const ch = divChoices(7, 8, 4, seeded(s))
      expect(ch).toContain(8)
      expect(new Set(ch).size).toBe(4)
      expect(ch.every(v => v >= 1 && v <= 10)).toBe(true)
    }
    expect(divChoices(3, 10, 4, seeded(2))).toContain(10)
  })
  it('même facilité que la multiplication', () => {
    expect(factEase(divFact(10, 7))).toBe(0)
    expect(factEase(divFact(7, 8))).toBe(3)
  })
  it('une division se note comme une multiplication', () => {
    const m = emptyMemory(); beginGame(m)
    record(m, { fact: divFact(7, 8), kind: 'probe' }, { ok: true, fast: true })
    expect(recOf(m, '56:7').lv).toBe(LV.numbers)
    expect(recOf(m, mulKey(7, 8)).seen).toBe(0)
  })
})
