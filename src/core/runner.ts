/* Le socle des jeux qui défilent (Course, Poussin Volant) : le monde avance
   vers −x à `speed` m/s, la joueuse reste à x = 0. Les obstacles naissent loin
   devant (`spawnX`), sont testés par le jeu, comptés quand leur arrière dépasse
   la joueuse, retirés derrière la caméra (`despawnX`) — plus d'obstacle
   supprimé encore à l'écran. Les couches de décor bouclent en parallaxe. Et le
   clignotement d'invulnérabilité, que les deux jeux écrivaient chacun. */

import type { Stage } from './three3d'

type Obj = import('three').Object3D

export interface Obstacle<D> {
  obj: Obj
  /** Position x du centre, en mètres. */
  x: number
  /** Demi-largeur en x : sert au passage et au retrait. */
  hw: number
  passed: boolean
  data: D
}

interface Layer { objs: Obj[]; depth: number; span: number; min: number }

export interface RunnerOpts {
  /** Vitesse de départ (m/s). */
  speed: number
  /** Où naissent les obstacles (devant, hors champ) et où ils meurent (derrière la caméra). */
  spawnX: number
  despawnX: number
  /** Position x de la joueuse (0 par défaut). */
  playerX?: number
}

export interface Runner<D> {
  speed: number
  /** Mètres parcourus. */
  dist: number
  /** Secondes d'invulnérabilité restantes. */
  invuln: number
  readonly playerX: number
  readonly spawnX: number
  readonly obstacles: Obstacle<D>[]
  /** Une couche de décor qui défile en boucle : `depth` 1 = à la vitesse du
      monde, 0.3 = lointain ; un objet passé sous `min` est renvoyé `span` plus loin. */
  layer(objs: Obj[], depth: number, span: number, min: number): void
  /** Pose un obstacle (à `spawnX` par défaut) ; l'objet est ajouté à la scène. */
  spawn(obj: Obj, hw: number, data: D, x?: number): Obstacle<D>
  /** Le dernier obstacle posé, pour espacer le suivant. */
  last(): Obstacle<D> | null
  /** Fait avancer le monde d'un `dt` (déjà ralenti par `stage.timeScale`). */
  update(dt: number, h?: { onPass?(o: Obstacle<D>): void; onGone?(o: Obstacle<D>): void }): void
  /** Démarre l'invulnérabilité (s). */
  hurt(sec: number): void
  /** À appeler chaque frame : fait clignoter `obj` tant qu'on est invulnérable. */
  blink(obj: Obj, now: number): void
  /** Retire tous les obstacles (nouvelle manche, démontage). */
  clear(): void
}

export function runner<D>(stage: Stage, o: RunnerOpts): Runner<D> {
  const layers: Layer[] = []
  const obstacles: Obstacle<D>[] = []
  const playerX = o.playerX ?? 0
  const r: Runner<D> = {
    speed: o.speed, dist: 0, invuln: 0, playerX, spawnX: o.spawnX, obstacles,
    layer(objs, depth, span, min) { layers.push({ objs, depth, span, min }) },
    spawn(obj, hw, data, x = o.spawnX) {
      obj.position.x = x
      stage.scene.add(obj)
      const ob: Obstacle<D> = { obj, x, hw, passed: false, data }
      obstacles.push(ob)
      return ob
    },
    last() { return obstacles.length ? obstacles[obstacles.length - 1] : null },
    update(dt, h = {}) {
      const v = r.speed * dt
      r.dist += v
      if (r.invuln > 0) r.invuln = Math.max(0, r.invuln - dt)
      for (const L of layers) for (const g of L.objs) {
        g.position.x -= v * L.depth
        if (g.position.x < L.min) g.position.x += L.span
      }
      for (let i = obstacles.length - 1; i >= 0; i--) {
        const ob = obstacles[i]
        ob.x -= v
        ob.obj.position.x = ob.x
        if (!ob.passed && ob.x + ob.hw < playerX) { ob.passed = true; h.onPass?.(ob) }
        if (ob.x + ob.hw < o.despawnX) {
          stage.scene.remove(ob.obj)
          obstacles.splice(i, 1)
          h.onGone?.(ob)
        }
      }
    },
    hurt(sec) { r.invuln = Math.max(r.invuln, sec) },
    blink(obj, now) { obj.visible = r.invuln <= 0 || Math.floor(now / 90) % 2 === 0 },
    clear() {
      for (const ob of obstacles) stage.scene.remove(ob.obj)
      obstacles.length = 0
    }
  }
  return r
}

/** Une texture de sol qui défile (terre, herbe) : bruit coloré, répétée en x.
    Faire avancer `tex.offset.x` de `v / longueur` chaque frame. */
export function scrollTex(T: import('./three3d').T3, base: string, grain: string, repeatX: number) {
  const c = document.createElement('canvas')
  c.width = 256; c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = base
  g.fillRect(0, 0, 256, 128)
  g.fillStyle = grain
  for (let i = 0; i < 900; i++) {
    g.globalAlpha = 0.08 + Math.random() * 0.22
    const s = 1 + Math.random() * 3
    g.fillRect(Math.random() * 256, Math.random() * 128, s, s * 0.7)
  }
  g.globalAlpha = 1
  const tex = new T.CanvasTexture(c)
  tex.wrapS = tex.wrapT = T.RepeatWrapping
  tex.repeat.set(repeatX, 1)
  tex.colorSpace = T.SRGBColorSpace
  return tex
}
