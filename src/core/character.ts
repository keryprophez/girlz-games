/* Système de personnage illustré — SVG dessiné main, cohérent dans toute l'app.
   La photo de la joueuse est détourée en ovale et devient le VISAGE d'un vrai
   personnage (cheveux, corps, habits dessinés). Le look choisi dans Habille-toi
   est persisté et suit la joueuse dans les autres jeux. */

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

const SKIN = '#F6C99F'
const INK = '#45362A'

/** Assombrit une couleur hexadécimale (f entre 0 et 1). */
export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.round(((n >> 16) & 255) * (1 - f))
  const g = Math.round(((n >> 8) & 255) * (1 - f))
  const b = Math.round((n & 255) * (1 - f))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

let uid = 0

/* ---- Tête : photo détourée en ovale, cheveux dessinés autour ----
   Coordonnées de référence : tête centrée en (100,72), rx32 ry36, haut y=36. */
function headSVG(photo: string | null, look: Look): string {
  const id = 'face' + ++uid
  const hc = look.hairColor, hcd = shade(hc, 0.2)
  const back = look.hair === 'pigtails'
    ? `<circle cx="58" cy="62" r="15" fill="${hc}"/><circle cx="142" cy="62" r="15" fill="${hc}"/>
       <circle cx="58" cy="62" r="15" fill="none" stroke="${hcd}" stroke-width="2"/>
       <circle cx="142" cy="62" r="15" fill="none" stroke="${hcd}" stroke-width="2"/>
       <circle cx="66" cy="52" r="4.5" fill="#FF6B81"/><circle cx="134" cy="52" r="4.5" fill="#FF6B81"/>`
    : `<path d="M62,70 Q56,150 74,158 L126,158 Q144,150 138,70 Q138,30 100,27 Q62,30 62,70 Z" fill="${hc}" stroke="${hcd}" stroke-width="2"/>`
  const face = photo
    ? `<clipPath id="${id}"><ellipse cx="100" cy="72" rx="29" ry="33"/></clipPath>
       <ellipse cx="100" cy="72" rx="32" ry="36" fill="${SKIN}"/>
       <image href="${photo}" x="67" y="35" width="66" height="74" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`
    : `<ellipse cx="100" cy="72" rx="32" ry="36" fill="${SKIN}"/>
       <circle cx="88" cy="68" r="3.6" fill="${INK}"/><circle cx="112" cy="68" r="3.6" fill="${INK}"/>
       <path d="M90,84 Q100,92 110,84" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
       <circle cx="78" cy="80" r="5" fill="#FF9C8F" opacity=".55"/><circle cx="122" cy="80" r="5" fill="#FF9C8F" opacity=".55"/>`
  const fringe = `<path d="M67,60 Q69,32 100,30 Q131,32 133,60 Q116,44 100,45 Q84,44 67,60 Z" fill="${hc}" stroke="${hcd}" stroke-width="2" stroke-linejoin="round"/>`
  return back + face + fringe
}

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

/* ---- Corps + habits ---- */
function bodySVG(look: Look): string {
  const c = look.color, cd = shade(c, 0.22)
  const arms = `<path d="M78,124 Q52,142 50,166" fill="none" stroke="${SKIN}" stroke-width="11" stroke-linecap="round"/>
    <path d="M122,124 Q148,142 150,166" fill="none" stroke="${SKIN}" stroke-width="11" stroke-linecap="round"/>
    <circle cx="50" cy="167" r="7" fill="${SKIN}"/><circle cx="150" cy="167" r="7" fill="${SKIN}"/>`
  const legs = `<path d="M87,214 L87,250 M113,214 L113,250" stroke="${SKIN}" stroke-width="12" stroke-linecap="round"/>
    <ellipse cx="85" cy="258" rx="12" ry="7.5" fill="${cd}"/><ellipse cx="115" cy="258" rx="12" ry="7.5" fill="${cd}"/>`
  const neck = `<rect x="94" y="100" width="12" height="12" fill="${SKIN}"/>`
  let clothes: string
  if (look.outfit === 'dress') {
    clothes = `<path d="M79,114 Q100,105 121,114 L137,206 Q139,215 129,215 L71,215 Q61,215 63,206 Z"
        fill="${c}" stroke="${cd}" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M70,168 Q100,178 130,168" fill="none" stroke="${cd}" stroke-width="2.5" opacity=".6"/>
      <circle cx="100" cy="128" r="3" fill="${cd}"/><circle cx="100" cy="142" r="3" fill="${cd}"/>
      <ellipse cx="78" cy="120" rx="9" ry="7" fill="${c}" stroke="${cd}" stroke-width="2"/>
      <ellipse cx="122" cy="120" rx="9" ry="7" fill="${c}" stroke="${cd}" stroke-width="2"/>`
  } else {
    clothes = `<rect x="74" y="110" width="52" height="56" rx="11" fill="${c}" stroke="${cd}" stroke-width="2.5"/>
      <circle cx="100" cy="136" r="9" fill="#fff" opacity=".85"/>
      <path d="M96,136 L99,140 L106,132" fill="none" stroke="${cd}" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M71,162 L129,162 L139,204 Q141,211 132,211 L68,211 Q59,211 61,204 Z"
        fill="${cd}" stroke="${shade(c, 0.38)}" stroke-width="2.5" stroke-linejoin="round"/>`
  }
  return neck + legs + arms + clothes
}

/** Le personnage complet (viewBox 0 0 200 300). */
export function characterSVG(photo: string | null, look: Look, widthPx: number): string {
  return `<svg viewBox="0 0 200 300" width="${widthPx}" height="${widthPx * 1.5}" xmlns="http://www.w3.org/2000/svg">
    ${bodySVG(look)}
    ${headSVG(photo, look)}
    ${glassesSVG(look.glasses)}
    ${hatSVG(look.hat)}
    ${heldSVG(look.held)}
  </svg>`
}

/* Aligne un accessoire de tête (dessiné pour la tête de référence : centre x=100,
   haut y=36) sur une tête placée en (cx, topY) avec un rayon différent. */
function fitHead(inner: string, cx: number, topY: number, s: number): string {
  if (!inner) return ''
  return `<g transform="translate(${cx - 100 * s},${topY - 36 * s}) scale(${s})">${inner}</g>`
}

/* Tête compacte réutilisable (photo ovale + frange + chapeau/lunettes du look). */
function miniHead(photo: string | null, look: Look | null, cx: number, cy: number, r: number): string {
  const lk = look || defaultLook()
  const s = r / 32
  const topY = cy - 36 * s
  const inner = headSVG(photo, lk) + glassesSVG(lk.glasses) + hatSVG(lk.hat)
  return `<g transform="translate(${cx - 100 * s},${cy - 72 * s}) scale(${s})">${inner}</g>`
}

/** Poussin dessiné avec le visage de la joueuse (viewBox 0 0 120 130). */
export function chickSVG(photo: string | null, look: Look | null, widthPx: number): string {
  return `<svg viewBox="0 0 120 130" width="${widthPx}" height="${widthPx * 1.08}" xmlns="http://www.w3.org/2000/svg">
    <path d="M18,88 Q4,80 8,66 Q20,72 26,80 Z" fill="#F2BE3C"/>
    <circle cx="62" cy="88" r="32" fill="#FFD44D" stroke="#E8B923" stroke-width="3"/>
    <ellipse class="wing" cx="38" cy="88" rx="15" ry="10" fill="#F2BE3C" stroke="#D9A32A" stroke-width="2"/>
    <path d="M92,84 L108,88 L92,94 Z" fill="#FFA94D" stroke="#E08A2E" stroke-width="2" stroke-linejoin="round"/>
    <path d="M52,118 L52,126 M72,118 L72,126" stroke="#E08A2E" stroke-width="4" stroke-linecap="round"/>
    ${miniHead(photo, look, 62, 44, 21)}
  </svg>`
}

/** Tracteur dessiné conduit par la joueuse (viewBox 0 0 170 130). */
export function tractorSVG(photo: string | null, look: Look | null, widthPx: number): string {
  return `<svg viewBox="0 0 170 130" width="${widthPx}" height="${widthPx * 0.76}" xmlns="http://www.w3.org/2000/svg">
    ${miniHead(photo, look, 62, 38, 18)}
    <rect x="40" y="60" width="14" height="16" fill="#F6C99F"/>
    <rect x="24" y="66" width="76" height="34" rx="8" fill="#E4573D" stroke="#B93E2C" stroke-width="3"/>
    <rect x="96" y="76" width="52" height="26" rx="6" fill="#E4573D" stroke="#B93E2C" stroke-width="3"/>
    <rect x="130" y="56" width="9" height="24" rx="3" fill="#8A7A6B"/>
    <rect x="100" y="80" width="20" height="9" rx="3" fill="#FFCE3C"/>
    <circle cx="48" cy="102" r="24" fill="#3D3D3D" stroke="#242424" stroke-width="3"/>
    <circle cx="48" cy="102" r="10" fill="#C9C9C9"/>
    <circle cx="130" cy="108" r="16" fill="#3D3D3D" stroke="#242424" stroke-width="3"/>
    <circle cx="130" cy="108" r="6.5" fill="#C9C9C9"/>
    <path d="M84,64 Q94,54 96,66" fill="none" stroke="#242424" stroke-width="4" stroke-linecap="round"/>
  </svg>`
}

/** Panier de récolte avec la joueuse dedans (viewBox 0 0 120 116). */
export function basketSVG(photo: string | null, look: Look | null, widthPx: number): string {
  return `<svg viewBox="0 0 120 116" width="${widthPx}" height="${widthPx * 0.97}" xmlns="http://www.w3.org/2000/svg">
    ${miniHead(photo, look, 60, 34, 20)}
    <path d="M22,58 L98,58 L88,106 Q87,112 80,112 L40,112 Q33,112 32,106 Z" fill="#D9A05B" stroke="#B97F3F" stroke-width="3" stroke-linejoin="round"/>
    <path d="M30,70 L90,70 M28,84 L92,84 M31,98 L89,98 M44,60 L40,110 M60,60 L60,112 M76,60 L80,110" stroke="#B97F3F" stroke-width="2" opacity=".7"/>
    <rect x="16" y="50" width="88" height="12" rx="6" fill="#B97F3F" stroke="#96632F" stroke-width="2.5"/>
  </svg>`
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
