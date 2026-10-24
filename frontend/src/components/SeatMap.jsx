import { money } from '../lib/format.js'

// Seats grouped by category (rows stay in order); price is shown once per group.
export default function SeatMap({ seats, selected, mine, onToggle }) {
  const groups = []
  const rowMap = new Map()
  for (const s of seats) {
    let row = rowMap.get(s.row)
    if (!row) {
      row = { label: s.row, seats: [], category: s.category, price: s.price }
      rowMap.set(s.row, row)
      const last = groups[groups.length - 1]
      if (last && last.category === s.category && last.price === s.price) last.rows.push(row)
      else groups.push({ category: s.category, price: s.price, rows: [row] })
    }
    row.seats.push(s)
  }

  const stateOf = (s) => {
    if (s.status === 'booked') return 'booked'
    if (s.status === 'held') return mine.has(s.id) ? 'mine' : 'held'
    return selected.has(s.id) ? 'selected' : 'available'
  }
  const describe = (s, st) =>
    `Row ${s.row}, seat ${s.seat_number}, ${s.category}, ${money(s.price)}, ` +
    { available: 'available', selected: 'selected', mine: 'held by you', held: 'held by someone else', booked: 'booked' }[st]

  return (
    <div className="seatmap">
      <div className="stage" aria-hidden="true">Stage</div>
      {groups.map((g) => (
        <section key={`${g.category}-${g.price}`} className="seat-group" aria-label={`${g.category} seats`}>
          <h3 className="seat-group-title">
            <span>{g.category}</span>
            <span>{money(g.price)}</span>
          </h3>
          {g.rows.map((row) => {
            const mid = Math.floor(row.seats.length / 2)
            return (
              <div className="seat-row" key={row.label} role="group" aria-label={`Row ${row.label}`}>
                <span className="row-label" aria-hidden="true">{row.label}</span>
                {row.seats.map((s, i) => {
                  const st = stateOf(s)
                  const disabled = st === 'booked' || st === 'held' || st === 'mine'
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`seat seat-${st}${i === mid && mid > 0 ? ' seat-aisle' : ''}`}
                      disabled={disabled}
                      aria-pressed={st === 'selected'}
                      aria-label={describe(s, st)}
                      onClick={() => onToggle(s)}
                    >
                      {s.seat_number}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </section>
      ))}
    </div>
  )
}

export function SeatLegend() {
  const items = [
    ['available', 'Available'],
    ['selected', 'Your selection'],
    ['mine', 'Held for you'],
    ['held', 'Held by others'],
    ['booked', 'Booked'],
  ]
  return (
    <ul className="legend" aria-label="Seat key">
      {items.map(([k, label]) => (
        <li key={k}><span className={`seat seat-${k} seat-key`} aria-hidden="true" />{label}</li>
      ))}
    </ul>
  )
}
