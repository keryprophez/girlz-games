// La route de « MON DESSIN PREND VIE » (`POST /api/vivant`, 18/10) : la
// Ferme à construire envoie le dessin de son animal, le Worker le montre à
// Claude et renvoie sa fiche revérifiée (allure, regard, cri, taille) — la
// même porte et le même appel que le devineur (`devine.ts`), la même clé.
// Rien n'est gardé ici.
import { parseVivant, SCHEMA, systemPrompt, USER_PROMPT, type Vivant } from '../src/core/vivant'
import { GuessFailure } from '../src/core/drawguess'
import { askModel, failed, json, readDrawing, type DevineEnv } from './devine'

/** Montre le dessin à Claude et rend la fiche (remplacé dans les tests). */
export type AskVivant = (key: string, png: string) => Promise<Vivant>

export async function vivant(request: Request, env: DevineEnv, ask: AskVivant = askVivantClaude): Promise<Response> {
  const got = await readDrawing(request, env)
  if (got instanceof Response) return got
  try {
    const v = await ask(got.key, got.body.png)
    // La même forme que la fiche imposée : le jeu la revérifie avec `parseVivant`
    return json({ ...v, cri: v.cri ?? 'aucun' })
  } catch (e) {
    return failed(e, 'Vivant')
  }
}

export async function askVivantClaude(key: string, png: string, fetchImpl?: typeof fetch): Promise<Vivant> {
  const raw = await askModel(key, { system: systemPrompt(), schema: SCHEMA, png, text: USER_PROMPT, maxTokens: 1000 }, fetchImpl)
  const v = parseVivant(raw)
  if (!v) throw new GuessFailure('autre')
  return v
}
