import { useEffect } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { APP_NAME } from '../lib/hooks.js'
import ErrorBoundary from './ErrorBoundary.jsx'
import ThemeToggle from './ThemeToggle.jsx'

function Mark() {
  return (
    <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M9 6h14a2 2 0 0 1 2 2v9H7V8a2 2 0 0 1 2-2Zm-2 12h18v4a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-4Z" fill="currentColor" />
    </svg>
  )
}

export default function Layout() {
  const { user, signOut } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  const leave = () => {
    signOut()
    navigate('/')
  }

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className="site-header">
        <div className="bar">
          <Link to="/" className="brand" aria-label={`${APP_NAME} home`}>
            <Mark />
            <span>{APP_NAME}</span>
          </Link>
          <nav className="nav" aria-label="Main">
            <NavLink to="/" end>Events</NavLink>
            {user?.role === 'customer' && <NavLink to="/tickets">My tickets</NavLink>}
            {user?.role === 'customer' && <NavLink to="/waitlist">Waitlist</NavLink>}
            {user?.role === 'creator' && <NavLink to="/manage">My events</NavLink>}
          </nav>
          <div className="account">
            <ThemeToggle />
            {user ? (
              <>
                <span className="account-name">{user.name}</span>
                <span className="role-badge">{user.role === 'creator' ? 'Event creator' : 'Customer'}</span>
                <button type="button" className="link-btn" onClick={leave}>Sign out</button>
              </>
            ) : (
              <>
                <Link to="/login" className="link-btn">Sign in</Link>
                <Link to="/register" className="btn btn-small">Create account</Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main id="main" className="page">
        <ErrorBoundary resetKey={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <footer className="site-footer">
        <p>Payments are test payments. No money is charged and no refunds are real.</p>
      </footer>
    </>
  )
}
