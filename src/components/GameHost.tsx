import { useEffect, useRef, useState } from 'react'
import { useFerme } from '../core/store'
import { gameById } from '../games'
import type { FinishPayload, GameContext, Profile, Tier } from '../core/types'
import { toast } from '../core/utils'
import { confetti, FX } from '../core/fx'
import { say, shutUp } from '../core/voice'
import { playClip } from '../core/clips'
import { iris } from '../core/juice'
import { tone } from '../core/audio'
import { playMusic, stopMusic } from '../core/music'
import { frameProps, loadAtlas, type Atlas } from '../core/sprites'
import { ICON, starsHTML } from '../core/icons'
import { Session, isPaused, onPause, setPaused } from '../core/session'
import { exitFullscreen } from '../App'

/* L'hôte d'un jeu : plein écran, carton titre, pause, outro, cérémonie de fin.
   Le jeu ne voit que `ctx` ; tout ce qui est commun à 30 jeux vit ici. */

interface Result extends FinishPayload {
  newSticker: string | null
}

const TITLE_CARD_MS = 1500

function Face({ p, px = 54 }: { p: Profile; px?: number }) {
  return p.avatar
    ? <span className="face-sprite" style={{ width: px, height: px, backgroundImage: `url(${p.avatar})` }} />
    : <span className="face-blank" style={{ width: px, height: px }} />
}

const Svg = ({ html, className }: { html: string; className?: string }) =>
  <span className={className} dangerouslySetInnerHTML={{ __html: html }} />

export function GameHost({ gameId, duel, onHome }: { gameId: string; duel: boolean; onHome: () => void }) {
  const game = gameById(gameId)!
  const creative = game.cat === 'creatif'
  const rootRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const sessionRef = useRef<Session | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [runId, setRunId] = useState(0)
  const [turn, setTurn] = useState(0)
  const [interstitial, setInterstitial] = useState<Result | null>(null)
  const [duelDone, setDuelDone] = useState<Result[] | null>(null)
  const [crashed, setCrashed] = useState(false)
  const [card, setCard] = useState(true)
  const [paused, setPausedState] = useState(isPaused())
  const [outro, setOutro] = useState(false)
  const duelResults = useRef<Result[]>([])
  const store = useFerme()

  // La planche des animaux, pour montrer le nouveau sticker en vrai sprite
  const [atlas, setAtlas] = useState<Atlas | null>(null)
  useEffect(() => { let on = true; loadAtlas('animals').then(a => on && setAtlas(a)); return () => { on = false } }, [])

  // Mode jeu : la coquille passe en plein écran (CSS), on en sort en rentrant
  useEffect(() => {
    document.body.classList.add('playing')
    return () => {
      document.body.classList.remove('playing')
      setPaused(false)
      exitFullscreen()
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

  // En duel, l'ordre est figé au montage : la joueuse sélectionnée commence
  const playersRef = useRef<Profile[]>([])
  if (playersRef.current.length === 0) {
    const cur = store.profiles.find(p => p.id === store.currentId) || store.profiles[0]
    const other = store.profiles.find(p => p.id !== cur.id) || cur
    playersRef.current = duel ? [cur, other] : [cur]
  }
  const profile = playersRef.current[Math.min(turn, playersRef.current.length - 1)]

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
    if (!rootRef.current) return
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
    // Difficulté adaptative : le palier choisi par le parent, décalé en
    // silence d'un cran max selon les dernières parties (voir reward()).
    const TIERS: Tier[] = ['easy', 'med', 'exp']
    const shift = Math.round(useFerme.getState().progressOf(p.id).adapt?.[gameId] ?? 0)
    const tier = TIERS[Math.max(0, Math.min(2, TIERS.indexOf(p.tier) + shift))]
    let finished = false
    // Deux cérémonies, pas une : gagner et perdre ne se ressemblent pas
    const ceremony = (res: Result) => {
      if (creative) { confetti(); return }
      if (res.stars === 3) { confetti(); FX.fireworks(); return }
      if (res.stars === 2) { confetti(); return }
      // 1 étoile : pas de fête, une descente douce — « encore ? »
      tone(392, 0.16, 'sine', 0.1); setTimeout(() => tone(330, 0.22, 'sine', 0.09), 170)
    }
    const ctx: GameContext = {
      root: rootRef.current,
      tier,
      playerName: p.name,
      avatar: p.avatar,
      look: p.look || null,
      byTier: (e, m, x) => (tier === 'easy' ? e : tier === 'med' ? m : x),
      toast,
      say,
      after: (ms, fn) => session.after(ms, fn),
      every: (ms, fn) => session.every(ms, fn),
      cancel: id => session.cancel(id),
      alive: () => session.running,
      finish(payload) {
        if (finished) return
        finished = true
        const newSticker = useFerme.getState().reward(gameId, payload.starsEarned, payload.stars, p.id)
        const res: Result = { ...payload, newSticker }
        // L'outro : le jeu reste monté pendant que la tour s'écroule, le
        // tracteur percute, la caméra recule — PUIS le score.
        const outroMs = payload.outroMs ?? 0
        if (outroMs > 0) { setOutro(true); stopMusic(outroMs / 1000) }
        window.setTimeout(() => {
          safeCleanup()
          ceremony(res)
          setTimeout(() => playClip(p.id, payload.stars >= 2 ? 'bravo' : 'retry'), 800)
          if (!duel) { setResult(res); return }
          duelResults.current = [...duelResults.current.slice(0, turn), res]
          if (turn === 0) setInterstitial(res)
          else setDuelDone([...duelResults.current])
        }, outroMs)
      }
    }
    // Monté après le rendu pour que les dimensions soient mesurables
    const raf = requestAnimationFrame(() => {
      try {
        cleanupRef.current = game.mount(ctx)
      } catch (err) {
        console.error(err)
        setCrashed(true)
      }
    })
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(cardT)
      safeCleanup()
      stopMusic()
      shutUp()
    }
  }, [gameId, runId, turn])

  const replay = () => { setResult(null); setRunId(r => r + 1) }

  const startSecondTurn = () => {
    setInterstitial(null)
    setTurn(1)
  }

  const restartDuel = () => {
    duelResults.current = []
    setDuelDone(null)
    setInterstitial(null)
    setTurn(0)
    setRunId(r => r + 1)
  }

  const duelMessage = (rs: Result[]) => {
    const [a, b] = rs
    if (a.stars === b.stars) return 'Égalité parfaite, bravo les deux !'
    const winner = a.stars > b.stars ? playersRef.current[0] : playersRef.current[1]
    return `${winner.name} brille un peu plus fort cette fois. Bravo les deux !`
  }

  return (
    <section className="screen play active">
      {/* Barre flottante : maison, (joueuse en duel), pause, rejouer */}
      <div className="playbar">
        <button className="pbtn" onClick={goHome} aria-label="Menu"><Svg html={ICON.home} /></button>
        {duel && <span className="playbar-who"><Face p={profile} px={30} /><b>{profile.name}</b></span>}
        <span className="playbar-right">
          <button className="pbtn" onClick={() => setPaused(true)} aria-label="Pause"><Svg html={ICON.pause} /></button>
          <button className="pbtn" onClick={replay} aria-label="Rejouer"><Svg html={ICON.replay} /></button>
        </span>
      </div>

      <div className={'gameroot' + (outro ? ' outro' : '')} ref={rootRef} key={gameId + ':' + runId + ':' + turn} />

      {card && (
        <div className="titlecard" aria-hidden="true">
          <span className={'titlecard-sq ' + game.sq}>{game.icon}</span>
          <span className="titlecard-name">{game.name}</span>
        </div>
      )}

      {paused && !result && !crashed && (
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

      {result && !duel && (
        /* Sur un jeu d'adresse, taper N'IMPORTE OÙ relance : réessayer doit
           coûter un geste, pas une visée. Le bouton reste pour les autres. */
        <div id="result" className={'show' + (game.cat === 'action' ? ' quickretry' : '') + (result.stars === 1 && !creative ? ' lost' : '')}
          onClick={game.cat === 'action'
            ? e => { if (e.target === e.currentTarget) replay() }
            : undefined}>
          <div className="modal">
            <h2>{result.title}</h2>
            <p>{result.msg}{!creative && `  (+${result.starsEarned})`}</p>
            {!creative && <Svg className="stars" html={starsHTML(result.stars)} />}
            {result.newSticker && (
              <div className="rewardbox" style={{ display: 'block' }}>
                <span className="ra">{atlas ? <i className="spr" style={frameProps(atlas, result.newSticker, 64)} /> : null}</span>
                <span>Nouvel animal pour l'album de {profile.name} !</span>
              </div>
            )}
            <div className="rbtns">
              <button className="bigbtn primary" onClick={replay}><Svg html={ICON.replay} /> {result.stars === 1 && !creative ? 'Encore !' : 'Rejouer'}</button>
              <button className="bigbtn ghost" onClick={goHome}><Svg html={ICON.home} /> Menu</button>
            </div>
            {game.cat === 'action' && <div className="retryhint">ou tape à côté pour rejouer</div>}
          </div>
        </div>
      )}

      {interstitial && (
        <div id="result" className="show">
          <div className="modal">
            <h2>{playersRef.current[0].name}</h2>
            <Svg className="stars" html={starsHTML(interstitial.stars)} />
            <p>{interstitial.msg}</p>
            <div className="duel-next">
              <Face p={playersRef.current[1]} px={64} />
              <div className="duel-next-txt">Au tour de <b>{playersRef.current[1].name}</b> !</div>
            </div>
            <div className="rbtns">
              <button className="bigbtn primary" onClick={startSecondTurn}><Svg html={ICON.versus} /> C'est parti !</button>
            </div>
          </div>
        </div>
      )}

      {duelDone && (
        <div id="result" className="show">
          <div className="modal">
            <h2>Résultat du défi</h2>
            {duelDone.map((r, i) => (
              <div className="duelrow" key={i}>
                <Face p={playersRef.current[i]} px={44} />
                <span className="duelname">{playersRef.current[i].name}</span>
                <Svg className="duelstars" html={starsHTML(r.stars)} />
              </div>
            ))}
            <p style={{ marginTop: 10 }}>{duelMessage(duelDone)}</p>
            <div className="rbtns">
              <button className="bigbtn primary" onClick={restartDuel}><Svg html={ICON.versus} /> Revanche !</button>
              <button className="bigbtn ghost" onClick={goHome}><Svg html={ICON.home} /> Menu</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
