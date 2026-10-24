import { Link } from 'react-router-dom'

export function Loading({ label = 'Loading' }) {
  return <p className="loading" role="status">{label}…</p>
}

export function ErrorNote({ error, onRetry }) {
  if (!error) return null
  return (
    <div className="note note-error" role="alert">
      <span>{error.message || String(error)}</span>
      {onRetry && <button type="button" className="link-btn" onClick={() => onRetry()}>Try again</button>}
    </div>
  )
}

export function Empty({ title, body, action }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      {body && <p>{body}</p>}
      {action && <Link className="btn" to={action.to}>{action.label}</Link>}
    </div>
  )
}

export function PageHead({ title, children }) {
  return (
    <div className="page-head">
      <h1>{title}</h1>
      {children && <p className="lede">{children}</p>}
    </div>
  )
}

// Segmented bar: booked / held / available out of total.
export function Availability({ summary }) {
  const { total, available, held, booked } = summary
  const pct = (n) => `${total ? (n / total) * 100 : 0}%`
  return (
    <div className="avail">
      <div className="avail-bar" role="img" aria-label={`${available} of ${total} seats available`}>
        <span className="avail-booked" style={{ width: pct(booked) }} />
        <span className="avail-held" style={{ width: pct(held) }} />
        <span className="avail-free" style={{ width: pct(available) }} />
      </div>
      <span className="avail-text">{available === 0 ? 'Sold out' : `${available} of ${total} seats left`}</span>
    </div>
  )
}
