/* @version 2026-11-26 09:36 */
/* LA SAISIE d'un texte tapé au clavier du Courrier : le texte, et son curseur
   compté en caractères VUS (un émoji composé, une teinte de peau ou un
   drapeau font un seul caractère : il s'efface d'un coup). Logique pure. */

const graphe = new Intl.Segmenter('fr', { granularity: 'grapheme' })

/** Les caractères tels qu'on les voit. */
export const vus = (t: string): string[] => Array.from(graphe.segment(t), x => x.segment)

export class Saisie {
  texte: string
  /** Avant quel caractère vu le prochain se pose (0 : au début). */
  curseur: number
  constructor(t = '') {
    this.texte = t
    this.curseur = vus(t).length
  }
  poser(c: string) {
    const g = vus(this.texte)
    g.splice(this.curseur, 0, c)
    this.texte = g.join('')
    this.curseur += vus(c).length
  }
  effacer() {
    if (this.curseur <= 0) return
    const g = vus(this.texte)
    g.splice(this.curseur - 1, 1)
    this.texte = g.join('')
    this.curseur--
  }
  placer(i: number) {
    this.curseur = Math.max(0, Math.min(vus(this.texte).length, Math.round(i)))
  }
  /** La ligne déborde : son dernier espace devient un retour à la ligne. */
  couper() {
    const i = this.texte.lastIndexOf(' ')
    if (i < 0 || this.texte.indexOf('\n', i) >= 0) return
    this.texte = this.texte.slice(0, i) + '\n' + this.texte.slice(i + 1)
  }
}

/** Rien que des blancs. */
export const vide = (t: string) => !t.trim()

const EMOJI = /\p{Extended_Pictographic}/u
/** Pour la voix : sans émojis (elle dirait « visage souriant »), les blancs resserrés. */
export const sansEmojis = (t: string) => vus(t).filter(c => !EMOJI.test(c) && !/^\p{Regional_Indicator}+$/u.test(c)).join('').replace(/[ \t]+/g, ' ').replace(/ ([!?.,])/g, (m, p) => (p === '!' || p === '?' ? m : p)).trim()
