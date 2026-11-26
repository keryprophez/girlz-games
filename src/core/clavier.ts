/* @version 2026-11-26 09:36 */
import { sfx } from './sfx'

/* LE CLAVIER du Courrier — le nôtre, jamais celui d'Android (il prendrait la
   moitié de l'écran, corrigerait et suggérerait des mots). Un AZERTY de dix
   colonnes, gros, la rangée des accents au-dessus (ou celle des chiffres), une
   majuscule pour UNE lettre, effacer qui se répète tant que le doigt reste, et
   une grille d'émojis. Une touche répond dès que le doigt se pose : plusieurs
   doigts peuvent taper en même temps. Les émojis, eux, défilent : ils répondent
   au toucher franc (`click`). Ses styles : `.clav` dans global.css. */

export const EMOJIS = Array.from(new Intl.Segmenter('fr', { granularity: 'grapheme' }).segment(
  '😀😂🤣😊😍🥰😘😜🤪😎🤩🥳😇🤗🤭😴😭😡😱🤢👻💩🤖👽👋👍👏🙏💪🤞✌️👑💗💛💚💙💜🧡🌈⭐✨🔥🎉🎈🎁🎂🍰🍭🍫🍦🍓🍒🍉🍌🍕🍟🥞🐶🐱🐰🦊🐻🐼🐨🦁🐮🐷🐸🐵🐥🦄🐝🦋🐢🐬🐙🦕🌸🌻🌞🌙⛄🏖️⚽🚲🎨🎵📚🏠🚗✈️🚀'
), s => s.segment)

/** Une touche : ce qu'elle tape (ou son rôle) et sa largeur en demi-colonnes (vingt par rangée). */
export interface Touche { k: string; w: number; cls?: string }

const ACCENTS = [...'éèêëàâçîôù'], CHIFFRES = [...'1234567890']
const R2 = [...'azertyuiop'], R3 = [...'qsdfghjklm'], R4 = [...'wxcvbn']

export function rangees(maj: boolean, chiffres: boolean): Touche[][] {
  const L = (c: string): Touche => ({ k: maj ? c.toLocaleUpperCase('fr') : c, w: 2 })
  const S = (k: string, w: number): Touche => ({ k, w, cls: 'spe' })
  return [
    (chiffres ? CHIFFRES : ACCENTS).map(L),
    R2.map(L),
    R3.map(L),
    [S('maj', 3), ...R4.map(L), { k: '’', w: 2 }, S('effacer', 3)],
    [S('emoji', 2), S('123', 2), { k: ',', w: 2 }, { k: ' ', w: 6, cls: 'esp' }, { k: '.', w: 2 }, { k: '?', w: 2 }, { k: '!', w: 2 }, S('entrer', 2)]
  ]
}

export interface Frappe { char(c: string): void; effacer(): void; entrer(): void }
export interface Clavier { el: HTMLElement; panneau(p: 'abc' | 'emoji'): void; detruire(): void }

const svg = (d: string, w = 28) => `<svg viewBox="0 0 24 24" width="${w}" aria-hidden="true">${d}</svg>`
const ICONE: Record<string, string> = {
  maj: svg('<path d="M12 4l8 9h-4.5v6h-7v-6H4z" fill="currentColor"/>', 26),
  effacer: svg('<path d="M9 5h11v14H9l-6-7z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M12 9.5l5 5m0-5l-5 5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'),
  entrer: svg('<path d="M19 5v7H6m4-4.5L5.5 12 10 16.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'),
  emoji: '<span class="clav-em">😀</span>'
}
const NOM: Record<string, string> = { maj: 'Majuscule', effacer: 'Effacer', entrer: 'À la ligne', emoji: 'Émojis', '123': 'Chiffres', ' ': 'Espace', abc: 'Lettres' }
const esc = (c: string) => c.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

export function clavier(f: Frappe): Clavier {
  const el = document.createElement('div')
  el.className = 'clav'
  let maj = false, chiffres = false, rep = 0, vivant = true
  const touche = (t: Touche) => {
    const label = ICONE[t.k] ?? (t.k === '123' ? `<span class="clav-pt">${chiffres ? 'éè' : '123'}</span>` : t.k === ' ' ? '' : `<span>${esc(t.k)}</span>`)
    const sel = t.k === 'maj' && maj ? ' sel' : ''
    return `<button class="clav-t ${t.cls ?? ''}${sel}" data-k="${esc(t.k)}" style="grid-column:span ${t.w}" aria-label="${esc(NOM[t.k] ?? t.k)}">${label}</button>`
  }
  const dessiner = () => {
    const vis = el.querySelector<HTMLElement>('.clav-emo')?.hidden === false ? 'emoji' : 'abc'
    el.innerHTML = `<div class="clav-abc">${rangees(maj, chiffres).flat().map(touche).join('')}</div>
      <div class="clav-emo" hidden><div class="clav-grille">${EMOJIS.map(e => `<button class="clav-e" data-k="${e}" aria-label="${e}">${e}</button>`).join('')}</div>
      <div class="clav-bas">${[{ k: 'abc', w: 4, cls: 'spe' }, { k: 'effacer', w: 4, cls: 'spe' }, { k: 'entrer', w: 4, cls: 'spe' }].map(t => touche(t).replace('<span>abc</span>', '<span class="clav-pt">abc</span>')).join('')}</div></div>`
    panneau(vis)
  }
  const panneau = (p: 'abc' | 'emoji') => {
    el.querySelector<HTMLElement>('.clav-abc')!.hidden = p !== 'abc'
    el.querySelector<HTMLElement>('.clav-emo')!.hidden = p !== 'emoji'
  }
  const stop = () => { clearTimeout(rep); rep = 0 }
  const presser = (k: string) => {
    if (k === 'maj') { maj = !maj; dessiner(); return }
    if (k === '123') { chiffres = !chiffres; dessiner(); return }
    if (k === 'emoji') { panneau('emoji'); return }
    if (k === 'abc') { panneau('abc'); return }
    if (k === 'effacer') {
      f.effacer()
      const encore = () => { if (!vivant) return; f.effacer(); rep = window.setTimeout(encore, 90) }
      stop()
      rep = window.setTimeout(encore, 480)
      return
    }
    if (k === 'entrer') { f.entrer(); return }
    f.char(k)
    if (maj) { maj = false; dessiner() }
  }
  const bas = (e: PointerEvent) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.clav-t')
    if (!b || !vivant) return
    e.preventDefault()
    sfx('tick', { vol: 0.28, rate: 1.2 })
    b.classList.add('bas')
    window.setTimeout(() => b.classList.remove('bas'), 130)
    presser(b.dataset.k!)
  }
  const clic = (e: MouseEvent) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.clav-e')
    if (!b || !vivant) return
    sfx('tick', { vol: 0.28, rate: 1.5 })
    f.char(b.dataset.k!)
  }
  el.addEventListener('pointerdown', bas)
  el.addEventListener('pointerup', stop)
  el.addEventListener('pointercancel', stop)
  el.addEventListener('pointerleave', stop)
  el.addEventListener('click', clic)
  dessiner()
  return { el, panneau, detruire() { vivant = false; stop() } }
}
