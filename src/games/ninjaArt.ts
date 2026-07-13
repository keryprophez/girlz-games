import { Texture } from 'pixi.js'
import { particleTex, texFromSVG } from './pixiKit'

/* Les fruits du Ninja — art vectoriel riche (dégradés, brillances) rendu en
   textures WebGL. Chaque fruit a une texture ENTIÈRE (peau) et une texture
   INTÉRIEUR (la face coupée : chair, pépins…) dont on tire les deux moitiés. */

export interface FruitArt { key: string; whole: string; inner: string; juice: number }

const G = (id: string, stops: [string, string][], cx = '38%', cy = '32%') =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="75%">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</radialGradient>`
const SHINE = `<ellipse cx="42" cy="36" rx="18" ry="11" fill="#fff" opacity=".35" transform="rotate(-24 42 36)"/>`
const wrap = (defs: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs>${defs}</defs>${body}</svg>`

export const FRUITS: FruitArt[] = [
  {
    key: 'pasteque', juice: 0xff5a76,
    whole: wrap(G('pq', [['0', '#7ED66B'], ['100', '#2E9643']]),
      `<circle cx="60" cy="60" r="52" fill="url(#pq)"/>
       <g stroke="#1F7A33" stroke-width="7" fill="none" opacity=".8">
         <path d="M32,14 Q26,60 32,106"/><path d="M60,8 Q56,60 60,112"/><path d="M88,14 Q94,60 88,106"/></g>
       <circle cx="60" cy="60" r="52" fill="none" stroke="#1F7A33" stroke-width="3"/>${SHINE}`),
    inner: wrap(G('pqi', [['0', '#FF8298'], ['80', '#F4405F'], ['100', '#E22D4C']]),
      `<circle cx="60" cy="60" r="52" fill="#2E9643"/>
       <circle cx="60" cy="60" r="46" fill="#EFF7E4"/>
       <circle cx="60" cy="60" r="40" fill="url(#pqi)"/>
       <g fill="#3B2A20"><ellipse cx="48" cy="42" rx="3" ry="4.6" transform="rotate(-18 48 42)"/>
         <ellipse cx="74" cy="46" rx="3" ry="4.6" transform="rotate(20 74 46)"/>
         <ellipse cx="60" cy="66" rx="3" ry="4.6"/>
         <ellipse cx="42" cy="72" rx="3" ry="4.6" transform="rotate(-30 42 72)"/>
         <ellipse cx="78" cy="74" rx="3" ry="4.6" transform="rotate(26 78 74)"/></g>`)
  },
  {
    key: 'orange', juice: 0xffa53c,
    whole: wrap(G('or', [['0', '#FFC46B'], ['100', '#F07E12']]),
      `<circle cx="60" cy="62" r="50" fill="url(#or)"/>
       <circle cx="60" cy="62" r="50" fill="none" stroke="#D96C08" stroke-width="3"/>
       <path d="M60,14 Q74,2 88,10 Q76,20 60,14 Z" fill="#4CA83D" stroke="#37822B" stroke-width="2.5"/>
       <circle cx="60" cy="12" r="4" fill="#8A5A2B"/>${SHINE}`),
    inner: wrap(G('ori', [['0', '#FFD98F'], ['100', '#FFAD3B']]),
      `<circle cx="60" cy="60" r="52" fill="#F07E12"/>
       <circle cx="60" cy="60" r="45" fill="#FFE9BD"/>
       <circle cx="60" cy="60" r="41" fill="url(#ori)"/>
       <g stroke="#FFE9BD" stroke-width="5" fill="none">
         ${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<line x1="60" y1="60" x2="${60 + 40 * Math.cos(a * Math.PI / 180)}" y2="${60 + 40 * Math.sin(a * Math.PI / 180)}"/>`).join('')}
       </g><circle cx="60" cy="60" r="7" fill="#FFE9BD"/>`)
  },
  {
    key: 'pomme', juice: 0xff6b6b,
    whole: wrap(G('ap', [['0', '#FF9D8A'], ['100', '#E23B2E']]),
      `<path d="M60,26 C34,10 10,32 14,62 C18,94 42,112 60,106 C78,112 102,94 106,62 C110,32 86,10 60,26 Z" fill="url(#ap)"/>
       <path d="M60,26 C34,10 10,32 14,62 C18,94 42,112 60,106 C78,112 102,94 106,62 C110,32 86,10 60,26 Z" fill="none" stroke="#B92A20" stroke-width="3"/>
       <path d="M60,26 Q58,10 66,4" fill="none" stroke="#7A4A22" stroke-width="5" stroke-linecap="round"/>
       <path d="M66,12 Q84,2 92,14 Q78,22 66,12 Z" fill="#4CA83D" stroke="#37822B" stroke-width="2.5"/>${SHINE}`),
    inner: wrap('',
      `<path d="M60,26 C34,10 10,32 14,62 C18,94 42,112 60,106 C78,112 102,94 106,62 C110,32 86,10 60,26 Z" fill="#E23B2E"/>
       <path d="M60,31 C38,18 17,36 20,62 C24,90 45,106 60,101 C75,106 96,90 100,62 C103,36 82,18 60,31 Z" fill="#FBF3DC"/>
       <ellipse cx="60" cy="64" rx="14" ry="20" fill="#F0E3BE"/>
       <ellipse cx="55" cy="60" rx="3.4" ry="6" fill="#5B3A21" transform="rotate(-14 55 60)"/>
       <ellipse cx="66" cy="66" rx="3.4" ry="6" fill="#5B3A21" transform="rotate(16 66 66)"/>`)
  },
  {
    key: 'fraise', juice: 0xff4d79,
    whole: wrap(G('fr', [['0', '#FF7D9C'], ['100', '#E52D55']]),
      `<path d="M60,112 C30,96 16,66 22,44 Q40,30 60,32 Q80,30 98,44 C104,66 90,96 60,112 Z" fill="url(#fr)" stroke="#C21F42" stroke-width="3"/>
       <g fill="#FFE08A"><circle cx="45" cy="55" r="2.6"/><circle cx="62" cy="50" r="2.6"/><circle cx="78" cy="58" r="2.6"/>
         <circle cx="52" cy="72" r="2.6"/><circle cx="70" cy="74" r="2.6"/><circle cx="60" cy="90" r="2.6"/><circle cx="40" cy="68" r="2.6"/></g>
       <path d="M60,32 L48,18 L56,30 L60,14 L64,30 L72,18 Z" fill="#4CA83D" stroke="#37822B" stroke-width="2.5" stroke-linejoin="round"/>
       <path d="M36,38 Q60,26 84,38 Q72,46 60,44 Q48,46 36,38 Z" fill="#5BBB49" stroke="#37822B" stroke-width="2.5"/>`),
    inner: wrap(G('fri', [['0', '#FFEDF1'], ['70', '#FF9CB4'], ['100', '#F25C7F']], '50%', '42%'),
      `<path d="M60,112 C30,96 16,66 22,44 Q40,30 60,32 Q80,30 98,44 C104,66 90,96 60,112 Z" fill="#E52D55"/>
       <path d="M60,105 C36,91 25,66 30,48 Q44,38 60,40 Q76,38 90,48 C95,66 84,91 60,105 Z" fill="url(#fri)"/>
       <path d="M60,48 L60,96 M42,56 Q52,70 60,92 M78,56 Q68,70 60,92" stroke="#fff" stroke-width="3" fill="none" opacity=".75"/>`)
  },
  {
    key: 'kiwi', juice: 0x8fd82d,
    whole: wrap(G('kw', [['0', '#9C7B52'], ['100', '#6B4F30']]),
      `<ellipse cx="60" cy="60" rx="50" ry="42" fill="url(#kw)"/>
       <ellipse cx="60" cy="60" rx="50" ry="42" fill="none" stroke="#54391F" stroke-width="3"/>
       <g stroke="#54391F" stroke-width="1.6" opacity=".5">
         ${Array.from({ length: 22 }, (_, i) => { const a = i * 16.4 * Math.PI / 180; const x = 60 + 46 * Math.cos(a); const y = 60 + 38 * Math.sin(a); return `<line x1="${x}" y1="${y}" x2="${x + 4}" y2="${y - 4}"/>` }).join('')}
       </g>${SHINE}`),
    inner: wrap(G('kwi', [['0', '#D6F09A'], ['100', '#78C226']]),
      `<ellipse cx="60" cy="60" rx="50" ry="42" fill="#6B4F30"/>
       <ellipse cx="60" cy="60" rx="46" ry="38" fill="url(#kwi)"/>
       <ellipse cx="60" cy="60" rx="16" ry="13" fill="#F3F7DC"/>
       <g fill="#2B1F12">${[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(a => {
        const r = Math.PI * a / 180; return `<ellipse cx="${60 + 26 * Math.cos(r)}" cy="${60 + 21 * Math.sin(r)}" rx="2" ry="3.4" transform="rotate(${a + 90} ${60 + 26 * Math.cos(r)} ${60 + 21 * Math.sin(r)})"/>`
      }).join('')}</g>`)
  },
  {
    key: 'peche', juice: 0xffb26b,
    whole: wrap(G('pc', [['0', '#FFD2A6'], ['55', '#FF9E63'], ['100', '#F2694B']]),
      `<circle cx="60" cy="64" r="48" fill="url(#pc)"/>
       <circle cx="60" cy="64" r="48" fill="none" stroke="#D9553B" stroke-width="3"/>
       <path d="M60,18 Q62,50 60,110" stroke="#D9553B" stroke-width="3.5" fill="none" opacity=".6"/>
       <path d="M58,18 Q42,4 30,12 Q40,24 58,18 Z" fill="#4CA83D" stroke="#37822B" stroke-width="2.5"/>${SHINE}`),
    inner: wrap(G('pci', [['0', '#FFE9C4'], ['100', '#FFB86B']]),
      `<circle cx="60" cy="60" r="50" fill="#F2694B"/>
       <circle cx="60" cy="60" r="44" fill="url(#pci)"/>
       <circle cx="60" cy="60" r="15" fill="#A85B32"/>
       <path d="M50,52 Q60,44 70,52 Q74,62 66,70 Q56,74 50,66 Q46,58 50,52 Z" fill="#8A4526" opacity=".8"/>`)
  }
]

export const HEDGEHOG = wrap(G('hh', [['0', '#A98866'], ['100', '#6B5138']]),
  `<g fill="#54391F">${Array.from({ length: 15 }, (_, i) => {
    const a = -160 + i * 21; const r = Math.PI * a / 180
    return `<path d="M60,64 L${60 + 56 * Math.cos(r)},${58 + 50 * Math.sin(r)} L${60 + 30 * Math.cos(r + 0.28)},${58 + 28 * Math.sin(r + 0.28)} Z"/>`
  }).join('')}</g>
   <circle cx="60" cy="66" r="34" fill="url(#hh)"/>
   <ellipse cx="60" cy="82" rx="20" ry="14" fill="#E8C49A"/>
   <circle cx="50" cy="66" r="4" fill="#2B1F12"/><circle cx="70" cy="66" r="4" fill="#2B1F12"/>
   <ellipse cx="60" cy="78" rx="6" ry="4.6" fill="#3B2A20"/>`)

export interface NinjaTextures {
  fruits: { key: string; whole: Texture; inner: Texture; juice: number }[]
  hedgehog: Texture
  particle: Texture
}

let cache: NinjaTextures | null = null

export async function loadNinjaTextures(): Promise<NinjaTextures> {
  if (cache) return cache
  const fruits = await Promise.all(FRUITS.map(async f => ({
    key: f.key,
    whole: await texFromSVG(f.whole),
    inner: await texFromSVG(f.inner),
    juice: f.juice
  })))
  const hedgehog = await texFromSVG(HEDGEHOG)
  cache = { fruits, hedgehog, particle: particleTex() }
  return cache
}
