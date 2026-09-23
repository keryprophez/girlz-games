import { useEffect, useState } from 'react'
import { critterPortraits, dollPortraits } from '../core/portraits'
import { useFerme } from '../core/store'
import { defaultLook } from '../core/character'

/* Le décor de l'accueil : des halos de couleur qui respirent, et la poule
   suivie de son poussin qui se promènent en bas de l'écran — les mêmes
   personnages 3D que dans les jeux (22/09 : plus d'emoji dans la coquille).
   Depuis le 23/09 LEUR personnage (Habille-toi) marche devant, deux images
   qui alternent pour les pas. Tant que les portraits ne sont pas rendus,
   rien ne s'affiche. */
export function Ambient() {
  const [img, setImg] = useState<Record<string, string>>({})
  const [doll, setDoll] = useState<Record<string, string>>({})
  const lookKey = useFerme(s => JSON.stringify((s.profiles.find(p => p.id === s.currentId) || s.profiles[0]).look || defaultLook()))
  useEffect(() => {
    let on = true
    critterPortraits(['hen', 'chick'], 72).then(r => { if (on) setImg(r) })
    return () => { on = false }
  }, [])
  useEffect(() => {
    let on = true
    dollPortraits(JSON.parse(lookKey), ['walk', 'stride'], 96).then(r => { if (on) setDoll(r) })
    return () => { on = false }
  }, [lookKey])
  return (
    <>
      <div className="halo h1" />
      <div className="halo h2" />
      <div className="halo h3" />
      <div className="halo h4" />
      {doll.walk && (
        <span className="critter walker doll">
          <img src={doll.walk} alt="" /><img src={doll.stride} alt="" />
        </span>
      )}
      {img.hen && <img className="critter walker" src={img.hen} alt="" />}
      {img.chick && <img className="critter walker chick" src={img.chick} alt="" />}
    </>
  )
}
