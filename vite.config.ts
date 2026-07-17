import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages sert le site sous /girlz-games/
export default defineConfig({
  base: '/girlz-games/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'La Ferme Magique',
        short_name: 'Ferme Magique',
        description: 'Les jeux de Joyce et Jade',
        theme_color: '#FFF9F0',
        background_color: '#FFF9F0',
        display: 'standalone',
        // Pas de verrou portrait : le mode grand écran ⛶ est pensé pour le paysage
        orientation: 'any',
        lang: 'fr',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      }
    })
  ]
})
