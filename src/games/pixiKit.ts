import { Texture } from 'pixi.js'

/* Petite boîte à outils PixiJS partagée par les jeux WebGL (Ninja, Attrape,
   Poussin Volant) : transformer un SVG (même avec la photo de la joueuse
   incrustée en data:) en texture GPU, et la goutte blanche des particules. */

export async function texFromSVG(svg: string, w = 144, h = w): Promise<Texture> {
  const img = new Image()
  await new Promise<void>((res, rej) => {
    img.onload = () => res()
    img.onerror = () => rej(new Error('svg'))
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)))
  })
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  cv.getContext('2d')!.drawImage(img, 0, 0, w, h)
  return Texture.from(cv)
}

let particle: Texture | null = null
/** Goutte ronde et douce, à teinter (jus, étincelles, plumes…). */
export function particleTex(): Texture {
  if (particle) return particle
  const cv = document.createElement('canvas')
  cv.width = cv.height = 16
  const g = cv.getContext('2d')!
  const grad = g.createRadialGradient(6, 6, 1, 8, 8, 8)
  grad.addColorStop(0, 'rgba(255,255,255,.95)')
  grad.addColorStop(0.35, 'rgba(255,255,255,.8)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 16, 16)
  particle = Texture.from(cv)
  return particle
}
