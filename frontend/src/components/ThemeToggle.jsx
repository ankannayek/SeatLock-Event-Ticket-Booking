import { useEffect, useState } from 'react'

const KEY = 'seatlock_theme'
const current = () => document.documentElement.getAttribute('data-theme') || 'light'

function apply(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0a1119' : '#101c2b')
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(current)

  // Follow the system setting until the person picks one themselves.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e) => {
      let saved = null
      try { saved = localStorage.getItem(KEY) } catch { /* storage blocked */ }
      if (saved) return
      const t = e.matches ? 'dark' : 'light'
      apply(t)
      setTheme(t)
    }
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    apply(next)
    setTheme(next)
    try { localStorage.setItem(KEY, next) } catch { /* storage blocked */ }
  }

  const dark = theme === 'dark'
  return (
    <button type="button" className="theme-toggle" onClick={toggle} aria-pressed={dark} aria-label="Dark mode" title={dark ? 'Switch to light' : 'Switch to dark'}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        {dark ? (
          <path fill="currentColor" d="M12 4a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V5a1 1 0 0 1 1-1Zm0 14a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1Zm8-7a1 1 0 1 1 0 2h-1a1 1 0 1 1 0-2h1ZM6 12a1 1 0 0 1-1 1H4a1 1 0 1 1 0-2h1a1 1 0 0 1 1 1Zm10.95-5.54a1 1 0 0 1 0 1.41l-.7.71a1 1 0 1 1-1.42-1.42l.71-.7a1 1 0 0 1 1.41 0ZM8.17 15.83a1 1 0 0 1 0 1.41l-.71.71a1 1 0 1 1-1.41-1.42l.7-.7a1 1 0 0 1 1.42 0Zm8.78 2.12-.7-.71a1 1 0 0 1 1.41-1.41l.71.7a1 1 0 0 1-1.42 1.42ZM8.17 8.17 7.46 7.46a1 1 0 1 1 1.41-1.41l.71.7a1 1 0 0 1-1.41 1.42ZM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
        ) : (
          <path fill="currentColor" d="M21 14.5A8.5 8.5 0 0 1 9.5 3a1 1 0 0 0-1.2-1.2A10 10 0 1 0 22.2 15.7 1 1 0 0 0 21 14.5Z" />
        )}
      </svg>
    </button>
  )
}
