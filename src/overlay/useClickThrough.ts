import { useEffect } from 'react'

/** Overlay owns click-through: pass through unless the cursor is over `.capture-mouse`. */
export function useClickThrough(enabled = true): void {
  useEffect(() => {
    if (!enabled) {
      window.battleBuddy.setClickThrough(false)
      return
    }
    let last = true
    const send = (pass: boolean) => {
      if (pass === last) return
      last = pass
      window.battleBuddy.setClickThrough(pass)
    }
    const onMove = (event: MouseEvent) => {
      const hit = document.elementFromPoint(event.clientX, event.clientY)
      const over = Boolean(hit instanceof Element && hit.closest('.capture-mouse'))
      send(!over)
    }
    const passThrough = () => send(true)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('pointermove', onMove)
    document.addEventListener('mouseleave', passThrough)
    send(true)
    return () => {
      send(true)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('mouseleave', passThrough)
    }
  }, [enabled])
}
