import { describe, expect, it } from 'vitest'
import { CREATIONS_MAX, SAVE_VERSION, defaultSave, migrateSave, normalizeSave } from './save'

const coeur = { rows: ['.RR.RR.', 'RRPRPRR', '.RRRRR.', '..RRR..', '...R...'] }
const look = { outfit: 'tee', color: '#5EC97B', hair: 'long', hairColor: '#E8B04B', hat: 'crown', glasses: 'sun', held: 'wand' }

/** Une sauvegarde telle que la tablette la gardait avant le 27/10 (version 0). */
function oldSave(over: Record<string, unknown> = {}) {
  return {
    profiles: [
      { id: 'jade', name: 'Jade', age: 6, avatar: 'data:image/jpeg;base64,AAAA', tier: 'easy', look },
      { id: 'joyce', name: 'Joyce', age: 8, avatar: null, tier: 'med' }
    ],
    currentId: 'jade',
    progress: { jade: { bestStars: { memory: 3, icetower: 2 } }, joyce: { bestStars: { memory: 1, potager: 3 } } },
    sound: false,
    timerEnd: 1793100000000,
    royals: { solo: { v: 2, beads: [{ k: 'pearl', c: '#F6EEF0' }], pendant: coeur, neck: 'beads' }, jade: null, joyce: null },
    creations: [{ ...coeur, at: 5 }, { rows: ['RX'], at: 6 }],
    puzzleImgs: {},
    voiceClips: { 'famille:bravo': 'data:audio/webm;base64,BBBB', 'jade:retry': 'data:audio/webm;base64,CCCC' },
    ...over
  }
}

describe('la sauvegarde de la famille', () => {
  it('garde d\'une sauvegarde d\'avant ce que la famille voyait à l\'écran', () => {
    const s = migrateSave(oldSave(), 0)
    expect(s.best).toEqual({ memory: 3, icetower: 2 }) // les notes de la joueuse en cours
    expect(s.look).toEqual(look)
    expect(s.owner).toBe('jade')
    expect(s.sound).toBe(false)
    expect(s.timerEnd).toBe(1793100000000)
    expect(s.necklace).toEqual([{ k: 'pearl', c: '#F6EEF0' }])
    expect(s.pendant).toEqual(coeur)
    expect(s.creations).toEqual([{ ...coeur, at: 5 }]) // l'abîmée est jetée
    expect(s.voiceClips).toEqual({ bravo: 'data:audio/webm;base64,BBBB', retry: 'data:audio/webm;base64,CCCC' })
    // Plus rien des profils ni de la princesse
    expect(Object.keys(s).sort()).toEqual(Object.keys(defaultSave()).sort())
  })

  it('suit la joueuse qui était en cours : ses notes, son look, et la clé de l\'Atelier', () => {
    const s = migrateSave(oldSave({ currentId: 'joyce' }), 0)
    expect(s.owner).toBe('joyce')
    expect(s.best).toEqual({ memory: 1, potager: 3 })
    expect(s.look).toEqual(defaultSave().look)
  })

  it('une sauvegarde vide ou abîmée donne la sauvegarde de départ', () => {
    for (const x of [null, undefined, 'abîmée', 42, [], {}]) expect(migrateSave(x, 0)).toEqual(defaultSave())
    expect(normalizeSave({ best: { memory: 9, tour: 'trois', nan: NaN } }).best).toEqual({ memory: 3 })
  })

  it('se relit à l\'identique, et la vitrine ne dépasse pas sa taille', () => {
    const s = migrateSave(oldSave(), 0)
    expect(migrateSave(JSON.parse(JSON.stringify(s)), SAVE_VERSION)).toEqual(s)
    const many = Array.from({ length: CREATIONS_MAX + 5 }, (_, i) => ({ ...coeur, at: i }))
    expect(normalizeSave({ creations: many }).creations).toHaveLength(CREATIONS_MAX)
  })

  it('relit le collier enfilé en jetant les perles abîmées', () => {
    expect(normalizeSave({ necklace: [{ k: 'heart', c: '#E8435F' }, { k: 'caillou', c: '#000000' }, { k: 'star', c: 'rouge' }] }).necklace)
      .toEqual([{ k: 'heart', c: '#E8435F' }, { k: 'star', c: '#F4F0EA' }])
  })

  it('n\'accepte comme voix que des enregistrements', () => {
    expect(normalizeSave({ voiceClips: { bravo: 'http://ailleurs/voix.mp3', retry: 3 } }).voiceClips).toEqual({})
  })
})
