export const FARM = ['🐕', '🐈', '🐔', '🐤', '🐷', '🐮', '🐑', '🐰', '🐴', '🦆', '🐐', '🦃']
export const COLLECT = [
  '🐕', '🐈', '🐔', '🐤', '🐷', '🐮', '🐑', '🐰', '🐴', '🦆', '🐐', '🦃',
  '🐝', '🦋', '🐞', '🐌', '🦔', '🐸', '🦉', '🦄', '🐢', '🦊', '🐿️', '🦩'
]

export function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
export function rnd(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}
export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}
export function uniqueNumbers(answer: number, min: number, max: number, count: number): number[] {
  const s = new Set([answer])
  while (s.size < count) s.add(rnd(min, max))
  return shuffle([...s])
}

/** Sprite joueur : photo ronde si dispo, sinon emoji. */
export function faceSprite(avatar: string | null, emoji: string, px = 44): string {
  if (avatar) {
    return `<span class="face-sprite" style="width:${px}px;height:${px}px;background-image:url('${avatar}')"></span>`
  }
  return emoji
}

export const $ = (id: string) => document.getElementById(id) as HTMLElement

/** Taille d'un plateau carré : s'étend en mode grand écran (body.bigplay). */
export function boardSize(base: number): number {
  const big = document.body.classList.contains('bigplay')
  const w = window.innerWidth - (big ? 24 : 44)
  const h = window.innerHeight - (big ? 180 : 300)
  return big ? Math.max(base, Math.min(base * 2.2, w, h)) : Math.min(base, w)
}

export function toast(msg: string) {
  window.dispatchEvent(new CustomEvent('ferme:toast', { detail: msg }))
}
