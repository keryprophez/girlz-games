// La page du CODE (/acces) : c'est le père qui la voit, une fois par
// tablette (le cookie tient 400 jours). Servie par le Worker sans les
// fichiers de l'app, elle porte ses propres styles (les couleurs de
// `global.css`) et aucun script : un formulaire natif qui marche sans JS.
// Les polices de l'app (Fredoka, Baloo) sont derrière le portail : polices
// du système ici.

export type PageState = 'saisie' | 'erreur' | 'attente' | 'ferme'

const MESSAGES: Record<PageState, string> = {
  saisie: '',
  erreur: 'Ce n’est pas le bon code.',
  attente: 'Trop d’essais. Réessaie dans une minute.',
  ferme: 'La Ferme n’est pas encore ouverte : le code n’est pas posé côté Cloudflare.'
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)

const STYLE = `
:root { --paper: #FFF9F0; --ink: #45362A; --ink-soft: #8A7A6B; --card: #FFFFFF;
  --meadow: #5EC97B; --meadow-deep: #2E7D4F; --coral: #D9483B; --line: rgba(69,54,42,.14); color-scheme: light; }
* { box-sizing: border-box; }
html, body { height: 100%; }
body { margin: 0; background: var(--paper); color: var(--ink);
  font-family: ui-rounded, "SF Pro Rounded", "Segoe UI", system-ui, -apple-system, sans-serif;
  display: grid; place-items: center;
  padding: max(24px, env(safe-area-inset-top)) 20px max(24px, env(safe-area-inset-bottom)); }
main { width: 100%; max-width: 380px; display: grid; gap: 18px; justify-items: center; text-align: center;
  background: var(--card); border-radius: 28px; padding: 32px 26px;
  box-shadow: 0 1px 0 var(--line), 0 18px 40px -18px rgba(69,54,42,.35); animation: entree .35s ease-out both; }
main img { width: 84px; height: 84px; }
h1 { margin: 0; font-size: 30px; line-height: 1.1; font-weight: 800; }
p { margin: 0; color: var(--ink-soft); line-height: 1.5; }
form { width: 100%; display: grid; gap: 12px; }
input[type="password"] { width: 100%; font: inherit; font-size: 22px; text-align: center; letter-spacing: .08em;
  padding: 14px; border: 2px solid var(--line); border-radius: 16px; background: var(--paper); color: var(--ink); }
input[type="password"]:focus-visible { outline: 3px solid var(--meadow); outline-offset: 1px; border-color: transparent; }
button { font: inherit; font-weight: 800; font-size: 20px; padding: 14px; border: 0; border-radius: 16px;
  background: var(--meadow-deep); color: #fff; cursor: pointer; transition: transform .15s ease, filter .15s ease; }
button:hover { filter: brightness(1.06); }
button:active { transform: scale(.97); }
button:focus-visible { outline: 3px solid var(--ink); outline-offset: 2px; }
.message { color: var(--coral); font-weight: 700; animation: entree .25s ease-out both; }
@keyframes entree { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { main, .message { animation: none; } button { transition: none; } }
`

/** La page entière. `next` doit déjà être assaini (`safeNext`). */
export function accessPage(state: PageState, next: string): string {
  const message = MESSAGES[state]
  const form = state === 'ferme'
    ? ''
    : `<form method="post" action="/api/acces">
      <input id="code" name="code" type="password" aria-label="Code" autocomplete="current-password" required autofocus>
      <input type="hidden" name="next" value="${escapeHtml(next)}">
      <button type="submit">Entrer</button>
    </form>`
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#FFF9F0">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="manifest" href="/manifest.webmanifest">
<title>La Ferme Magique</title>
<style>${STYLE}</style>
</head>
<body>
  <main>
    <img src="/icon.svg" alt="" width="84" height="84">
    <h1>La Ferme Magique</h1>
    <p>Le code de la famille, une fois sur cette tablette.</p>
    ${message ? `<p class="message" role="alert">${message}</p>` : ''}
    ${form}
  </main>
</body>
</html>`
}
