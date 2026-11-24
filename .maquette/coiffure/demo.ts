/* @version 2026-11-25 00:20 */
// LA DÉMO du Salon de coiffure : le moteur de l'app (`src/core/salon3d.ts`), seul dans une page — pour
// mettre au point les cheveux, et pour l'essayer sur la tablette en un fichier (`seul.mjs`) sans rien publier.
import { createStage } from '../../src/core/three3d'
import { createSalon } from '../../src/core/salon3d'
import { COIFFURES, TEINTES, TEINTE, type Coiffure, type Step } from '../../src/core/salon'
import buste from '../../public/assets/salon/buste.glb?url'
import noeud0 from '../../public/assets/salon/noeud0.webp?inline'
import noeud1 from '../../public/assets/salon/noeud1.webp?inline'

const $ = (id: string) => document.getElementById(id)!
const q = new URLSearchParams(location.search)
let coif = (COIFFURES.find(c => c.id === q.get('coiffure'))?.id ?? 'queue') as Coiffure

/** Une image embarquée, sans passer par une adresse (certains aperçus les refusent). */
async function toile(uri: string) {
  const b = Uint8Array.from(atob(uri.slice(uri.indexOf(',') + 1)), c => c.charCodeAt(0))
  const bmp = await createImageBitmap(new Blob([b], { type: 'image/webp' })), c = document.createElement('canvas')
  c.width = bmp.width; c.height = bmp.height
  c.getContext('2d')!.drawImage(bmp, 0, 0)
  return c
}
/** Le modèle embarqué (compressé), ou son adresse. */
async function modele(): Promise<string | ArrayBuffer> {
  const m = (window as unknown as { __modele?: string }).__modele
  if (!m) return buste
  const b = Uint8Array.from(atob(m.slice(3)), c => c.charCodeAt(0))
  return new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
}

async function ouvrir() {
  const stage = await createStage($('scene'), { sky: '#F6E7DA', fov: 28, cam: [0, 0, 1.1], target: [0, 0, 0], ibl: false, noSun: true, hemi: ['#FFF4EC', '#B99A8A', 1.6], exposure: 1.05 })
  stage.renderer.shadowMap.enabled = false
  const noeuds = await Promise.all([toile(noeud0), toile(noeud1)]), tray = $('elastique'), fly = $('vol')
  const onStep = (i: number, st: Step, n: number, quiet: boolean) => {
    $('texte').innerHTML = `<b>${st.k === 'fini' ? '✓' : i + 1}</b>${st.txt}`
    $('etapes').innerHTML = Array.from({ length: n }, (_, k) => `<i class="${k < i ? 'on' : k === i ? 'cur' : ''}"></i>`).join('')
    $('plateau').hidden = st.k !== 'elastique'
    for (const el of [tray, fly]) {
      const pic = noeuds[Math.max(0, st.a)], c = pic.cloneNode() as HTMLCanvasElement
      c.getContext('2d')!.drawImage(pic, 0, 0)
      c.style.cssText = 'width:100%;height:100%;pointer-events:none'
      el.replaceChildren(c)
    }
    if (st.k === 'fini' && !quiet) $('fete').innerHTML = Array.from({ length: 40 }, (_, k) => `<i style="left:${50 + (Math.random() - 0.5) * 40}%;background:${['#F06292', '#FFC81E', '#4FB8E7', '#41C26A', '#FFFFFF'][k % 5]};--dx:${(Math.random() - 0.5) * 600}px;--dy:${-200 - Math.random() * 380}px;animation-delay:${Math.random() * 0.2}s"></i>`).join('')
    document.querySelectorAll<HTMLElement>('[data-coiffure]').forEach(b => b.classList.toggle('sel', b.dataset.coiffure === coif))
  }
  const salon = await createSalon({ stage, src: await modele(), after: (ms, fn) => { setTimeout(fn, ms) }, onStep, sound: () => { /* muette */ } })
  salon.setColor(TEINTES[TEINTE].hex)
  salon.start(coif)
  $('recommencer').onclick = () => salon.start(coif)
  document.querySelectorAll<HTMLButtonElement>('[data-coiffure]').forEach(b => { b.onclick = () => { coif = b.dataset.coiffure as Coiffure; salon.start(coif) } })
  document.querySelectorAll<HTMLButtonElement>('[data-teinte]').forEach((b, i) => {
    b.style.background = TEINTES[i].hex
    b.classList.toggle('sel', i === TEINTE)
    b.onclick = () => { salon.setColor(TEINTES[i].hex); document.querySelectorAll('[data-teinte]').forEach(x => x.classList.toggle('sel', x === b)) }
  })
  let id = -1
  const flyTo = (e: PointerEvent) => { fly.style.left = e.clientX + 'px'; fly.style.top = e.clientY + 'px' }
  tray.addEventListener('pointerdown', e => { id = e.pointerId; tray.setPointerCapture(id); fly.hidden = false; flyTo(e) })
  tray.addEventListener('pointermove', e => { if (e.pointerId === id) flyTo(e) })
  const drop = (e: PointerEvent) => {
    if (e.pointerId !== id) return
    id = -1; fly.hidden = true
    if (salon.drop(e.clientX, e.clientY)) $('plateau').hidden = true
  }
  tray.addEventListener('pointerup', drop); tray.addEventListener('pointercancel', drop)
  const fps = $('fps')
  let frames = 0, acc = 0
  fps.dataset.phys = '0'
  stage.start((dt, now) => {
    salon.update(dt, now)
    frames++; acc += dt
    if (acc > 0.5) { fps.textContent = `${Math.round(frames / acc)} img/s`; frames = 0; acc = 0 }
  })
  ;(window as unknown as { __coif: unknown }).__coif = Object.assign(salon.dbg, { aFaire: () => salon.geste(), density: (k: number) => salon.setDensity(k), face: salon.face })
  document.body.classList.add('pret')
}
ouvrir().catch(err => { $('charge').textContent = 'La démo n’a pas pu s’ouvrir : ' + String(err) })
