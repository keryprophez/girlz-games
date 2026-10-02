import { describe, expect, it } from 'vitest'
import { CFG, Pinball, autoPilot, flipperTip, TABLE, R, LEFT, type PinCfg, type PinEvent } from './pinball'

/* Le Flipper de la grange : la physique de la bille, jouée hors navigateur.
   `npm test` n'en garde que l'essentiel (quelques secondes). Les grandes
   séries du pilote : `npm run sim:flipper` (PB_SIM=1 : 1 200 parties du
   scénario du bot, les statistiques par niveau) ; PB_SIMS, PB_SKILL,
   PB_MAXT, PB_CAD, PB_BOT pour les régler, PB_STATS=<fichier> pour le
   rapport. */

/** Les variables d'environnement, sans les types de Node (le projet ne les a pas). */
const ENV: Record<string, string | undefined> = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}
const BIG = !!ENV.PB_SIM
const SIMS = Number(ENV.PB_SIMS || 6)

/** Un générateur pseudo-aléatoire reproductible. */
function seeded(seed: number) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

/** Une cadence d'affichage : 60 i/s, 20 i/s (tablette qui peine), ou saccadée. */
const CADENCES: [string, (r: () => number) => number][] = [
  ['60 i/s', () => 1 / 60],
  ['20 i/s', () => 1 / 20],
  ['saccadé', r => (r() < 0.15 ? 0.1 : 1 / 30 + r() * 0.03)]
]

interface Run {
  time: number; drains: number; bumpers: number; flips: number; ramps: number; eggs: number
  slings: number; saves: number; near: number; combo: number; stuck: number; out: boolean; score: number; multis: number
}

/** Une partie au pilote, avec les règles du jeu qui touchent à la bille :
    vies, multibille à la série, nouvelle bille sur le ressort. */
function play(cfg: PinCfg, seed: number, cadence: (r: () => number) => number, o: { lives?: number; maxT?: number; multiAt?: number; skill?: number } = {}): Run {
  const r = seeded(seed)
  const sim = new Pinball(cfg, seeded(seed * 7 + 3))
  sim.pilot = autoPilot({ launch: true, skill: o.skill, rnd: seeded(seed * 31 + 11) })
  sim.serve()
  let lives = o.lives ?? 3
  const run: Run = { time: 0, drains: 0, bumpers: 0, flips: 0, ramps: 0, eggs: 0, slings: 0, saves: 0, near: 0, combo: 0, stuck: 0, out: false, score: 0, multis: 0 }
  let combo = 0, lastHit = 0, armed = true
  const maxT = o.maxT ?? 400
  const multiAt = o.multiAt ?? 10
  let serveAt = -1
  while (sim.t < maxT) {
    sim.update(cadence(r))
    for (const b of sim.balls) {
      if (!Number.isFinite(b.x) || !Number.isFinite(b.y) || b.x < -3.2 || b.x > 3.9 || b.y > 11.2 || (b.st === 'table' && b.y < -1)) run.out = true
    }
    const hit = (p: number) => { combo++; run.score += p * Math.min(5, 1 + Math.floor(combo / 3)); lastHit = sim.t; run.combo = Math.max(run.combo, combo) }
    for (const e of sim.events.splice(0) as PinEvent[]) {
      switch (e.k) {
        case 'bumper': run.bumpers++; hit(10); break
        case 'sling': run.slings++; break
        case 'flipHit': if (e.v > 3) run.flips++; break
        case 'target': hit(25); break
        case 'targets': run.eggs++; hit(150); break
        case 'barn': run.ramps++; hit(100); break
        case 'save': run.saves++; break
        case 'near': run.near++; break
        case 'nudge': run.stuck++; break
        case 'drain':
          if (e.left === 0) {
            run.drains++; lives--; combo = 0; armed = true
            if (lives <= 0) { run.time = sim.t; return run }
            serveAt = sim.t + 1
          }
          break
      }
    }
    if (combo > 0 && sim.t - lastHit > 4) combo = 0
    if (armed && combo >= multiAt && sim.inPlay().length === 1) { armed = false; run.multis++; sim.release(2) }
    // Le multibille fini et la série retombée : il peut revenir
    if (!armed && combo === 0 && sim.inPlay().length <= 1) armed = true
    if (serveAt > 0 && sim.t >= serveAt) { serveAt = -1; sim.serve() }
  }
  run.time = sim.t
  return run
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const quant = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(q * (s.length - 1))] }

describe('le flipper de la grange : la physique', () => {
  it('un lancer, même bref, sort la bille du couloir et la met en jeu', () => {
    for (const cfg of Object.values(CFG)) {
      for (const pull of [0, 0.5, 1]) {
        const sim = new Pinball(cfg, seeded(1))
        sim.serve()
        sim.plunger(true)
        sim.update(pull * 0.75)
        sim.plunger(false)
        let left = false
        for (let i = 0; i < 300 && !left; i++) {
          sim.update(1 / 60)
          const b = sim.balls[0]
          if (b && b.st === 'table' && b.x < TABLE.laneL - 0.1) left = true
        }
        expect(left).toBe(true)
      }
    }
  })

  it('la bille ne traverse jamais un batteur qui se lève, même lancée vite', () => {
    const sim = new Pinball(CFG.exp, seeded(2))
    const f = sim.flippers[LEFT]
    for (let k = 0; k < 400; k++) {
      sim.balls = []
      sim.setFlipper(LEFT, false)
      for (let i = 0; i < 200; i++) sim.step(1 / 480) // retombé
      // Une bille qui fonce sur le batteur, du dessus, à un endroit tiré au sort
      const u = 0.25 + (k % 20) / 20 * 0.75
      const tip = flipperTip(f)
      const px = f.px + (tip.x - f.px) * u, py = f.py + (tip.y - f.py) * u
      const b = (sim as unknown as { ball: (st: string, x: number, y: number) => import('./pinball').Ball }).ball('table', px + 0.3, py + 0.6)
      const sp = 6 + (k % 7) * 3
      b.vx = -0.3 * sp; b.vy = -sp
      // Le batteur part à un moment différent à chaque essai
      const at = (k % 9) * 0.004
      for (let i = 0; i < 240; i++) {
        if (i * (1 / 480) >= at) sim.setFlipper(LEFT, true)
        sim.step(1 / 480)
        // Toujours du bon côté de la ligne du batteur
        const t2 = flipperTip(f)
        const side = (t2.x - f.px) * (b.y - f.py) - (t2.y - f.py) * (b.x - f.px)
        const along = ((b.x - f.px) * (t2.x - f.px) + (b.y - f.py) * (t2.y - f.py)) / (f.len * f.len)
        if (along > 0.05 && along < 0.95 && b.st === 'table') expect(side).toBeGreaterThan(0)
      }
    }
  })

  it('aucune bille ne sort de la table, ne reste coincée ni ne devient NaN', () => {
    for (const [name, cad] of CADENCES) {
      for (const tier of ['easy', 'med', 'exp'] as const) {
        for (let k = 0; k < (BIG ? Math.max(4, SIMS / 10) : 1); k++) {
          const run = play(CFG[tier], 1000 + k, cad, { maxT: BIG ? 120 : 30 })
          expect(run.out, `${tier} ${name} #${k}`).toBe(false)
        }
      }
    }
  }, 120000)

  it.skipIf(!BIG)('le pilote joue de vraies parties : il renvoie la bille, les animaux crient', async () => {
    const report: string[] = []
    const skills = ENV.PB_SKILL ? ENV.PB_SKILL.split(',').map(Number) : [1]
    // PB_CAD=1 : une seule cadence (les réglages), sinon les trois
    const cads = ENV.PB_CAD ? CADENCES.slice(0, 1) : CADENCES
    for (const skill of skills) for (const tier of ['easy', 'med', 'exp'] as const) {
      for (const [name, cad] of cads) {
        const runs: Run[] = []
        for (let k = 0; k < SIMS; k++) runs.push(play(CFG[tier], 77 + k * 13, cad, { lives: tier === 'exp' ? 2 : 3, multiAt: { easy: 10, med: 12, exp: 14 }[tier], skill, maxT: Number(ENV.PB_MAXT || 120) }))
        const m = (f: (r: Run) => number) => mean(runs.map(f)).toFixed(1)
        report.push(`[${skill}] ${tier} ${name}: durée ${m(r => r.time)} s (q10 ${quant(runs.map(r => r.time), 0.1).toFixed(0)}), score ${m(r => r.score)} (q10 ${quant(runs.map(r => r.score), 0.1)}, q90 ${quant(runs.map(r => r.score), 0.9)}), coups ${m(r => r.flips)}, bumpers ${m(r => r.bumpers)}, rampes ${m(r => r.ramps)}, œufs ${m(r => r.eggs)}, foins ${m(r => r.slings)}, chien ${m(r => r.saves)}, ouf ${m(r => r.near)}, série max ${m(r => r.combo)}, multibille ${m(r => r.multis)}, secousses ${m(r => r.stuck)}`)
        // Le pilote tient la bille : en moyenne plusieurs coups de batteur par bille
        expect(mean(runs.map(r => r.flips))).toBeGreaterThan(6)
        expect(mean(runs.map(r => r.bumpers))).toBeGreaterThan(3)
      }
    }
    if (ENV.PB_STATS) {
      const fs = await import(/* @vite-ignore */ 'node:' + 'fs')
      fs.writeFileSync(ENV.PB_STATS, report.join('\n') + '\n')
    }
  }, 600000)

  it('le bot du navigateur gagne à tous les coups, pas par chance', async () => {
    // Ce que joue `flipper-partie-complete` (scripts/play.mjs), à la fleur :
    // un lancer au doigt, puis le pilote (qui relance aussi les billes) joue
    // jusqu'à 15 coups de batteur et 6 animaux touchés ; puis il lâche, les
    // billes tombent, chaque nouvelle bille est lancée au clavier, jusqu'à la
    // fin. Les règles du jeu qui touchent la bille sont celles de
    // games/pinball.ts : 3 billes, la suivante 1,3 s après, le multibille à 10.
    const N = Number(ENV.PB_BOT || (BIG ? 400 : 2))
    let worstPlay = 0, worstEnd = 0
    for (const [name, cad] of CADENCES) {
      for (let k = 0; k < N; k++) {
        const r = seeded(500 + k * 7)
        const sim = new Pinball(CFG.easy, seeded(900 + k * 11))
        sim.serve()
        sim.plunger(true)
        sim.update(0.2 + r() * 0.6)
        sim.plunger(false)
        sim.pilot = autoPilot({ launch: true, rnd: seeded(k + 3) })
        let lives = 3, flips = 0, bumpers = 0, combo = 0, lastHit = 0, armed = true, serveAt = -1
        let phase = 1, phaseAt = 0, pressAt = -1
        while (lives > 0 && sim.t < 900) {
          sim.update(cad(r))
          for (const e of sim.events.splice(0)) {
            if (e.k === 'flipHit' && e.v > 3) flips++
            if (e.k === 'bumper' || e.k === 'target' || e.k === 'targets' || e.k === 'barn') { combo++; lastHit = sim.t; if (e.k === 'bumper') bumpers++ }
            if (e.k === 'drain' && e.left === 0) { lives--; combo = 0; armed = true; if (lives > 0) serveAt = sim.t + 1.3 }
          }
          if (combo > 0 && sim.t - lastHit > 4) combo = 0
          if (armed && combo >= 10 && sim.inPlay().length === 1) { armed = false; sim.release(2, 0.8) }
          if (!armed && combo === 0 && sim.inPlay().length <= 1) armed = true
          if (serveAt > 0 && sim.t >= serveAt) { serveAt = -1; sim.serve() }
          if (phase === 1 && ((flips >= 15 && bumpers >= 6) || sim.t > 90)) {
            expect(flips, `${name} #${k} : coups de batteur`).toBeGreaterThanOrEqual(15)
            expect(bumpers, `${name} #${k} : animaux`).toBeGreaterThanOrEqual(6)
            worstPlay = Math.max(worstPlay, sim.t)
            phase = 2; phaseAt = sim.t
            sim.pilot = null
            sim.setFlipper(0, false); sim.setFlipper(1, false)
          }
          // Le bot appuie sur Espace environ une seconde après l'arrivée de la bille
          if (phase === 2 && sim.readyBall() && sim.inPlay().length === 0) {
            if (pressAt < 0) pressAt = sim.t + 1
            else if (sim.t >= pressAt && !sim.pulling) sim.plunger(true)
            else if (sim.pulling && sim.t >= pressAt + 0.2) { sim.plunger(false); pressAt = -1 }
          }
        }
        expect(lives, `${name} #${k} : la partie finit`).toBe(0)
        worstEnd = Math.max(worstEnd, sim.t - phaseAt)
      }
    }
    // Le pire cas tient dans les délais du bot (temps simulé)
    expect(worstPlay).toBeLessThan(90)
    expect(worstEnd).toBeLessThan(400)
    if (ENV.PB_STATS) {
      const fs = await import(/* @vite-ignore */ 'node:' + 'fs')
      fs.writeFileSync(ENV.PB_STATS, `bot (${N} × 3 cadences) : jeu au pilote ≤ ${worstPlay.toFixed(1)} s, fin de partie ≤ ${worstEnd.toFixed(1)} s\n`)
    }
  }, 600000)

  it('le portillon du couloir : une bille qui redescend ne retombe pas sur le ressort', () => {
    const sim = new Pinball(CFG.easy, seeded(5))
    const b = (sim as unknown as { ball: (st: string, x: number, y: number) => import('./pinball').Ball }).ball('table', 3.1, 7.4)
    b.vx = 0; b.vy = -2
    for (let i = 0; i < 480 * 3; i++) sim.step(1 / 480)
    expect(b.x).toBeLessThan(TABLE.laneL)
    expect(R).toBeGreaterThan(0)
  })
})
