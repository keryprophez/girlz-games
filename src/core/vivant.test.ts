import { describe, expect, it } from 'vitest'
import { parseVivant, SCHEMA, systemPrompt } from './vivant'

describe('la fiche de vie', () => {
  it('garde quatre choix connus', () => {
    expect(parseVivant({ allure: 'saute', regard: 'face', cri: 'chien', taille: 'grand' })).toEqual({ allure: 'saute', regard: 'face', cri: 'chien', taille: 'grand' })
  })
  it('« aucun » ou un cri inconnu : pas de cri', () => {
    expect(parseVivant({ allure: 'nage', regard: 'gauche', cri: 'aucun', taille: 'petit' })?.cri).toBeNull()
    expect(parseVivant({ allure: 'nage', regard: 'gauche', cri: 'rugissement', taille: 'petit' })?.cri).toBeNull()
  })
  it('un choix hors de la liste : pas de fiche', () => {
    expect(parseVivant({ allure: 'danse', regard: 'gauche', cri: 'chat', taille: 'petit' })).toBeNull()
    expect(parseVivant({ allure: 'marche', regard: 'haut', cri: 'chat', taille: 'petit' })).toBeNull()
    expect(parseVivant(null)).toBeNull()
    expect(parseVivant('marche')).toBeNull()
  })
  it('la fiche imposée et la consigne nomment les mêmes cris', () => {
    for (const c of SCHEMA.properties.cri.enum) if (c !== 'aucun') expect(systemPrompt()).toContain(`${c} =`)
  })
})
