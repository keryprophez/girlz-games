import { describe, expect, it } from 'vitest'
import {
  LESSONS, ORDER, allLegal, at, build, chain, checkers, fromFen, inCheck, isHome, isLegal, isMate, isStale,
  kingSq, legal, lessonRank, matesIn1, nameOf, pawnStuck, perft, plan, play, pseudo, rankOf, reply, starsFor,
  startPos, type Exo, type Move
} from './chess'
import { seeded } from './tracteur'
import type { Tier } from './types'

const TIERS: Tier[] = ['easy', 'med', 'exp']
const to = (ms: Move[]) => ms.map(m => nameOf(m.to)).sort()

describe('les règles', () => {
  it('le compte des parties depuis le départ (20, 400, 8 902)', () => {
    expect(perft(startPos(), 1)).toBe(20)
    expect(perft(startPos(), 2)).toBe(400)
    expect(perft(startPos(), 3)).toBe(8902)
  })
  it('une position pleine de roques, de clouages et de prises en passant (48, 2 039)', () => {
    const kiwi = fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -')
    expect(perft(kiwi, 1)).toBe(48)
    expect(perft(kiwi, 2)).toBe(2039)
  })
  it('une finale avec prise en passant et échecs à la découverte (14, 191, 2 812)', () => {
    const end = fromFen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - -')
    expect(perft(end, 1)).toBe(14)
    expect(perft(end, 2)).toBe(191)
    expect(perft(end, 3)).toBe(2812)
  })
  it('la tour va tout droit, le fou en biais, et ils ne sautent pas', () => {
    const pos = fromFen('8/8/8/8/3R4/8/3P4/8 w - -')
    expect(to(pseudo(pos, at('d4')))).toEqual(['a4', 'b4', 'c4', 'd3', 'd5', 'd6', 'd7', 'd8', 'e4', 'f4', 'g4', 'h4'].sort())
    expect(to(pseudo(fromFen('8/8/8/8/8/2p5/8/B7 w - -'), at('a1')))).toEqual(['b2', 'c3'])
  })
  it('le cavalier saute par-dessus les autres', () => {
    expect(to(pseudo(startPos(), at('g1')))).toEqual(['f3', 'h3'])
  })
  it('le pion avance tout droit, de deux au départ, et prend en biais seulement', () => {
    const pos = fromFen('8/8/8/8/8/3pp3/4P3/8 w - -')
    expect(to(pseudo(pos, at('e2')))).toEqual(['d3'])
    expect(to(pseudo(startPos(), at('e2')))).toEqual(['e3', 'e4'])
  })
  it('le pion au bout devient une dame', () => {
    const pos = fromFen('8/4P3/8/8/8/8/8/8 w - -')
    const next = play(pos, pseudo(pos, at('e7'))[0])
    expect(next.board[at('e8')]).toEqual({ k: 'Q', s: 'w' })
  })
  it('la prise en passant enlève le pion d’à côté, et seulement tout de suite', () => {
    let pos = fromFen('4k3/3p4/8/4P3/8/8/8/4K3 b - -')
    pos = play(pos, { from: at('d7'), to: at('d5'), double: true })
    const ep = pseudo(pos, at('e5')).find(m => m.to === at('d6'))!
    expect(ep.take).toBe(at('d5'))
    expect(play(pos, ep).board[at('d5')]).toBeNull()
    // Un coup plus tard, c'est trop tard
    const later = play(play(pos, { from: at('e1'), to: at('e2') }), { from: at('e8'), to: at('e7') })
    expect(pseudo(later, at('e5')).some(m => m.to === at('d6'))).toBe(false)
  })
  it('le roque déplace aussi la tour, et se perd dès que le roi a bougé', () => {
    const pos = fromFen('4k3/8/8/8/8/8/8/R3K2R w KQ -')
    const k = pseudo(pos, at('e1')).find(m => m.castle === 'K')!
    const done = play(pos, k)
    expect(done.board[at('g1')]?.k).toBe('K')
    expect(done.board[at('f1')]?.k).toBe('R')
    expect(done.castle).toBe('')
    const q = play(pos, pseudo(pos, at('e1')).find(m => m.castle === 'Q')!)
    expect(q.board[at('c1')]?.k).toBe('K')
    expect(q.board[at('d1')]?.k).toBe('R')
  })
  it('pas de roque en échec, ni à travers une case attaquée, ni par-dessus une pièce', () => {
    const castles = (fen: string) => pseudo(fromFen(fen), at('e1')).filter(m => m.castle).map(m => m.castle).sort()
    expect(castles('4k3/8/8/8/8/8/8/R3K2R w KQ -')).toEqual(['K', 'Q'])
    expect(castles('4r3/8/8/8/8/8/8/R3K2R w KQ -')).toEqual([])
    expect(castles('5r2/8/8/8/8/8/8/R3K2R w KQ -')).toEqual(['Q'])
    expect(castles('4k3/8/8/8/8/8/8/RN2K1NR w KQ -')).toEqual([])
    expect(castles('4k3/8/8/8/8/8/8/R3K2R w - -')).toEqual([])
  })
  it('un coup qui laisse son roi en échec n’est pas permis', () => {
    // Le fou blanc est cloué par la tour noire
    const pos = fromFen('4r3/8/8/8/8/8/4B3/4K3 w - -')
    expect(pseudo(pos, at('e2')).length).toBeGreaterThan(0)
    expect(legal(pos, at('e2'))).toEqual([])
    expect(isLegal(pos, { from: at('e1'), to: at('d1') })).toBe(true)
  })
  it('échec, mat et pat', () => {
    expect(inCheck(fromFen('4k3/8/8/8/8/8/8/r3K3 w - -'), 'w')).toBe(true)
    expect(checkers(fromFen('4k3/8/8/8/8/8/8/r3K3 w - -'), 'w')).toEqual([at('a1')])
    expect(isMate(fromFen('R5k1/5ppp/8/8/8/8/8/6K1 b - -'))).toBe(true)
    expect(isMate(fromFen('R5k1/5pp1/8/8/8/8/8/6K1 b - -'))).toBe(false)
    expect(isStale(fromFen('7k/5Q2/6K1/8/8/8/8/8 b - -'))).toBe(true)
  })
  it('la réponse des noirs : le roi s’échappe, ou rien s’il est pat', () => {
    const pos = fromFen('6k1/R7/8/8/8/8/8/6K1 b - -')
    const m = reply(pos, seeded(1))!
    expect(isLegal(pos, m)).toBe(true)
    expect(reply(fromFen('7k/5Q2/6K1/8/8/8/8/8 b - -'))).toBeNull()
    const check = fromFen('R5k1/5pp1/8/8/8/8/8/6K1 b - -')
    expect(check.board[reply(check, seeded(2))!.from]?.k).toBe('K')
  })
})

describe('les exercices', () => {
  const each = (fn: (e: Exo, tier: Tier, seed: number) => void, seeds = 60) => {
    for (const tier of TIERS) for (const part of plan(tier)) for (const e of part.pool) {
      for (let s = 1; s <= seeds; s++) fn(e, tier, s)
    }
  }

  it('huit exercices par partie, à chaque niveau, sans doublon dans un tas', () => {
    for (const tier of TIERS) {
      const parts = plan(tier)
      expect(parts.reduce((n, p) => n + p.n, 0)).toBe(8)
      for (const p of parts) {
        expect(p.pool.length).toBeGreaterThanOrEqual(p.n)
        expect(new Set(p.pool.map(e => e.key)).size).toBe(p.pool.length)
      }
    }
  })
  it('une partie va de leçon en leçon, les pièces dans l’ordre où on les apprend', () => {
    const all = plan('easy').flatMap(p => p.pool).sort((a, b) => lessonRank(a) - lessonRank(b))
    expect(all[0].lesson).toBe('ranger')
    const moves = all.filter(e => e.lesson === 'bouger').map(e => e.id)
    expect(moves).toEqual(ORDER)
    expect(LESSONS.indexOf(all[all.length - 1].lesson)).toBeGreaterThan(0)
  })
  it('ranger : chaque pièce à poser a sa case libre, et rien d’autre ne manque', () => {
    each((e, tier, s) => {
      if (e.lesson !== 'ranger') return
      const rd = build(e, tier, seeded(s))
      const holes = rd.pos.board.map((p, i) => (!p && rankOf(i) !== 2 && rankOf(i) !== 3 && rankOf(i) !== 4 && rankOf(i) !== 5 ? i : -1)).filter(i => i >= 0)
      expect(holes.length).toBe(rd.tray.length)
      // Chaque pièce trouve une case à elle, toutes différentes
      const left = [...holes]
      for (const p of rd.tray) {
        const i = left.findIndex(h => isHome(p, h))
        expect(i).toBeGreaterThanOrEqual(0)
        left.splice(i, 1)
      }
      expect(rd.ghosts).toBe(tier === 'easy')
    }, 8)
  })
  it('la dame va sur sa couleur : la dame blanche en d1, pas en e1', () => {
    expect(isHome({ k: 'Q', s: 'w' }, at('d1'))).toBe(true)
    expect(isHome({ k: 'Q', s: 'w' }, at('e1'))).toBe(false)
    expect(isHome({ k: 'Q', s: 'b' }, at('d8'))).toBe(true)
    expect(isHome({ k: 'R', s: 'w' }, at('h1'))).toBe(true)
  })
  it('bouger : les pommes se ramassent dans l’ordre, un coup chacune', () => {
    each((e, tier, s) => {
      if (e.lesson !== 'bouger') return
      const rd = build(e, tier, seeded(s))
      let pos = rd.pos
      let cur = pos.board.findIndex(p => p)
      expect(pos.board[cur]?.k).toBe(e.id)
      expect(new Set(rd.apples).size).toBe(rd.apples.length)
      expect(rd.apples).not.toContain(cur)
      let moves = 0
      for (const a of rd.apples) {
        // Le pion fait parfois deux pas pour une pomme
        for (let k = 0; cur !== a && k < 3; k++) {
          const opts = pseudo(pos, cur)
          const m = opts.find(x => x.to === a) ?? opts.find(x => rankOf(x.to) < rankOf(a) && !x.double)!
          pos = play(pos, m); pos.turn = 'w'; cur = m.to; moves++
        }
        expect(cur).toBe(a)
      }
      expect(moves).toBeLessThanOrEqual(rd.par)
    })
  })
  it('prendre : les pièces noires se mangent dans l’ordre, une par coup', () => {
    each((e, tier, s) => {
      if (e.lesson !== 'prendre') return
      const rd = build(e, tier, seeded(s))
      const from = rd.pos.board.findIndex(p => p?.s === 'w')
      expect(rd.pos.board[from]?.k).toBe(e.id)
      expect(chain(rd.pos, from, rd.targets)).toBe(true)
      expect(rd.pos.board.filter(p => p?.s === 'b').length).toBe(rd.targets.length)
      // Aucun pion noir sur la première ou la dernière rangée
      rd.pos.board.forEach((p, i) => { if (p?.k === 'P' && p.s === 'b') expect([0, 7]).not.toContain(rankOf(i)) })
      if (e.id === 'P') expect(pawnStuck(from, rd.targets)).toBe(false)
    })
  })
  it('le pion qui a dépassé une pièce à manger est coincé', () => {
    expect(pawnStuck(at('e3'), [at('d4')])).toBe(false)
    expect(pawnStuck(at('e4'), [at('d4')])).toBe(true)
    expect(pawnStuck(at('e3'), [at('b4')])).toBe(true)
  })
  it('échec : une vraie position, une seule pièce fait échec, et on peut s’en sortir', () => {
    each((e, tier, s) => {
      if (e.lesson !== 'echec') return
      const rd = build(e, tier, seeded(s))
      const ch = checkers(rd.pos, 'w')
      expect(ch.length).toBe(1)
      expect(rd.pos.board[ch[0]]?.k).toBe(e.id)
      expect(inCheck(rd.pos, 'b')).toBe(false)
      expect(kingSq(rd.pos.board, 'b')).toBeGreaterThanOrEqual(0)
      expect(allLegal(rd.pos).length).toBeGreaterThanOrEqual(2)
      expect(rd.goal).toBe('legal')
    })
  })
  it('mat : un ou deux coups font mat, et ce sont ceux qu’on attend', () => {
    each((e, tier, s) => {
      if (e.lesson !== 'mat') return
      const rd = build(e, tier, seeded(s))
      expect(rd.pos.turn).toBe('w')
      expect(inCheck(rd.pos, 'b')).toBe(false)
      expect(rd.want.length).toBeGreaterThanOrEqual(1)
      expect(rd.want.length).toBeLessThanOrEqual(2)
      expect(rd.want).toEqual(matesIn1(rd.pos))
      for (const m of rd.want) expect(isMate(play(rd.pos, m))).toBe(true)
    })
  })
  it('les secours des tirages sont de vraies positions', () => {
    for (const fen of ['7k/8/5K2/6Q1/8/8/8/8 w - -', '7k/R7/8/8/8/8/1R6/K7 w - -', '7k/8/6K1/8/8/8/8/R7 w - -', '6k1/5ppp/8/8/8/8/8/R5K1 w - -']) {
      expect(matesIn1(fromFen(fen)).length).toBeGreaterThanOrEqual(1)
    }
    for (const fen of ['4k3/8/8/8/8/2N5/8/r3K3 w - -', '4k3/8/8/8/1b6/8/5R2/4K3 w - -', '4k3/8/8/4q3/8/8/3B4/4K3 w - -', '4k3/8/8/8/8/3n4/8/4K2R w - -']) {
      const pos = fromFen(fen)
      expect(checkers(pos, 'w').length).toBe(1)
      expect(allLegal(pos).length).toBeGreaterThanOrEqual(2)
    }
  })
  it('le roque, la promotion, la prise en passant', () => {
    for (let s = 1; s <= 40; s++) {
      const roque = build({ key: 'special:roque', lesson: 'special', id: 'roque' }, 'exp', seeded(s))
      expect(roque.want.length).toBe(1)
      expect(roque.want[0].castle).toBeTruthy()
      expect(isLegal(roque.pos, roque.want[0])).toBe(true)
      expect(roque.apples).toEqual([roque.want[0].to])

      const promo = build({ key: 'special:promo', lesson: 'special', id: 'promo' }, 'exp', seeded(s))
      let pos = promo.pos
      for (const a of promo.apples) {
        const from = pos.board.findIndex(p => p)
        pos = play(pos, pseudo(pos, from).find(m => m.to === a)!)
        pos.turn = 'w'
      }
      expect(pos.board[promo.apples[1]]).toEqual({ k: 'Q', s: 'w' })

      const ep = build({ key: 'special:passant', lesson: 'special', id: 'passant' }, 'exp', seeded(s))
      expect(ep.intro).not.toBeNull()
      const after = play(ep.pos, ep.intro!)
      expect(after.turn).toBe('w')
      expect(ep.want.length).toBe(1)
      expect(ep.want[0].take).toBe(ep.intro!.to)
      expect(pseudo(after, ep.want[0].from).some(m => m.to === ep.want[0].to)).toBe(true)
    }
  })
  it('les pastilles : toujours, sauf à la flamme', () => {
    const e: Exo = { key: 'bouger:R', lesson: 'bouger', id: 'R' }
    expect(build(e, 'easy', seeded(1)).dots).toBe(true)
    expect(build(e, 'exp', seeded(1)).dots).toBe(false)
  })
  it('les étoiles ne comptent que les ratés', () => {
    expect(starsFor(0)).toBe(3)
    expect(starsFor(2)).toBe(3)
    expect(starsFor(3)).toBe(2)
    expect(starsFor(7)).toBe(1)
  })
})
