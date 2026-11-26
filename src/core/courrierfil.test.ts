/* @version 2026-11-26 16:46 */
import { describe, expect, it } from 'vitest'
import { cleDe, fichiersDe, lireLettre, lirePrefs, MAX_OBJETS, MAX_VOIX, nomFichier, rang, texteDe, ETATS } from './courrierfil'
import * as C from './courrier'

const L = (plus: Record<string, unknown> = {}) => ({
  id: 'abc-1', de: 'jade', a: 'joyce', etat: 'postee', cree: 1, postee: 2, tour: 2, papier: '#FFFDF8',
  env: { couleur: '#F58FB8', cachet: 'coeur', timbre: 'animal:duck' }, objets: [] as unknown[], peinture: null, version: 3, ...plus
})
const pose = { x: 10, y: 20, s: 1, r: 0 }
const texte = (t: string, y: number) => ({ k: 'texte', t, couleur: '#1C64C8', police: 'Gochi Hand', taille: 92, ...pose, y })
const voix = (cle: string) => ({ k: 'voix', cle, pics: [0.2, 0.5], duree: 2, ...pose })
const gomme = { k: 'gomme', src: 'emoji:🐱', ...pose }

describe('le fil : une lettre', () => {
  it('une lettre bien formée passe, les champs inconnus tombent', () => {
    expect(lireLettre({ ...L(), espion: 1 }, 'abc-1')).toEqual(L())
    const l = lireLettre(L({ objets: [{ ...gomme, espion: 2 }] }), 'abc-1')!
    expect(l.objets[0]).toEqual(gomme)
  })
  it('refuse un id autre que celui du chemin, ou hors du motif', () => {
    expect(lireLettre(L(), 'abc-2')).toBeNull()
    expect(lireLettre(L({ id: '../x' }), '../x')).toBeNull()
    expect(lireLettre(L({ id: 'ABC' }), 'ABC')).toBeNull()
  })
  it('refuse de = a, un prénom inconnu, un état inconnu, une version 0 ou décimale', () => {
    expect(lireLettre(L({ a: 'jade' }), 'abc-1')).toBeNull()
    expect(lireLettre(L({ de: 'papa' }), 'abc-1')).toBeNull()
    expect(lireLettre(L({ etat: 'perdue' }), 'abc-1')).toBeNull()
    expect(lireLettre(L({ version: 0 }), 'abc-1')).toBeNull()
    expect(lireLettre(L({ version: 1.5 }), 'abc-1')).toBeNull()
  })
  it('refuse des heures négatives ou infinies, un papier trop long, une enveloppe mal faite', () => {
    expect(lireLettre(L({ cree: -1 }), 'abc-1')).toBeNull()
    expect(lireLettre(L({ tour: Infinity }), 'abc-1')).toBeNull()
    expect(lireLettre(L({ papier: 'x'.repeat(21) }), 'abc-1')).toBeNull()
    expect(lireLettre(L({ env: { couleur: '#fff', cachet: 'coeur' } }), 'abc-1')).toBeNull()
    expect(lireLettre(L({ env: null }), 'abc-1')).not.toBeNull()
  })
  it(`refuse ${MAX_OBJETS + 1} objets et ${MAX_VOIX + 1} voix`, () => {
    expect(lireLettre(L({ objets: Array.from({ length: MAX_OBJETS }, () => gomme) }), 'abc-1')).not.toBeNull()
    expect(lireLettre(L({ objets: Array.from({ length: MAX_OBJETS + 1 }, () => gomme) }), 'abc-1')).toBeNull()
    const v = (n: number) => Array.from({ length: n }, (_, i) => voix(`lettres/abc-1/voix-v${i}.webm`))
    expect(lireLettre(L({ objets: v(MAX_VOIX) }), 'abc-1')).not.toBeNull()
    expect(lireLettre(L({ objets: v(MAX_VOIX + 1) }), 'abc-1')).toBeNull()
  })
  it('refuse un objet mal formé', () => {
    expect(lireLettre(L({ objets: [{ ...gomme, x: NaN }] }), 'abc-1')).toBeNull()
    expect(lireLettre(L({ objets: [{ ...gomme, k: 'bombe' }] }), 'abc-1')).toBeNull()
    expect(lireLettre(L({ objets: [{ ...gomme, src: 'x'.repeat(201) }] }), 'abc-1')).toBeNull()
    expect(lireLettre(L({ objets: [texte('a'.repeat(2001), 1)] }), 'abc-1')).toBeNull()
    expect(lireLettre(L({ objets: [{ ...texte('a', 1), police: 'p'.repeat(41) }] }), 'abc-1')).toBeNull()
    expect(lireLettre(L({ objets: [{ ...voix('lettres/abc-1/voix-a.webm'), duree: 31 }] }), 'abc-1')).toBeNull()
    expect(lireLettre(L({ objets: [{ ...voix('lettres/abc-1/voix-a.webm'), pics: Array(101).fill(0.1) }] }), 'abc-1')).toBeNull()
    expect(lireLettre(L({ objets: 'rien' }), 'abc-1')).toBeNull()
    expect(lireLettre(null, 'abc-1')).toBeNull()
  })
  it('une voix doit désigner un fichier de SA lettre', () => {
    expect(lireLettre(L({ objets: [voix('lettres/abc-1/voix-k3f9a2.webm')] }), 'abc-1')).not.toBeNull()
    expect(lireLettre(L({ objets: [voix('lettres/zzz/voix-k3f9a2.webm')] }), 'abc-1')).toBeNull()
    expect(lireLettre(L({ objets: [voix('lettres/abc-1/voix-1.mp3')] }), 'abc-1')).toBeNull()
    expect(lireLettre(L({ objets: [voix('lettres/abc-1/peinture.png')] }), 'abc-1')).toBeNull()
  })
  it('peinture : null ou la clé de la lettre', () => {
    expect(lireLettre(L({ peinture: 'lettres/abc-1/peinture.png' }), 'abc-1')?.peinture).toBe('lettres/abc-1/peinture.png')
    expect(lireLettre(L({ peinture: 'lettres/abc-1/x.png' }), 'abc-1')).toBeNull()
    expect(lireLettre(L({ peinture: 'lettres/zzz/peinture.png' }), 'abc-1')).toBeNull()
  })
})

describe('le fil : les fichiers et le texte', () => {
  it('nomFichier', () => {
    expect(['peinture.png', 'voix-a1.webm', 'voix-.webm', '../peinture.png', 'voix-A1.webm', 'voix-a1.webm/x'].map(nomFichier))
      .toEqual(['peinture', 'voix', null, null, null, null])
  })
  it('cleDe', () => expect(cleDe('abc-1', 'peinture.png')).toBe('lettres/abc-1/peinture.png'))
  it('fichiersDe : le dessin et chaque voix', () => {
    const l = lireLettre(L({ peinture: 'lettres/abc-1/peinture.png', objets: [gomme, voix('lettres/abc-1/voix-a.webm'), voix('lettres/abc-1/voix-b.webm')] }), 'abc-1')!
    expect(fichiersDe(l)).toEqual(['lettres/abc-1/peinture.png', 'lettres/abc-1/voix-a.webm', 'lettres/abc-1/voix-b.webm'])
    expect(fichiersDe(lireLettre(L(), 'abc-1')!)).toEqual([])
  })
  it('texteDe : les textes de haut en bas, émojis gardés', () => {
    const l = lireLettre(L({ objets: [texte('bisous 💖', 800), gomme, texte('Coucou', 100)] }), 'abc-1')!
    expect(texteDe(l)).toBe('Coucou\nbisous 💖')
  })
  it('les états, dans l’ordre', () => {
    expect(ETATS).toEqual(['brouillon', 'cachetee', 'postee', 'ouverte', 'gardee'])
    expect(rang('brouillon')).toBeLessThan(rang('gardee'))
  })
  it('les mêmes limites que le jeu', () => {
    expect([MAX_OBJETS, MAX_VOIX]).toEqual([C.MAX_OBJETS, C.MAX_VOIX])
  })
})

describe('le fil : les réglages', () => {
  const P = { envois: 2, env: { couleur: '#F58FB8', cachet: 'coeur', timbre: 'animal:duck' }, faits: ['plier', 'boite'] }
  it('bons réglages, champs inconnus ôtés', () => {
    expect(lirePrefs({ ...P, espion: 1 })).toEqual(P)
    expect(lirePrefs({ envois: 0, env: null, faits: [] })).toEqual({ envois: 0, env: null, faits: [] })
  })
  it('mauvais réglages', () => {
    expect(lirePrefs({ ...P, envois: -1 })).toBeNull()
    expect(lirePrefs({ ...P, envois: 1.5 })).toBeNull()
    expect(lirePrefs({ ...P, faits: Array(31).fill('a') })).toBeNull()
    expect(lirePrefs({ ...P, faits: ['a'.repeat(31)] })).toBeNull()
    expect(lirePrefs({ ...P, env: 'rouge' })).toBeNull()
    expect(lirePrefs(null)).toBeNull()
  })
})
