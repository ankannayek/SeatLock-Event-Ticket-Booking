import { Link } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useFetch, useTitle } from '../lib/hooks.js'
import { bookingRef, dateShort, money, plural, timeOf } from '../lib/format.js'
import { Empty, ErrorNote, Loading, PageHead } from '../components/Ui.jsx'

function Row({ b }) {
  const cancelled = b.status === 'cancelled'
  return (
    <li className={`ticket-row${cancelled ? ' is-cancelled' : ''}`}>
      <div className="ticket-row-main">
        <h3><Link to={`/tickets/${b.id}`}>{b.show?.event_title}</Link></h3>
        <p>{b.show && `${dateShort(b.show.start_time)}, ${timeOf(b.show.start_time)}`}{b.show?.venue ? `. ${b.show.venue}` : ''}</p>
        <p className="muted">Seats {b.seats.map((s) => s.label).join(', ')}</p>
      </div>
      <div className="ticket-row-side">
        <span className={`status status-${b.status}`}>{cancelled ? 'Cancelled' : 'Confirmed'}</span>
        <span>{money(b.total)}</span>
        <span className="muted">{bookingRef(b.id)}</span>
      </div>
    </li>
  )
}

export default function Tickets() {
  useTitle('My tickets')
  const { data, error, loading, reload } = useFetch(() => api('/bookings/me'))
  const bookings = data?.bookings || []
  const active = bookings.filter((b) => b.status === 'confirmed')
  const past = bookings.filter((b) => b.status !== 'confirmed')

  return (
    <>
      <PageHead title="My tickets" />
      {loading && <Loading />}
      <ErrorNote error={error} onRetry={reload} />
      {!loading && !error && bookings.length === 0 && (
        <Empty title="No tickets yet" body="When you book seats, your tickets show up here." action={{ to: '/', label: 'Browse events' }} />
      )}
      {active.length > 0 && (
        <>
          <h2 className="section-title">{plural(active.length, 'booking')}</h2>
          <ul className="ticket-list">{active.map((b) => <Row key={b.id} b={b} />)}</ul>
        </>
      )}
      {past.length > 0 && (
        <>
          <h2 className="section-title">Cancelled</h2>
          <ul className="ticket-list">{past.map((b) => <Row key={b.id} b={b} />)}</ul>
        </>
      )}
    </>
  )
}
