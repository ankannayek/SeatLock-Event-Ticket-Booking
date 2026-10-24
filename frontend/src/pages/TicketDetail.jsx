import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useToast } from '../context/ToastContext.jsx'
import { useFetch, useTitle } from '../lib/hooks.js'
import { bookingRef, dateLong, money, plural, timeOf } from '../lib/format.js'
import QrCode from '../components/QrCode.jsx'
import { Empty, ErrorNote, Loading } from '../components/Ui.jsx'

export default function TicketDetail() {
  const { bookingId } = useParams()
  const notify = useToast()
  const { data, error, loading, reload } = useFetch(() => api(`/bookings/${bookingId}`), [bookingId])
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const b = data?.booking
  useTitle(b ? bookingRef(b.id) : 'Ticket')

  const cancel = async () => {
    setBusy(true)
    try {
      await api(`/bookings/${bookingId}/cancel`, { method: 'POST' })
      notify('Booking cancelled. Your payment was refunded.', 'ok')
      setAsking(false)
      reload(true)
    } catch (e) {
      notify(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Loading />
  if (error?.status === 403 || error?.status === 404) {
    return <Empty title="Ticket not found" body="It may belong to another account." action={{ to: '/tickets', label: 'My tickets' }} />
  }
  if (error) return <ErrorNote error={error} onRetry={reload} />
  if (!b) return <Loading />

  const cancelled = b.status === 'cancelled'
  const seats = b.seats.map((s) => s.label)
  const qrValue = [
    'SEATLOCK',
    bookingRef(b.id),
    b.show.event_title,
    `${dateLong(b.show.start_time)} ${timeOf(b.show.start_time)}`,
    b.show.venue,
    `Seats: ${seats.join(', ')}`,
    `Admits: ${seats.length}`,
  ].filter(Boolean).join('\n')

  return (
    <>
      <p className="crumbs no-print"><Link to="/tickets">My tickets</Link></p>

      <article className={`ticket${cancelled ? ' ticket-void' : ''}`} aria-label="Ticket">
        <div className="ticket-body">
          <h1>{b.show.event_title}</h1>
          <p className="ticket-when">{dateLong(b.show.start_time)}, {timeOf(b.show.start_time)}</p>
          <p className="ticket-where">{b.show.venue}</p>
          <div className="ticket-seats">
            <span className="ticket-label">{plural(seats.length, 'seat')}</span>
            <ul>{seats.map((s) => <li key={s}>{s}</li>)}</ul>
          </div>
        </div>
        <div className="ticket-stub">
          <dl>
            <div><dt>Booking</dt><dd>{bookingRef(b.id)}</dd></div>
            <div><dt>Admits</dt><dd>{seats.length}</dd></div>
            <div>
              <dt>{b.payment?.status === 'refunded' ? 'Refunded' : 'Paid'}</dt>
              <dd>{money(b.total)}</dd>
            </div>
          </dl>
          {!cancelled && (
            <div className="ticket-qr">
              <QrCode value={qrValue} label={`QR code for booking ${bookingRef(b.id)}`} />
              <span className="ticket-qr-note">Show this at the entrance</span>
            </div>
          )}
        </div>
        {cancelled && <div className="ticket-stamp" aria-hidden="true"><span>Cancelled</span></div>}
      </article>

      <div className="ticket-actions no-print">
        {!cancelled && !asking && (
          <>
            <button type="button" className="btn" onClick={() => window.print()}>Print ticket</button>
            <button type="button" className="btn btn-quiet" onClick={() => setAsking(true)}>Cancel booking</button>
          </>
        )}
        {!cancelled && asking && (
          <div className="note note-warn" role="alertdialog" aria-label="Confirm cancellation">
            <span>Cancel this booking and refund {money(b.total)}? The seats go back on sale.</span>
            <span className="note-actions">
              <button type="button" className="btn btn-danger btn-small" onClick={cancel} disabled={busy}>Cancel booking</button>
              <button type="button" className="link-btn" onClick={() => setAsking(false)}>Keep ticket</button>
            </span>
          </div>
        )}
        {cancelled && <Link className="btn" to={`/events/${b.show.event_id}`}>Book again</Link>}
      </div>
      <p className="fineprint no-print">Payment was a test payment. No real money moved.</p>
    </>
  )
}
