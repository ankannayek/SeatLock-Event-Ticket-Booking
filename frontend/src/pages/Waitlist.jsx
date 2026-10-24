import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useToast } from '../context/ToastContext.jsx'
import { useFetch, useTitle } from '../lib/hooks.js'
import { dateShort, timeOf } from '../lib/format.js'
import { Empty, ErrorNote, Loading, PageHead } from '../components/Ui.jsx'

const LABEL = { waiting: 'Waiting', notified: 'Seats may be free', cancelled: 'Left' }

export default function Waitlist() {
  useTitle('Waitlist')
  const notify = useToast()
  const { data, error, loading, reload } = useFetch(() => api('/waitlist/me'))
  const [busy, setBusy] = useState(null)
  const entries = (data?.waitlist || []).filter((e) => e.status !== 'cancelled')

  const leave = async (id) => {
    setBusy(id)
    try {
      await api(`/waitlist/${id}`, { method: 'DELETE' })
      notify('You left the waitlist.', 'ok')
      reload(true)
    } catch (e) {
      notify(e.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <PageHead title="Waitlist">
        When a booking is cancelled, the person who has waited longest is told first. Seats are not booked for you.
      </PageHead>
      {loading && <Loading />}
      <ErrorNote error={error} onRetry={reload} />
      {!loading && !error && entries.length === 0 && (
        <Empty title="You are not on any waitlist" body="Sold-out shows let you join a waitlist from their page." action={{ to: '/', label: 'Browse events' }} />
      )}
      <ul className="ticket-list">
        {entries.map((e) => (
          <li key={e.id} className="ticket-row">
            <div className="ticket-row-main">
              <h3><Link to={`/shows/${e.show_id}`}>{e.show?.event_title}</Link></h3>
              <p>{e.show && `${dateShort(e.show.start_time)}, ${timeOf(e.show.start_time)}. ${e.show.venue}`}</p>
              <p className="muted">{e.seats_requested === 1 ? '1 seat' : `${e.seats_requested} seats`} requested</p>
            </div>
            <div className="ticket-row-side">
              <span className={`status status-${e.status}`}>{LABEL[e.status]}</span>
              {e.status === 'notified' && <Link className="btn btn-small" to={`/shows/${e.show_id}`}>Choose seats</Link>}
              {e.status === 'waiting' && (
                <button type="button" className="link-btn" disabled={busy === e.id} onClick={() => leave(e.id)}>Leave waitlist</button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
