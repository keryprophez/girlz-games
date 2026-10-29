import { describe, expect, it } from 'vitest'
import { IMAGIER, PIC, ofThemes } from './imagier'

const files = new Set(Object.keys(import.meta.glob('/public/assets/photos/*.jpg')).map(f => f.split('/').pop()))
const credits = Object.values(import.meta.glob('/public/assets/photos/CREDITS.json', { eager: true, import: 'default' }))[0] as Record<string, unknown>

describe("l'imagier", () => {
  it('chaque photo est installée et créditée, une seule fois', () => {
    expect(new Set(IMAGIER.map(p => p.id)).size).toBe(IMAGIER.length)
    for (const p of IMAGIER) {
      expect(files.has(`${p.id}.jpg`), p.id).toBe(true)
      expect(credits[p.id], p.id).toBeTruthy()
    }
  })
  it('un mot ne sert qu\'une fois (la Chasse aux lettres le montre seul)', () => {
    const mots = IMAGIER.map(p => p.mot.toLowerCase())
    expect(new Set(mots).size).toBe(mots.length)
  })
  it('un mot à écrire n\'a que des lettres, et au plus un espace, un tiret ou une apostrophe entre elles', () => {
    for (const p of IMAGIER.filter(p => p.niveau > 0)) {
      expect(p.mot, p.id).toMatch(/^\p{L}+(?:[ '-]\p{L}+)*$/u)
      expect(p.mot.replace(/[ '-]/g, '').length, p.id).toBeLessThanOrEqual(13)
    }
  })
  it('chaque niveau a de quoi tourner longtemps', () => {
    for (const n of [1, 2, 3] as const) expect(IMAGIER.filter(p => p.niveau === n).length, `niveau ${n}`).toBeGreaterThanOrEqual(60)
    for (const n of [1, 2, 3] as const) expect(IMAGIER.filter(p => p.dessin === n).length, `dessin ${n}`).toBeGreaterThanOrEqual(15)
  })
  it('chaque jeu de cartes du Memory a de quoi changer d\'une partie à l\'autre (douze paires à la flamme)', () => {
    for (const themes of [['espace'], ['mer'], ['betes'], ['monde'], ['oiseaux'], ['nature'], ['fruits', 'desserts']] as const) {
      expect(ofThemes(themes).length, themes.join('+')).toBeGreaterThanOrEqual(18)
    }
  })
  it('se lit par identifiant et par thème', () => {
    expect(PIC.cat.mot).toBe('chat')
    expect(ofThemes(['espace']).every(p => p.theme === 'espace')).toBe(true)
  })
})
