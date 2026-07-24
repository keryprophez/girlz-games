import { useMemo, useRef, useState } from 'react'
import { useFerme } from '../core/store'
import { CATEGORIES, GAMES } from '../games'
import { sFlip, sPop } from '../core/audio'
import type { GameCategory } from '../core/types'

/* La Ferme — un décor d'accueil, pas un système de récompense. Les filles s'y
   promènent, le ciel suit l'heure réelle, et TOUT le décor est là dès la
   première seconde : aucun palier, rien à « débloquer », rien qui pousse à
   rejouer. On touche un lieu pour ouvrir ses jeux, c'est tout. */

const VW = 1000, VH = 600

/* ---------- Petites briques de dessin ---------- */
function tree(x: number, y: number, s: number, dark = false): string {
  const g1 = dark ? '#2E7D57' : '#4CA772', g2 = dark ? '#39905F' : '#5CBB80'
  return `<g transform="translate(${x},${y}) scale(${s})" class="hub-sway">
    <rect x="-5" y="-14" width="10" height="20" rx="3" fill="#8A5A33"/>
    <circle cx="-16" cy="-28" r="20" fill="${g1}"/><circle cx="16" cy="-26" r="18" fill="${g1}"/>
    <circle cx="0" cy="-42" r="22" fill="${g2}"/><circle cx="-4" cy="-24" r="20" fill="${g2}"/>
    <circle cx="10" cy="-38" r="14" fill="${g1}" opacity=".55"/>
  </g>`
}
function flower(x: number, y: number, col: string, s = 1): string {
  return `<g transform="translate(${x},${y}) scale(${s})" class="hub-sway">
    <path d="M0,0 L0,-11" stroke="#5CBB80" stroke-width="2.5" stroke-linecap="round"/>
    ${[0, 72, 144, 216, 288].map(a => {
      const r = (a * Math.PI) / 180
      return `<ellipse cx="${Math.cos(r) * 5}" cy="${-11 + Math.sin(r) * 5}" rx="4" ry="5.5"
        transform="rotate(${a} ${Math.cos(r) * 5} ${-11 + Math.sin(r) * 5})" fill="${col}"/>`
    }).join('')}
    <circle cx="0" cy="-11" r="3" fill="#FFD34D"/></g>`
}
function fence(x: number, y: number, w: number): string {
  const posts = Math.max(2, Math.round(w / 34))
  let s = `<rect x="${x}" y="${y - 14}" width="${w}" height="5" rx="2.5" fill="#C89A63"/>
           <rect x="${x}" y="${y - 5}" width="${w}" height="5" rx="2.5" fill="#C89A63"/>`
  for (let i = 0; i <= posts; i++) {
    const px = x + (i / posts) * w
    s += `<rect x="${px - 3.5}" y="${y - 22}" width="7" height="26" rx="3" fill="#B0854F"/>`
  }
  return s
}
function cloud(x: number, y: number, s: number, dur: number): string {
  return `<g class="hub-cloud" style="animation-duration:${dur}s" transform="translate(${x},${y}) scale(${s})">
    <ellipse cx="0" cy="0" rx="34" ry="18" fill="#fff" opacity=".92"/>
    <ellipse cx="-26" cy="6" rx="22" ry="13" fill="#fff" opacity=".92"/>
    <ellipse cx="26" cy="5" rx="24" ry="14" fill="#fff" opacity=".92"/></g>`
}

/* ---------- Le ciel suit l'heure réelle ---------- */
function skyOf(h: number) {
  if (h >= 6 && h < 9) return { a: '#FFC9A8', b: '#FFE8CF', c: '#CDE9FA', night: false, label: 'matin' }
  if (h >= 9 && h < 17) return { a: '#9FD6F5', b: '#CDEBFB', c: '#E9F7FF', night: false, label: 'jour' }
  if (h >= 17 && h < 20) return { a: '#FF9E7A', b: '#FFCFA0', c: '#FFE9CF', night: false, label: 'soir' }
  return { a: '#241A4A', b: '#3E2F6E', c: '#6A55A0', night: true, label: 'nuit' }
}

/* ---------- Les lieux (une catégorie chacun) ---------- */
interface Place { cat: GameCategory; x: number; y: number; name: string }
const PLACES: Place[] = [
  { cat: 'reflexion', x: 168, y: 372, name: "L'École" },
  { cat: 'memoire', x: 480, y: 356, name: 'La Grange' },
  { cat: 'action', x: 812, y: 400, name: 'Le Pré' },
  { cat: 'creatif', x: 330, y: 512, name: "L'Atelier" }
]

function schoolSVG(): string {
  return `<g>
    <rect x="-62" y="-70" width="124" height="72" rx="6" fill="#FDF3E0" stroke="#C9A97B" stroke-width="3"/>
    <path d="M-72,-70 L0,-112 L72,-70 Z" fill="#7FB8E4" stroke="#5E96C2" stroke-width="3" stroke-linejoin="round"/>
    <rect x="-14" y="-124" width="28" height="26" rx="4" fill="#FDF3E0" stroke="#C9A97B" stroke-width="2.5"/>
    <path d="M-18,-124 L0,-140 L18,-124 Z" fill="#E8695D" stroke="#C24B41" stroke-width="2.5" stroke-linejoin="round"/>
    <circle cx="0" cy="-111" r="6" fill="#FFD34D" stroke="#E0A722" stroke-width="2"/>
    <rect x="-46" y="-52" width="30" height="26" rx="3" fill="#BFE3F5" stroke="#8FBBD4" stroke-width="2.5"/>
    <rect x="16" y="-52" width="30" height="26" rx="3" fill="#BFE3F5" stroke="#8FBBD4" stroke-width="2.5"/>
    <rect x="-15" y="-40" width="30" height="38" rx="3" fill="#C77B4E" stroke="#9A5A33" stroke-width="2.5"/>
    <circle cx="8" cy="-20" r="2.6" fill="#FFD34D"/></g>`
}
function barnSVG(): string {
  return `<g>
    <rect x="26" y="-116" width="42" height="118" rx="6" fill="#DCE6EC" stroke="#A9BCC8" stroke-width="3"/>
    <path d="M24,-116 Q47,-134 70,-116 Z" fill="#A9BCC8"/>
    <rect x="-86" y="-84" width="120" height="86" rx="5" fill="#D5453F" stroke="#A32F2C" stroke-width="3"/>
    <path d="M-96,-84 L-56,-124 L-6,-124 L44,-84 Z" fill="#E8695D" stroke="#A32F2C" stroke-width="3" stroke-linejoin="round"/>
    <path d="M-26,-84 L-26,0 M-86,-46 L34,-46" stroke="#FDF3E0" stroke-width="5"/>
    <path d="M-86,-84 L-26,-46 M-26,-84 L-86,-46 M-26,-84 L34,-46 M34,-84 L-26,-46" stroke="#FDF3E0" stroke-width="4" opacity=".85"/>
    <path d="M-44,-30 L-44,0 L-8,0 L-8,-30 Q-26,-44 -44,-30 Z" fill="#8A5A33" stroke="#5E3C22" stroke-width="2.5"/>
    <circle cx="-26" cy="-100" r="11" fill="#FFE8A3" stroke="#C99A3F" stroke-width="2.5"/></g>`
}
function meadowSVG(): string {
  return `<g>
    ${fence(-96, 4, 192)}
    <g transform="translate(-46,-16)">
      <ellipse cx="0" cy="0" rx="30" ry="22" fill="#EBC96A" stroke="#C9A03F" stroke-width="3"/>
      <path d="M-24,-8 Q0,-12 24,-6 M-26,4 Q0,0 26,6" stroke="#C9A03F" stroke-width="2.5" fill="none"/></g>
    <g transform="translate(34,-12) scale(.8)">
      <ellipse cx="0" cy="0" rx="30" ry="22" fill="#EBC96A" stroke="#C9A03F" stroke-width="3"/>
      <path d="M-24,-8 Q0,-12 24,-6" stroke="#C9A03F" stroke-width="2.5" fill="none"/></g>
    <g transform="translate(60,-52)">
      <rect x="-3" y="-6" width="6" height="58" fill="#A87C4A"/>
      <rect x="-24" y="-2" width="48" height="6" rx="3" fill="#A87C4A"/>
      <circle cx="0" cy="-18" r="14" fill="#EBC96A" stroke="#C9A03F" stroke-width="2.5"/>
      <circle cx="-5" cy="-21" r="2" fill="#45362A"/><circle cx="5" cy="-21" r="2" fill="#45362A"/>
      <path d="M-6,-12 Q0,-8 6,-12" stroke="#45362A" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M-16,-30 L16,-30 L12,-38 L-12,-38 Z" fill="#C77B4E"/></g></g>`
}
function studioSVG(): string {
  return `<g>
    <rect x="-58" y="-62" width="116" height="64" rx="6" fill="#FFE9F1" stroke="#E0A5BE" stroke-width="3"/>
    <path d="M-68,-62 L0,-100 L68,-62 Z" fill="#B9A7F2" stroke="#8E79D6" stroke-width="3" stroke-linejoin="round"/>
    <rect x="-40" y="-46" width="34" height="28" rx="3" fill="#FFF" stroke="#E0A5BE" stroke-width="2.5"/>
    <path d="M-36,-24 L-30,-38 L-22,-28 L-14,-40 L-10,-24 Z" fill="#7BDD97"/>
    <circle cx="-30" cy="-40" r="3.5" fill="#FFD34D"/>
    <rect x="10" y="-40" width="30" height="38" rx="3" fill="#F0A878" stroke="#C4794A" stroke-width="2.5"/>
    <circle cx="16" cy="-20" r="2.6" fill="#FFF"/>
    <g transform="translate(78,-6)">
      <path d="M-14,0 L0,-40 L14,0" stroke="#A87C4A" stroke-width="4" fill="none" stroke-linecap="round"/>
      <rect x="-16" y="-44" width="32" height="26" rx="2" fill="#FFF" stroke="#C9A97B" stroke-width="2.5"/>
      <circle cx="-6" cy="-34" r="5" fill="#FF8FA3"/><circle cx="6" cy="-28" r="5" fill="#7FB8E4"/></g></g>`
}
const PLACE_ART: Record<GameCategory, string> = {
  reflexion: schoolSVG(), memoire: barnSVG(), action: meadowSVG(), creatif: studioSVG()
}

/* ---------- Le décor de la ferme (tout est là, rien à « débloquer ») ---------- */
interface Build { id: string; name: string; svg: string }
const BUILDS: Build[] = [
  {
    id: 'pommier', name: 'un pommier 🍎',
    svg: `<g transform="translate(628,470)">${tree(0, 0, 1.15)}
      <circle cx="-14" cy="-46" r="5" fill="#E8503F"/><circle cx="16" cy="-34" r="5" fill="#E8503F"/>
      <circle cx="2" cy="-58" r="5" fill="#E8503F"/></g>`
  },
  {
    id: 'mare', name: 'la mare aux canards 🦆',
    svg: `<g transform="translate(694,454)">
      <ellipse cx="0" cy="0" rx="70" ry="23" fill="#7FC6E8" stroke="#5AA6CC" stroke-width="3"/>
      <ellipse cx="-22" cy="-6" rx="30" ry="8" fill="#A9DCF2" opacity=".8"/>
      <path d="M28,4 q10,-6 20,0" stroke="#A9DCF2" stroke-width="3" fill="none"/>
      <text x="-24" y="-2" font-size="26" class="hub-bob">🦆</text>
      <text x="26" y="4" font-size="20" class="hub-bob" style="animation-delay:-.7s">🦆</text>
      ${[-70, -40, 62].map(dx => `<path d="M${dx},6 q4,-16 0,-26" stroke="#5CBB80" stroke-width="3.5" fill="none" stroke-linecap="round"/>`).join('')}</g>`
  },
  {
    id: 'moulin', name: 'le moulin 🌾',
    svg: `<g transform="translate(918,396)">
      <path d="M-30,0 L-22,-84 L22,-84 L30,0 Z" fill="#FDF3E0" stroke="#C9A97B" stroke-width="3"/>
      <path d="M-24,-84 L0,-104 L24,-84 Z" fill="#D5453F" stroke="#A32F2C" stroke-width="3" stroke-linejoin="round"/>
      <rect x="-9" y="-34" width="18" height="34" rx="3" fill="#8A5A33"/>
      <g transform="translate(0,-84)"><g class="hub-mill">
        ${[0, 90, 180, 270].map(a => `<g transform="rotate(${a})">
          <rect x="-4" y="-52" width="8" height="46" rx="3" fill="#C89A63" stroke="#8A5A33" stroke-width="2"/>
          <rect x="4" y="-50" width="14" height="40" rx="2" fill="#FFF3D6" stroke="#C9A97B" stroke-width="1.6"/></g>`).join('')}
      </g><circle cx="0" cy="0" r="6" fill="#8A5A33"/></g></g>`
  },
  {
    id: 'serre', name: 'la serre à fleurs 🌷',
    svg: `<g transform="translate(112,512)">
      <rect x="-52" y="-52" width="104" height="52" rx="5" fill="rgba(190,235,250,.75)" stroke="#8FBBD4" stroke-width="3"/>
      <path d="M-58,-52 L0,-84 L58,-52 Z" fill="rgba(190,235,250,.9)" stroke="#8FBBD4" stroke-width="3" stroke-linejoin="round"/>
      <path d="M0,-84 L0,0 M-52,-30 L52,-30" stroke="#8FBBD4" stroke-width="2.5"/>
      ${flower(-30, -6, '#FF8FA3', 0.9)}${flower(-10, -4, '#FFD34D', 0.9)}
      ${flower(14, -6, '#B9A7F2', 0.9)}${flower(34, -4, '#FF7B6B', 0.9)}</g>`
  },
  {
    id: 'ballon', name: 'la montgolfière 🎈',
    svg: `<g transform="translate(806,146)" class="hub-float">
      <path d="M0,-52 C34,-52 46,-24 40,-2 C36,14 14,30 0,44 C-14,30 -36,14 -40,-2 C-46,-24 -34,-52 0,-52 Z"
        fill="#FF8FA3" stroke="#D96C81" stroke-width="3"/>
      <path d="M-14,-50 C-22,-24 -22,10 -8,36" stroke="#FFD34D" stroke-width="9" fill="none" opacity=".95"/>
      <path d="M14,-50 C22,-24 22,10 8,36" stroke="#7FB8E4" stroke-width="9" fill="none" opacity=".95"/>
      <path d="M-12,44 L-9,58 M12,44 L9,58" stroke="#8A5A33" stroke-width="2.5"/>
      <rect x="-13" y="56" width="26" height="18" rx="4" fill="#C89A63" stroke="#8A5A33" stroke-width="2.5"/></g>`
  },
  {
    id: 'arcenciel', name: "l'arc-en-ciel 🌈",
    svg: `<g transform="translate(430,352)" opacity=".85" class="hub-rainbow">
      ${['#FF7B6B', '#FFB84D', '#FFE08A', '#7BDD97', '#7FB8E4', '#B9A7F2'].map((c, i) =>
        `<path d="M-250,0 A250,250 0 0 1 250,0" fill="none" stroke="${c}" stroke-width="13"
          transform="scale(${1 - i * 0.055})"/>`).join('')}</g>`
  },
  {
    id: 'chateau', name: 'le château 🏰',
    svg: `<g transform="translate(66,352)">
      <rect x="-42" y="-64" width="84" height="64" rx="4" fill="#E6DCF5" stroke="#A895CE" stroke-width="3"/>
      <rect x="-56" y="-88" width="26" height="88" rx="4" fill="#EFE7FA" stroke="#A895CE" stroke-width="3"/>
      <rect x="30" y="-88" width="26" height="88" rx="4" fill="#EFE7FA" stroke="#A895CE" stroke-width="3"/>
      <path d="M-58,-88 L-43,-114 L-28,-88 Z" fill="#B9A7F2" stroke="#8E79D6" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M28,-88 L43,-114 L58,-88 Z" fill="#B9A7F2" stroke="#8E79D6" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M-44,-64 L0,-96 L44,-64 Z" fill="#B9A7F2" stroke="#8E79D6" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M-14,0 L-14,-30 Q0,-44 14,-30 L14,0 Z" fill="#7B5EA8"/>
      <path d="M43,-114 L43,-126 L60,-121 L43,-116" fill="#FF8FA3"/>
      <circle cx="-43" cy="-66" r="5" fill="#FFE08A"/><circle cx="43" cy="-66" r="5" fill="#FFE08A"/></g>`
  }
]

/* ---------- La scène complète ---------- */
function sceneSVG(stickers: string[], hour: number): string {
  const sky = skyOf(hour)
  const unlocked = BUILDS
  const nightStars = sky.night
    ? Array.from({ length: 30 }, (_, i) => {
        const x = ((i * 137) % 97) / 97 * VW, y = ((i * 79) % 53) / 53 * 300
        return `<circle class="hub-twinkle" style="animation-delay:${-(i % 7) * 0.5}s" cx="${x}" cy="${y}" r="${1 + (i % 3) * 0.6}" fill="#FFF6D8"/>`
      }).join('')
    : ''
  // Animaux de l'album qui gambadent (jusqu'à 6)
  const roam = stickers.slice(0, 6).map((e, i) => {
    const x = 90 + ((i * 197) % 820), y = 572 + ((i * 43) % 18)
    return `<text class="hub-roam" style="animation-delay:${-i * 1.3}s" x="${x}" y="${y}" font-size="26">${e}</text>`
  }).join('')

  return `
  <defs>
    <linearGradient id="hubSky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${sky.a}"/><stop offset="55%" stop-color="${sky.b}"/><stop offset="100%" stop-color="${sky.c}"/>
    </linearGradient>
    <linearGradient id="hubGround" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8FCB74"/><stop offset="100%" stop-color="#B6E098"/>
    </linearGradient>
    <radialGradient id="hubSun" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#FFF6C0"/><stop offset="60%" stop-color="#FFD34D"/><stop offset="100%" stop-color="#FFB13D"/>
    </radialGradient>
  </defs>
  <rect width="${VW}" height="${VH}" fill="url(#hubSky)"/>
  ${nightStars}
  ${sky.night
    ? `<g transform="translate(880,96)"><circle r="40" fill="#FFF3C4" opacity=".18"/>
       <path d="M14,-26 A28,28 0 1 0 22,22 A22,22 0 1 1 14,-26 Z" fill="#FFEFB8"/></g>`
    : `<g transform="translate(${hour < 13 ? 168 : 856},94)" class="hub-sun">
       <circle r="46" fill="#FFF3C4" opacity=".3"/><circle r="30" fill="url(#hubSun)"/></g>`}
  ${cloud(210, 120, 1, 68)}${cloud(560, 78, 0.75, 92)}${cloud(760, 150, 0.9, 78)}

  <path d="M0,362 Q140,300 300,336 Q450,368 600,320 Q780,268 1000,330 L1000,600 L0,600 Z" fill="#7FBF6D" opacity=".55"/>
  <path d="M0,404 Q180,352 360,392 Q560,436 760,388 Q900,354 1000,392 L1000,600 L0,600 Z" fill="url(#hubGround)"/>
  <path d="M480,600 Q470,520 500,470 Q530,424 500,384" stroke="#E4D2A8" stroke-width="34" fill="none" stroke-linecap="round" opacity=".9"/>
  <path d="M480,600 Q470,520 500,470 Q530,424 500,384" stroke="#EFE2C4" stroke-width="24" fill="none" stroke-linecap="round"/>

  ${unlocked.filter(b => ['arcenciel', 'chateau'].includes(b.id)).map(b => b.svg).join('')}
  ${tree(64, 430, 0.8, true)}${tree(940, 470, 1, true)}${tree(212, 452, 0.7, true)}
  ${unlocked.filter(b => !['arcenciel', 'chateau', 'ballon'].includes(b.id)).map(b => b.svg).join('')}

  ${PLACES.map(p => {
    const n = GAMES.filter(g => g.cat === p.cat).length
    const cat = CATEGORIES.find(c => c.id === p.cat)!
    return `<g class="hub-place" data-cat="${p.cat}">
      <ellipse cx="${p.x}" cy="${p.y + 6}" rx="86" ry="18" fill="rgba(69,54,42,.13)"/>
      <g transform="translate(${p.x},${p.y})">${PLACE_ART[p.cat]}</g>
      <g transform="translate(${p.x},${p.y + 30})">
        <rect x="-70" y="-13" width="140" height="30" rx="15" fill="rgba(255,249,240,.95)" stroke="#C9A97B" stroke-width="2.5"/>
        <text x="0" y="7" text-anchor="middle" class="hub-sign">${cat.icon} ${p.name}</text>
      </g>
      <rect class="hub-hit" x="${p.x - 92}" y="${p.y - 116}" width="184" height="168" fill="transparent"/>
      <text x="${p.x + 74}" y="${p.y + 4}" class="hub-count">${n}</text>
    </g>`
  }).join('')}

  ${unlocked.filter(b => b.id === 'ballon').map(b => b.svg).join('')}
  ${flower(150, 560, '#FF8FA3')}${flower(880, 552, '#FFD34D')}${flower(300, 578, '#B9A7F2')}
  ${flower(660, 570, '#FF7B6B')}${flower(560, 556, '#FFF')}
  ${roam}`
}

/* ---------- Le composant ---------- */
export function FarmHub({ onPlay, duel }: { onPlay: (id: string, duel: boolean) => void; duel: boolean }) {
  const store = useFerme()
  const cur = store.profiles.find(p => p.id === store.currentId) || store.profiles[0]
  const prog = store.progress[cur.id] || { stars: 0, stickers: [], bestStars: {} }
  const [open, setOpen] = useState<GameCategory | null>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const hour = useMemo(() => new Date().getHours(), [])

  const svg = useMemo(() => sceneSVG(prog.stickers, hour), [prog.stickers, hour])

  const games = open ? GAMES.filter(g => g.cat === open) : []
  const catDef = open ? CATEGORIES.find(c => c.id === open)! : null

  return (
    <>
      <div className="hub-wrap" ref={hostRef}>
        <svg
          className="hub-svg" viewBox={`0 0 ${VW} ${VH}`}
          dangerouslySetInnerHTML={{ __html: svg }}
          onPointerDown={e => {
            const el = (e.target as HTMLElement).closest('[data-cat]') as HTMLElement | null
            if (!el) return
            sFlip()
            setOpen(el.dataset.cat as GameCategory)
          }}
        />
        {/* Les filles se promènent dans le pré */}
        {store.profiles.map((p, i) => (
          <div key={p.id} className={'hub-walker w' + i} title={p.name}>
            {p.avatar
              ? <span className="face-sprite" style={{ width: 36, height: 36, backgroundImage: `url(${p.avatar})` }} />
              : <span style={{ fontSize: 32 }}>{i === 0 ? '👧' : '🧒'}</span>}
            <span className="hub-wname">{p.name}</span>
          </div>
        ))}
      </div>


      {open && catDef && (
        <div id="album" className="show" onPointerDown={e => { if (e.target === e.currentTarget) setOpen(null) }}>
          <div className="modal hub-sheet">
            <h2>{catDef.icon} {PLACES.find(p => p.cat === open)!.name}</h2>
            <p>{games.length} jeux à découvrir</p>
            <div className="grid hub-grid">
              {games.map(g => {
                const best = prog.bestStars[g.id] || 0
                const noDuel = duel && g.duel === false
                return (
                  <button className={'gc' + (noDuel ? ' gc-solo' : '')} key={g.id}
                    onClick={() => { if (noDuel) { sPop(); return } setOpen(null); onPlay(g.id, duel) }}>
                    <span className={'sq ' + g.sq}>{g.icon}</span>
                    <span className="nm">{g.name}</span>
                    <span className="gc-stars">{'★'.repeat(best)}{'☆'.repeat(3 - best)}</span>
                  </button>
                )
              })}
            </div>
            <button className="bigbtn ghost" style={{ marginTop: 12 }} onClick={() => setOpen(null)}>Fermer</button>
          </div>
        </div>
      )}
    </>
  )
}
