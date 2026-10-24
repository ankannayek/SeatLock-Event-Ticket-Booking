import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useToast } from '../context/ToastContext.jsx'
import { useFetch, useTitle } from '../lib/hooks.js'
import { dateShort, plural, timeOf } from '../lib/format.js'
import { ErrorNote, Loading, PageHead } from '../components/Ui.jsx'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

// First ~30% of rows Premium, last ~20% VIP, the rest Standard.
function layoutFor(rows, perRow, prices) {
  const labels = [...LETTERS].slice(0, rows)
  const prem = Math.max(1, Math.round(rows * 0.3))
  const vip = rows >= 5 ? Math.round(rows * 0.2) : 0
  const categories = {}
  labels.forEach((l, i) => {
    categories[l] = i < prem ? 'Premium' : i >= rows - vip ? 'VIP' : 'Standard'
  })
  return { rows: labels, seats_per_row: perRow, categories, prices }
}

export default function Admin() {
  useTitle('Manage events')
  const notify = useToast()
  const { data, error, loading, reload } = useFetch(() => api('/events', { auth: false }))
  const events = data?.events || []

  const [ev, setEv] = useState({ title: '', venue: '', category: '', description: '' })
  const [sh, setSh] = useState({ event_id: '', start: '', rows: 10, per_row: 10, premium: 799, standard: 499, vip: 1199 })
  const [busy, setBusy] = useState('')

  const createEvent = async (e) => {
    e.preventDefault()
    setBusy('event')
    try {
      const res = await api('/admin/events', { method: 'POST', body: ev })
      notify(`Event "${res.event.title}" created. Add a show to put it on sale.`, 'ok')
      setEv({ title: '', venue: '', category: '', description: '' })
      setSh((s) => ({ ...s, event_id: String(res.event.id) }))
      reload(true)
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setBusy('')
    }
  }

  const createShow = async (e) => {
    e.preventDefault()
    setBusy('show')
    try {
      const rows = Math.min(26, Math.max(1, Number(sh.rows)))
      const perRow = Math.min(30, Math.max(1, Number(sh.per_row)))
      const res = await api(`/admin/events/${sh.event_id}/shows`, {
        method: 'POST',
        body: {
          start_time: sh.start.length === 16 ? `${sh.start}:00` : sh.start,
          seat_layout: layoutFor(rows, perRow, {
            Premium: Number(sh.premium), Standard: Number(sh.standard), VIP: Number(sh.vip),
          }),
        },
      })
      notify(`Show added with ${plural(res.seats_created, 'seat')}.`, 'ok')
      reload(true)
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setBusy('')
    }
  }

  const rowsN = Math.min(26, Math.max(1, Number(sh.rows) || 1))
  const perN = Math.min(30, Math.max(1, Number(sh.per_row) || 1))
  const f = (obj, set, k) => ({ value: obj[k], onChange: (e) => set((o) => ({ ...o, [k]: e.target.value })) })

  return (
    <>
      <PageHead title="Manage events">Create events and schedule shows. Seats are generated when a show is added.</PageHead>

      <div className="admin-grid">
        <form className="panel form" onSubmit={createEvent}>
          <h2>New event</h2>
          <div className="field"><label htmlFor="t">Title</label><input id="t" required {...f(ev, setEv, 'title')} /></div>
          <div className="field"><label htmlFor="v">Venue</label><input id="v" {...f(ev, setEv, 'venue')} /></div>
          <div className="field"><label htmlFor="c">Category</label><input id="c" placeholder="Music, Comedy, Conference" {...f(ev, setEv, 'category')} /></div>
          <div className="field"><label htmlFor="d">Description</label><textarea id="d" rows={3} {...f(ev, setEv, 'description')} /></div>
          <button className="btn" disabled={busy === 'event'}>Create event</button>
        </form>

        <form className="panel form" onSubmit={createShow}>
          <h2>New show</h2>
          <div className="field">
            <label htmlFor="e">Event</label>
            <select id="e" required {...f(sh, setSh, 'event_id')}>
              <option value="">Select an event</option>
              {events.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="s">Starts</label><input id="s" type="datetime-local" required {...f(sh, setSh, 'start')} /></div>
          <div className="field-pair">
            <div className="field"><label htmlFor="r">Rows</label><input id="r" type="number" min="1" max="26" {...f(sh, setSh, 'rows')} /></div>
            <div className="field"><label htmlFor="p">Seats per row</label><input id="p" type="number" min="1" max="30" {...f(sh, setSh, 'per_row')} /></div>
          </div>
          <div className="field-trio">
            <div className="field"><label htmlFor="pp">Premium (₹)</label><input id="pp" type="number" min="0" {...f(sh, setSh, 'premium')} /></div>
            <div className="field"><label htmlFor="ps">Standard (₹)</label><input id="ps" type="number" min="0" {...f(sh, setSh, 'standard')} /></div>
            <div className="field"><label htmlFor="pv">VIP (₹)</label><input id="pv" type="number" min="0" {...f(sh, setSh, 'vip')} /></div>
          </div>
          <p className="hint">Rows A to {LETTERS[rowsN - 1]}, {perN} seats each: {rowsN * perN} seats in total.</p>
          <button className="btn" disabled={busy === 'show' || !sh.event_id}>Add show</button>
        </form>
      </div>

      <h2 className="section-title">Current events</h2>
      {loading && <Loading />}
      <ErrorNote error={error} onRetry={reload} />
      <ul className="ticket-list">
        {events.map((x) => (
          <li key={x.id} className="ticket-row">
            <div className="ticket-row-main">
              <h3><Link to={`/events/${x.id}`}>{x.title}</Link></h3>
              <p>{x.venue}</p>
              <p className="muted">
                {x.shows.length === 0 ? 'No shows yet' : x.shows.map((s) => `${dateShort(s.start_time)}, ${timeOf(s.start_time)}`).join('; ')}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
