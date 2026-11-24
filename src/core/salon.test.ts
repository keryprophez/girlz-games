/* @version 2026-11-25 00:20 */
import { describe, expect, it } from 'vitest'
import { COIFFURES, RECETTES, TEINTE, TEINTES, packSalon, readSalon } from './salon'

describe('les recettes du Salon', () => {
  it('une recette par coiffure, et une image à son nom', () => {
    expect(RECETTES.map(r => r.id)).toEqual(COIFFURES.map(c => c.id))
  })
  it('chacune commence par brosser, et finit', () => {
    for (const r of RECETTES) {
      expect(r.steps[0].k).toBe('brosser')
      expect(r.steps[r.steps.length - 1].k).toBe('fini')
      expect(r.steps.filter(s => s.k === 'fini').length).toBe(1)
    }
  })
  it('chaque attache est rassemblée PUIS reçoit son élastique', () => {
    for (const r of RECETTES) r.dirs.forEach((_, a) => {
      const i = r.steps.findIndex(s => s.k === 'rassembler' && s.a === a), j = r.steps.findIndex(s => s.k === 'elastique' && s.a === a)
      expect(i).toBeGreaterThan(0)
      expect(j).toBeGreaterThan(i)
    })
  })
  it('chaque mèche a un côté qui existe ; les couettes se partagent au milieu', () => {
    for (const r of RECETTES) for (const x of [-0.8, -0.01, 0.01, 0.8]) expect(r.dirs[r.side([x, 0.3, -0.4])]).toBeDefined()
    const c = RECETTES.find(r => r.id === 'couettes')!
    for (const x of [-0.5, 0.5]) expect(Math.sign(c.dirs[c.side([x, 0.3, -0.4])][0])).toBe(Math.sign(x))
  })
})

describe('ce que le Salon garde', () => {
  it('se relit tel quel', () => {
    for (const c of [null, ...COIFFURES.map(x => x.id)]) for (let t = 0; t < TEINTES.length; t++)
      expect(readSalon(JSON.parse(JSON.stringify(packSalon({ c, t }))))).toEqual({ c, t })
  })
  it('illisible ou inconnu : cheveux lâchés, la teinte de départ', () => {
    for (const raw of [null, undefined, 3, 'x', [], {}, { c: 'chignon', t: 99 }, { c: 4, t: '1' }, { t: 1.5 }, { t: -1 }])
      expect(readSalon(raw)).toEqual({ c: null, t: TEINTE })
  })
  it('une coiffure inconnue ne perd pas la teinte', () => {
    expect(readSalon({ c: 'chignon', t: 3 })).toEqual({ c: null, t: 3 })
  })
})
