import { useEffect, useRef, useState } from 'react'
import { mmss } from '../lib/format.js'

// Counts down from a server-provided number of seconds. `resetKey` restarts it.
export function useCountdown(seconds, resetKey, onExpire) {
  const [left, setLeft] = useState(seconds)
  const expire = useRef(onExpire)
  expire.current = onExpire
  useEffect(() => {
    if (seconds == null) return undefined
    const deadline = Date.now() + seconds * 1000
    let fired = false
    const tick = () => {
      const s = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      setLeft(s)
      if (s === 0 && !fired) {
        fired = true
        expire.current?.()
      }
    }
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [seconds, resetKey])
  return left
}

export default function Countdown({ left, total }) {
  const pct = total ? Math.min(100, (left / total) * 100) : 0
  return (
    <div className="countdown">
      <div className="countdown-time" aria-hidden="true">{mmss(left)}</div>
      <span className="visually-hidden">{mmss(left)} left on your hold</span>
      <div className="countdown-bar"><span style={{ width: `${pct}%` }} /></div>
    </div>
  )
}
