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

/** Un cube de bois vu de trois quarts : face avant (x, y, côté w), dessus
    clair, flanc droit sombre. */
const woodCube = (x: number, y: number, w: number) => {
  const d = w * 0.22
  return `<path d="M${x} ${y}l${d} ${-d}h${w}l${-d} ${d}z" fill="${C.cream}"/>
   <path d="M${x + w} ${y}l${d} ${-d}v${w}l${-d} ${d}z" fill="${C.woodDark}"/>
   <rect x="${x}" y="${y}" width="${w}" height="${w}" rx="1.6" fill="${C.wood}"/>`
}

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

  maze: svg(`
    <rect x="5" y="5" width="38" height="38" rx="8" fill="${C.woodDark}"/>
    <path d="M24 38a14 14 0 1 1 14-14 10 10 0 1 1-10 10 6 6 0 1 0 6-6"
      fill="none" stroke="${C.cream}" stroke-width="4.6" stroke-linecap="round"/>
    <circle cx="24" cy="38" r="3.4" fill="${C.coral}"/>
    <circle cx="34" cy="24" r="2.6" fill="${C.meadow}"/>`),

  // Le Puzzle (30/09) : deux pièces emboîtées sur le plateau, une troisième qui arrive
  taquin2: svg(`
    <rect x="4" y="7" width="40" height="34" rx="6" fill="${C.woodDark}"/>
    <rect x="8" y="11" width="32" height="26" rx="3" fill="${C.cream}" opacity=".5"/>
    <path d="M8 11h14v5.2a3.2 3.2 0 1 1 0 6.4V24H8z" fill="${C.sky}"/>
    <path d="M22 11h11v13h-4.8a3.2 3.2 0 1 0-6.4 0H22v-1.4a3.2 3.2 0 1 0 0-6.4z" fill="${C.meadow}"/>
    <path d="M24.5 26h5.2a3.2 3.2 0 1 1 6.4 0h5.4v14h-17z" fill="${C.mango}" transform="rotate(-9 33 33)"/>`),

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

  /* Le Potager : la table en grille claire, un rectangle de trois rangées
     planté (une plante par rangée, comme dans le jeu) et le résultat en
     pastille corail dans son coin */
  potager: svg(`
    <rect x="5" y="5" width="38" height="38" rx="8" fill="${C.white}"/>
    ${[0, 1, 2, 3].map(i => [0, 1, 2, 3].map(j => `<rect x="${8.5 + j * 8}" y="${8.5 + i * 8}" width="7" height="7" rx="2" fill="${C.cream}"/>`).join('')).join('')}
    ${[[C.coral, 0], [C.sun, 1], [C.lilac, 2]].map(([col, i]) => [0, 1, 2].map(j => {
      const x = 12 + j * 8, y = 12 + Number(i) * 8
      return `<ellipse cx="${x}" cy="${y + 2.4}" rx="2.8" ry="1.2" fill="${C.woodDark}"/><rect x="${x - 0.5}" y="${y - 1}" width="1" height="3.2" fill="${C.meadowDark}"/><circle cx="${x}" cy="${y - 1.4}" r="2.1" fill="${col}"/>`
    }).join('')).join('')}
    <rect x="23" y="23" width="13" height="13" rx="4" fill="${C.coralDark}"/>
    <rect x="23" y="23" width="13" height="10.5" rx="4" fill="${C.coral}"/>`),

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

  /* Une plaque à picots vue de dessus : un cœur en perles à repasser, la
     moitié gauche posée, la droite en cours, l'axe lumineux entre les deux. */
  mirror: svg(`
    <rect x="4" y="7" width="40" height="38" rx="6" fill="${C.iceDark}"/>
    <rect x="4" y="6" width="40" height="37" rx="6" fill="${C.ice}"/>
    <circle cx="21" cy="12" r="1.1" fill="${C.iceDark}"/><circle cx="27" cy="12" r="1.1" fill="${C.iceDark}"/><circle cx="39" cy="12" r="1.1" fill="${C.iceDark}"/><circle cx="39" cy="18" r="1.1" fill="${C.iceDark}"/><circle cx="33" cy="24" r="1.1" fill="${C.iceDark}"/><circle cx="39" cy="24" r="1.1" fill="${C.iceDark}"/><circle cx="9" cy="30" r="1.1" fill="${C.iceDark}"/><circle cx="33" cy="30" r="1.1" fill="${C.iceDark}"/><circle cx="39" cy="30" r="1.1" fill="${C.iceDark}"/><circle cx="9" cy="36" r="1.1" fill="${C.iceDark}"/><circle cx="15" cy="36" r="1.1" fill="${C.iceDark}"/><circle cx="27" cy="36" r="1.1" fill="${C.iceDark}"/><circle cx="33" cy="36" r="1.1" fill="${C.iceDark}"/><circle cx="39" cy="36" r="1.1" fill="${C.iceDark}"/><circle cx="9" cy="42" r="1.1" fill="${C.iceDark}"/><circle cx="15" cy="42" r="1.1" fill="${C.iceDark}"/><circle cx="21" cy="42" r="1.1" fill="${C.iceDark}"/><circle cx="27" cy="42" r="1.1" fill="${C.iceDark}"/><circle cx="33" cy="42" r="1.1" fill="${C.iceDark}"/><circle cx="39" cy="42" r="1.1" fill="${C.iceDark}"/>
    <circle cx="9" cy="12" r="2.9" fill="${C.coral}"/><circle cx="9" cy="12" r="1" fill="${C.cream}"/><circle cx="15" cy="12" r="2.9" fill="${C.coral}"/><circle cx="15" cy="12" r="1" fill="${C.cream}"/><circle cx="33" cy="12" r="2.9" fill="${C.coral}"/><circle cx="33" cy="12" r="1" fill="${C.cream}"/><circle cx="9" cy="18" r="2.9" fill="${C.coral}"/><circle cx="9" cy="18" r="1" fill="${C.cream}"/><circle cx="15" cy="18" r="2.9" fill="${C.coral}"/><circle cx="15" cy="18" r="1" fill="${C.cream}"/><circle cx="21" cy="18" r="2.9" fill="${C.coral}"/><circle cx="21" cy="18" r="1" fill="${C.cream}"/><circle cx="27" cy="18" r="2.9" fill="${C.coral}"/><circle cx="27" cy="18" r="1" fill="${C.cream}"/><circle cx="33" cy="18" r="2.9" fill="${C.coral}"/><circle cx="33" cy="18" r="1" fill="${C.cream}"/><circle cx="9" cy="24" r="2.9" fill="${C.coral}"/><circle cx="9" cy="24" r="1" fill="${C.cream}"/><circle cx="15" cy="24" r="2.9" fill="${C.coral}"/><circle cx="15" cy="24" r="1" fill="${C.cream}"/><circle cx="21" cy="24" r="2.9" fill="${C.coral}"/><circle cx="21" cy="24" r="1" fill="${C.cream}"/><circle cx="27" cy="24" r="2.9" fill="${C.coral}"/><circle cx="27" cy="24" r="1" fill="${C.cream}"/><circle cx="15" cy="30" r="2.9" fill="${C.coral}"/><circle cx="15" cy="30" r="1" fill="${C.cream}"/><circle cx="21" cy="30" r="2.9" fill="${C.coral}"/><circle cx="21" cy="30" r="1" fill="${C.cream}"/><circle cx="27" cy="30" r="2.9" fill="${C.coral}"/><circle cx="27" cy="30" r="1" fill="${C.cream}"/><circle cx="21" cy="36" r="2.9" fill="${C.coral}"/><circle cx="21" cy="36" r="1" fill="${C.cream}"/>
    <rect x="23" y="4" width="2.4" height="41" rx="1.2" fill="${C.sun}"/>`),

  /* Les Cubes de l'alphabet (30/09) : trois cubes de bois empilés, a b c en
     minuscules d'imprimerie — la voyelle en rouge, les consonnes en bleu,
     comme dans le jeu. */
  letters: svg(`
    ${woodCube(5, 27, 15)}
    ${woodCube(24, 27, 15)}
    ${woodCube(14.5, 11.5, 15)}
    <circle cx="11.6" cy="35.4" r="3" fill="none" stroke="${C.coralDark}" stroke-width="2.6"/>
    <path d="M14.6 32v6.4" stroke="${C.coralDark}" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M28.6 29.6v8.8" stroke="${C.skyDark}" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="31.6" cy="35.4" r="3" fill="none" stroke="${C.skyDark}" stroke-width="2.6"/>
    <path d="M24.4 17.6a3.4 3.4 0 1 0 0 4.6" fill="none" stroke="${C.skyDark}" stroke-width="2.6" stroke-linecap="round"/>`),

  /* Une enveloppe et son tampon : le point d'exclamation dépasse du rabat. */
  sentences: svg(`
    <rect x="4" y="12" width="34" height="25" rx="3" fill="${C.cream}"/>
    <path d="M4 15l17 12 17-12v-1a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2z" fill="${C.meadow}"/>
    <path d="M4 37l13-11 4 3 4-3 13 11z" fill="${C.meadowDark}" opacity=".45"/>
    <rect x="27" y="6" width="18" height="18" rx="3" fill="${C.coralDark}"/>
    <rect x="27" y="4" width="18" height="18" rx="3" fill="${C.coral}"/>
    <rect x="34" y="7.5" width="4" height="8" rx="2" fill="${C.white}"/>
    <circle cx="36" cy="18.5" r="2.1" fill="${C.white}"/>`),

  /* ---------- Créer ---------- */
  dressup: svg(`
    <path d="M19 7h10l7 5-4 5-2-1.6V22l6 18a30 30 0 0 1-24 0l6-18v-6.6L16 17l-4-5z" fill="${C.coral}"/>
    <path d="M18 22h12l1.6 5H16.4z" fill="${C.coralDark}" opacity=".55"/>
    <circle cx="24" cy="13" r="1.7" fill="${C.cream}"/>
    <circle cx="24" cy="19" r="1.7" fill="${C.cream}"/>`),

  // Un collier de perles, un cœur en pendentif
  bijoux: svg(`
    <path d="M8 8c0 18 7 26 16 26s16-8 16-26" fill="none" stroke="${C.mango}" stroke-width="3" stroke-linecap="round"/>
    ${([[9.5, 15, C.cream], [11.5, 21.5, C.lilac], [15, 27, C.cream], [19.5, 31, C.pink], [28.5, 31, C.pink], [33, 27, C.cream], [36.5, 21.5, C.lilac], [38.5, 15, C.cream]] as [number, number, string][])
      .map(([x, y, f]) => `<circle cx="${x}" cy="${y}" r="3.6" fill="${f}"/>`).join('')}
    <path d="M24 44c-6-4.2-8.5-7-8.5-10.2a4.2 4.2 0 0 1 8.5-1.6 4.2 4.2 0 0 1 8.5 1.6c0 3.2-2.5 6-8.5 10.2z" fill="${C.coral}"/>
    <path d="M18.6 33.4a2.2 2.2 0 0 1 3.4-1" fill="none" stroke="${C.white}" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>`),

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
