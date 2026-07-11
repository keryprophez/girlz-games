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

export function toast(msg: string) {
  window.dispatchEvent(new CustomEvent('ferme:toast', { detail: msg }))
}
