/// <reference types="vite-plugin-pwa/client" />
import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './assets/fonts/fonts.css'
import './styles/global.css'
import { toast } from './core/utils'

/* Mise à jour PWA sans friction : si une nouvelle version est détectée juste
   après l'ouverture, on l'applique tout de suite (rechargement invisible).
   Si elle arrive plus tard (app restée ouverte), on prévient sans couper
   une partie en cours. */
const openedAt = Date.now()
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    if (Date.now() - openedAt < 15000) updateSW(true)
    else toast('🌟 Nouvelle version prête — ferme et rouvre le jeu !')
  }
})

ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
