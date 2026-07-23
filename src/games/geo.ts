import type { GameContext, GameDef } from '../core/types'
import { $, pick, rnd, shuffle } from '../core/utils'
import { sGood, sNope, sPop, sWin, tone } from '../core/audio'
import { confetti, FX } from '../core/fx'

/* La Loupe Magique — apprendre l'emboîtement CONTINENT ⊃ PAYS ⊃ RÉGION ⊃
   VILLE sans quiz ni lecture. Un petit animal veut rentrer chez lui : on
   ZOOME du plus grand au plus petit. On tape d'abord tout le continent, puis
   on trouve son pays (parmi plusieurs), puis sa région (un morceau du pays),
   puis sa ville (là où il habite). La caméra zoome vraiment à chaque étape,
   les mots sont lus à voix haute et un récapitulatif emboîté conclut le tour. */

const VCX = 200, VCY = 150

const CONTINENTS = ['Grande Terre', 'Douceterre', 'Mondorico', 'Terre-en-Ciel', 'Belle-Monde']
const COUNTRIES = ['Doucepré', 'Sucrelande', 'Mielpays', 'Câlinie', 'Pomdland', 'Rêvie', 'Bonbonie']
const REGION_NAMES = ['les Collines', 'la Grande Forêt', 'les Prés Fleuris', 'la Vallée', 'le Bord de Mer', 'les Montagnes']
const CITY_NAMES = ['Framboisette', 'Petibourg', 'Coquelicot', 'Ronronville', 'Trésorville', 'Mésange', "Pomme d'Api", 'Câlinou', 'Bisou-les-Bains', 'Doudouville', 'Papillon', 'Guimauve']
const LANDMARKS = ['🏔️', '🌋', '🗼', '🏰', '🌴', '⛰️']
const ANIMALS: [string, string][] = [
  ['🐰', 'le petit lapin'], ['🐭', 'la petite souris'], ['🦊', 'le renardeau'],
  ['🐻', "l'ourson"], ['🐨', 'le koala'], ['🐱', 'le chaton'], ['🐹', 'le hamster'], ['🐧', 'le pingouin']
]
const REGION_COLORS: [string, string][] = [
  ['#CDEBB6', '#8FCB74'], ['#BFE3F5', '#6FBEE0'], ['#FFDFC4', '#F0A878'],
  ['#E4D6F7', '#B69BE6'], ['#FFE7A8', '#EBC65C']
]
const COUNTRY_COLORS: [string, string][] = [
  ['#FFD9D3', '#F0938A'], ['#D7EFD0', '#8FCB74'], ['#D6E9FA', '#7FB8E4']
]

// Le pays « cible » (celui qu'on développe en régions), à gauche
const TARGET_C = { cx: 132, cy: 154, rx: 96, ry: 110 }
// Régions à l'intérieur du pays cible (décalage / centre du pays)
const REG_OFF = [
  { dx: -34, dy: -58, rx: 44, ry: 46, slots: [[-16, -14], [18, 8], [-2, 26], [20, -16]] },
  { dx: 34, dy: -4, rx: 46, ry: 44, slots: [[-18, -10], [16, 14], [2, -20], [22, 18]] },
  { dx: -14, dy: 62, rx: 48, ry: 42, slots: [[-20, 2], [18, -12], [0, 22], [-6, -18]] }
]
// Les deux autres pays du continent (décoratifs, à droite)
const OTHER_C = [
  { cx: 304, cy: 96, rx: 80, ry: 64 },
  { cx: 304, cy: 214, rx: 80, ry: 60 }
]

let geo: any = null
let ctx: GameContext

/* Forme organique lisse (pièce de terre) — déterministe pour ne pas gigoter. */
function blob(cx: number, cy: number, rx: number, ry: number, ph: number): string {
  const mult = [1, 0.9, 1.06, 0.92, 1.03, 0.94, 1.07, 0.9]
  const n = 8, pts: number[][] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const m = mult[(i + ph) % n]
    pts.push([cx + Math.cos(a) * rx * m, cy + Math.sin(a) * ry * m])
  }
  let d = `M ${(pts[0][0] + pts[n - 1][0]) / 2} ${(pts[0][1] + pts[n - 1][1]) / 2} `
  for (let i = 0; i < n; i++) {
    const cur = pts[i], nxt = pts[(i + 1) % n]
    d += `Q ${cur[0]} ${cur[1]} ${(cur[0] + nxt[0]) / 2} ${(cur[1] + nxt[1]) / 2} `
  }
  return d + 'Z'
}

const houseMark = () => `
  <ellipse cx="0" cy="7" rx="17" ry="6" fill="rgba(255,255,255,.5)"/>
  <polygon points="-11,-3 0,-13 11,-3" fill="#E8695D" stroke="#C24B41" stroke-width="1.5" stroke-linejoin="round"/>
  <rect x="-8" y="-3" width="16" height="11" rx="1.5" fill="#FBE4BC" stroke="#C99A5F" stroke-width="1.5"/>
  <rect x="-2.5" y="1" width="5" height="7" fill="#C77B4E"/>`

function tree(x: number, y: number, s: number): string {
  return `<g transform="translate(${x},${y})" opacity=".85" pointer-events="none">
    <rect x="${-1.4 * s}" y="0" width="${2.8 * s}" height="${4 * s}" fill="#9A6A3C"/>
    <polygon points="${-7 * s},1 ${7 * s},1 0,${-11 * s}" fill="#4CA772"/>
    <polygon points="${-5 * s},${-6 * s} ${5 * s},${-6 * s} 0,${-15 * s}" fill="#5CBB80"/></g>`
}

/* ---------- Construction d'une carte ---------- */
function buildMap(nCities: number) {
  const rcols = shuffle([...REGION_COLORS]).slice(0, 3)
  const rnames = shuffle([...REGION_NAMES]).slice(0, 3)
  const cnames = shuffle([...CITY_NAMES])
  const countryNames = shuffle([...COUNTRIES])
  const continent = pick(CONTINENTS)

  const regions = REG_OFF.map((O, i) => {
    const cx = TARGET_C.cx + O.dx, cy = TARGET_C.cy + O.dy
    const cities = shuffle([...O.slots]).slice(0, nCities).map(([dx, dy]) => ({
      x: cx + dx, y: cy + dy, name: cnames.pop() || 'Petibourg'
    }))
    return { cx, cy, rx: O.rx, ry: O.ry, name: rnames[i], fill: rcols[i][0], stroke: rcols[i][1], path: blob(cx, cy, O.rx, O.ry, i * 3), cities }
  })
  const target = {
    ...TARGET_C, name: countryNames[0], path: blob(TARGET_C.cx, TARGET_C.cy, TARGET_C.rx, TARGET_C.ry, 1), regions
  }
  const ccols = shuffle([...COUNTRY_COLORS])
  const others = OTHER_C.map((O, i) => ({
    ...O, name: countryNames[i + 1], path: blob(O.cx, O.cy, O.rx, O.ry, i * 2 + 4),
    fill: ccols[i][0], stroke: ccols[i][1], landmark: pick(LANDMARKS)
  }))
  return { continent, target, others }
}

/* ---------- Rendu de la carte (une fois par tour) ---------- */
function renderMap() {
  const { continent, target, others } = geo.map
  const tr = geo.target.r, tc = geo.target.c
  const t = target.regions[tr].cities[tc]

  const regionsSvg = target.regions.map((R: any, ri: number) => {
    const cities = R.cities.map((city: any, ci: number) => {
      const isT = ri === tr && ci === tc
      return `<g class="geo-city${isT ? ' tcity' : ''}" data-hit="city" data-r="${ri}" data-c="${ci}"${isT ? ' data-correct="1"' : ''}
        transform="translate(${city.x},${city.y})">
        <g transform="scale(0.85)">${houseMark()}</g>
        <text class="geo-clabel" x="0" y="20" text-anchor="middle">${city.name}</text>
      </g>`
    }).join('')
    return `<g class="geo-region" data-r="${ri}">
      <path class="geo-region-blob${ri === tr ? ' tregion' : ''}" data-hit="region" data-r="${ri}"${ri === tr ? ' data-correct="1"' : ''}
        d="${R.path}" fill="${R.fill}" stroke="${R.stroke}" stroke-width="2.5"/>
      ${tree(R.cx - R.rx * 0.5, R.cy + R.ry * 0.4, 0.7)}
      <text class="geo-rlabel" x="${R.cx}" y="${R.cy - R.ry * 0.66}" text-anchor="middle">${R.name}</text>
      ${cities}
    </g>`
  }).join('')

  // Les autres pays (décoratifs) — à choisir à l'étape « pays »
  const othersSvg = others.map((O: any, oi: number) => `
    <g class="geo-country geo-country-other" data-oi="${oi}">
      <path class="geo-country-blob" data-hit="country" data-target="0"
        d="${O.path}" fill="${O.fill}" stroke="${O.stroke}" stroke-width="3"/>
      <text x="${O.cx}" y="${O.cy - 2}" text-anchor="middle" font-size="26" pointer-events="none">${O.landmark}</text>
      <text class="geo-colabel" x="${O.cx}" y="${O.cy + O.ry * 0.62}" text-anchor="middle">${O.name}</text>
    </g>`).join('')

  $('geoSvg').innerHTML = `
    <g id="geoZoom">
      <path d="${blob(200, 150, 192, 142, 0)}" fill="rgba(255,255,255,.28)"
        stroke="#B69BE6" stroke-width="4" stroke-dasharray="10 8"/>
      <text class="geo-continent" x="200" y="22" text-anchor="middle">🌍 ${continent}</text>
      ${othersSvg}
      <g class="geo-country geo-target-country">
        <path class="geo-country-blob tcountry" data-hit="country" data-target="1" data-correct="1"
          d="${target.path}" fill="#FFD9D3" stroke="#F0938A" stroke-width="3"/>
        <text class="geo-colabel geo-tclabel" x="${target.cx}" y="${target.cy - target.ry * 0.72}" text-anchor="middle">${target.name}</text>
        <g class="geo-inside" id="geoInside">${regionsSvg}</g>
      </g>
      <text class="geo-char" id="geoChar" x="${t.x}" y="${t.y - 12}" text-anchor="middle">${geo.animal[0]}</text>
      <rect class="geo-contHit" data-hit="continent" x="4" y="4" width="392" height="292" rx="30" fill="transparent"/>
    </g>`
}

/* ---------- Caméra (zoom fluide) ---------- */
function setZoom(px: number, py: number, k: number) {
  const g = $('geoZoom')
  g.style.transform = `translate(${VCX - k * px}px, ${VCY - k * py}px) scale(${k})`
}
function resetZoom() {
  const g = $('geoZoom')
  g.style.transition = 'none'
  g.style.transform = 'none'
  void g.offsetWidth
  g.style.transition = ''
}

/* ---------- Bannière / étapes ---------- */
const LEVELS = ['continent', 'pays', 'region', 'ville']
function setBanner(now: string, text: string) {
  $('geoSay').innerHTML = text
  LEVELS.forEach(p => {
    const el = $('geoDot-' + p)
    el.classList.toggle('now', p === now)
    el.classList.toggle('done', !!geo.done[p])
  })
}
function setPhaseClass(p: string) {
  const a = $('geoArea')
  a.classList.remove('phase-continent', 'phase-pays', 'phase-region', 'phase-city')
  a.classList.add('phase-' + p)
}

/* ---------- Déroulé d'un tour ---------- */
function startRound() {
  geo.phase = 'continent'
  geo.busy = false
  geo.done = {}
  renderMap()
  resetZoom()
  setPhaseClass('continent')
  $('geoRound').textContent = `🔍 Tour ${geo.round + 1}/${geo.rounds}`
  setBanner('continent', `Coucou, je suis <b>${geo.animal[0]} ${geo.animal[1]}</b> !<br>Tape sur tout le <b class="w-cont">CONTINENT 🌍</b> !`)
  ctx.say(`Coucou ! Aide ${geo.animal[1]} à rentrer chez lui. D'abord, tape sur tout le continent ${geo.map.continent}.`)
}

function continentDone() {
  geo.busy = true
  geo.done.continent = true
  sGood(); tone(500, 0.12, 'sine', 0.12)
  setBanner('pays', `Le continent <b>${geo.map.continent}</b>, c'est <b>énorme</b> 🌍<br>Dedans il y a plusieurs <b class="w-pays">PAYS</b>.<br>Trouve <b>son</b> pays 🏳️ !`)
  ctx.say(`Le continent ${geo.map.continent}, c'est énorme ! Dedans, il y a plusieurs pays. Trouve celui où il habite.`)
  const g = $('geoZoom'); g.classList.remove('geo-boop'); void g.offsetWidth; g.classList.add('geo-boop')
  setTimeout(() => {
    if (!geo || !geo.running) return
    geo.phase = 'pays'; geo.busy = false; setPhaseClass('pays')
  }, 650)
}

function pickCountry(isTarget: boolean, el: HTMLElement) {
  if (!isTarget) {
    geo.wrong++; sNope()
    const b = el.querySelector('.geo-country-blob') || el
    ;(b as HTMLElement).classList.remove('shake'); void (b as HTMLElement).offsetWidth; (b as HTMLElement).classList.add('shake')
    ctx.say(`C'est un autre pays. Regarde où est ${geo.animal[1]} !`)
    return
  }
  geo.busy = true; geo.done.pays = true
  sPop(); tone(620, 0.12, 'sine', 0.12)
  const T = geo.map.target
  document.querySelectorAll('#geoSvg .geo-country-other').forEach(c => c.classList.add('dim'))
  $('geoInside').classList.add('show') // les régions apparaissent
  setZoom(T.cx, T.cy, 1.5)
  setBanner('region', `Oui ! Le pays <b>${T.name}</b> 🏳️<br>Un pays est <b>dans</b> le continent.<br>Dedans, voici ses <b class="w-region">RÉGIONS 🏞️</b> — trouve la sienne !`)
  ctx.say(`Oui ! Le pays ${T.name}. Un pays, c'est dans le continent. Et dans un pays, il y a des régions. Trouve la sienne !`)
  setTimeout(() => {
    if (!geo || !geo.running) return
    geo.phase = 'region'; geo.busy = false; setPhaseClass('region')
  }, 750)
}

function pickRegion(ri: number) {
  if (ri !== geo.target.r) {
    geo.wrong++; sNope()
    const el = document.querySelector(`#geoSvg .geo-region[data-r="${ri}"] .geo-region-blob`)
    if (el) { el.classList.remove('shake'); void (el as HTMLElement).offsetWidth; el.classList.add('shake') }
    ctx.say(`C'est une autre région. Cherche bien !`)
    return
  }
  geo.busy = true; geo.done.region = true
  sPop(); tone(700, 0.12, 'sine', 0.12)
  const R = geo.map.target.regions[geo.target.r]
  document.querySelectorAll('#geoSvg .geo-region').forEach(r => {
    r.classList.toggle('dim', +(r as HTMLElement).dataset.r! !== geo.target.r)
    r.classList.toggle('focus', +(r as HTMLElement).dataset.r! === geo.target.r)
  })
  setZoom(R.cx, R.cy, 3.4)
  setBanner('ville', `Bravo ! La région <b>${R.name}</b> 🏞️<br>Une région, c'est un <b>morceau</b> du pays.<br>Et dans quelle <b class="w-ville">VILLE 🏘️</b> habite-t-il ?`)
  ctx.say(`Bravo ! La région ${R.name}. Une région, c'est un morceau du pays. Et maintenant, dans quelle ville habite-t-il ?`)
  setTimeout(() => {
    if (!geo || !geo.running) return
    geo.phase = 'city'; geo.busy = false; setPhaseClass('city')
  }, 750)
}

function pickCity(ri: number, ci: number) {
  if (ri !== geo.target.r || ci !== geo.target.c) {
    geo.wrong++; sNope()
    const el = document.querySelector(`#geoSvg .geo-city[data-r="${ri}"][data-c="${ci}"]`)
    if (el) { el.classList.remove('shake'); void (el as HTMLElement).offsetWidth; el.classList.add('shake') }
    ctx.say(`Ce n'est pas sa ville. Cherche sa petite maison !`)
    return
  }
  geo.busy = true; geo.done.ville = true
  const city = geo.map.target.regions[ri].cities[ci]
  sGood()
  setZoom(city.x, city.y, 6)
  const ch = $('geoChar'); if (ch) ch.classList.add('cheer')
  setBanner('ville', `La ville <b>${city.name}</b> 🏘️ !<br>On <b>habite</b> dans une ville.`)
  setTimeout(() => {
    if (!geo || !geo.running) return
    const r = ($('geoChar') as unknown as SVGElement)?.getBoundingClientRect()
    if (r) FX.burst(r.left + r.width / 2, r.top + r.height / 2, { colors: ['#FFE08A', '#FF9E7A', '#8FCB74', '#6FBEE0', '#B69BE6'], count: 16 })
    tone(784, 0.16, 'sine', 0.14)
    showRecap()
  }, 700)
}

/* ---------- Récapitulatif emboîté ---------- */
function showRecap() {
  const T = geo.map.target
  const R = T.regions[geo.target.r]
  const city = R.cities[geo.target.c]
  const last = geo.round + 1 >= geo.rounds
  $('geoArea').insertAdjacentHTML('beforeend', `
    <div class="geo-recap" id="geoRecap">
      <div class="geo-nest geo-n-cont"><span class="geo-nlabel">🌍 Continent</span><b>${geo.map.continent}</b>
        <div class="geo-nest geo-n-pays"><span class="geo-nlabel">🏳️ Pays</span><b>${T.name}</b>
          <div class="geo-nest geo-n-region"><span class="geo-nlabel">🏞️ Région</span><b>${R.name}</b>
            <div class="geo-nest geo-n-ville"><span class="geo-nlabel">🏘️ Ville</span><b>${city.name}</b>
              <span class="geo-recap-char">${geo.animal[0]}</span></div>
          </div>
        </div>
      </div>
      <button class="bigbtn primary" id="geoNext">${last ? '🎉 On a fini !' : '➡️ Un autre !'}</button>
    </div>`)
  const name = geo.animal[1].charAt(0).toUpperCase() + geo.animal[1].slice(1)
  ctx.say(`${name} habite à ${city.name}, dans la région ${R.name}, dans le pays ${T.name}, sur le continent ${geo.map.continent}.`)
  ;($('geoNext') as HTMLButtonElement).onclick = () => {
    if (!geo || !geo.running) return
    sPop(); $('geoRecap')?.remove()
    if (last) finish(); else nextRound()
  }
}

function nextRound() {
  geo.round++
  const ri = geo.order[geo.round]
  geo.target = { r: ri, c: rnd(0, geo.map.target.regions[ri].cities.length - 1) }
  geo.animal = pick(ANIMALS)
  startRound()
}

function finish() {
  sWin(); confetti()
  const w = geo.wrong
  const stars = w <= 1 ? 3 : w <= 4 ? 2 : 1
  ctx.finish({
    title: 'Tu as tout trouvé !',
    msg: `${ctx.playerName} sait ranger : la ville est dans la région, dans le pays, sur le continent 🌍`,
    stars: stars as 1 | 2 | 3, starsEarned: stars
  })
}

export const geoGame: GameDef = {
  id: 'geo', name: 'La Loupe Magique', icon: '🔍', sq: 'sq-lilac', cat: 'reflexion', music: 'meadow',
  subtitle: 'Zoome du continent à la ville pour ramener le petit animal chez lui !',
  mount(c) {
    ctx = c
    const cfg = c.byTier(
      { nCities: 2, rounds: 2 },
      { nCities: 3, rounds: 3 },
      { nCities: 3, rounds: 3 }
    )
    const map = buildMap(cfg.nCities)
    const order = shuffle([0, 1, 2]).slice(0, cfg.rounds)
    const first = order[0]
    geo = {
      map, order, round: 0, rounds: cfg.rounds, wrong: 0,
      target: { r: first, c: rnd(0, map.target.regions[first].cities.length - 1) },
      animal: pick(ANIMALS), phase: 'continent', busy: false, done: {}, running: true
    }

    c.root.innerHTML = `
      <div class="topbar"><div class="chip" id="geoRound">🔍 Tour 1/${cfg.rounds}</div></div>
      <div class="geo-steps">
        <div class="geo-dot" id="geoDot-continent"><span>🌍</span>Continent</div>
        <div class="geo-arrow">›</div>
        <div class="geo-dot" id="geoDot-pays"><span>🏳️</span>Pays</div>
        <div class="geo-arrow">›</div>
        <div class="geo-dot" id="geoDot-region"><span>🏞️</span>Région</div>
        <div class="geo-arrow">›</div>
        <div class="geo-dot" id="geoDot-ville"><span>🏘️</span>Ville</div>
      </div>
      <div class="geo-say" id="geoSay"></div>
      <div id="geoArea" class="phase-continent">
        <svg id="geoSvg" viewBox="0 0 400 300"></svg>
      </div>`

    $('geoSvg').addEventListener('pointerdown', (e: PointerEvent) => {
      const el = (e.target as HTMLElement).closest('[data-hit]') as HTMLElement | null
      if (!el || !geo || !geo.running || geo.busy) return
      const hit = el.dataset.hit
      if (geo.phase === 'continent' && hit === 'continent') continentDone()
      else if (geo.phase === 'pays' && hit === 'country') pickCountry(el.dataset.target === '1', el.closest('.geo-country') as HTMLElement)
      else if (geo.phase === 'region' && hit === 'region') pickRegion(+el.dataset.r!)
      else if (geo.phase === 'city' && hit === 'city') pickCity(+el.dataset.r!, +el.dataset.c!)
    })

    ctx.say("Le monde est plein de continents. Dans un continent, il y a des pays. Dans un pays, des régions. Et dans une région, des villes !")
    setTimeout(() => { if (geo && geo.running) startRound() }, 200)

    return () => { if (geo) { geo.running = false; geo = null } }
  }
}
