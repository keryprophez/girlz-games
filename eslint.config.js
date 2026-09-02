// ESLint : le minimum utile — erreurs TypeScript réelles, pas de règles de style
// (le formatage reste libre, c'est un projet de jeux, pas une lib).
import js from '@eslint/js'
import ts from 'typescript-eslint'

export default ts.config(
  { ignores: ['dist/**', 'node_modules/**', 'scripts/**', '*.config.*'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      // Les jeux 3D vivent encore sur `any` (188 occurrences au 2/09) :
      // on le signale sans bloquer, la phase 1 les typera avec core/arcade.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'prefer-const': 'warn'
    }
  }
)
