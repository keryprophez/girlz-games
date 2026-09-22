import { useEffect, useState } from 'react'
import { critterPortraits } from '../core/portraits'

/* Le décor de l'accueil : des halos de couleur qui respirent, et la poule
   suivie de son poussin qui se promènent en bas de l'écran — les mêmes
   personnages 3D que dans les jeux (22/09 : plus d'emoji dans la coquille).
   Tant que les portraits ne sont pas rendus, rien ne s'affiche. */
export function Ambient() {
  const [img, setImg] = useState<Record<string, string>>({})
  useEffect(() => {
    let on = true
    critterPortraits(['hen', 'chick'], 72).then(r => { if (on) setImg(r) })
    return () => { on = false }
  }, [])
  return (
    <>
      <div className="halo h1" />
      <div className="halo h2" />
      <div className="halo h3" />
      <div className="halo h4" />
      {img.hen && <img className="critter walker" src={img.hen} alt="" />}
      {img.chick && <img className="critter walker chick" src={img.chick} alt="" />}
    </>
  )
}
