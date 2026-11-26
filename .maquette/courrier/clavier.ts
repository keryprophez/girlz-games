// LE CLAVIER : un AZERTY à nous, gros, sans correction ni suggestions ; les accents au-dessus (ou les chiffres).
import { sfx } from '../../src/core/sfx'

export const EMOJIS = [...new Intl.Segmenter('fr', { granularity: 'grapheme' }).segment(
  '😀😂🤣😊😍🥰😘😜🤪😎🤩🥳😇🤗🤭😴😭😡😱🤢👻💩🤖👽👋👍👏🙏💪🤞✌️👑💗💛💚💙💜🧡🌈⭐✨🔥🎉🎈🎁🎂🍰🍭🍫🍦🍓🍒🍉🍌🍕🍟🥞🐶🐱🐰🦊🐻🐼🐨🦁🐮🐷🐸🐵🐥🦄🐝🦋🐢🐬🐙🦕🌸🌻🌞🌙⛄🏖️⚽🚲🎨🎵📚🏠🚗✈️🚀'
)].map(s => s.segment)

const ACCENTS = [...'éèêëàâçîôù'], CHIFFRES = [...'1234567890']
const R2 = [...'azertyuiop'], R3 = [...'qsdfghjklm'], R4 = [...'wxcvbn']

export interface Touches { char(c: string): void; back(): void; enter(): void }
export interface Clavier { el: HTMLElement; panel(p: 'abc' | 'emoji'): void }

const SHIFT = '<svg viewBox="0 0 24 24" width="26"><path d="M12 4l8 9h-4.5v6h-7v-6H4z" fill="currentColor"/></svg>'
const BACK = '<svg viewBox="0 0 24 24" width="28"><path d="M9 5h11v14H9l-6-7z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M12 9.5l5 5m0-5l-5 5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>'
const ENTER = '<svg viewBox="0 0 24 24" width="28"><path d="M19 5v7H6m4-4.5L5.5 12 10 16.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'

/** `enterIcon` : la touche de droite (à la ligne, ou envoyer). */
export function clavier(t: Touches, o: { enterIcon?: string; enterCls?: string } = {}): Clavier {
  const el = document.createElement('div')
  el.className = 'clav'
  let maj = false, digits = false
  const k = (c: string, w = 2, cls = '', label = '') => `<button class="tch ${cls}" data-k="${c}" style="grid-column:span ${w}">${label || `<span>${c}</span>`}</button>`
  const draw = () => {
    const L = (c: string) => k(maj ? c.toLocaleUpperCase('fr') : c)
    el.innerHTML = `<div class="clav-abc">${(digits ? CHIFFRES : ACCENTS).map(L).join('')}${R2.map(L).join('')}${R3.map(L).join('')}
      ${k('maj', 3, 'spe' + (maj ? ' sel' : ''), SHIFT)}${R4.map(L).join('')}${k('’')}${k('back', 3, 'spe', BACK)}
      ${k('emoji', 2, 'spe', '<span>😀</span>')}${k('123', 2, 'spe', digits ? '<span class="pt">éè</span>' : '<span class="pt">123</span>')}${k(',')}${k(' ', 6, 'esp', ' ')}${k('.')}${k('?')}${k('!')}${k('enter', 2, 'spe ' + (o.enterCls ?? ''), o.enterIcon ?? ENTER)}</div>
      <div class="clav-emo" hidden><div class="emo-grille">${EMOJIS.map(e => `<button class="emo" data-k="${e}">${e}</button>`).join('')}</div>
      <div class="emo-bas">${k('abc', 4, 'spe', '<span class="pt">abc</span>')}${k('back', 4, 'spe', BACK)}${k('enter', 4, 'spe ' + (o.enterCls ?? ''), o.enterIcon ?? ENTER)}</div></div>`
  }
  const panel = (p: 'abc' | 'emoji') => {
    el.querySelector<HTMLElement>('.clav-abc')!.hidden = p !== 'abc'
    el.querySelector<HTMLElement>('.clav-emo')!.hidden = p !== 'emoji'
  }
  draw()
  let rep = 0
  const stopRep = () => { clearTimeout(rep); rep = 0 }
  const press = (key: string) => {
    if (key === 'maj') { maj = !maj; draw(); return }
    if (key === '123') { digits = !digits; draw(); return }
    if (key === 'emoji') { panel('emoji'); return }
    if (key === 'abc') { panel('abc'); return }
    if (key === 'back') {
      t.back()
      const again = () => { t.back(); rep = window.setTimeout(again, 90) }
      stopRep(); rep = window.setTimeout(again, 480)
      return
    }
    if (key === 'enter') { t.enter(); return }
    t.char(key)
    if (maj) { maj = false; draw() }
  }
  // Les touches répondent dès que le doigt se pose ; les émojis (une grille qui défile), au toucher franc
  el.addEventListener('pointerdown', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.tch')
    if (!b) return
    e.preventDefault()
    sfx('tick', { vol: 0.28, rate: 1.2 })
    b.classList.add('bas')
    setTimeout(() => b.classList.remove('bas'), 130)
    press(b.dataset.k!)
  })
  el.addEventListener('pointerup', stopRep)
  el.addEventListener('pointercancel', stopRep)
  el.addEventListener('pointerleave', stopRep)
  el.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.emo')
    if (b) { sfx('tick', { vol: 0.28, rate: 1.5 }); press(b.dataset.k!) }
  })
  return { el, panel }
}

export const graphemes = (s: string) => [...new Intl.Segmenter('fr', { granularity: 'grapheme' }).segment(s)].map(x => x.segment)
