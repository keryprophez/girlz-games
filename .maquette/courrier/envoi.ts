// LA CÉRÉMONIE : plier, glisser dans l'enveloppe, cacheter, timbrer ; et à l'arrivée, casser le cachet, déplier.
import { sfx } from '../../src/core/sfx'
import { buzz } from '../../src/core/audio'
import { whoOf, girl, type Who } from '../../src/core/mine'
import type { Lettre } from './coffre'
import { aplatir, gommeHTML } from './feuille'
import { heartD, starD } from './pinceaux'

const COULEURS = ['#F58FB8', '#FFB84D', '#7CCB8F', '#6FC3EA', '#B197FC', '#F4E3C3']
const TIMBRES = ['duck', 'chick', 'cat', 'rabbit', 'cow', 'pig', 'sheep', 'horse'].map(a => 'animal:' + a)
const CACHETS: Record<string, string> = {
  coeur: `<path d="${heartD(50, 54, 40)}"/>`,
  etoile: `<path d="${starD(50, 51, 26)}"/>`,
  fleur: [0, 1, 2, 3, 4].map(k => `<circle cx="${50 + Math.cos(k * 1.257 - 1.57) * 15}" cy="${50 + Math.sin(k * 1.257 - 1.57) * 15}" r="11"/>`).join('') + '<circle cx="50" cy="50" r="7" class="centre"/>',
  patte: '<ellipse cx="50" cy="60" rx="17" ry="13"/><circle cx="31" cy="43" r="8"/><circle cx="43" cy="32" r="8"/><circle cx="57" cy="32" r="8"/><circle cx="69" cy="43" r="8"/>'
}
const CIRE = '#B3202E'
/** La pastille de cire, son bord irrégulier, son motif en creux. */
const cireSVG = (seal: string, clip = '') => {
  let d = ''
  for (let k = 0; k <= 40; k++) { const a = k / 40 * 6.283, r = 44 + Math.sin(a * 5 + 1) * 2.2 + Math.sin(a * 9) * 1.6; d += `${k ? 'L' : 'M'}${(50 + Math.cos(a) * r).toFixed(1)} ${(50 + Math.sin(a) * r).toFixed(1)}` }
  return `<svg viewBox="0 0 100 100" style="${clip}"><path d="${d}Z" fill="${CIRE}"/><circle cx="50" cy="50" r="35" fill="#9C1724"/><circle cx="50" cy="51.5" r="34" fill="#C22D3A"/><g fill="#8F1420" class="motif">${CACHETS[seal] ?? ''}</g><path d="M22 32a34 34 0 0 1 26-17" stroke="#fff" stroke-opacity=".4" stroke-width="5" fill="none" stroke-linecap="round"/></svg>`
}
const tampon = '<svg viewBox="0 0 120 80" class="oblit"><circle cx="38" cy="40" r="30" fill="none" stroke="#33407A" stroke-width="4"/><circle cx="38" cy="40" r="22" fill="none" stroke="#33407A" stroke-width="2"/><path d="M72 24c8-6 14 6 22 0s14 6 22 0M72 40c8-6 14 6 22 0s14 6 22 0M72 56c8-6 14 6 22 0s14 6 22 0" fill="none" stroke="#33407A" stroke-width="4"/></svg>'

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/** L'enveloppe ; `poste` : le tampon est déjà sur le timbre. */
export function enveloppeHTML(env: { color: string; stamp: string; seal: string }, to: Who, from: Who, poste = false) {
  return `<div class="env" style="--env:${env.color}"><div class="env-in">
    <div class="env-dos"><div class="env-fond"></div><div class="env-place"></div><div class="env-poche"></div><div class="env-rabat"><i></i></div><div class="env-cire"></div></div>
    <div class="env-face"><div class="env-timbre">${env.stamp ? `<span class="timbre">${gommeHTML(env.stamp)}</span>` : ''}${poste ? tampon : ''}</div><div class="env-adr">${girl(whoOf(to).color, 92)}<b>${whoOf(to).name}</b></div><div class="env-exp">${girl(whoOf(from).color, 34)}</div></div>
  </div></div>`
}

/** Le doigt qui montre un glissé : parti de (x, y), en % de l'écran. */
const doigt = (cls: string) => `<i class="doigt ${cls}"></i>`

/** Suit un glissé sur `el` : `onP` reçoit l'avancée (0..1), rend vrai quand c'est fait. */
function glisse(el: HTMLElement, axis: 'x' | 'y', sign: 1 | -1, dist: () => number, onP: (p: number, dragging: boolean) => void): Promise<void> {
  return new Promise(res => {
    let id = -1, s0 = 0, p = 0
    const pos = (e: PointerEvent) => (axis === 'x' ? e.clientX : e.clientY)
    const dn = (e: PointerEvent) => { if (id >= 0) return; id = e.pointerId; s0 = pos(e); sfx('cloth', { vol: 0.35 }) }
    const mv = (e: PointerEvent) => { if (e.pointerId !== id) return; p = Math.min(1, Math.max(0, (pos(e) - s0) * sign / dist())); onP(p, true) }
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      id = -1
      if (p < 0.42) { p = 0; onP(0, false); return }
      onP(1, false)
      el.removeEventListener('pointerdown', dn); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up)
      res()
    }
    el.addEventListener('pointerdown', dn); window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up)
  })
}

/* ---------- À l'envoi ---------- */

/** Toute la mise sous enveloppe ; rend l'enveloppe prête (ou null : elle est revenue à sa feuille). */
export async function cacheter(host: HTMLElement, l: Lettre, consigne: (t: string) => void): Promise<Lettre['env']> {
  const flat = await aplatir(l)
  const env = { color: COULEURS[0], stamp: '', seal: 'coeur' }
  host.innerHTML = `<div class="cer"><div class="pli" style="--img:url(${flat});--pap:${l.paper}">
      <div class="pli-h"></div><div class="pli-b"><i class="av"></i><i class="ar"></i></div></div>${doigt('d-haut')}
    <div class="cer-choix" hidden></div></div>`
  const cer = host.querySelector<HTMLElement>('.cer')!, choix = host.querySelector<HTMLElement>('.cer-choix')!
  let pli = host.querySelector<HTMLElement>('.pli')!
  const hint = () => host.querySelector('.doigt')

  // 1. Plier le bas sur le haut
  consigne('Plier : glisser le bas de la feuille vers le haut.')
  await glisse(cer, 'y', -1, () => pli.clientHeight * 0.75, (p, drag) => { pli.classList.toggle('auto', !drag); pli.style.setProperty('--a', String(p)); if (p > 0.05) hint()?.remove() })
  sfx('cloth', { vol: 0.8, rate: 0.9 }); buzz(12)
  await wait(330)
  // 2. Plier en deux, dans l'autre sens
  pli.outerHTML = `<div class="pli2" style="--pap:${l.paper}"><div class="p2-d"></div><div class="p2-g"><i class="av"></i><i class="ar"></i></div></div>`
  pli = host.querySelector<HTMLElement>('.pli2')!
  cer.insertAdjacentHTML('beforeend', doigt('d-droite'))
  consigne('Encore un pli : glisser le côté gauche vers la droite.')
  await glisse(cer, 'x', 1, () => pli.clientWidth * 0.75, (p, drag) => { pli.classList.toggle('auto', !drag); pli.style.setProperty('--a', String(p)); if (p > 0.05) hint()?.remove() })
  sfx('cloth', { vol: 0.8 }); buzz(12)
  await wait(330)

  // 3. L'enveloppe : sa couleur, puis la lettre dedans
  pli.remove()
  cer.insertAdjacentHTML('afterbegin', enveloppeHTML(env, l.to, l.from))
  const envEl = cer.querySelector<HTMLElement>('.env')!
  envEl.classList.add('ouverte', 'arrive')
  // Dans l'enveloppe, entre le fond et la poche : elle y entre pour de vrai
  const place = envEl.querySelector<HTMLElement>('.env-place')!
  place.innerHTML = `<div class="carte sortie" style="--pap:${l.paper};--a:1"></div>`
  const carte = place.firstElementChild as HTMLElement
  cer.classList.add('etape-env')
  cer.insertAdjacentHTML('beforeend', doigt('d-bas'))
  consigne('Choisir sa couleur, puis glisser la lettre dans l’enveloppe.')
  choix.hidden = false
  choix.innerHTML = COULEURS.map((c, i) => `<button class="${i ? '' : 'sel'}" data-c="${c}" style="background:${c}" aria-label="Couleur"></button>`).join('')
  choix.onclick = e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-c]'); if (!b) return; sfx('click', { vol: 0.5 }); env.color = b.dataset.c!; envEl.style.setProperty('--env', env.color); choix.querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b)) }
  await glisse(cer, 'y', 1, () => cer.clientHeight * 0.3, (p, drag) => { carte.classList.toggle('auto', !drag); carte.style.setProperty('--a', String(1 - p)); if (p > 0.05) hint()?.remove() })
  sfx('whoosh', { vol: 0.5 })
  await wait(360)
  choix.innerHTML = ''
  await wait(200)
  envEl.classList.remove('ouverte')
  sfx('cloth', { vol: 0.8, rate: 1.2 })
  await wait(520)
  place.innerHTML = ''

  // 4. La cire : choisir le motif, garder le doigt posé
  consigne('Le cachet : choisir le dessin, puis garder le doigt posé sur l’enveloppe.')
  choix.innerHTML = Object.keys(CACHETS).map((k, i) => `<button class="ca ${i ? '' : 'sel'}" data-s="${k}" aria-label="Cachet">${cireSVG(k)}</button>`).join('')
  const cire = envEl.querySelector<HTMLElement>('.env-cire')!
  choix.onclick = e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-s]'); if (!b) return; sfx('click', { vol: 0.5 }); env.seal = b.dataset.s!; choix.querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b)) }
  cer.insertAdjacentHTML('beforeend', doigt('d-pose'))
  await new Promise<void>(res => {
    let raf = 0, t0 = 0, id = -1
    cire.innerHTML = '<i class="goutte"></i>'
    const g = cire.firstElementChild as HTMLElement
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / 1100)
      g.style.transform = `scale(${0.08 + p * 0.92})`
      if (p < 1) { raf = requestAnimationFrame(tick); return }
      envEl.removeEventListener('pointerdown', dn); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up)
      res()
    }
    const dn = (e: PointerEvent) => { if (id >= 0) return; id = e.pointerId; hint()?.remove(); t0 = performance.now(); sfx('drop', { vol: 0.4, rate: 0.7 }); tick() }
    const up = (e: PointerEvent) => { if (e.pointerId !== id) return; id = -1; cancelAnimationFrame(raf); g.style.transform = 'scale(0.08)' }
    envEl.addEventListener('pointerdown', dn); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up)
  })
  cire.innerHTML = cireSVG(env.seal)
  cire.classList.add('tape')
  sfx('chop', { vol: 0.7, rate: 0.8 }); buzz([20, 30, 35])
  choix.innerHTML = ''
  await wait(800)

  // 5. Le timbre, de l'autre côté
  envEl.classList.add('face')
  sfx('whoosh', { vol: 0.4 })
  await wait(650)
  consigne('Choisir un timbre.')
  choix.innerHTML = TIMBRES.map(t => `<button class="ti" data-t="${t}" aria-label="Timbre"><span class="timbre">${gommeHTML(t)}</span></button>`).join('')
  env.stamp = await new Promise<string>(res => { choix.onclick = e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-t]'); if (b) res(b.dataset.t!) } })
  choix.innerHTML = ''
  const tb = envEl.querySelector<HTMLElement>('.env-timbre')!
  tb.innerHTML = `<span class="timbre colle">${gommeHTML(env.stamp)}</span>`
  sfx('drop', { vol: 0.6 })
  await wait(520)
  tb.insertAdjacentHTML('beforeend', tampon)
  sfx('chop', { vol: 0.8 }); buzz([25, 20, 40])
  await wait(800)
  host.innerHTML = ''
  return env
}

/* ---------- À l'arrivée ---------- */

/** L'enveloppe reçue : la retourner, casser le cachet, sortir la lettre. Rend la main quand elle est dépliée. */
export async function ouvrir(host: HTMLElement, l: Lettre, consigne: (t: string) => void, ecran: () => void): Promise<void> {
  const flat = await aplatir(l), env = l.env!
  host.innerHTML = `<div class="cer">${enveloppeHTML(env, l.to, l.from, true)}${doigt('d-pose')}</div>`
  const cer = host.querySelector<HTMLElement>('.cer')!, e = cer.querySelector<HTMLElement>('.env')!, hint = () => cer.querySelector('.doigt')
  const cire = e.querySelector<HTMLElement>('.env-cire')!
  cire.innerHTML = cireSVG(env.seal)
  e.classList.add('face', 'pleine', 'arrive')
  sfx('whoosh', { vol: 0.5 })
  const tap = (el: HTMLElement) => new Promise<void>(r => el.addEventListener('pointerup', () => r(), { once: true }))
  consigne('Une lettre ! La toucher pour la retourner.')
  await tap(e)
  hint()?.remove()
  e.classList.remove('face')
  sfx('whoosh', { vol: 0.4 })
  await wait(650)
  consigne('Casser le cachet : appuyer dessus, trois fois.')
  cer.insertAdjacentHTML('beforeend', doigt('d-pose'))
  cire.style.pointerEvents = 'auto'
  for (let k = 1; k <= 3; k++) {
    await new Promise<void>(r => cire.addEventListener('pointerdown', () => r(), { once: true }))
    hint()?.remove()
    if (k < 3) { cire.dataset.f = String(k); cire.classList.remove('fend'); void cire.offsetWidth; cire.classList.add('fend'); sfx('glass', { vol: 0.35, rate: 0.6 + k * 0.1 }); buzz(18) }
  }
  delete cire.dataset.f
  sfx('chop', { vol: 0.8 }); buzz([30, 20, 30])
  cire.innerHTML = `<span class="moitie g">${cireSVG(env.seal, 'clip-path:polygon(0 0,52% 0,44% 30%,56% 52%,42% 74%,50% 100%,0 100%)')}</span><span class="moitie d">${cireSVG(env.seal, 'clip-path:polygon(52% 0,100% 0,100% 100%,50% 100%,42% 74%,56% 52%,44% 30%)')}</span>`
  await wait(650)
  cire.innerHTML = ''
  e.classList.add('ouverte')
  sfx('cloth', { vol: 0.9 })
  await wait(620)
  consigne('Sortir la lettre : la glisser vers le haut.')
  const place = e.querySelector<HTMLElement>('.env-place')!
  place.innerHTML = `<div class="carte dedans" style="--pap:${l.paper}"></div>`
  const carte = place.firstElementChild as HTMLElement
  cer.insertAdjacentHTML('beforeend', doigt('d-haut'))
  await glisse(cer, 'y', -1, () => cer.clientHeight * 0.28, (p, drag) => { carte.classList.toggle('auto', !drag); carte.style.setProperty('--a', String(p)); if (p > 0.05) hint()?.remove() })
  sfx('whoosh', { vol: 0.5 })
  await wait(300)
  e.classList.add('part')
  // Elle se déplie toute seule : le pli de côté, puis le pli du bas
  carte.remove()
  cer.insertAdjacentHTML('beforeend', `<div class="pli2 auto" style="--pap:${l.paper};--a:1"><div class="p2-d"></div><div class="p2-g"><i class="av"></i><i class="ar"></i></div></div>`)
  const p2 = cer.querySelector<HTMLElement>('.pli2')!
  await wait(260)
  p2.style.setProperty('--a', '0'); sfx('cloth', { vol: 0.7 })
  await wait(420)
  p2.outerHTML = `<div class="pli auto" style="--img:url(${flat});--pap:${l.paper};--a:1"><div class="pli-h"></div><div class="pli-b"><i class="av"></i><i class="ar"></i></div></div>`
  const p1 = cer.querySelector<HTMLElement>('.pli')!
  await wait(160)
  p1.style.setProperty('--a', '0'); sfx('cloth', { vol: 0.8, rate: 0.9 })
  await wait(480)
  ecran()
  host.innerHTML = ''
}
