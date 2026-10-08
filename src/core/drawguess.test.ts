import { describe, expect, it } from 'vitest'
import { candidates, looksLikeKey, matches, parseGuess, POOLS, SCHEMA, spoken, systemPrompt, userPrompt, WORDS } from './drawguess'

describe('la fiche du devineur', () => {
  it('garde au plus trois propositions, des mots courts, une photo qui existe', () => {
    const g = parseGuess({
      propositions: [
        { article: 'un', mot: 'chat', photo: 'cat' },
        { article: 'un', mot: 'Chat', photo: 'cat' }, // le même mot : ignoré
        { article: 'une', mot: 'licorne', photo: 'dragon' }, // pas de photo : rien
        { article: 'xx', mot: 'lapin', photo: 'rabbit' },
        { article: 'un', mot: 'renard', photo: 'fox' }
      ]
    })
    expect(g?.items).toEqual([
      { article: 'un', mot: 'chat', photo: 'cat' },
      { article: 'une', mot: 'licorne', photo: null },
      { article: '', mot: 'lapin', photo: 'rabbit' }
    ])
  })
  it('refuse ce qui n\'est pas une fiche', () => {
    expect(parseGuess(null)).toBeNull()
    expect(parseGuess({ propositions: 'chat' })).toBeNull()
    expect(parseGuess({ propositions: [{ mot: '<script>' }, { mot: '' }] })).toBeNull()
  })
  it('tronque un mot trop long', () => {
    expect(parseGuess({ propositions: [{ article: 'un', mot: 'a'.repeat(80), photo: 'aucune' }] })?.items[0].mot).toHaveLength(24)
  })
})

describe('le défi', () => {
  it('se reconnaît par la photo ou par le mot, accents et pluriel compris', () => {
    expect(matches({ article: 'un', mot: 'minou', photo: 'cat' }, 'cat')).toBe(true)
    expect(matches({ article: 'un', mot: 'Éléphant', photo: null }, 'elephant')).toBe(true)
    expect(matches({ article: 'des', mot: 'cerise', photo: null }, 'cherries')).toBe(true)
    expect(matches({ article: 'un', mot: 'chien', photo: 'dog' }, 'cat')).toBe(false)
  })
  it('chaque sujet a sa photo et son mot', () => {
    for (const id of [...POOLS.easy, ...POOLS.med, ...POOLS.exp]) expect(WORDS[id], id).toBeTruthy()
    expect(new Set([...POOLS.easy, ...POOLS.med, ...POOLS.exp]).size).toBe(POOLS.easy.length + POOLS.med.length + POOLS.exp.length)
  })
  it('la fleur choisit parmi ses sujets, l\'éclair parmi plus, la flamme parmi tout', () => {
    expect(candidates('easy')).toEqual(POOLS.easy)
    expect(candidates('med')?.length).toBe(POOLS.easy.length + POOLS.med.length)
    expect(candidates('exp')).toBeNull()
    expect(userPrompt(candidates('easy'))).toContain('pomme')
    expect(userPrompt(null)).not.toContain('Choisis')
  })
})

describe('ce qu\'il dit, ce qu\'on lui dit', () => {
  it('dit « Un chat ? »', () => {
    expect(spoken({ article: 'un', mot: 'chat', photo: 'cat' })).toBe('Un chat ?')
    expect(spoken({ article: "de l'", mot: 'herbe', photo: null })).toBe("De l'herbe ?")
    expect(spoken({ article: '', mot: 'lapin', photo: null })).toBe('Lapin ?')
  })
  it('un message système figé (il se garde en cache), qui nomme chaque photo', () => {
    expect(systemPrompt()).toBe(systemPrompt())
    expect(systemPrompt()).toContain('cat = chat')
    expect(SCHEMA.properties.propositions.items.properties.photo.enum).toContain('aucune')
  })
  it('reconnaît la forme d\'une clé', () => {
    expect(looksLikeKey('sk-ant-api03-' + 'a'.repeat(40))).toBe(true)
    expect(looksLikeKey('bonjour')).toBe(false)
  })
})
