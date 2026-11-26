/* @version 2026-11-26 11:16 */
// LE BANC des outils du Courrier (livraison 1) : les vrais modules de l'app, hors du jeu, pour les essayer
// dans un navigateur. npx vite .maquette/courrier → http://localhost:5302/banc.html
import '../../src/assets/fonts/fonts.css'
import '../../src/styles/global.css'
import { clavier } from '../../src/core/clavier'
import { Saisie, vus } from '../../src/core/saisie'
import { enregistrer, jouer, taire } from '../../src/core/vocal'
import { setPaused } from '../../src/core/session'
import { coffreIDB } from '../../src/core/courrierdb'
import { neuve, cacheter } from '../../src/core/courrier'
import { coachHand, handNow } from '../../src/core/hand'
import { Session } from '../../src/core/session'

const $ = (id: string) => document.getElementById(id)!
const s = new Saisie()
const montrer = () => {
  const g = vus(s.texte)
  $('ecrit').innerHTML = g.map((c, i) => (i === s.curseur ? '<i></i>' : '') + c.replace(/&/g, '&amp;').replace(/</g, '&lt;')).join('') + (s.curseur >= g.length ? '<i></i>' : '')
  $('etat').textContent = `${g.length} caractères · curseur ${s.curseur}`
}
const kb = clavier({ char(c) { s.poser(c); montrer() }, effacer() { s.effacer(); montrer() }, entrer() { s.poser('\n'); montrer() } })
$('hote').append(kb.el)
montrer()
;(window as unknown as { __banc: unknown }).__banc = { s, kb, enregistrer, jouer, taire, setPaused, coffreIDB, neuve, cacheter }
// La main à deux doigts, sur le texte : un faux ctx (les minuteurs d'une Session)
{
  const ses = new Session()
  const ctx = { root: document.body, after: (ms: number, f: () => void) => ses.after(ms, f), every: (ms: number, f: () => void) => ses.every(ms, f), cancel: (id: number) => ses.cancel(id), alive: () => true }
  ;(window as unknown as { __main: unknown }).__main = () => { coachHand(ctx as never, 'banc-pinch', () => ({ pinch: $('ecrit') }), 60000); setTimeout(handNow, 50) }
}
