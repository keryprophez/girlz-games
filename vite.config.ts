import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Le Worker Cloudflare sert le site à la racine (9/10 : plus de GitHub
// Pages, qui le servait sous /girlz-games/)
export default defineConfig({
  base: '/',
  build: {
    // Le code de l'app dans /app/ (derrière le code d'accès), les médias de
    // public/assets/ dans /assets/ (servis sans le Worker) : voir wrangler.jsonc
    assetsDir: 'app'
  },
  plugins: [
    react(),
    VitePWA({
      // `prompt` : la nouvelle version ATTEND, et main.tsx l'applique sur
      // l'accueil — jamais en pleine partie (25/09, voir main.tsx)
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      workbox: {
        // Le portail et l'API vont toujours au réseau : sans ça, le service
        // worker répondrait la page de l'app à la place de la page du code
        navigateFallbackDenylist: [/^\/acces/, /^\/api\//]
      },
      manifest: {
        name: 'La Ferme Magique',
        short_name: 'Ferme Magique',
        description: 'Les jeux de Joyce et Jade',
        theme_color: '#FFF9F0',
        background_color: '#FFF9F0',
        display: 'fullscreen', // installée sur l'écran d'accueil : plein écran natif, sans message du navigateur
        // Tout en paysage (décision du 2/09) : la tablette est posée ainsi pour la 3D
        orientation: 'landscape',
        lang: 'fr',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      }
    })
  ]
})
