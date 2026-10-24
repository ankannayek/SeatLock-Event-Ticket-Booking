import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useToast } from '../context/ToastContext.jsx'
import { useConfig, useFetch, useTitle } from '../lib/hooks.js'
import { dateLong, money, plural, timeOf } from '../lib/format.js'
import Countdown, { useCountdown } from '../components/Countdown.jsx'
import { Empty, ErrorNote, Loading } from '../components/Ui.jsx'

// One idempotency key per set of seats, kept for the tab session so a retried
// payment can never create a second booking.
function idempotencyKey(showId, seatIds) {
  const k = `seatlock:idem:${showId}:${[...seatIds].sort().join('-')}`
  let v = sessionStorage.getItem(k)
  if (!v) {
    v = crypto.randomUUID()
    sessionStorage.setItem(k, v)
  }
  return [k, v]
}

export default function Checkout() {
  useTitle('Checkout')
  const { showId } = useParams()
  const navigate = useNavigate()
  const notify = useToast()
  const cfg = useConfig()
  const [busy, setBusy] = useState(false)
  const [expired, setExpired] = useState(false)
  const [payError, setPayError] = useState(null)

  const { data, error, loading, reload } = useFetch(() => api(`/holds/me?show_id=${showId}`), [showId])
  const group = data?.holds?.[0]
  const left = useCountdown(group ? group.seconds_left : null, data, () => setExpired(true))

  if (loading) return <Loading />
  if (error) return <ErrorNote error={error} onRetry={reload} />
  if (!group || expired) {
    return (
      <Empty
        title={expired ? 'Your hold expired' : 'You are not holding any seats'}
        body={expired ? 'The seats went back on sale. You can pick them again if they are still free.' : 'Pick seats first, then come back to pay.'}
        action={{ to: `/shows/${showId}`, label: 'Choose seats' }}
      />
    )
  }

  const seatIds = group.holds.map((h) => h.seat_id)

  const pay = async () => {
    setBusy(true)
    setPayError(null)
    const [storeKey, key] = idempotencyKey(showId, seatIds)
    try {
      const res = await api(`/shows/${showId}/bookings`, {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: { seat_ids: seatIds },
      })
      sessionStorage.removeItem(storeKey)
      notify('Payment received. Your tickets are ready.', 'ok')
      navigate(`/tickets/${res.booking.id}`, { replace: true })
    } catch (e) {
      setPayError(e)
      if (e.status === 409) reload(true)
    } finally {
      setBusy(false)
    }
  }

  const release = async () => {
    setBusy(true)
    try {
      await api(`/shows/${showId}/holds`, { method: 'DELETE' })
      navigate(`/shows/${showId}`)
    } catch (e) {
      notify(e.message, 'error')
      setBusy(false)
    }
  }

  return (
    <>
      <p className="crumbs"><Link to={`/shows/${showId}`}>Back to seat map</Link></p>
      <div className="page-head">
        <h1>Checkout</h1>
        <p className="lede">{group.show.event_title}, {dateLong(group.show.start_time)}, {timeOf(group.show.start_time)}</p>
      </div>

      <div className="checkout">
        <section className="panel">
          <h2>{plural(group.holds.length, 'seat')} at {group.show.venue}</h2>
          <table className="table">
            <thead>
              <tr><th scope="col">Seat</th><th scope="col">Section</th><th scope="col" className="num">Price</th></tr>
            </thead>
            <tbody>
              {group.holds.map((h) => (
                <tr key={h.id}>
                  <th scope="row">{h.seat.label}</th>
                  <td>{h.seat.category}</td>
                  <td className="num">{money(h.seat.price)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><th scope="row" colSpan={2}>Total</th><td className="num">{money(group.total)}</td></tr>
            </tfoot>
          </table>
        </section>

        <aside className="panel pay">
          <h2>Time left to pay</h2>
          <Countdown left={left} total={cfg.hold_seconds} />
          <ErrorNote error={payError} />
          <button type="button" className="btn btn-block" onClick={pay} disabled={busy}>
            {busy ? 'Processing' : `Pay ${money(group.total)}`}
          </button>
          <button type="button" className="btn btn-quiet btn-block" onClick={release} disabled={busy}>Release seats</button>
          <p className="fineprint">This is a test payment. No card is needed and nothing is charged.</p>
        </aside>
      </div>
    </>
  )
}
