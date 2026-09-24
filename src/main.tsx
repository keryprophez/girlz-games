/// <reference types="vite-plugin-pwa/client" />
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './assets/fonts/fonts.css'
import './styles/global.css'
import { startFpsProbe } from './core/fps'

/* Mise à jour PWA sans jamais couper une partie (25/09). En mode
   `autoUpdate`, le service worker rechargeait la page DÈS que la nouvelle
   version était installée, quelques secondes après l'ouverture — donc en
   plein jeu si on avait déjà lancé une partie : « ça crashe à la première
   ouverture du Potager, ensuite ça marche ». (Et le rappel qui devait
   l'éviter n'était jamais appelé dans ce mode.) Maintenant la nouvelle
   version attend (`registerType: 'prompt'`) et s'applique sur l'accueil :
   tout de suite si on y est, sinon dès le retour de la partie. */
let pending = false
let updateSW: (reload?: boolean) => Promise<void> = async () => { /* pas encore enregistré */ }
const applyUpdate = () => {
  if (!pending || document.body.classList.contains('playing')) return
  pending = false
  updateSW(true)
}
updateSW = registerSW({
  immediate: true,
  onNeedRefresh() { pending = true; applyUpdate() }
})
// `body.playing` part quand on revient à l'accueil : c'est le moment
new MutationObserver(applyUpdate).observe(document.body, { attributes: true, attributeFilter: ['class'] })

ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
// `?fps` dans l'adresse : compteur d'images pour régler la 3D sur la tablette
startFpsProbe()
