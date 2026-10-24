import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useToast } from '../context/ToastContext.jsx'
import { useFetch, useTitle } from '../lib/hooks.js'
import { dateShort, money, plural, timeOf } from '../lib/format.js'
import { ErrorNote, Loading, PageHead } from '../components/Ui.jsx'
import { EventCover } from '../components/EventArt.jsx'
import ImagePicker from '../components/ImagePicker.jsx'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const DEFAULT_PASSES = [
  { name: 'Premium', price: 799, rows: 3 },
  { name: 'Standard', price: 499, rows: 5 },
  { name: 'VIP', price: 1199, rows: 2 },
]
const EMPTY_EVENT = { title: '', venue: '', category: '', description: '', image_url: '' }
const bind = (obj, set, k) => ({ value: obj[k] ?? '', onChange: (e) => set((o) => ({ ...o, [k]: e.target.value })) })

/* ---------- event form (create + edit) ---------- */
function EventForm({ initial = EMPTY_EVENT, submitLabel, busy, onSubmit, onCancel, idPrefix = 'ev' }) {
  const [ev, setEv] = useState(initial)
  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); onSubmit(ev, () => setEv(EMPTY_EVENT)) }}>
      <div className="field"><label htmlFor={`${idPrefix}-t`}>Title</label><input id={`${idPrefix}-t`} required {...bind(ev, setEv, 'title')} /></div>
      <div className="field"><label htmlFor={`${idPrefix}-v`}>Venue</label><input id={`${idPrefix}-v`} {...bind(ev, setEv, 'venue')} /></div>
      <div className="field"><label htmlFor={`${idPrefix}-c`}>Category</label><input id={`${idPrefix}-c`} placeholder="Music, Comedy, Conference" {...bind(ev, setEv, 'category')} /></div>
      <div className="field"><label htmlFor={`${idPrefix}-d`}>Description</label><textarea id={`${idPrefix}-d`} rows={3} {...bind(ev, setEv, 'description')} /></div>
      <div className="field">
        <span className="label">Cover image</span>
        <ImagePicker value={ev.image_url} onChange={(url) => setEv((o) => ({ ...o, image_url: url }))} title={ev.title} category={ev.category} />
      </div>
      <div className="form-actions">
        <button className="btn" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
        {onCancel && <button type="button" className="link-btn" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  )
}

/* ---------- passes editor for a NEW show ---------- */
function PassBuilder({ passes, setPasses, perRow }) {
  const update = (i, k, v) => setPasses((p) => p.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  const move = (i, d) => setPasses((p) => {
    const n = [...p]; const j = i + d
    if (j < 0 || j >= n.length) return p
    ;[n[i], n[j]] = [n[j], n[i]]
    return n
  })
  const rows = passes.reduce((n, p) => n + (Number(p.rows) || 0), 0)
  let cursor = 0
  return (
    <div className="passes">
      <div className="pass-head" aria-hidden="true"><span>Pass name</span><span>Price (₹)</span><span>Rows</span><span /></div>
      {passes.map((p, i) => {
        const from = cursor
        cursor += Number(p.rows) || 0
        return (
          <div className="pass-row" key={i}>
            <input aria-label={`Pass ${i + 1} name`} placeholder="e.g. Gold, Early bird, Balcony" value={p.name} maxLength={50} onChange={(e) => update(i, 'name', e.target.value)} />
            <input aria-label={`Pass ${i + 1} price`} type="number" min="0" value={p.price} onChange={(e) => update(i, 'price', e.target.value)} />
            <input aria-label={`Pass ${i + 1} rows`} type="number" min="1" max="26" value={p.rows} onChange={(e) => update(i, 'rows', e.target.value)} />
            <span className="pass-tools">
              <button type="button" className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move pass towards the stage">↑</button>
              <button type="button" className="icon-btn" onClick={() => move(i, 1)} disabled={i === passes.length - 1} aria-label="Move pass away from the stage">↓</button>
              <button type="button" className="icon-btn" onClick={() => setPasses((x) => x.filter((_, j) => j !== i))} disabled={passes.length === 1} aria-label="Remove pass">✕</button>
            </span>
            <span className="pass-rows-note">Rows {LETTERS[from] || '?'}{(Number(p.rows) || 0) > 1 ? ` to ${LETTERS[cursor - 1] || '?'}` : ''}</span>
          </div>
        )
      })}
      <div className="pass-foot">
        <button type="button" className="btn btn-small btn-quiet" disabled={passes.length >= 8} onClick={() => setPasses((p) => [...p, { name: '', price: 499, rows: 2 }])}>Add a pass</button>
        <p className="hint">First pass is closest to the stage. {rows} rows × {perRow || 0} seats = {rows * (Number(perRow) || 0)} seats{rows > 26 ? '. Maximum is 26 rows.' : '.'}</p>
      </div>
    </div>
  )
}

/* ---------- edit an existing show: time + pass names/prices ---------- */
function ShowEditor({ showId, onDone, onSaved }) {
  const notify = useToast()
  const { data, error, loading } = useFetch(() => api(`/admin/shows/${showId}`), [showId])
  const [start, setStart] = useState(null)
  const [passes, setPasses] = useState(null)
  const [busy, setBusy] = useState(false)

  if (loading) return <Loading />
  if (error) return <ErrorNote error={error} />
  const startVal = start ?? (data.show.start_time || '').slice(0, 16)
  const list = passes ?? data.passes.map((p) => ({ ...p, current_name: p.name }))
  const set = (i, k, v) => setPasses(list.map((x, j) => (j === i ? { ...x, [k]: v } : x)))

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api(`/admin/shows/${showId}`, {
        method: 'PATCH',
        body: {
          start_time: startVal.length === 16 ? `${startVal}:00` : startVal,
          passes: list.map((p) => ({ current_name: p.current_name, name: p.name, price: Number(p.price) })),
        },
      })
      notify('Show updated.', 'ok')
      onSaved()
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form show-editor" onSubmit={save}>
      <div className="field"><label htmlFor={`st-${showId}`}>Starts</label><input id={`st-${showId}`} type="datetime-local" required value={startVal} onChange={(e) => setStart(e.target.value)} /></div>
      <div className="passes">
        <div className="pass-head pass-head-edit" aria-hidden="true"><span>Pass name</span><span>Price (₹)</span><span>Seats</span></div>
        {list.map((p, i) => (
          <div className="pass-row pass-row-edit" key={p.current_name}>
            <input aria-label={`Name of ${p.current_name}`} value={p.name} maxLength={50} required onChange={(e) => set(i, 'name', e.target.value)} />
            <input aria-label={`Price of ${p.current_name}`} type="number" min="0" required value={p.price} onChange={(e) => set(i, 'price', e.target.value)} />
            <span className="pass-seats">{p.seats} seats{p.booked ? `, ${p.booked} taken` : ''}</span>
          </div>
        ))}
      </div>
      <p className="hint">
        Renaming or re-pricing a pass changes it for every seat in that pass.
        {data.has_bookings && ' Existing bookings keep the price they were paid at.'} The seat layout itself can't be changed after the show is created.
      </p>
      <div className="form-actions">
        <button className="btn btn-small" disabled={busy}>{busy ? 'Saving…' : 'Save show'}</button>
        <button type="button" className="link-btn" onClick={onDone}>Cancel</button>
      </div>
    </form>
  )
}

/* ---------- one event in the list ---------- */
function EventItem({ ev, onChanged }) {
  const notify = useToast()
  const [mode, setMode] = useState(null) // 'edit' | { show: id } | 'delete' | { delShow: id }
  const [busy, setBusy] = useState(false)

  const run = async (fn, okMsg) => {
    setBusy(true)
    try {
      await fn()
      if (okMsg) notify(okMsg, 'ok')
      setMode(null)
      onChanged()
    } catch (e) {
      notify(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const saveEvent = (data) => run(() => api(`/admin/events/${ev.id}`, { method: 'PATCH', body: data }), 'Event updated.')
  const delEvent = () => run(() => api(`/admin/events/${ev.id}`, { method: 'DELETE' }), 'Event deleted.')
  const delShow = (id) => run(() => api(`/admin/shows/${id}`, { method: 'DELETE' }), 'Show deleted.')

  return (
    <li className="manage-item">
      <div className="manage-head">
        <div className="manage-thumb">
          <EventCover event={ev} />
        </div>
        <div className="manage-info">
          <h3><Link to={`/events/${ev.id}`}>{ev.title}</Link></h3>
          <p>{ev.venue}{ev.category ? ` · ${ev.category}` : ''}</p>
        </div>
        {mode !== 'edit' && mode !== 'delete' && (
          <div className="manage-actions">
            <button type="button" className="btn btn-small btn-quiet" onClick={() => setMode('edit')}>Edit event</button>
            <button type="button" className="link-btn danger" onClick={() => setMode('delete')}>Delete</button>
          </div>
        )}
      </div>

      {mode === 'edit' && (
        <div className="manage-panel">
          <EventForm idPrefix={`e${ev.id}`} initial={{ title: ev.title, venue: ev.venue || '', category: ev.category || '', description: ev.description || '', image_url: ev.image_url || '' }}
            submitLabel="Save changes" busy={busy} onSubmit={saveEvent} onCancel={() => setMode(null)} />
        </div>
      )}

      {mode === 'delete' && (
        <div className="note note-warn" role="alertdialog" aria-label="Confirm delete">
          <span>{ev.has_bookings ? 'This event has active bookings, so it can’t be deleted. Cancel them first.' : `Delete “${ev.title}” and all its shows? This can’t be undone.`}</span>
          <span className="note-actions">
            {!ev.has_bookings && <button type="button" className="btn btn-danger btn-small" disabled={busy} onClick={delEvent}>Delete event</button>}
            <button type="button" className="link-btn" onClick={() => setMode(null)}>{ev.has_bookings ? 'Close' : 'Keep it'}</button>
          </span>
        </div>
      )}

      <ul className="manage-shows">
        {ev.shows.length === 0 && <li className="muted">No shows yet. Add one with “New show” above.</li>}
        {ev.shows.map((s) => {
          const sum = s.seat_summary
          const editing = mode?.show === s.id
          return (
            <li key={s.id}>
              <div className="manage-show-row">
                <span><strong>{dateShort(s.start_time)}, {timeOf(s.start_time)}</strong> <span className="muted">· {sum ? `${sum.available} of ${sum.total} seats left` : ''}</span></span>
                {!editing && mode?.delShow !== s.id && (
                  <span className="note-actions">
                    <button type="button" className="link-btn" onClick={() => setMode({ show: s.id })}>Edit show</button>
                    <button type="button" className="link-btn danger" onClick={() => setMode({ delShow: s.id })}>Delete</button>
                  </span>
                )}
              </div>
              {editing && <div className="manage-panel"><ShowEditor showId={s.id} onDone={() => setMode(null)} onSaved={() => { setMode(null); onChanged() }} /></div>}
              {mode?.delShow === s.id && (
                <div className="note note-warn" role="alertdialog" aria-label="Confirm delete show">
                  <span>Delete this show and its {plural(sum?.total || 0, 'seat')}? Cancelled bookings for it are removed too. Shows with active bookings can’t be deleted.</span>
                  <span className="note-actions">
                    <button type="button" className="btn btn-danger btn-small" disabled={busy} onClick={() => delShow(s.id)}>Delete show</button>
                    <button type="button" className="link-btn" onClick={() => setMode(null)}>Keep it</button>
                  </span>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </li>
  )
}

export default function Manage() {
  useTitle('My events')
  const notify = useToast()
  const { data, error, loading, reload } = useFetch(() => api('/admin/events'))
  const events = data?.events || []

  const [sh, setSh] = useState({ event_id: '', start: '', per_row: 10 })
  const [passes, setPasses] = useState(DEFAULT_PASSES)
  const [busy, setBusy] = useState('')

  const createEvent = async (ev, reset) => {
    setBusy('event')
    try {
      const res = await api('/admin/events', { method: 'POST', body: ev })
      notify(`“${res.event.title}” created. Add a show to put it on sale.`, 'ok')
      reset()
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
      const res = await api(`/admin/events/${sh.event_id}/shows`, {
        method: 'POST',
        body: {
          start_time: sh.start.length === 16 ? `${sh.start}:00` : sh.start,
          seat_layout: {
            seats_per_row: Math.min(30, Math.max(1, Number(sh.per_row) || 1)),
            passes: passes.map((p) => ({ name: p.name.trim(), price: Number(p.price), rows: Number(p.rows) })),
          },
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

  return (
    <>
      <PageHead title="My events">Create events, set up your own passes and prices, and keep everything up to date. Only you can see and change the events you create.</PageHead>

      <div className="admin-grid">
        <section className="panel">
          <h2>New event</h2>
          <EventForm idPrefix="new" submitLabel="Create event" busy={busy === 'event'} onSubmit={createEvent} />
        </section>

        <form className="panel form" onSubmit={createShow}>
          <h2>New show</h2>
          <div className="field">
            <label htmlFor="e">Event</label>
            <select id="e" required {...bind(sh, setSh, 'event_id')}>
              <option value="">Select an event</option>
              {events.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="s">Starts</label><input id="s" type="datetime-local" required {...bind(sh, setSh, 'start')} /></div>
          <div className="field"><label htmlFor="pr">Seats per row</label><input id="pr" type="number" min="1" max="30" {...bind(sh, setSh, 'per_row')} /></div>
          <div className="field">
            <span className="label">Passes</span>
            <PassBuilder passes={passes} setPasses={setPasses} perRow={sh.per_row} />
          </div>
          <button className="btn" disabled={busy === 'show' || !sh.event_id}>Add show</button>
        </form>
      </div>

      <h2 className="section-title">Your events</h2>
      {loading && <Loading />}
      <ErrorNote error={error} onRetry={reload} />
      {!loading && !error && events.length === 0 && <p className="muted">You haven’t created any events yet. Start with “New event” above.</p>}
      <ul className="manage-list">
        {events.map((x) => <EventItem key={x.id} ev={x} onChanged={() => reload(true)} />)}
      </ul>
    </>
  )
}
