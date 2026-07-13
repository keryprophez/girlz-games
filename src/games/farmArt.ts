/* L'art du potager — légumes, bêtises et bonus dessinés en vectoriel riche
   pour le jeu Attrape (rendu WebGL). Même famille graphique que le Ninja :
   dégradés, contours chauds, brillances. */

const G = (id: string, stops: [string, string][], cx = '38%', cy = '32%') =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="75%">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</radialGradient>`
const SHINE = `<ellipse cx="44" cy="38" rx="15" ry="9" fill="#fff" opacity=".35" transform="rotate(-24 44 38)"/>`
const wrap = (defs: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs>${defs}</defs>${body}</svg>`

export interface FarmItem { key: string; svg: string; tint: number }

export const GOODS_ART: FarmItem[] = [
  {
    key: 'carotte', tint: 0xff9d3c,
    svg: wrap(G('ca', [['0', '#FFB25E'], ['100', '#F07816']]),
      `<path d="M48,34 Q60,26 72,34 L64,104 Q60,112 56,104 Z" fill="url(#ca)" stroke="#D96208" stroke-width="3" stroke-linejoin="round"/>
       <path d="M52,50 L66,48 M53,64 L65,62 M55,80 L63,78" stroke="#D96208" stroke-width="2.5" stroke-linecap="round" opacity=".7"/>
       <path d="M58,30 Q50,10 40,12 M60,28 Q60,8 60,6 M62,30 Q70,10 80,12" fill="none" stroke="#4CA83D" stroke-width="6" stroke-linecap="round"/>`)
  },
  {
    key: 'tomate', tint: 0xff5a4d,
    svg: wrap(G('to', [['0', '#FF8A73'], ['100', '#E23B2E']]),
      `<circle cx="60" cy="66" r="42" fill="url(#to)" stroke="#B92A20" stroke-width="3"/>
       <path d="M60,26 L52,14 M60,26 L68,14 M60,26 L60,10" stroke="#37822B" stroke-width="4" stroke-linecap="round"/>
       <path d="M42,32 Q60,20 78,32 Q70,42 60,38 Q50,42 42,32 Z" fill="#4CA83D" stroke="#37822B" stroke-width="2.5"/>${SHINE}`)
  },
  {
    key: 'mais', tint: 0xffd44d,
    svg: wrap(G('mi', [['0', '#FFE58A'], ['100', '#F2B824']]),
      `<ellipse cx="60" cy="62" rx="26" ry="46" fill="url(#mi)" stroke="#D99B12" stroke-width="3"/>
       <g fill="#D99B12" opacity=".55">${[0, 1, 2, 3, 4].map(r => [0, 1, 2].map(c =>
        `<circle cx="${48 + c * 12}" cy="${34 + r * 14}" r="3.4"/>`).join('')).join('')}</g>
       <path d="M40,86 Q30,110 46,108 Q52,96 50,84 Z" fill="#5BBB49" stroke="#37822B" stroke-width="2.5"/>
       <path d="M80,86 Q90,110 74,108 Q68,96 70,84 Z" fill="#4CA83D" stroke="#37822B" stroke-width="2.5"/>`)
  },
  {
    key: 'oeuf', tint: 0xfff2d9,
    svg: wrap(G('oe', [['0', '#FFFCF2'], ['100', '#F2E3C4']]),
      `<path d="M60,14 C82,14 94,44 94,68 C94,92 79,108 60,108 C41,108 26,92 26,68 C26,44 38,14 60,14 Z"
         fill="url(#oe)" stroke="#D9C49B" stroke-width="3"/>${SHINE}`)
  },
  {
    key: 'fraise', tint: 0xff4d79,
    svg: wrap(G('fs', [['0', '#FF7D9C'], ['100', '#E52D55']]),
      `<path d="M60,112 C30,96 16,66 22,44 Q40,30 60,32 Q80,30 98,44 C104,66 90,96 60,112 Z" fill="url(#fs)" stroke="#C21F42" stroke-width="3"/>
       <g fill="#FFE08A"><circle cx="45" cy="55" r="2.6"/><circle cx="62" cy="50" r="2.6"/><circle cx="78" cy="58" r="2.6"/>
         <circle cx="52" cy="72" r="2.6"/><circle cx="70" cy="74" r="2.6"/><circle cx="60" cy="90" r="2.6"/></g>
       <path d="M36,38 Q60,26 84,38 Q72,46 60,44 Q48,46 36,38 Z" fill="#5BBB49" stroke="#37822B" stroke-width="2.5"/>`)
  },
  {
    key: 'pomme', tint: 0xff6b6b,
    svg: wrap(G('po', [['0', '#FF9D8A'], ['100', '#E23B2E']]),
      `<path d="M60,26 C34,10 10,32 14,62 C18,94 42,112 60,106 C78,112 102,94 106,62 C110,32 86,10 60,26 Z" fill="url(#po)" stroke="#B92A20" stroke-width="3"/>
       <path d="M60,26 Q58,10 66,4" fill="none" stroke="#7A4A22" stroke-width="5" stroke-linecap="round"/>
       <path d="M66,12 Q84,2 92,14 Q78,22 66,12 Z" fill="#4CA83D" stroke="#37822B" stroke-width="2.5"/>${SHINE}`)
  }
]

export const BADS_ART: FarmItem[] = [
  {
    key: 'caillou', tint: 0x8a8a8a,
    svg: wrap(G('rk', [['0', '#B9B9B9'], ['100', '#7A7A7A']]),
      `<path d="M28,84 L20,58 L40,32 L74,26 L100,48 L96,82 L68,100 Z" fill="url(#rk)" stroke="#5E5E5E" stroke-width="3" stroke-linejoin="round"/>
       <path d="M40,32 L56,58 L20,58 M56,58 L96,82 M56,58 L68,100" stroke="#5E5E5E" stroke-width="2" opacity=".5" fill="none"/>`)
  },
  {
    key: 'botte', tint: 0x8a6b4a,
    svg: wrap(G('bo', [['0', '#A9805C'], ['100', '#75543A']]),
      `<path d="M44,14 L76,14 L76,64 Q100,68 102,88 Q102,102 88,102 L48,102 Q42,102 42,94 L44,14 Z"
         fill="url(#bo)" stroke="#54391F" stroke-width="3" stroke-linejoin="round"/>
       <rect x="40" y="8" width="40" height="12" rx="5" fill="#8A5A2B" stroke="#54391F" stroke-width="2.5"/>
       <path d="M42,88 L102,88" stroke="#54391F" stroke-width="3"/>`)
  },
  {
    key: 'champignon', tint: 0xe23b2e,
    svg: wrap(G('ch', [['0', '#FF8A73'], ['100', '#D92E20']]),
      `<path d="M18,58 Q22,20 60,18 Q98,20 102,58 Q80,66 60,64 Q40,66 18,58 Z" fill="url(#ch)" stroke="#A82318" stroke-width="3"/>
       <g fill="#FFF2E2"><circle cx="42" cy="38" r="6"/><circle cx="70" cy="30" r="5"/><circle cx="82" cy="48" r="4.6"/><circle cx="54" cy="52" r="4"/></g>
       <path d="M48,62 Q46,96 54,102 L68,102 Q74,96 72,62" fill="#F6E9CF" stroke="#C9B490" stroke-width="3" stroke-linejoin="round"/>`)
  }
]

export const POWERS_ART: Record<string, FarmItem> = {
  x2: {
    key: 'x2', tint: 0xffce3c,
    svg: wrap(G('gx', [['0', '#FFE9A6'], ['100', '#F2B824']]),
      `<path d="M60,14 C82,14 94,44 94,68 C94,92 79,108 60,108 C41,108 26,92 26,68 C26,44 38,14 60,14 Z"
         fill="url(#gx)" stroke="#D9930B" stroke-width="3"/>
       <path d="M66,34 L48,66 L60,66 L54,90 L74,56 L62,56 Z" fill="#fff" stroke="#D9930B" stroke-width="2.5" stroke-linejoin="round"/>`)
  },
  magnet: {
    key: 'magnet', tint: 0xff5a5a,
    svg: wrap('',
      `<path d="M30,66 L30,36 Q30,18 48,18 L72,18 Q90,18 90,36 L90,66 Q90,96 60,96 Q30,96 30,66 Z"
         fill="none" stroke="#E23B2E" stroke-width="20" stroke-linecap="butt"/>
       <path d="M30,36 Q30,18 48,18 L72,18 Q90,18 90,36" fill="none" stroke="#4FB8E7" stroke-width="20"/>
       <rect x="20" y="58" width="20" height="16" fill="#D8DBDE" stroke="#A9AFB6" stroke-width="2.5"/>
       <rect x="80" y="58" width="20" height="16" fill="#D8DBDE" stroke="#A9AFB6" stroke-width="2.5"/>`)
  },
  slow: {
    key: 'slow', tint: 0x9a7ae0,
    svg: wrap('',
      `<path d="M34,16 L86,16 L86,26 Q86,44 66,56 L66,64 Q86,76 86,94 L86,104 L34,104 L34,94 Q34,76 54,64 L54,56 Q34,44 34,26 Z"
         fill="#EDE3FD" stroke="#8A5AD9" stroke-width="4" stroke-linejoin="round"/>
       <path d="M44,26 L76,26 Q74,42 60,50 Q46,42 44,26 Z" fill="#C9A94D"/>
       <path d="M60,64 Q74,76 76,94 L44,94 Q46,76 60,64 Z" fill="#C9A94D"/>
       <rect x="28" y="10" width="64" height="10" rx="5" fill="#8A5AD9"/>
       <rect x="28" y="100" width="64" height="10" rx="5" fill="#8A5AD9"/>`)
  }
}
