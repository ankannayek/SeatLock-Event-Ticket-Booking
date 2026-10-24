import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api.js'

export const APP_NAME = import.meta.env.VITE_APP_NAME || 'SeatLock'

export function useTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} | ${APP_NAME}` : APP_NAME
  }, [title])
}

// Small data loader: { data, error, loading, reload }.
// Refreshes quietly when the tab becomes visible again, and ignores responses
// that arrive after the page has moved on.
export function useFetch(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  const fnRef = useRef(fn)
  fnRef.current = fn
  const seq = useRef(0)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])
  const run = useCallback((silent = false) => {
    const mine = ++seq.current
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }))
    return fnRef.current().then(
      (data) => alive.current && mine === seq.current && setState({ data, error: null, loading: false }),
      (error) => alive.current && mine === seq.current && setState((s) => (silent ? s : { data: null, error, loading: false })),
    )
  }, [])
  useEffect(() => {
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) run(true) }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [run])
  return { ...state, reload: run }
}

let configCache
export function useConfig() {
  const [cfg, setCfg] = useState(configCache || { hold_seconds: 600, max_seats_per_hold: 8 })
  useEffect(() => {
    if (configCache) return
    api('/config', { auth: false }).then((c) => {
      configCache = c
      setCfg(c)
    }).catch(() => {})
  }, [])
  return cfg
}
