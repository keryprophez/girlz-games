import { useEffect, useState } from 'react'
import { critterPortraits, meadowBanner, dollPortraits } from '../core/portraits'
import { familyDoll, useFerme } from '../core/store'

/* Le décor de l'accueil : des halos de couleur qui respirent, un pré en 3D
   au bas de l'écran (23/09 : collines, arbres, clôture, les animaux de la
   ferme qui paissent), et LEUR petite fille d'Habille-toi qui s'y promène
   (revenue le 6/10 à la place des princesses VRM), suivie de la poule et du poussin — les mêmes personnages 3D que dans les jeux. Tout est rendu
   en images, une seule fois, un peu après l'ouverture : l'accueil s'affiche
   d'abord, le décor arrive ensuite (un rendu 3D logiciel peut prendre
   plusieurs secondes sur une machine sans carte graphique). */
export function Ambient() {
  const [img, setImg] = useState<Record<string, string>>({})
  const [dolls, setDolls] = useState<Record<string, string>[]>([])
  const [pre, setPre] = useState('')
  const lookKey = useFerme(s => JSON.stringify(familyDoll(s)))
  useEffect(() => {
    let on = true
    const t = window.setTimeout(async () => {
      const w = Math.min(2400, Math.round(window.innerWidth * Math.min(1.5, window.devicePixelRatio || 1)))
      const url = await meadowBanner(w, Math.round(w * 0.2))
      if (on) setPre(url)
      const r = await critterPortraits(['hen', 'chick'], 72)
      if (on) setImg(r)
    }, 700)
    return () => { on = false; clearTimeout(t) }
  }, [])
  useEffect(() => {
    let on = true
    const t = window.setTimeout(() => {
      const look = familyDoll(useFerme.getState())
      dollPortraits([look], ['walk', 'stride'], 96).then(r => {
        if (on) setDolls([r])
        // Puis, toujours au calme, celles de l'écran de fin des jeux
        if (on) void dollPortraits([look], ['cheer', 'wave'], 200)
      })
    }, 2500) // seulement si l'on reste sur l'accueil : un jeu lancé tout de suite n'attend personne
    return () => { on = false; clearTimeout(t) }
  }, [lookKey])
  return (
    <>
      <div className="halo h1" />
      <div className="halo h2" />
      <div className="halo h3" />
      <div className="halo h4" />
      {pre && <div className="critter hm-meadow" style={{ backgroundImage: `url(${pre})` }} />}
      {dolls.map((d, i) => d.walk && (
        <span key={i} className={'critter walker doll' + (i ? ' d2' : '')}>
          <img src={d.walk} alt="" /><img src={d.stride} alt="" />
        </span>
      ))}
      {img.hen && <img className="critter walker" src={img.hen} alt="" />}
      {img.chick && <img className="critter walker chick" src={img.chick} alt="" />}
    </>
  )
}
