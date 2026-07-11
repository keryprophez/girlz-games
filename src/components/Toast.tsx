import { useEffect, useRef, useState } from 'react'

export function Toast() {
  const [msg, setMsg] = useState('')
  const [show, setShow] = useState(false)
  const timer = useRef<number>()

  useEffect(() => {
    const on = (e: Event) => {
      setMsg((e as CustomEvent).detail)
      setShow(true)
      clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setShow(false), 1700)
    }
    window.addEventListener('ferme:toast', on)
    return () => { window.removeEventListener('ferme:toast', on); clearTimeout(timer.current) }
  }, [])

  return <div id="toast" className={show ? 'show' : ''}>{msg}</div>
}
