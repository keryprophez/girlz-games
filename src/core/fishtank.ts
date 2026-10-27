/* 🐠 L'AQUARIUM (27/10) — la logique pure, sans 3D : ce qu'on garde d'un
   poisson dessiné (ses traits, allégés), de quel côté il regarde, la
   sauvegarde de l'aquarium (six poissons au plus, le décor) et le pas d'un
   poisson qui nage (il file vers un but, tourne en douceur, ralentit en
   arrivant). Testé (`fishtank.test.ts`).
   Contrairement à la Ferme à construire, rien ne part chez Claude : un
   poisson nage, pas besoin de deviner son allure — rien ne quitte la
   tablette. */
import type { DrawStroke } from '../games/farmdraw'

export const MAX_FISH = 6
export const MAX_DECO = 16
export type DecoKind = 'algue' | 'rocher' | 'chateau' | 'coffre' | 'coquillage' | 'corail'
export const DECOS: DecoKind[] = ['algue', 'rocher', 'chateau', 'coffre', 'coquillage', 'corail']

export interface Fish { s: DrawStroke[]; /** Le côté de sa tête sur le dessin : 1 à droite, −1 à gauche. */ d: 1 | -1 }
export interface Deco { k: DecoKind; x: number; z: number; r: number }

/** Allège un trait (Ramer–Douglas–Peucker, `eps` pixels) : le même dessin à l'œil, cinq fois moins de points. */
export function simplify(p: number[], eps = 1.6): number[] {
  const n = p.length / 2
  if (n <= 2) return p.slice()
  const keep = new Uint8Array(n)
  keep[0] = keep[n - 1] = 1
  const stack: [number, number][] = [[0, n - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const ax = p[2 * a], ay = p[2 * a + 1], bx = p[2 * b], by = p[2 * b + 1]
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy)
    let best = -1, bd = eps
    for (let i = a + 1; i < b; i++) {
      const px = p[2 * i], py = p[2 * i + 1]
      const d = l < 1e-6 ? Math.hypot(px - ax, py - ay) : Math.abs(dy * px - dx * py + bx * ay - by * ax) / l
      if (d > bd) { bd = d; best = i }
    }
    if (best >= 0) { keep[best] = 1; stack.push([a, best], [best, b]) }
  }
  const out: number[] = []
  for (let i = 0; i < n; i++) if (keep[i]) out.push(p[2 * i], p[2 * i + 1])
  return out
}

/** Ses traits allégés (la gomme comprise : elle fait partie du dessin). */
export const lighten = (strokes: DrawStroke[]): DrawStroke[] => strokes.map(st => ({ ...st, p: simplify(st.p) }))

const box = (p: number[]) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]) }
  return { x0, y0, x1, y1 }
}

/** De quel côté du dessin est la tête ? Un enfant dessine presque toujours
    l'ŒIL : un petit trait ramassé (un point, un rond), loin du milieu du
    corps. Leur centre dit le côté de la tête. Sans œil reconnaissable : la
    queue est le bout le plus fin… faute de mieux, la droite. */
export function headSide(strokes: DrawStroke[]): 1 | -1 {
  const ink = strokes.filter(st => !st.e && st.p.length >= 2)
  if (!ink.length) return 1
  const all = box(ink.flatMap(st => st.p))
  const W = Math.max(1, all.x1 - all.x0), H = Math.max(1, all.y1 - all.y0), cx = (all.x0 + all.x1) / 2
  const diag = Math.hypot(W, H)
  let sum = 0, n = 0
  for (const st of ink) {
    const b = box(st.p)
    const size = Math.hypot(b.x1 - b.x0, b.y1 - b.y0) + st.w
    if (size > diag * 0.16) continue
    const x = (b.x0 + b.x1) / 2
    // Un petit trait au bord même du dessin : une bulle, une écaille de la queue — pas un œil
    if (Math.abs(x - cx) > W * 0.47) continue
    sum += (x - cx) / W
    n++
  }
  if (n && Math.abs(sum / n) > 0.06) return sum > 0 ? 1 : -1
  // Sans œil : on compare l'épaisseur des deux bouts (le quart gauche et le quart droit)
  const thick = (lo: number, hi: number) => {
    let y0 = Infinity, y1 = -Infinity
    for (const st of ink) for (let i = 0; i < st.p.length; i += 2) {
      const x = st.p[i]
      if (x >= lo && x <= hi) { y0 = Math.min(y0, st.p[i + 1]); y1 = Math.max(y1, st.p[i + 1]) }
    }
    return y1 - y0
  }
  const l = thick(all.x0, all.x0 + W * 0.18), r = thick(all.x1 - W * 0.18, all.x1)
  // La queue s'ouvre en éventail : souvent aussi haute que le corps, mais le
  // creux entre corps et queue… trop incertain : on ne tranche qu'avec un écart net
  if (isFinite(l) && isFinite(r) && Math.abs(l - r) > H * 0.25) return l > r ? -1 : 1
  return 1
}

/* ---------- La sauvegarde ---------- */

const q1 = (v: number) => Math.round(v * 1000) / 1000
const isColor = (c: unknown): c is string => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)

export function packTank(fish: Fish[], deco: Deco[]) {
  return {
    v: 1,
    fish: fish.slice(-MAX_FISH).map(f => ({ d: f.d, s: f.s.map(st => ({ c: st.c, w: st.w, ...(st.e ? { e: 1 } : {}), p: st.p.map(Math.round) })) })),
    deco: deco.slice(0, MAX_DECO).map(d => [d.k, q1(d.x), q1(d.z), q1(d.r)])
  }
}

/** Relit un aquarium gardé ; ce qui est abîmé est laissé de côté. */
export function readTank(x: unknown): { fish: Fish[]; deco: Deco[] } {
  const o = x as { v?: number; fish?: unknown; deco?: unknown } | null
  const fish: Fish[] = [], deco: Deco[] = []
  if (!o || o.v !== 1) return { fish, deco }
  if (Array.isArray(o.fish)) for (const f of o.fish as { d?: unknown; s?: unknown }[]) {
    if (!f || !Array.isArray(f.s)) continue
    const s: DrawStroke[] = []
    for (const st of f.s as Record<string, unknown>[]) {
      if (!st || !isColor(st.c) || typeof st.w !== 'number' || !Array.isArray(st.p) || st.p.length < 2 || st.p.length % 2 || !st.p.every(v => typeof v === 'number' && isFinite(v))) continue
      s.push({ c: st.c, w: st.w, ...(st.e ? { e: 1 as const } : {}), p: st.p as number[] })
    }
    if (s.some(st => !st.e)) fish.push({ s, d: f.d === -1 ? -1 : 1 })
  }
  if (Array.isArray(o.deco)) for (const d of o.deco as unknown[]) {
    if (!Array.isArray(d) || !DECOS.includes(d[0]) || ![d[1], d[2], d[3]].every(v => typeof v === 'number' && isFinite(v))) continue
    deco.push({ k: d[0], x: d[1], z: d[2], r: d[3] })
  }
  return { fish: fish.slice(-MAX_FISH), deco: deco.slice(0, MAX_DECO) }
}

/* ---------- La nage ---------- */

/** Le volume où nagent les poissons (le bac, moins une marge). */
export const SWIM = { x: 1.35, y0: 0.35, y1: 1.45, z0: -0.35, z1: 0.3 }

export interface Swimmer { x: number; y: number; z: number; vx: number; vy: number; vz: number; gx: number; gy: number; gz: number; speed: number }

/** Un pas de nage : le poisson accélère vers son but, tourne en douceur, ralentit en arrivant.
    Renvoie vrai quand il y est. */
export function swimStep(f: Swimmer, dt: number, turn = 2.2): boolean {
  const dx = f.gx - f.x, dy = f.gy - f.y, dz = f.gz - f.z
  const d = Math.hypot(dx, dy, dz)
  if (d < 0.05) { f.vx *= 0.9; f.vy *= 0.9; f.vz *= 0.9; f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt; return true }
  const want = Math.min(f.speed, d * 1.6)
  const k = Math.min(1, dt * turn)
  f.vx += (dx / d * want - f.vx) * k
  f.vy += (dy / d * want * 0.6 - f.vy) * k
  f.vz += (dz / d * want - f.vz) * k
  f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt
  // Jamais hors du bac
  f.x = Math.max(-SWIM.x, Math.min(SWIM.x, f.x))
  f.y = Math.max(SWIM.y0, Math.min(SWIM.y1, f.y))
  f.z = Math.max(SWIM.z0, Math.min(SWIM.z1, f.z))
  return false
}
