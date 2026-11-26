/* @version 2026-11-26 09:36 */
import { describe, expect, it } from 'vitest'
import { Saisie, sansEmojis, vide, vus } from './saisie'

describe('les caractères vus', () => {
  it('un émoji composé compte pour un', () => {
    expect(vus('a👨‍👩‍👧é')).toHaveLength(3)
  })
  it('un émoji composé, une teinte de peau, un drapeau s’effacent d’un coup', () => {
    for (const e of ['👨‍👩‍👧', '👍🏽', '🇫🇷']) {
      const s = new Saisie('a' + e)
      s.effacer()
      expect(s.texte).toBe('a')
      expect(s.curseur).toBe(1)
    }
  })
})

describe('la saisie', () => {
  it('pose au curseur et avance', () => {
    const s = new Saisie('abc')
    s.placer(1)
    s.poser('é')
    expect(s.texte).toBe('aébc')
    expect(s.curseur).toBe(2)
  })
  it('effacer au début ne fait rien', () => {
    const s = new Saisie('abc')
    s.placer(0)
    s.effacer()
    expect(s.texte).toBe('abc')
    expect(s.curseur).toBe(0)
  })
  it('placer se borne au texte', () => {
    const s = new Saisie('abc')
    s.placer(99)
    expect(s.curseur).toBe(3)
    s.placer(-4)
    expect(s.curseur).toBe(0)
  })
  it('un texte neuf a son curseur à la fin', () => {
    expect(new Saisie('a🐱').curseur).toBe(2)
  })
  it('couper : le dernier espace devient un retour, le curseur ne bouge pas', () => {
    const s = new Saisie('un deux trois')
    s.couper()
    expect(s.texte).toBe('un deux\ntrois')
    expect(s.curseur).toBe(13)
  })
  it('couper : rien sans espace après le dernier retour', () => {
    const s = new Saisie('un deux\ntrois')
    s.couper()
    expect(s.texte).toBe('un deux\ntrois')
  })
})

describe('le vide et la voix', () => {
  it('des blancs seuls, c’est vide ; un émoji, non', () => {
    expect(vide(' \n ')).toBe(true)
    expect(vide('')).toBe(true)
    expect(vide('🐱')).toBe(false)
  })
  it('la voix ne lit pas les émojis', () => {
    expect(sansEmojis('on mange 😋 des crêpes')).toBe('on mange des crêpes')
    expect(sansEmojis('Coucou 👨‍👩‍👧 !')).toBe('Coucou !')
    expect(sansEmojis('🐱💗')).toBe('')
  })
})
