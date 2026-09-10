/* Les vignettes des jeux — une illustration SVG par jeu, à la place des emoji.

   Pourquoi : l'emoji change de dessin selon la tablette, ne respecte aucune
   palette et jure avec le reste de la coquille (icônes SVG, sprites Kenney,
   3D). Une petite fille de 6 ans reconnaît son jeu à SA vignette : elle doit
   donc être stable, lisible à 46 px et dessinée dans les mêmes couleurs.

   Langage visuel commun (tenu pour les 30) :
   - `viewBox 0 0 48 48`, tout en formes PLEINES, aucun trait fin ;
   - la palette de l'app, jamais de couleur inventée ;
   - une ombre portée interne = la même couleur en plus sombre, jamais du noir ;
   - le sujet occupe le carré central 6..42 : la vignette vit dans une pastille
     ronde colorée (`.sq`), il faut de l'air autour.

   Ajouter un jeu = ajouter sa clé ici. Sans entrée, la coquille retombe sur
   l'emoji du `GameDef` (aucun écran vide). */

/* Palette — les mêmes valeurs que `global.css`, en dur pour rester lisible
   dans un SVG (une variable CSS ne traverse pas un `fill`). */
const C = {
  ink: '#45362A',
  coral: '#FF6B81',
  coralDark: '#E8574C',
  mango: '#FFA94D',
  mangoDark: '#E8873A',
  sun: '#FFD34D',
  meadow: '#5EC97B',
  meadowDark: '#3FA45E',
  leaf: '#94D82D',
  sky: '#4FB8E7',
  skyDark: '#3A93BC',
  ice: '#BFE4F6',
  iceDark: '#8CC7E8',
  lilac: '#B197FC',
  lilacDark: '#8E6FD4',
  pink: '#F58FB8',
  cream: '#FFF6E8',
  wood: '#C99A5F',
  woodDark: '#9C7340',
  white: '#FFFFFF'
} as const

const svg = (body: string) =>
  `<svg class="badge" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`

/** Un bloc de glace : sert à la Tour, réutilisé en petit ailleurs. */
const iceBlock = (x: number, y: number, w: number, h: number) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2.5" fill="${C.iceDark}"/>
   <rect x="${x}" y="${y}" width="${w}" height="${h - 2.5}" rx="2.5" fill="${C.ice}"/>
   <rect x="${x + 2}" y="${y + 1.6}" width="${w * 0.34}" height="2" rx="1" fill="${C.white}" opacity=".85"/>`

export const BADGE: Record<string, string> = {
  /* ---------- Jouer ---------- */
  icetower: svg(`
    <rect x="7" y="35" width="34" height="7" rx="2" fill="${C.skyDark}"/>
    ${iceBlock(9, 25, 30, 10)}
    ${iceBlock(15, 15, 24, 10)}
    ${iceBlock(12, 5, 18, 10)}
    <circle cx="26" cy="8" r="1.8" fill="${C.white}"/>`),

  ninja: svg(`
    <g transform="translate(-4 -3)">
      <path d="M26 6a14 14 0 0 1 12 14c0 2-1 4-2 5L20 12a14 14 0 0 1 6-6z" fill="${C.coralDark}"/>
      <path d="M26 6a14 14 0 0 0-12 14c0 2 1 4 2 5l16-13a14 14 0 0 0-6-6z" fill="${C.coral}"/>
      <path d="M24 8c0-2 2-4 5-5-1 3 0 5 1 6z" fill="${C.meadow}"/>
    </g>
    <g transform="translate(4 5)">
      <path d="M14 22c-1 2-2 5-2 8 0 8 6 13 12 13s12-5 12-13c0-3-1-6-2-8z" fill="${C.coral}"/>
      <path d="M24 43c6 0 12-5 12-13 0-3-1-6-2-8H24z" fill="${C.coralDark}"/>
    </g>
    <path d="M4 30 44 15l1.6 4.2L5.6 34.2z" fill="${C.white}" opacity=".95"/>`),

  mole: svg(`
    <ellipse cx="24" cy="37" rx="17" ry="7" fill="${C.wood}"/>
    <ellipse cx="24" cy="36" rx="12" ry="4.6" fill="${C.ink}"/>
    <g transform="rotate(22 24 22)">
      <rect x="21" y="16" width="6" height="20" rx="3" fill="${C.wood}"/>
      <rect x="12" y="7" width="24" height="12" rx="4" fill="${C.coral}"/>
      <rect x="12" y="7" width="24" height="5" rx="2.5" fill="${C.white}" opacity=".35"/>
    </g>`),

  catch: svg(`
    <circle cx="14" cy="9" r="5" fill="${C.coral}"/>
    <circle cx="32" cy="12" r="4.2" fill="${C.mango}"/>
    <path d="M13 22a11 11 0 0 1 22 0" fill="none" stroke="${C.woodDark}" stroke-width="2.6"/>
    <path d="M8 23h32l-4 16a4 4 0 0 1-4 3H16a4 4 0 0 1-4-3z" fill="${C.wood}"/>
    <path d="M18 26l1.6 15M30 26l-1.6 15M11 31h26M12.6 37h22.8" stroke="${C.woodDark}" stroke-width="1.8" stroke-linecap="round" opacity=".75"/>
    <rect x="6" y="20" width="36" height="5" rx="2.5" fill="${C.woodDark}"/>`),

  caterpillar: svg(`
    <circle cx="12" cy="30" r="7" fill="${C.meadowDark}"/>
    <circle cx="22" cy="27" r="8" fill="${C.meadow}"/>
    <circle cx="33" cy="22" r="9" fill="${C.leaf}"/>
    <circle cx="30" cy="19" r="1.9" fill="${C.ink}"/>
    <circle cx="37" cy="18" r="1.9" fill="${C.ink}"/>
    <path d="M31 12c-1-3 0-5 2-6M38 12c0-3 1-4 3-5" stroke="${C.meadowDark}" stroke-width="2" fill="none" stroke-linecap="round"/>`),

  run: svg(`
    <rect x="16" y="12" width="18" height="12" rx="3" fill="${C.meadow}"/>
    <rect x="8" y="21" width="32" height="10" rx="3" fill="${C.meadowDark}"/>
    <rect x="19" y="14" width="12" height="7" rx="2" fill="${C.ice}"/>
    <circle cx="15" cy="34" r="7" fill="${C.ink}"/>
    <circle cx="15" cy="34" r="3" fill="${C.cream}"/>
    <circle cx="34" cy="35" r="5.5" fill="${C.ink}"/>
    <circle cx="34" cy="35" r="2.3" fill="${C.cream}"/>`),

  flappy: svg(`
    <circle cx="26" cy="24" r="13" fill="${C.sun}"/>
    <circle cx="30" cy="20" r="2.3" fill="${C.ink}"/>
    <path d="M37 24l7 3-7 3z" fill="${C.mango}"/>
    <path d="M10 18c6-4 12-1 13 5-6 4-12 2-13-5z" fill="${C.mango}"/>
    <path d="M20 36c1 3 4 5 7 5" stroke="${C.mangoDark}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`),

  maze: svg(`
    <rect x="5" y="5" width="38" height="38" rx="8" fill="${C.woodDark}"/>
    <path d="M24 38a14 14 0 1 1 14-14 10 10 0 1 1-10 10 6 6 0 1 0 6-6"
      fill="none" stroke="${C.cream}" stroke-width="4.6" stroke-linecap="round"/>
    <circle cx="24" cy="38" r="3.4" fill="${C.coral}"/>
    <circle cx="34" cy="24" r="2.6" fill="${C.meadow}"/>`),

  taquin2: svg(`
    <rect x="6" y="6" width="36" height="36" rx="6" fill="${C.woodDark}"/>
    <rect x="10" y="10" width="13" height="13" rx="2.5" fill="${C.mango}"/>
    <rect x="25" y="10" width="13" height="13" rx="2.5" fill="${C.sky}"/>
    <rect x="10" y="25" width="13" height="13" rx="2.5" fill="${C.meadow}"/>
    <rect x="27" y="27" width="9" height="9" rx="2" fill="${C.cream}" opacity=".45"/>`),

  memory: svg(`
    <rect x="6" y="12" width="18" height="26" rx="4" fill="${C.lilacDark}" transform="rotate(-8 15 25)"/>
    <rect x="24" y="10" width="18" height="26" rx="4" fill="${C.cream}"/>
    <circle cx="33" cy="20" r="4" fill="${C.coral}"/>
    <path d="M27 32c3-5 9-5 12 0z" fill="${C.meadow}"/>`),

  simon: svg(`
    <path d="M23 6A18 18 0 0 0 6 23h17z" fill="${C.meadow}"/>
    <path d="M25 6a18 18 0 0 1 17 17H25z" fill="${C.coral}"/>
    <path d="M23 25H6a18 18 0 0 0 17 17z" fill="${C.sun}"/>
    <path d="M25 25h17A18 18 0 0 1 25 42z" fill="${C.sky}"/>
    <circle cx="24" cy="24" r="5" fill="${C.cream}"/>`),

  stand3d: svg(`
    <circle cx="24" cy="22" r="15" fill="${C.cream}"/>
    <circle cx="24" cy="22" r="11" fill="${C.coral}"/>
    <circle cx="24" cy="22" r="7" fill="${C.cream}"/>
    <circle cx="24" cy="22" r="3.4" fill="${C.coralDark}"/>
    <circle cx="35" cy="36" r="6" fill="${C.mango}"/>
    <circle cx="33" cy="34" r="1.8" fill="${C.white}" opacity=".7"/>`),

  connect4: svg(`
    <rect x="6" y="10" width="36" height="32" rx="5" fill="${C.sky}"/>
    <circle cx="15" cy="20" r="4.6" fill="${C.cream}"/>
    <circle cx="24" cy="20" r="4.6" fill="${C.sun}"/>
    <circle cx="33" cy="20" r="4.6" fill="${C.cream}"/>
    <circle cx="15" cy="32" r="4.6" fill="${C.coral}"/>
    <circle cx="24" cy="32" r="4.6" fill="${C.coral}"/>
    <circle cx="33" cy="32" r="4.6" fill="${C.sun}"/>`),

  /* ---------- Apprendre ---------- */
  clock: svg(`
    <circle cx="24" cy="24" r="17" fill="${C.cream}"/>
    <circle cx="24" cy="24" r="17" fill="none" stroke="${C.mango}" stroke-width="3.4"/>
    <path d="M24 13v11l8 5" stroke="${C.ink}" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="24" cy="24" r="2.2" fill="${C.coral}"/>`),

  tables: svg(`
    <rect x="6" y="8" width="36" height="32" rx="5" fill="${C.meadowDark}"/>
    <rect x="10" y="12" width="28" height="24" rx="3" fill="${C.cream}"/>
    <path d="M17 19l14 10M31 19L17 29" stroke="${C.lilacDark}" stroke-width="4" stroke-linecap="round"/>`),

  addboard: svg(`
    <rect x="6" y="8" width="36" height="32" rx="5" fill="${C.meadowDark}"/>
    <rect x="10" y="12" width="28" height="24" rx="3" fill="${C.cream}"/>
    <path d="M24 17v14M17 24h14" stroke="${C.sky}" stroke-width="4.4" stroke-linecap="round"/>`),

  market: svg(`
    <ellipse cx="17" cy="34" rx="12" ry="5" fill="${C.mangoDark}"/>
    <rect x="5" y="26" width="24" height="8" fill="${C.mangoDark}"/>
    <ellipse cx="17" cy="26" rx="12" ry="5" fill="${C.sun}"/>
    <ellipse cx="17" cy="26" rx="7" ry="2.8" fill="${C.mango}"/>
    <path d="M30 6h11v11L27 31 16 20z" fill="${C.coral}"/>
    <circle cx="36" cy="12" r="2.6" fill="${C.cream}"/>`),

  intrus: svg(`
    <circle cx="13" cy="17" r="6.5" fill="${C.sky}"/>
    <circle cx="30" cy="15" r="6.5" fill="${C.sky}"/>
    <circle cx="16" cy="33" r="6.5" fill="${C.sky}"/>
    <path d="M33 25l7 12H26z" fill="${C.coral}"/>
    <circle cx="33" cy="32" r="11" fill="none" stroke="${C.mango}" stroke-width="2.6"/>`),

  geo: svg(`
    <circle cx="24" cy="24" r="17" fill="${C.sky}"/>
    <path d="M11 18c5 3 9 2 12 5s-1 6 1 9 6 1 9-2" stroke="${C.meadow}" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M24 7c5 5 5 29 0 34M7 24h34" stroke="${C.white}" stroke-width="1.8" fill="none" opacity=".55"/>`),

  space: svg(`
    <path d="M24 6c6 5 9 12 9 20l-4 7H19l-4-7c0-8 3-15 9-20z" fill="${C.cream}"/>
    <circle cx="24" cy="21" r="4.5" fill="${C.sky}"/>
    <path d="M15 27l-6 7h7zM33 27l6 7h-7z" fill="${C.coral}"/>
    <path d="M20 33h8l-4 8z" fill="${C.mango}"/>
    <circle cx="9" cy="12" r="2" fill="${C.sun}"/>
    <circle cx="40" cy="17" r="1.6" fill="${C.sun}"/>`),

  patterns: svg(`
    <circle cx="12" cy="17" r="6" fill="${C.coral}"/>
    <rect x="21" y="11" width="12" height="12" rx="3" fill="${C.sky}"/>
    <circle cx="12" cy="34" r="6" fill="${C.coral}"/>
    <rect x="21" y="28" width="12" height="12" rx="3" fill="${C.cream}"/>
    <path d="M39 30v3M39 36v.1" stroke="${C.mango}" stroke-width="4" stroke-linecap="round"/>`),

  mirror: svg(`
    <path d="M8 12h14v10H8zM8 26h14v10H8z" fill="${C.coral}"/>
    <path d="M26 12h14v10H26zM26 26h14v10H26z" fill="${C.ice}"/>
    <path d="M24 6v36" stroke="${C.mango}" stroke-width="2.6" stroke-dasharray="4 3" stroke-linecap="round"/>`),

  letters: svg(`
    <rect x="5" y="13" width="20" height="22" rx="4" fill="${C.cream}"/>
    <rect x="26" y="16" width="17" height="19" rx="4" fill="${C.meadow}"/>
    <path d="M11 30l4-12 4 12M12.5 26h5" stroke="${C.coral}" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M31 30V20h4a3 3 0 0 1 0 6h-4h4.4a3 3 0 0 1 0 6z" fill="${C.cream}"/>`),

  /* ---------- Créer ---------- */
  snowman: svg(`
    <circle cx="24" cy="33" r="10" fill="${C.white}"/>
    <circle cx="24" cy="18" r="7" fill="${C.white}"/>
    <rect x="16" y="8" width="16" height="4" rx="1.5" fill="${C.ink}"/>
    <rect x="19" y="2" width="10" height="7" rx="2" fill="${C.ink}"/>
    <circle cx="21.5" cy="17" r="1.5" fill="${C.ink}"/>
    <circle cx="26.5" cy="17" r="1.5" fill="${C.ink}"/>
    <path d="M24 19l5 2-5 2z" fill="${C.mango}"/>
    <circle cx="24" cy="30" r="1.6" fill="${C.ink}"/>
    <circle cx="24" cy="36" r="1.6" fill="${C.ink}"/>`),

  dressup: svg(`
    <path d="M19 7h10l7 5-4 5-2-1.6V22l6 18a30 30 0 0 1-24 0l6-18v-6.6L16 17l-4-5z" fill="${C.coral}"/>
    <path d="M18 22h12l1.6 5H16.4z" fill="${C.coralDark}" opacity=".55"/>
    <circle cx="24" cy="13" r="1.7" fill="${C.cream}"/>
    <circle cx="24" cy="19" r="1.7" fill="${C.cream}"/>`),

  beatbox: svg(`
    <rect x="6" y="12" width="36" height="24" rx="5" fill="${C.lilacDark}"/>
    <rect x="10" y="16" width="7" height="7" rx="2" fill="${C.coral}"/>
    <rect x="20" y="16" width="7" height="7" rx="2" fill="${C.cream}"/>
    <rect x="30" y="16" width="7" height="7" rx="2" fill="${C.sun}"/>
    <rect x="10" y="26" width="7" height="7" rx="2" fill="${C.cream}"/>
    <rect x="20" y="26" width="7" height="7" rx="2" fill="${C.sky}"/>
    <rect x="30" y="26" width="7" height="7" rx="2" fill="${C.cream}"/>`),

  piano: svg(`
    <rect x="6" y="12" width="36" height="26" rx="4" fill="${C.cream}"/>
    <path d="M15 12v26M24 12v26M33 12v26" stroke="${C.woodDark}" stroke-width="1.6"/>
    <rect x="11" y="12" width="6" height="15" rx="2" fill="${C.ink}"/>
    <rect x="21" y="12" width="6" height="15" rx="2" fill="${C.ink}"/>
    <rect x="30" y="12" width="6" height="15" rx="2" fill="${C.ink}"/>
    <rect x="6" y="8" width="36" height="5" rx="2.5" fill="${C.coral}"/>`),

  fireworks: svg(`
    <circle cx="24" cy="24" r="3.4" fill="${C.sun}"/>
    <path d="M24 6v8M24 34v8M6 24h8M34 24h8M11 11l6 6M31 31l6 6M37 11l-6 6M17 31l-6 6"
      stroke="${C.coral}" stroke-width="3.4" stroke-linecap="round"/>
    <circle cx="24" cy="8" r="2.2" fill="${C.mango}"/>
    <circle cx="8" cy="24" r="2.2" fill="${C.lilac}"/>
    <circle cx="40" cy="24" r="2.2" fill="${C.sky}"/>
    <circle cx="24" cy="40" r="2.2" fill="${C.meadow}"/>`),

  coloring: svg(`
    <path d="M30 6l12 12-16 16-12-12z" fill="${C.mango}"/>
    <path d="M30 6l12 12-8 8-12-12z" fill="${C.sun}"/>
    <path d="M14 22l12 12-9 5-8-8z" fill="${C.cream}"/>
    <path d="M9 31l8 8-9 3z" fill="${C.ink}"/>
    <circle cx="38" cy="38" r="4.5" fill="${C.coral}"/>
    <circle cx="29" cy="42" r="3" fill="${C.sky}"/>`),

  pizza: svg(`
    <path d="M24 5c10 0 19 8 19 19 0 13-9 19-19 19S5 37 5 24C5 13 14 5 24 5z" fill="${C.wood}"/>
    <path d="M24 10c8 0 14 6 14 14 0 10-6 14-14 14s-14-4-14-14c0-8 6-14 14-14z" fill="${C.sun}"/>
    <circle cx="19" cy="20" r="3" fill="${C.coralDark}"/>
    <circle cx="30" cy="24" r="3" fill="${C.coralDark}"/>
    <circle cx="22" cy="31" r="3" fill="${C.coralDark}"/>
    <circle cx="31" cy="15" r="2.2" fill="${C.meadow}"/>
    <circle cx="15" cy="28" r="2.2" fill="${C.meadow}"/>`)
}

/** Les trois univers de l'accueil, dessinés eux aussi. */
export const WORLD_BADGE: Record<string, string> = {
  jouer: svg(`<path d="M27 4 10 27h11l-3 17 20-24H27z" fill="${C.mango}"/>`),
  apprendre: svg(`
    <path d="M6 10c6-3 12-3 18 1v30c-6-4-12-4-18-1z" fill="${C.sky}"/>
    <path d="M42 10c-6-3-12-3-18 1v30c6-4 12-4 18-1z" fill="${C.skyDark}"/>`),
  creer: svg(`
    <path d="M24 6c10 0 18 7 18 15 0 6-5 8-9 8h-4c-3 0-5 2-5 4 0 3 2 3 2 6 0 2-2 3-4 3-9 0-16-8-16-18S14 6 24 6z" fill="${C.cream}"/>
    <circle cx="16" cy="17" r="3" fill="${C.coral}"/>
    <circle cx="26" cy="13" r="3" fill="${C.mango}"/>
    <circle cx="34" cy="20" r="3" fill="${C.sky}"/>
    <circle cx="15" cy="27" r="3" fill="${C.meadow}"/>`)
}
