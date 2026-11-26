// Les sons et les photos viennent de l'app (public/) ; `seul.mjs` met le code dans une seule page
import { defineConfig } from 'vite'
import { resolve } from 'node:path'
export default defineConfig({ base: './', publicDir: resolve(import.meta.dirname, '../../public'), server: { host: 'localhost' } })
