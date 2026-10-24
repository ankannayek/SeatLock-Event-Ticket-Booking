import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { useConfig, useFetch, useTitle } from '../lib/hooks.js'
import { dateLong, money, mmss, plural, timeOf } from '../lib/format.js'
import { useCountdown } from '../components/Countdown.jsx'
import SeatMap, { SeatLegend } from '../components/SeatMap.jsx'
import { Empty, ErrorNote, Loading } from '../components/Ui.jsx'

function HeldBanner({ group, onRelease, busy }) {
  const left = useCountdown(group.seconds_left, group)
  const labels = group.holds.map((h) => h.seat.label).join(', ')
  return (
    <div className="note note-hold">
      <div>
        <strong>You are holding {labels}.</strong>
        <span> {left > 0 ? `${mmss(left)} left.` : 'The hold has just expired.'}</span>
      </div>
      <div className="note-actions">
        <Link className="btn btn-small" to={`/checkout/${group.show.id}`}>Go to checkout</Link>
        <button type="button" className="link-btn" onClick={onRelease} disabled={busy}>Release seats</button>
      </div>
    </div>
  )
}

export default function ShowSeats() {
  const { showId } = useParams()
  const { user } = useAuth()
  const cfg = useConfig()
  const notify = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [selected, setSelected] = useState(() => new Map())
  const [busy, setBusy] = useState(false)

  const { data, error, loading, reload } = useFetch(async () => {
    const [show, seats, holds] = await Promise.all([
      api(`/shows/${showId}`, { auth: false }),
      api(`/shows/${showId}/seats`, { auth: false }),
      user ? api(`/holds/me?show_id=${showId}`).catch(() => ({ holds: [] })) : { holds: [] },
    ])
    return { show: show.show, seats: seats.seats, group: holds.holds[0] || null }
  }, [showId, user?.id])

  // Keep the map fresh while the page is open.
  useEffect(() => {
    const id = setInterval(() => !document.hidden && !busy && reload(true), 8000)
    return () => clearInterval(id)
  }, [reload, busy])

  // Drop selections that someone else took in the meantime.
  useEffect(() => {
    if (!data) return
    setSelected((prev) => {
      const next = new Map(prev)
      for (const id of prev.keys()) {
        const s = (data.seats || []).find((x) => x.id === id)
        if (!s || s.status !== 'available') next.delete(id)
      }
      return next.size === prev.size ? prev : next
    })
  }, [data])

  const show = data?.show
  useTitle(show?.event?.title ? `Seats for ${show.event.title}` : 'Seats')

  const mine = useMemo(() => new Set((data?.group?.holds || []).map((h) => h.seat_id)), [data])
  const ids = useMemo(() => new Set(selected.keys()), [selected])
  const chosen = [...selected.values()]
  const total = chosen.reduce((n, s) => n + s.price, 0)

  const toggle = (seat) => {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(seat.id)) next.delete(seat.id)
      else if (next.size >= cfg.max_seats_per_hold) notify(`You can pick up to ${cfg.max_seats_per_hold} seats at a time.`, 'error')
      else next.set(seat.id, seat)
      return next
    })
  }

  const hold = async () => {
    setBusy(true)
    try {
      await api(`/shows/${showId}/holds`, { method: 'POST', body: { seat_ids: [...selected.keys()] } })
      navigate(`/checkout/${showId}`)
    } catch (e) {
      notify(e.message, 'error')
      setSelected(new Map())
      reload(true)
    } finally {
      setBusy(false)
    }
  }

  const release = async () => {
    setBusy(true)
    try {
      await api(`/shows/${showId}/holds`, { method: 'DELETE' })
      notify('Seats released.', 'ok')
      reload(true)
    } catch (e) {
      notify(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const joinWaitlist = async () => {
    if (!user) return navigate('/login', { state: { from: location.pathname } })
    setBusy(true)
    try {
      await api(`/shows/${showId}/waitlist`, { method: 'POST', body: { seats_requested: 1 } })
      notify('You are on the waitlist.', 'ok')
      navigate('/waitlist')
    } catch (e) {
      notify(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loading && !data) return <Loading label="Loading seats" />
  if (error?.status === 404) return <Empty title="Show not found" action={{ to: '/', label: 'Browse events' }} />
  if (error && !data) return <ErrorNote error={error} onRetry={reload} />

  if (!show || !data) return <Loading label="Loading seats" />
  const soldOut = show.seat_summary?.available === 0 && !data.group

  return (
    <>
      <p className="crumbs">
        <Link to="/">All events</Link> / <Link to={`/events/${show.event_id}`}>{show.event_title ?? show.event?.title}</Link>
      </p>
      <div className="page-head">
        <h1>{show.event_title ?? show.event?.title}</h1>
        <p className="lede">{dateLong(show.start_time)}, {timeOf(show.start_time)}. {show.event?.venue}</p>
      </div>

      {data.group && <HeldBanner group={data.group} onRelease={release} busy={busy} />}

      <div className="seat-layout">
        <section className="panel seat-panel" aria-label="Seat map">
          <SeatLegend />
          <div className="seatmap-scroll">
            <SeatMap seats={data.seats || []} selected={ids} mine={mine} onToggle={toggle} />
          </div>
        </section>

        <aside className="panel order" aria-label="Your selection">
          <h2>Your selection</h2>
          <div aria-live="polite">
            {chosen.length === 0 ? (
              <p className="muted">
                {soldOut ? 'Every seat for this show is taken.' : 'Select seats on the map to start.'}
              </p>
            ) : (
              <ul className="order-list">
                {chosen.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })).map((s) => (
                  <li key={s.id}>
                    <span>{s.label} <span className="muted">{s.category}</span></span>
                    <span>{money(s.price)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {chosen.length > 0 && (
            <p className="order-total"><span>Total for {plural(chosen.length, 'seat')}</span><strong>{money(total)}</strong></p>
          )}

          {soldOut && user?.role !== 'creator' ? (
            <button type="button" className="btn btn-block" onClick={joinWaitlist} disabled={busy}>Join waitlist</button>
          ) : user?.role === 'creator' ? (
            <p className="note note-info">Event creator accounts can’t book seats. Sign in with a customer account to buy tickets.</p>
          ) : user ? (
            <button type="button" className="btn btn-block" disabled={busy || chosen.length === 0} onClick={hold}>
              {chosen.length ? `Hold ${plural(chosen.length, 'seat')}` : 'Hold seats'}
            </button>
          ) : (
            <Link className="btn btn-block" to="/login" state={{ from: location.pathname }}>Sign in to hold seats</Link>
          )}
          <p className="fineprint">
            Held seats are yours for {Math.round(cfg.hold_seconds / 60)} minutes. After that they go back on sale.
          </p>
        </aside>
      </div>
    </>
  )
}
