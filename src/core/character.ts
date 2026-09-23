/* Le look de la joueuse — choisi dans Habille-toi, persisté, et porté par
   son personnage 3D (`core/doll3d.ts`) dans les autres jeux : au volant du
   tracteur, sur l'écran de fin, en promenade sur l'accueil. Ici ne restent
   que le type, les palettes et les petites icônes dessinées des boutons. */

export interface Look {
  outfit: 'dress' | 'tee'
  color: string
  hair: 'pigtails' | 'long'
  hairColor: string
  hat: 'none' | 'crown' | 'cap' | 'sunhat' | 'party'
  glasses: 'none' | 'round' | 'sun'
  held: 'none' | 'balloon' | 'wand' | 'flower' | 'icecream'
}

export const OUTFIT_COLORS = ['#FF6B81', '#FFA94D', '#5EC97B', '#4FB8E7', '#B197FC', '#F5C518']
export const HAIR_COLORS = ['#5B3A21', '#2B2118', '#E8B04B', '#A65C2E']

export function defaultLook(): Look {
  return { outfit: 'dress', color: '#FF6B81', hair: 'pigtails', hairColor: '#5B3A21', hat: 'none', glasses: 'none', held: 'none' }
}

const INK = '#45362A'

/* ---- Chapeaux dessinés, posés sur le haut de tête (autour de y=36) ---- */
export function hatSVG(hat: Look['hat']): string {
  switch (hat) {
    case 'crown': return `<g><path d="M70,42 L76,18 L90,32 L100,12 L110,32 L124,18 L130,42 Z" fill="#FFCE3C" stroke="#D9A32A" stroke-width="2.5" stroke-linejoin="round"/>
      <circle cx="84" cy="35" r="3" fill="#FF6B81"/><circle cx="100" cy="33" r="3" fill="#4FB8E7"/><circle cx="116" cy="35" r="3" fill="#5EC97B"/></g>`
    case 'cap': return `<g><path d="M70,42 Q100,8 130,42 Z" fill="#4FB8E7" stroke="#3391BF" stroke-width="2.5"/>
      <path d="M124,36 Q152,36 154,46 Q138,51 120,45 Z" fill="#3391BF"/>
      <circle cx="100" cy="12" r="5" fill="#3391BF"/></g>`
    case 'sunhat': return `<g><ellipse cx="100" cy="41" rx="47" ry="11" fill="#F2B558" stroke="#D69A3F" stroke-width="2.5"/>
      <path d="M74,39 Q100,4 126,39 Z" fill="#F2B558" stroke="#D69A3F" stroke-width="2.5"/>
      <path d="M75,32 Q100,24 125,32 L125,39 Q100,31 75,39 Z" fill="#FF6B81"/></g>`
    case 'party': return `<g><path d="M85,44 L100,6 L115,44 Z" fill="#B197FC" stroke="#8F74E0" stroke-width="2.5" stroke-linejoin="round"/>
      <circle cx="100" cy="6" r="6" fill="#FFCE3C"/>
      <circle cx="95" cy="30" r="2.6" fill="#fff"/><circle cx="104" cy="22" r="2.6" fill="#fff"/><circle cx="100" cy="38" r="2.6" fill="#fff"/></g>`
    default: return ''
  }
}

/* ---- Lunettes (ligne des yeux ≈ y=70) ---- */
export function glassesSVG(glasses: Look['glasses']): string {
  if (glasses === 'none') return ''
  const fill = glasses === 'sun' ? 'rgba(69,54,42,.78)' : 'rgba(255,255,255,.18)'
  return `<g><circle cx="86" cy="70" r="11" fill="${fill}" stroke="${INK}" stroke-width="3"/>
    <circle cx="114" cy="70" r="11" fill="${fill}" stroke="${INK}" stroke-width="3"/>
    <path d="M97,70 L103,70 M75,68 L68,63 M125,68 L132,63" stroke="${INK}" stroke-width="3" stroke-linecap="round"/></g>`
}

/* ---- Objets tenus (main droite ≈ (150,168)) ---- */
function heldSVG(held: Look['held']): string {
  switch (held) {
    case 'balloon': return `<path d="M150,164 Q156,142 151,122" fill="none" stroke="${INK}" stroke-width="2"/>
      <ellipse cx="151" cy="105" rx="15" ry="18" fill="#FF6B81" stroke="#E04E63" stroke-width="2"/>
      <ellipse cx="146" cy="99" rx="4.5" ry="6" fill="#fff" opacity=".5"/>`
    case 'wand': return `<path d="M150,168 L172,122" stroke="#B97F3F" stroke-width="5" stroke-linecap="round"/>
      <path d="M176,100 L180,111 L192,112 L183,120 L186,132 L176,125 L166,132 L169,120 L160,112 L172,111 Z" fill="#FFCE3C" stroke="#D9A32A" stroke-width="2" stroke-linejoin="round"/>`
    case 'flower': return `<path d="M150,168 Q158,146 161,132" fill="none" stroke="#5EC97B" stroke-width="4" stroke-linecap="round"/>
      <g fill="#FF8FA3" stroke="#E06A82" stroke-width="1.5">
        <circle cx="161" cy="114" r="7"/><circle cx="172" cy="122" r="7"/><circle cx="168" cy="134" r="7"/>
        <circle cx="154" cy="134" r="7"/><circle cx="150" cy="122" r="7"/></g>
      <circle cx="161" cy="124" r="6" fill="#FFCE3C"/>`
    case 'icecream': return `<path d="M143,148 L159,148 L151,174 Z" fill="#E8B676" stroke="#C99457" stroke-width="2" stroke-linejoin="round"/>
      <path d="M144,146 L158,146 M146,153 L156,153" stroke="#C99457" stroke-width="1.5"/>
      <circle cx="151" cy="139" r="10" fill="#FF9CB1"/><circle cx="151" cy="127" r="8" fill="#FFF0CC"/>
      <circle cx="151" cy="118" r="3.5" fill="#E04E63"/>`
    default: return ''
  }
}

/* ---- Icônes pour les boutons du jeu Habille-toi (extraits dessinés) ---- */
export function hatIcon(hat: Look['hat']): string {
  if (hat === 'none') return `<svg viewBox="0 0 40 40" width="30" height="30"><line x1="8" y1="8" x2="32" y2="32" stroke="#C8B8A8" stroke-width="4" stroke-linecap="round"/><line x1="32" y1="8" x2="8" y2="32" stroke="#C8B8A8" stroke-width="4" stroke-linecap="round"/></svg>`
  return `<svg viewBox="58 0 84 52" width="34" height="24">${hatSVG(hat)}</svg>`
}
export function glassesIcon(g: Look['glasses']): string {
  if (g === 'none') return hatIcon('none')
  return `<svg viewBox="62 52 76 36" width="34" height="20">${glassesSVG(g)}</svg>`
}
export function heldIcon(h: Look['held']): string {
  if (h === 'none') return hatIcon('none')
  return `<svg viewBox="136 92 62 86" width="24" height="32">${heldSVG(h)}</svg>`
}
