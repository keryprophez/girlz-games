import { useEffect, useMemo, useRef, useState } from 'react'
import { SHOW_PROFILES, useFerme } from '../core/store'
import { gameById } from '../games'
import type { FinishPayload, GameContext, Tier } from '../core/types'
import { toast } from '../core/utils'
import { confetti, FX } from '../core/fx'
import { say, shutUp } from '../core/voice'
import { playClip } from '../core/clips'
import { iris } from '../core/juice'
import { tone } from '../core/audio'
import { playMusic, stopMusic } from '../core/music'
import { ICON, starsHTML } from '../core/icons'
import { BADGE } from '../core/badges'
import { Session, isPaused, onPause, setPaused } from '../core/session'
import { dollPortraits } from '../core/portraits'
import { defaultLook, type Look } from '../core/character'

/* L'hôte d'un jeu : plein écran, carton titre, pause, outro, cérémonie de fin.
   Le jeu ne voit que `ctx` ; tout ce qui est commun à 30 jeux vit ici. */

const TITLE_CARD_MS = 1500

/* La difficulté se choisit DANS le jeu (10/09) : trois boutons, zéro lecture —
   une fleur (douce), un éclair (normale), une flamme (expert). Le dernier
   choix est retenu par jeu et proposé en premier au coup d'après. */
const TIERS: Tier[] = ['easy', 'med', 'exp']
const TIER_ICON: Record<Tier, string> = { easy: ICON.flower, med: ICON.bolt, exp: ICON.flame }
const tierKey = (gameId: string) => `ferme:niveau:${gameId}`
function lastTier(gameId: string): Tier | null {
  try {
    const v = localStorage.getItem(tierKey(gameId))
    if (v === 'easy' || v === 'med' || v === 'exp') return v
  } catch { /* stockage refusé : tant pis */ }
  return null
}
/* À deux (jeux `duo`) : retenu par jeu, comme le niveau */
const duoKey = (gameId: string) => `ferme:duo:${gameId}`
function lastDuo(gameId: string): boolean {
  try { return localStorage.getItem(duoKey(gameId)) === '1' } catch { return false }
}

const Svg = ({ html, className }: { html: string; className?: string }) =>
  <span className={className} dangerouslySetInnerHTML={{ __html: html }} />

/** Leur personnage (Habille-toi) sur l'écran de fin : elle saute de joie
    pour une belle partie, elle fait coucou « encore ! » pour une partie ratée.
    Les images sont rendues dès l'ouverture du jeu (cache) : elles sont prêtes. */
function EndDoll({ look, mood }: { look: Look; mood: 'joy' | 'soft' | 'again' }) {
  const [img, setImg] = useState<Record<string, string>>({})
  useEffect(() => {
    let on = true
    dollPortraits(look, ['cheer', 'wave'], 200).then(r => { if (on) setImg(r) })
    return () => { on = false }
  }, [look])
  const src = mood === 'again' ? img.wave : img.cheer
  if (!src) return null
  return <img className={'result-doll ' + mood} src={src} alt="" />
}

/** Le score de fin en géant, qui défile de 0 jusqu'au résultat avec un tic
    par cran (≈ 0,9 s en tout) : on VOIT et on ENTEND combien on a fait. */
function BigScore({ value, icon }: { value: number; icon: string }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    setShown(0)
    if (value <= 0) return
    const steps = Math.min(value, 30)
    const ts: number[] = []
    for (let k = 1; k <= steps; k++) {
      ts.push(window.setTimeout(() => {
        setShown(Math.round(value * k / steps))
        tone(520 + k * 14, 0.04, 'triangle', 0.05)
      }, 250 + k * (900 / steps)))
    }
    return () => ts.forEach(clearTimeout)
  }, [value])
  return (
    <div className="result-score">
      <Svg html={icon} />
      <b className={shown === value ? 'done' : ''}>{shown}</b>
    </div>
  )
}

export function GameHost({ gameId, onHome }: { gameId: string; onHome: () => void }) {
  const game = gameById(gameId)!
  const creative = game.cat === 'creatif'
  const rootRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const sessionRef = useRef<Session | null>(null)
  const [result, setResult] = useState<FinishPayload | null>(null)
  const [runId, setRunId] = useState(0)
  const [crashed, setCrashed] = useState(false)
  // Tant que la difficulté n'est pas choisie, le jeu n'est pas monté
  const [tier, setTier] = useState<Tier | null>(null)
  const [duo, setDuo] = useState(() => lastDuo(gameId))
  // Lu au montage du jeu (l'effet ne dépend pas de `duo` : changer se fait
  // dans le choix du niveau, qui relance de toute façon la partie)
  const duoRef = useRef(duo)
  const [card, setCard] = useState(true)
  const [paused, setPausedState] = useState(isPaused())
  const [outro, setOutro] = useState(false)
  const store = useFerme()

  // Mode jeu : la coquille passe en plein écran (CSS). Le plein écran du
  // navigateur, lui, reste d'un jeu à l'autre : chaque entrée/sortie faisait
  // sauter toute la page (vécu sur tablette). On en sort par le geste du
  // navigateur (glisser depuis le bord), pas en rentrant au menu.
  useEffect(() => {
    document.body.classList.add('playing')
    return () => {
      document.body.classList.remove('playing')
      setPaused(false)
    }
  }, [])

  const goHome = () => { setPaused(false); onHome() }

  // Filet anti-crash : une exception dans un timer, un handler ou une promesse
  // d'un jeu affiche un écran « Oups » au lieu de laisser un plateau figé
  const safeCleanup = () => {
    sessionRef.current?.end()
    sessionRef.current = null
    try { cleanupRef.current?.() } catch (err) { console.error(err) }
    cleanupRef.current = null
  }
  useEffect(() => {
    const onErr = () => { safeCleanup(); setCrashed(true) }
    window.addEventListener('error', onErr)
    window.addEventListener('unhandledrejection', onErr)
    return () => {
      window.removeEventListener('error', onErr)
      window.removeEventListener('unhandledrejection', onErr)
    }
  }, [])

  // Pause : onglet en arrière-plan, minuteur parental, bouton pause.
  // La musique se tait, la boucle 3D se fige (three3d), les timers de partie
  // se suspendent (Session), et un voile avec « lecture » reprend d'un tap.
  useEffect(() => {
    const off = onPause(p => {
      setPausedState(p)
      if (p) stopMusic(0.25)
      else if (game.music && !result) playMusic(game.music)
    })
    const onVis = () => { if (document.hidden) setPaused(true) }
    document.addEventListener('visibilitychange', onVis)
    return () => { off(); document.removeEventListener('visibilitychange', onVis) }
  }, [game.music, result])

  const profile = store.profiles.find(p => p.id === store.currentId) || store.profiles[0]
  // Un objet stable : un nouveau look à chaque rendu relancerait le rendu 3D
  const lookKey = JSON.stringify(profile.look || defaultLook())
  const look = useMemo(() => JSON.parse(lookKey) as Look, [lookKey])
  // Préparer tout de suite les images du personnage pour l'écran de fin
  useEffect(() => { dollPortraits(look, ['cheer', 'wave'], 200) }, [look])

  // Cérémonie des étoiles : chaque étoile gagnée sonne et étincelle
  useEffect(() => {
    if (!result || creative) return
    const ts: number[] = []
    for (let i = 0; i < result.stars; i++) {
      ts.push(window.setTimeout(() => {
        tone(620 + i * 170, 0.18, 'sine', 0.13)
        FX.burst(window.innerWidth / 2 + (i - 1) * 74, window.innerHeight * 0.36,
          { colors: ['#FFD34D', '#FFF3B0', '#FF9E7A'], count: 9 })
      }, (game.cat === 'action' ? 90 : 320) + i * (game.cat === 'action' ? 110 : 220)))
    }
    return () => ts.forEach(clearTimeout)
  }, [result])

  useEffect(() => {
    if (!rootRef.current || !tier) return
    setResult(null)
    setCrashed(false)
    setOutro(false)
    setCard(true)
    const cardT = window.setTimeout(() => setCard(false), TITLE_CARD_MS)
    iris() // entrée de scène : le cercle s'ouvre sur le jeu
    if (game.music) playMusic(game.music)
    const p = profile
    const session = new Session()
    sessionRef.current = session
    let finished = false
    // Les minuteurs de la coquille (outro, encouragement) meurent avec la
    // partie : quitter pendant un outro ne doit rien afficher ni jouer après
    const hostTimers: number[] = []
    // Deux cérémonies, pas une : gagner et perdre ne se ressemblent pas
    const ceremony = (res: FinishPayload) => {
      if (creative) { confetti(); return }
      if (res.stars === 3) { confetti(); FX.fireworks(); return }
      if (res.stars === 2) { confetti(); return }
      // 1 étoile : pas de fête, une descente douce — « encore ? »
      tone(392, 0.16, 'sine', 0.1); tone(330, 0.22, 'sine', 0.09, 0.17)
    }
    const ctx: GameContext = {
      root: rootRef.current,
      tier,
      playerName: SHOW_PROFILES ? p.name : '',
      avatar: p.avatar,
      look: p.look || null,
      byTier: (e, m, x) => (tier === 'easy' ? e : tier === 'med' ? m : x),
      duo: !!game.duo && duoRef.current,
      toast,
      say,
      after: (ms, fn) => session.after(ms, fn),
      every: (ms, fn) => session.every(ms, fn),
      cancel: id => session.cancel(id),
      alive: () => session.running,
      finish(payload) {
        if (finished) return
        finished = true
        useFerme.getState().recordBest(gameId, payload.stars, p.id)
        // L'outro : le jeu reste monté pendant que la tour s'écroule, le
        // tracteur percute, la caméra recule — PUIS le score.
        const outroMs = payload.outroMs ?? 0
        if (outroMs > 0) { setOutro(true); stopMusic(outroMs / 1000) }
        hostTimers.push(window.setTimeout(() => {
          // Le jeu reste MONTÉ et figé derrière l'écran de fin : on voit sa
          // partie, pas un fond vide. Il sera démonté au rejouer / au menu.
          sessionRef.current?.end()
          sessionRef.current = null
          setPaused(true)
          ceremony(payload)
          hostTimers.push(window.setTimeout(() => playClip(p.id, payload.stars >= 2 ? 'bravo' : 'retry'), 800))
          setResult(payload)
        }, outroMs))
      }
    }
    // Monté après le rendu pour que les dimensions soient mesurables — et
    // après le passage en plein écran (fenêtre qui change de taille), sinon
    // l'arène est mesurée trop petite puis saute. Le carton titre couvre.
    let mounted = false
    let raf = 0
    const doMount = () => {
      if (mounted) return
      mounted = true
      document.removeEventListener('fullscreenchange', doMount)
      raf = requestAnimationFrame(() => {
        try {
          cleanupRef.current = game.mount(ctx)
        } catch (err) {
          console.error(err)
          setCrashed(true)
        }
      })
    }
    const waitFs = document.fullscreenEnabled && !document.fullscreenElement && runId === 0
    if (waitFs) document.addEventListener('fullscreenchange', doMount)
    const mountT = window.setTimeout(doMount, waitFs ? 350 : 0)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(mountT)
      document.removeEventListener('fullscreenchange', doMount)
      clearTimeout(cardT)
      hostTimers.forEach(clearTimeout)
      safeCleanup()
      stopMusic()
      shutUp()
    }
  }, [gameId, runId, tier])

  const replay = () => { setPaused(false); setResult(null); setRunId(r => r + 1) }

  /** Choisir (ou changer) la difficulté : le jeu repart de zéro à ce niveau. */
  const pickTier = (t: Tier) => {
    try { localStorage.setItem(tierKey(gameId), t) } catch { /* stockage refusé */ }
    tone(520, 0.12, 'sine', 0.1)
    setPaused(false)
    setResult(null)
    setTier(t)
    setRunId(r => r + 1)
  }
  const askTier = () => { setPaused(false); setResult(null); setTier(null) }
  const pickDuo = (v: boolean) => {
    try { localStorage.setItem(duoKey(gameId), v ? '1' : '0') } catch { /* stockage refusé */ }
    duoRef.current = v
    setDuo(v)
    tone(v ? 660 : 440, 0.1, 'sine', 0.09)
  }

  return (
    <section className="screen play active">
      {/* Barre flottante : maison, son, pause, rejouer */}
      <div className="playbar">
        <button className="pbtn" onClick={goHome} aria-label="Menu"><Svg html={ICON.home} /></button>
        <span className="playbar-right">
          {tier && <button className={'pbtn pbtn-tier tier-' + tier} onClick={askTier} aria-label="Difficulté"><Svg html={TIER_ICON[tier]} /></button>}
          <button className="pbtn" onClick={() => {
            store.toggleSound()
            // `store.sound` est encore l'état d'AVANT : s'il était allumé, on
            // vient de couper — la voix en cours doit s'arrêter net.
            // (la musique générative, elle, se tait d'elle-même : chaque note
            // vérifie le réglage — inutile de l'arrêter, elle repart au son)
            if (store.sound) shutUp()
          }} aria-label="Son"><Svg html={store.sound ? ICON.sound : ICON.mute} /></button>
          <button className="pbtn" onClick={() => setPaused(true)} aria-label="Pause"><Svg html={ICON.pause} /></button>
          <button className="pbtn" onClick={replay} aria-label="Rejouer"><Svg html={ICON.replay} /></button>
        </span>
      </div>

      <div className={'gameroot' + (outro ? ' outro' : '')} ref={rootRef} key={gameId + ':' + runId + ':' + (tier ?? '-')} />

      {/* Le choix du niveau remplace le carton titre : même carte, trois boutons */}
      {!tier && (
        <div className="tierpick">
          <span className={'titlecard-sq ' + game.sq}>{BADGE[game.id] ? <Svg html={BADGE[game.id]} /> : game.icon}</span>
          <span className="titlecard-name">{game.name}</span>
          {game.duo && (
            <div className="duorow">
              <button className={'duobtn' + (!duo ? ' sel' : '')} onClick={() => pickDuo(false)} aria-label="Seule"><Svg html={ICON.solo} /></button>
              <button className={'duobtn' + (duo ? ' sel' : '')} onClick={() => pickDuo(true)} aria-label="À deux"><Svg html={ICON.duo} /></button>
            </div>
          )}
          <div className="tierrow">
            {TIERS.map(t => (
              <button key={t} className={'tierbtn tier-' + t + (lastTier(gameId) === t ? ' last' : '')}
                onClick={() => pickTier(t)} aria-label={t}>
                <Svg html={TIER_ICON[t]} />
                <span className="tierdots">{TIERS.slice(0, TIERS.indexOf(t) + 1).map((_, i) => <i key={i} />)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {tier && card && (
        <div className="titlecard" aria-hidden="true">
          <span className={'titlecard-sq ' + game.sq}>{BADGE[game.id] ? <Svg html={BADGE[game.id]} /> : game.icon}</span>
          <span className="titlecard-name">{game.name}</span>
        </div>
      )}

      {paused && !result && !crashed && tier && (
        <div className="pausewall" onClick={() => setPaused(false)}>
          <button className="pbtn pbtn-big" aria-label="Reprendre"><Svg html={ICON.play} /></button>
        </div>
      )}

      {crashed && (
        <div id="result" className="show">
          <div className="modal">
            <h2>Oups !</h2>
            <p>Le jeu a eu un petit pépin… Ce n'est pas de ta faute !</p>
            <div className="rbtns">
              <button className="bigbtn primary" onClick={() => { setCrashed(false); setRunId(r => r + 1) }}><Svg html={ICON.replay} /> Réessayer</button>
              <button className="bigbtn ghost" onClick={goHome}><Svg html={ICON.home} /> Menu</button>
            </div>
          </div>
        </div>
      )}

      {result && (
        /* Sur un jeu d'adresse, taper N'IMPORTE OÙ relance : réessayer doit
           coûter un geste, pas une visée. Le bouton reste pour les autres. */
        <div id="result" className={'show' + (game.cat === 'action' ? ' quickretry' : '') + (result.stars === 1 && !creative ? ' lost' : '')}
          onClick={game.cat === 'action'
            ? e => { if (e.target === e.currentTarget) replay() }
            : undefined}>
          <div className="modal">
            <EndDoll look={look} mood={creative || result.stars === 3 ? 'joy' : result.stars === 2 ? 'soft' : 'again'} />
            <h2>{result.title}</h2>
            {result.score !== undefined && <BigScore value={result.score} icon={result.scoreIcon ?? ICON.star} />}
            <p>{result.msg}</p>
            {!creative && <Svg className="stars" html={starsHTML(result.stars)} />}
            <div className="rbtns">
              <button className="bigbtn primary" onClick={replay}><Svg html={ICON.replay} /> {result.stars === 1 && !creative ? 'Encore !' : 'Rejouer'}</button>
              <button className="bigbtn ghost" onClick={goHome}><Svg html={ICON.home} /> Menu</button>
            </div>
            {game.cat === 'action' && <div className="retryhint">ou tape à côté pour rejouer</div>}
          </div>
        </div>
      )}

    </section>
  )
}
