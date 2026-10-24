import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { useFetch, useTitle } from '../lib/hooks.js'
import { dateLong, timeOf } from '../lib/format.js'
import { EventCover } from '../components/EventArt.jsx'
import { Availability, Empty, ErrorNote, Loading } from '../components/Ui.jsx'

export default function EventDetail() {
  const { eventId } = useParams()
  const { user } = useAuth()
  const notify = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const { data, error, loading, reload } = useFetch(() => api(`/events/${eventId}`, { auth: false }), [eventId])
  const [busy, setBusy] = useState(null)
  const ev = data?.event
  useTitle(ev?.title)

  const joinWaitlist = async (showId) => {
    if (!user) return navigate('/login', { state: { from: location.pathname } })
    setBusy(showId)
    try {
      await api(`/shows/${showId}/waitlist`, { method: 'POST', body: { seats_requested: 1 } })
      notify('You are on the waitlist. We will mark it when seats open up.', 'ok')
      navigate('/waitlist')
    } catch (e) {
      notify(e.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <Loading />
  if (error?.status === 404) return <Empty title="Event not found" action={{ to: '/', label: 'Browse events' }} />
  if (error) return <ErrorNote error={error} onRetry={reload} />
  if (!ev) return <Loading />

  return (
    <>
      <p className="crumbs"><Link to="/">All events</Link></p>
      <section className="hero hero-small">
        <EventCover event={ev} className="hero-art" />
        <div className="hero-shade" />
        <div className="hero-body">
          {ev.category && <span className="pill pill-solid">{ev.category}</span>}
          <h1>{ev.title}</h1>
          <p className="hero-meta">{ev.venue}</p>
        </div>
      </section>
      {ev.description && <p className="prose">{ev.description}</p>}

      <h2 className="section-title">Choose a show</h2>
      {ev.shows.length === 0 && <Empty title="No shows scheduled" body="Check back soon." />}
      <ul className="shows">
        {ev.shows.map((s) => {
          const soldOut = s.seat_summary.available === 0
          return (
            <li key={s.id} className="show-row">
              <div className="show-when">
                <strong>{dateLong(s.start_time)}</strong>
                <span>{timeOf(s.start_time)}</span>
              </div>
              <Availability summary={s.seat_summary} />
              <div className="show-action">
                {soldOut ? (
                  <button type="button" className="btn btn-quiet" disabled={busy === s.id} onClick={() => joinWaitlist(s.id)}>
                    Join waitlist
                  </button>
                ) : (
                  <Link className="btn" to={`/shows/${s.id}`}>Select seats</Link>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </>
  )
}
