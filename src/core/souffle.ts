/* 🌬️ LE SOUFFLE (11/10, la Pâtisserie) — reconnaître un vrai souffle dans
   le micro : un bruit FORT et SANS NOTE. Une voix qui parle ou qui chante
   (« Joyeux anniversaire » en chœur autour de la tablette) a une hauteur :
   son onde se répète à chaque période de sa note. Un souffle, c'est du
   vent : rien ne s'y répète. Avant, tout bruit fort éteignait les bougies —
   celles qu'on venait de planter s'éteignaient pendant qu'on parlait, et la
   chanson partait au milieu. Logique pure, testée (`souffle.test.ts`). */

/** Le son ramené vers 12 kHz (des moyennes de quelques échantillons : assez
    pour une voix d'enfant, et dix fois moins de calcul), sans sa composante
    continue. */
function decimate(x: Float32Array, sr: number): { y: Float32Array; rate: number } {
  const step = Math.max(1, Math.round(sr / 12000))
  const n = Math.floor(x.length / step)
  const y = new Float32Array(n)
  let mean = 0
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let k = 0; k < step; k++) s += x[i * step + k]
    y[i] = s / step
    mean += y[i]
  }
  mean /= n || 1
  for (let i = 0; i < n; i++) y[i] -= mean
  return { y, rate: sr / step }
}

/** Combien ce morceau de son a une NOTE : 0 pour un bruit, près de 1 pour
    une voix tenue. C'est l'autocorrélation normalisée à son plus haut
    sommet entre 70 et 900 Hz — mais seulement APRÈS qu'elle est passée sous
    0,2 : un bruit grave (le vent d'un souffle dans le micro) reste corrélé à
    lui-même sur quelques échantillons, en descendant, sans jamais se
    répéter ; une voix, elle, retombe puis remonte à sa période. */
export function tonality(x: Float32Array, sr: number): number {
  const { y, rate } = decimate(x, sr)
  const n = y.length
  const lo = Math.max(1, Math.floor(rate / 900)), hi = Math.min(Math.ceil(rate / 70), Math.floor(n / 2))
  if (hi <= lo) return 0
  // Énergies cumulées : celle des deux morceaux comparés, à chaque décalage
  const cum = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) cum[i + 1] = cum[i] + y[i] * y[i]
  if (cum[n] < 1e-9) return 0
  let dipped = false, best = 0
  for (let L = 1; L <= hi; L++) {
    let s = 0
    for (let i = 0; i + L < n; i++) s += y[i] * y[i + L]
    const e = Math.sqrt(cum[n - L] * (cum[n] - cum[L]))
    const r = e > 0 ? s / e : 0
    if (!dipped) { if (r < 0.2) dipped = true; continue }
    if (L >= lo && r > best) best = r
  }
  return best
}

/** Le seuil au-delà duquel un son a une note (une voix) : il ne souffle pas. */
export const VOICED = 0.55

/** La force du souffle (0..1) d'un morceau de son : son volume (efficace),
    nulle s'il a une note. `floor` : le bruit de la pièce qu'on ignore,
    `span` : ce qu'il faut au-dessus pour souffler fort. */
export function blowLevel(x: Float32Array, sr: number, floor = 0.04, span = 0.12): number {
  let sum = 0
  for (let i = 0; i < x.length; i++) sum += x[i] * x[i]
  const rms = Math.sqrt(sum / (x.length || 1))
  if (rms <= floor) return 0
  if (tonality(x, sr) > VOICED) return 0
  return Math.min(1, (rms - floor) / span)
}
