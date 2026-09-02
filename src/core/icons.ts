/* Icônes de la coquille — du SVG inline, jamais d'emoji : le rendu ne dépend
   plus de la police de la tablette, la couleur suit `currentColor`, et une
   enfant de 6 ans reconnaît une forme pleine mieux qu'un pictogramme fin.
   Tracés maison, traits ronds, 24×24. */

const wrap = (body: string, cls = '') =>
  `<svg class="ico ${cls}" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">${body}</svg>`

const HEART = 'M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2 0 3.5 1 4.4 2.4l.8 1.2.8-1.2c.9-1.4 2.4-2.4 4.4-2.4 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z'
const STAR = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z'

export const ICON = {
  home: wrap('<path d="M3.5 11.2 12 3.8l8.5 7.4v8.3a1.5 1.5 0 0 1-1.5 1.5h-4.5v-6h-5v6H5a1.5 1.5 0 0 1-1.5-1.5z" fill="currentColor"/>'),
  replay: wrap('<path d="M12 5a7 7 0 1 1-6.3 4" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M3.5 3.5v6h6z" fill="currentColor"/>'),
  play: wrap('<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>'),
  pause: wrap('<rect x="5" y="4" width="5" height="16" rx="1.5" fill="currentColor"/><rect x="14" y="4" width="5" height="16" rx="1.5" fill="currentColor"/>'),
  heart: wrap(`<path d="${HEART}" fill="currentColor"/>`, 'ico-heart'),
  heartEmpty: wrap(`<path d="${HEART}" fill="none" stroke="currentColor" stroke-width="2"/>`, 'ico-heart ico-empty'),
  star: wrap(`<path d="${STAR}" fill="currentColor"/>`, 'ico-star'),
  starEmpty: wrap(`<path d="${STAR}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>`, 'ico-star ico-empty'),
  clock: wrap('<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M12 7v5.5l3.5 2" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>'),
  bolt: wrap('<path d="M13.5 2 4 13.5h6.5L10 22l9.5-11.5H13z" fill="currentColor"/>'),
  sound: wrap('<path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
  mute: wrap('<path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="m16 9 5 6m0-6-5 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'),
  camera: wrap('<path d="M4 8h3.5l1.5-2.5h6L16.5 8H20a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 20 19.5H4A1.5 1.5 0 0 1 2.5 18V9.5A1.5 1.5 0 0 1 4 8z" fill="currentColor"/><circle cx="12" cy="13.5" r="3.2" fill="#fff"/>'),
  album: wrap('<path d="M5 3.5h11.5a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5z" fill="currentColor"/><path d="M8 7h5M8 10.5h5" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>'),
  mic: wrap('<rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'),
  timer: wrap('<path d="M7 3h10v3.5c0 2.4-2 3.8-3.6 5.5 1.6 1.7 3.6 3.1 3.6 5.5V21H7v-3.5c0-2.4 2-3.8 3.6-5.5C9 10.3 7 8.9 7 6.5z" fill="currentColor"/>'),
  save: wrap('<path d="M4 4.5h12l3.5 3.5v11.5A1.5 1.5 0 0 1 18 21H4a1.5 1.5 0 0 1-1.5-1.5v-13A2 2 0 0 1 4 4.5z" fill="currentColor"/><rect x="7" y="13" width="10" height="6" fill="#fff"/><rect x="7" y="4.5" width="7" height="4" fill="#fff"/>'),
  rotate: wrap('<rect x="3" y="7" width="18" height="11" rx="2.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M12 2.5 15 5l-3 2.5M12 21.5 9 19l3-2.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>'),
  versus: wrap('<path d="M4 4.5 9.5 12 4 19.5M20 4.5 14.5 12 20 19.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>')
} as const

export type IconName = keyof typeof ICON

/** Rangée d'étoiles : `n` pleines sur 3. */
export function starsHTML(n: number, of = 3): string {
  let s = ''
  for (let i = 0; i < of; i++) s += i < n ? ICON.star : ICON.starEmpty
  return s
}

/** Rangée de cœurs : `n` pleins sur `of`. */
export function heartsHTML(n: number, of: number): string {
  let s = ''
  for (let i = 0; i < of; i++) s += i < n ? ICON.heart : ICON.heartEmpty
  return s
}
