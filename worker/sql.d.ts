/* @version 2026-11-26 16:53 */
// Un fichier SQL lu comme du texte (Vite, `?raw`) : seuls les tests du Worker
// s'en servent, pour appliquer les migrations à la base locale du banc.
declare module '*.sql?raw' {
  const sql: string
  export default sql
}
