import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useTitle } from '../lib/hooks.js'
import { ErrorNote } from '../components/Ui.jsx'

const SHOW_DEMO = import.meta.env.VITE_SHOW_DEMO_LOGIN === 'true'

export default function Auth({ mode }) {
  const isLogin = mode === 'login'
  useTitle(isLogin ? 'Sign in' : 'Create account')
  const { user, signIn, register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from || '/'
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'customer' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to={from} replace />

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (isLogin) await signIn(form.email, form.password)
      else await register(form.name, form.email, form.password, form.role)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }
  const fill = (email, password) => setForm((f) => ({ ...f, email, password }))

  return (
    <div className="auth">
      <h1>{isLogin ? 'Sign in' : 'Create your account'}</h1>
      <p className="lede">
        {isLogin ? 'Sign in to hold seats and see your tickets.' : 'You need an account to hold seats and keep your tickets.'}
      </p>
      <form onSubmit={submit} className="form" noValidate>
        {!isLogin && (
          <fieldset className="role-pick">
            <legend>I want to</legend>
            {[
              ['customer', 'Book tickets', 'Browse events, hold seats and get QR tickets.'],
              ['creator', 'Host events', 'Publish events, set up passes and prices, manage shows.'],
            ].map(([value, title, hint]) => (
              <label key={value} className={`role-option${form.role === value ? ' is-on' : ''}`}>
                <input type="radio" name="role" value={value} checked={form.role === value} onChange={set('role')} />
                <span><strong>{title}</strong><small>{hint}</small></span>
              </label>
            ))}
          </fieldset>
        )}
        {!isLogin && (
          <div className="field">
            <label htmlFor="name">Full name</label>
            <input id="name" autoComplete="name" required value={form.name} onChange={set('name')} />
          </div>
        )}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password" type="password" required minLength={6}
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            value={form.password} onChange={set('password')}
          />
          {!isLogin && <span className="hint">At least 6 characters.</span>}
        </div>
        <ErrorNote error={error} />
        <button className="btn btn-block" disabled={busy}>
          {busy ? 'Please wait' : isLogin ? 'Sign in' : 'Create account'}
        </button>
      </form>
      <p className="auth-switch">
        {isLogin ? 'New here?' : 'Already have an account?'}{' '}
        <Link to={isLogin ? '/register' : '/login'} state={location.state}>
          {isLogin ? 'Create an account' : 'Sign in'}
        </Link>
      </p>
      {SHOW_DEMO && isLogin && (
        <p className="auth-demo">
          Local demo accounts:{' '}
          <button type="button" className="link-btn" onClick={() => fill('demo@seatlock.local', 'Demo123!')}>fill customer</button>
          {' or '}
          <button type="button" className="link-btn" onClick={() => fill('admin@seatlock.local', 'Admin123!')}>fill event creator</button>
        </p>
      )}
    </div>
  )
}
