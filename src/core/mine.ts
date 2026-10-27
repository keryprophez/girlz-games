import type { GameContext } from './types'
import type { Stage } from './three3d'
import { sfx } from './sfx'

/* « Une création par fille » (27/10) — ce que la Ferme à construire, Mon
   cartable et les Monuments recopiaient chacun :
   - les deux filles (`WHO`) et la petite fille dessinée à leur couleur ;
   - le coffre d'un jeu (`mine`) : charger, garder (avec un délai, `flush`
     en quittant), la photo de sa création, la dernière choisie. Les clés
     sont `ferme:<jeu>:<qui>`, `ferme:<jeu>:photo:<qui>[:<sous-clé>]` et
     `ferme:<jeu>:qui` — celles d'avant ce module, AU CARACTÈRE PRÈS : les
     créations déjà faites sur la tablette ne doivent jamais se perdre ;
   - la photo de la scène telle qu'on la quitte (`snapScene`) ;
   - les deux cartes de l'ouverture (`whoCards`, `paintCards`), le bouton
     « Changer » (`meButton`, `paintMe`) ;
   - la poubelle à deux touchers (`twoTaps` : le premier l'arme, comme dans
     l'Atelier ; elle se désarme seule, ou par un toucher ailleurs) ;
   - `calm` : un bouton qui en remplace un autre à la même place ignore le
     second toucher d'un double toucher. */

export type Who = 'jade' | 'joyce'
export const WHO: { id: Who; name: string; color: string }[] = [
  { id: 'jade', name: 'Jade', color: '#5EC97B' },
  { id: 'joyce', name: 'Joyce', color: '#B197FC' }
]
export const whoOf = (w: Who) => WHO.find(x => x.id === w)!

const svg = (inner: string, sz: number) => `<svg viewBox="0 0 48 48" width="${sz}" height="${sz}">${inner}</svg>`
/** Une petite fille (sa couleur : son haut), pour sa carte et le bouton « Changer ». */
export const girl = (color: string, sz = 40) => svg(`<path d="M11 45c1-8 6-11 13-11s12 3 13 11z" fill="${color}"/><circle cx="24" cy="22" r="11" fill="#FFD9B8"/><path d="M12.5 22c0-9 5-14 11.5-14S35.5 13 35.5 22c-3-5-6.5-7-11.5-7s-8.5 2-11.5 7z" fill="#6B3E26"/><circle cx="10" cy="21" r="4.5" fill="#6B3E26"/><circle cx="38" cy="21" r="4.5" fill="#6B3E26"/><circle cx="20" cy="23.5" r="1.5" fill="#45362A"/><circle cx="28" cy="23.5" r="1.5" fill="#45362A"/><path d="M21 28c2 1.5 4 1.5 6 0" fill="none" stroke="#C0605A" stroke-width="1.5" stroke-linecap="round"/>`, sz)
/** La poubelle rouge (celle de l'Atelier). */
export const TRASH_ICON = svg('<path d="M12 15h24l-2 25a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3z" fill="#E8574C"/><rect x="8" y="9" width="32" height="6" rx="2.5" fill="#C8453B"/><rect x="19" y="5" width="10" height="6" rx="2.5" fill="#C8453B"/><path d="M19 21v16M24 21v16M29 21v16" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".85"/>', 32)

/* ---------- Le coffre d'un jeu ---------- */

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface Box {
  readonly key: (w: Who) => string
  readonly photoKey: (w: Who, sub?: string) => string
  readonly lastKey: string
  /** Ce qui est gardé pour elle, relu (null : rien, ou illisible). */
  read(w: Who): unknown
  /** Gardé tout de suite. */
  write(w: Who, data: unknown): void
  /** Gardé dans un instant (les gestes s'enchaînent) ; une fonction est appelée au moment d'écrire. */
  save(w: Who, data: unknown): void
  /** Ce qui attend est écrit maintenant (on quitte). */
  flush(): void
  /** Ce qui attend est oublié (sa création vient d'être effacée). */
  drop(w: Who): void
  photo(w: Who, sub?: string): string | null
  setPhoto(w: Who, url: string, sub?: string): void
  dropPhoto(w: Who, sub?: string): void
  /** La dernière choisie (sa carte est bordée). */
  last(): Who | null
  setLast(w: Who): void
}

/** Le coffre de `game` : ses clés sont `ferme:<game>:…`. */
export function mine(game: string, o: { delay?: number; storage?: () => StorageLike } = {}): Box {
  const delay = o.delay ?? 300
  const store = o.storage ?? (() => localStorage)
  const key = (w: Who) => `ferme:${game}:${w}`
  const photoKey = (w: Who, sub?: string) => `ferme:${game}:photo:${w}${sub ? ':' + sub : ''}`
  const lastKey = `ferme:${game}:qui`
  const get = (k: string) => { try { return store().getItem(k) } catch { return null } }
  // Plein (ou interdit) : tant pis, la création reste à l'écran
  const set = (k: string, v: string) => { try { store().setItem(k, v) } catch { /* plein */ } }
  const del = (k: string) => { try { store().removeItem(k) } catch { /* rien */ } }
  let pending: { w: Who; data: unknown } | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  const write = (w: Who, data: unknown) => {
    const v = typeof data === 'function' ? (data as () => unknown)() : data
    set(key(w), JSON.stringify(v))
  }
  const flush = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
    const p = pending
    pending = null
    if (p) write(p.w, p.data)
  }
  return {
    key, photoKey, lastKey,
    read(w) { try { return JSON.parse(get(key(w)) || 'null') } catch { return null } },
    write(w, data) { if (pending?.w === w) { if (timer !== null) clearTimeout(timer); timer = null; pending = null } write(w, data) },
    save(w, data) {
      // Une autre fille en attente (on vient de changer) : la sienne part d'abord
      if (pending && pending.w !== w) flush()
      if (timer !== null) clearTimeout(timer)
      pending = { w, data }
      timer = setTimeout(flush, delay)
    },
    flush,
    drop(w) { if (pending?.w === w) { if (timer !== null) clearTimeout(timer); timer = null; pending = null } },
    photo: (w, sub) => get(photoKey(w, sub)),
    setPhoto: (w, url, sub) => set(photoKey(w, sub), url),
    dropPhoto: (w, sub) => del(photoKey(w, sub)),
    last() { const v = get(lastKey); return v === 'jade' || v === 'joyce' ? v : null },
    setLast: w => set(lastKey, w)
  }
}

/** La photo de la scène pour sa carte : l'image telle qu'on la quitte,
    réduite (`w` px de large, en WebP : une vingtaine de Ko) ; `crop43` : le
    milieu de l'image, en 4:3. Lue dans la foulée du rendu : après, le tampon
    d'un canvas WebGL est vidé. Null : pas de photo neuve (la carte garde
    l'ancienne). */
export function snapScene(stage: Stage, w: number, crop43 = false): string | null {
  try {
    stage.renderer.render(stage.scene, stage.camera)
    const cv = stage.renderer.domElement
    const c2 = document.createElement('canvas')
    const g = c2.getContext('2d')!
    if (crop43) {
      c2.width = w; c2.height = Math.round(w * 3 / 4)
      const sw = Math.min(cv.width, cv.height * 4 / 3), sh = sw * 3 / 4
      g.drawImage(cv, (cv.width - sw) / 2, (cv.height - sh) / 2, sw, sh, 0, 0, c2.width, c2.height)
    } else {
      c2.width = w; c2.height = Math.max(1, Math.round(w * cv.height / Math.max(1, cv.width)))
      g.drawImage(cv, 0, 0, c2.width, c2.height)
    }
    return c2.toDataURL('image/webp', 0.8)
  } catch { return null }
}

/* ---------- Les cartes, « Changer » ---------- */

/** Les deux cartes de l'ouverture : la photo de sa création (`doll` : la
    petite fille à la place, les Monuments). `cls` préfixe les classes du jeu
    (`fb` : `.fb-who`, `.fb-card`), que sa main et ses bots visent. */
export function whoCards(cls: string, doll = false): string {
  return `<div class="mine-who ${cls}-who">${WHO.map(w => `
    <span class="tool-item"><button class="mine-card${doll ? ' doll' : ''} ${cls}-card" data-who="${w.id}" aria-label="${w.name}" style="--c:${w.color}">${doll ? girl(w.color, 120) : '<span class="mine-photo"></span>'}</button><b class="mine-name">${doll ? '' : girl(w.color, 44)}${w.name}</b></span>`).join('')}
  </div>`
}

/** Les cartes repeintes : la dernière choisie bordée ; la photo de chacune (`empty` : sa vignette si elle n'a rien fait). */
export function paintCards(root: HTMLElement, box: Box, empty?: string) {
  const last = box.last()
  root.querySelectorAll<HTMLElement>('.mine-card').forEach(b => {
    const w = b.dataset.who as Who
    b.classList.toggle('last', w === last)
    const ph = b.querySelector('.mine-photo')
    if (!ph) return
    const src = box.photo(w)
    ph.innerHTML = src ? `<img src="${src}" alt="" draggable="false">` : `<span class="mine-empty">${empty ?? ''}</span>`
  })
}

/** Le bouton « Changer » (la petite fille et son prénom dessous). */
export const meButton = (id: string, cls: string, label: string, w?: Who) =>
  `<span class="tool-item mine-me ${cls}"><button class="sn-tool" id="${id}" aria-label="${label}">${w ? girl(whoOf(w).color) : ''}</button><i class="tool-cap">${w ? whoOf(w).name : ''}</i></span>`

/** « Changer » à ses couleurs à elle. */
export function paintMe(root: HTMLElement, id: string, w: Who) {
  const b = root.querySelector<HTMLElement>('#' + id)
  if (!b) return
  b.innerHTML = girl(whoOf(w).color)
  const cap = b.parentElement?.querySelector('.tool-cap')
  if (cap) cap.textContent = whoOf(w).name
}

/** La poubelle (`<span>` + son bouton `id`), avec son petit nom « Effacer ». */
export const trashButton = (id: string, cls: string, label: string) =>
  `<span class="tool-item mine-trash ${cls}"><button class="sn-tool at-trash" id="${id}" aria-label="${label}">${TRASH_ICON}</button><i class="tool-cap">Effacer</i></span>`

/** Deux touchers pour effacer : le premier arme la poubelle (elle se dandine
    2,6 s), le second appelle `wipe`. Un toucher ailleurs la désarme (`disarm`). */
export function twoTaps(btn: HTMLElement, ctx: Pick<GameContext, 'after' | 'cancel'>, wipe: () => void) {
  let armed = false, id = 0
  const disarm = () => { if (!armed) return; armed = false; btn.classList.remove('arm'); ctx.cancel(id) }
  return {
    get armed() { return armed },
    disarm,
    tap() {
      if (!armed) {
        armed = true
        btn.classList.add('arm')
        sfx('switch', { vol: 0.5 })
        ctx.cancel(id)
        id = ctx.after(2600, disarm)
        return
      }
      disarm()
      wipe()
    }
  }
}

/** Un écran remplacé par un autre (des boutons à la même place) : `quiet()`
    reste vrai `ms` millisecondes après `mark()` — le second toucher d'un
    double toucher n'appuie pas sur le bouton apparu dessous. */
export function calm(ms = 450, now = () => performance.now()) {
  let t = -Infinity
  return { mark() { t = now() }, quiet() { return now() - t < ms } }
}
