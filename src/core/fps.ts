/* Sonde de fréquence d'images — pour régler la 3D sur la VRAIE tablette
   (Galaxy Tab A9+), jamais montrée aux filles.

   Ouvrir l'app une fois avec `?fps` dans l'adresse l'allume, et elle reste
   allumée (y compris dans l'app installée) ; `?fps=0` l'éteint. Un petit
   cadre en haut à gauche, qui ne capte aucun toucher, affiche :
   - les images par seconde (moyenne sur 1 s) et la pire seconde des 10 dernières ;
   - pour un jeu 3D : le temps de calcul d'une image (simulation + rendu, côté
     processeur), le nombre d'appels de dessin et de triangles ;
   - la taille de l'écran, la densité de rendu appliquée et le nom du GPU.
   Les chiffres se relisent à l'œil : aucune donnée ne quitte la tablette. */

import type { WebGLRenderer } from 'three'

const KEY = 'ferme:fps'

function wanted(): boolean {
  try {
    const q = new URLSearchParams(location.search).get('fps')
    if (q === '0') localStorage.removeItem(KEY)
    else if (q !== null) localStorage.setItem(KEY, '1')
    return localStorage.getItem(KEY) === '1'
  } catch { return false }
}

let on = false
let renderer: WebGLRenderer | null = null
let gpu = ''
let cpuMs = 0

/** three3d signale la scène active (null au démontage). */
export function probeRenderer(r: WebGLRenderer | null) {
  if (!on) return
  renderer = r
  if (r && !gpu) {
    try {
      const gl = r.getContext()
      const ext = gl.getExtension('WEBGL_debug_renderer_info')
      gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
    } catch { gpu = '?' }
  }
}

/** three3d signale le coût d'une image (ms de simulation + rendu). */
export function probeFrame(ms: number) {
  if (on) cpuMs = cpuMs ? cpuMs * 0.9 + ms * 0.1 : ms
}

export function startFpsProbe() {
  on = wanted()
  if (!on) return
  const box = document.createElement('div')
  box.style.cssText = 'position:fixed;left:6px;top:6px;z-index:99;pointer-events:none;' +
    'font:600 11px/1.35 ui-monospace,monospace;color:#fff;background:rgba(20,16,12,.72);' +
    'padding:5px 8px;border-radius:8px;white-space:pre'
  document.body.appendChild(box)

  let frames = 0
  let t0 = performance.now()
  const history: number[] = []
  const tick = () => {
    frames++
    const now = performance.now()
    if (now - t0 >= 1000) {
      const fps = Math.round(frames * 1000 / (now - t0))
      frames = 0
      t0 = now
      history.push(fps)
      if (history.length > 10) history.shift()
      const lines = [`${fps} i/s · pire ${Math.min(...history)} (10 s)`]
      if (renderer) {
        const info = renderer.info.render
        lines.push(`3D ${cpuMs.toFixed(1)} ms/image · ${info.calls} appels · ${Math.round(info.triangles / 1000)}k tri.`)
        lines.push(`rendu ×${renderer.getPixelRatio()} · ${gpu}`)
      }
      lines.push(`écran ${innerWidth}×${innerHeight} ×${devicePixelRatio}`)
      box.textContent = lines.join('\n')
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
