/* @version 2026-11-26 09:36 */
// LE BANC des outils du Courrier (livraison 1) : les vrais modules de l'app, hors du jeu, pour les essayer
// dans un navigateur. npx vite .maquette/courrier → http://localhost:5302/banc.html
import '../../src/assets/fonts/fonts.css'
import '../../src/styles/global.css'
import { clavier } from '../../src/core/clavier'
import { Saisie, vus } from '../../src/core/saisie'

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
;(window as unknown as { __banc: unknown }).__banc = { s, kb }
