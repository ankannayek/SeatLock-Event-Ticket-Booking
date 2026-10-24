import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useConfig, useFetch, useTitle } from '../lib/hooks.js'
import { dateShort, dayNum, monthShort, plural, timeOf } from '../lib/format.js'
import { Empty, ErrorNote, Loading } from '../components/Ui.jsx'
import { EventCover } from '../components/EventArt.jsx'

const firstTime = (ev) => (ev.shows?.[0]?.start_time ? new Date(ev.shows[0].start_time).getTime() : Infinity)
const seatsLeft = (ev) => (ev.shows || []).reduce((n, s) => n + (s.seat_summary?.available || 0), 0)
const seatsTotal = (ev) => (ev.shows || []).reduce((n, s) => n + (s.seat_summary?.total || 0), 0)

function Art({ ev, className }) {
  return <EventCover event={ev} className={className} />
}

function Hero({ ev }) {
  const first = ev.shows?.[0]
  const left = seatsLeft(ev)
  return (
    <section className="hero" aria-label="Featured event">
      <Art ev={ev} className="hero-art" />
      <div className="hero-shade" />
      <div className="hero-body">
        <span className="pill pill-solid">Featured{ev.category ? ` · ${ev.category}` : ''}</span>
        <h1>{ev.title}</h1>
        <p className="hero-meta">
          {first && <>{dateShort(first.start_time)}, {timeOf(first.start_time)} · </>}{ev.venue}
        </p>
        {ev.description && <p className="hero-desc">{ev.description}</p>}
        <div className="hero-actions">
          <Link className="btn btn-taxi" to={`/events/${ev.id}`}>Get tickets</Link>
          {seatsTotal(ev) > 0 && <span className="hero-left">{left === 0 ? 'Sold out' : `${left} seats left`}</span>}
        </div>
      </div>
    </section>
  )
}

function Card({ ev }) {
  const shows = ev.shows || []
  const first = shows[0]
  const left = seatsLeft(ev)
  const total = seatsTotal(ev)
  const hot = total > 0 && left > 0 && left / total < 0.3
  return (
    <li className="card">
      <Link to={`/events/${ev.id}`} className="card-media" aria-label={ev.title} tabIndex={-1}>
        <Art ev={ev} />
        {first && (
          <span className="card-date" aria-hidden="true">
            <b>{dayNum(first.start_time)}</b>{monthShort(first.start_time)}
          </span>
        )}
        {ev.category && <span className="pill">{ev.category}</span>}
        {total > 0 && left === 0 && <span className="pill pill-sold">Sold out</span>}
        {hot && <span className="pill pill-hot">Selling fast</span>}
      </Link>
      <div className="card-body">
        <h2><Link to={`/events/${ev.id}`}>{ev.title}</Link></h2>
        <p className="card-venue">{ev.venue}</p>
        {ev.description && <p className="card-desc">{ev.description}</p>}
        <div className="card-shows">
          {shows.length === 0 && <span className="muted">No shows scheduled</span>}
          {shows.length > 0 && <span className="card-shows-label">{plural(shows.length, 'show')}</span>}
          {shows.map((s) => (
            <Link key={s.id} className="chip" to={`/shows/${s.id}`}>
              {dateShort(s.start_time)}, {timeOf(s.start_time)}
            </Link>
          ))}
        </div>
      </div>
    </li>
  )
}

export default function Home() {
  useTitle('Events')
  const cfg = useConfig()
  const { data, error, loading, reload } = useFetch(() => api('/events', { auth: false }))
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')

  const events = useMemo(() => [...(data?.events || [])].sort((a, b) => firstTime(a) - firstTime(b)), [data])
  const categories = useMemo(() => ['All', ...new Set(events.map((e) => e.category).filter(Boolean))], [events])
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return events.filter(
      (e) => (category === 'All' || e.category === category) &&
        (!q || `${e.title} ${e.venue} ${e.description}`.toLowerCase().includes(q)),
    )
  }, [events, query, category])
  const featured = !query && category === 'All' ? events.find((e) => e.shows?.length) : null

  return (
    <>
      {featured && <Hero ev={featured} />}
      {!featured && (
        <div className="page-head">
          <h1>Upcoming events</h1>
          <p className="lede">Choose a show, pick your seats, and we hold them for {Math.round(cfg.hold_seconds / 60)} minutes while you check out.</p>
        </div>
      )}

      <div className="steps" aria-label="How it works">
        <span><b>1</b> Pick a show</span>
        <span><b>2</b> Choose seats, held for {Math.round(cfg.hold_seconds / 60)} min</span>
        <span><b>3</b> Pay and get your QR ticket</span>
      </div>

      <div className="filters">
        <div className="field filters-search">
          <label htmlFor="q">Search events</label>
          <input id="q" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Title or venue" />
        </div>
        {categories.length > 2 && (
          <div className="tabs" role="group" aria-label="Category">
            {categories.map((c) => (
              <button key={c} type="button" className="tab" aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>
            ))}
          </div>
        )}
      </div>

      {loading && <Loading label="Loading events" />}
      <ErrorNote error={error} onRetry={reload} />
      {!loading && !error && events.length === 0 && <Empty title="No events yet" body="Events appear here as soon as they are published." />}
      {!loading && events.length > 0 && visible.length === 0 && <Empty title="Nothing matches that search" body="Try a different word or clear the category." />}

      <ul className="cards">{visible.map((ev) => <Card key={ev.id} ev={ev} />)}</ul>
    </>
  )
}
