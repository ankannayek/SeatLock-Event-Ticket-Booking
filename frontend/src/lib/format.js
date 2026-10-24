const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
export const money = (n) => inr.format(n || 0)

// Show times are stored as local venue time without a zone, so new Date() reads them as written.
const d = (iso) => new Date(iso)
export const dayNum = (iso) => d(iso).getDate()
export const monthShort = (iso) => d(iso).toLocaleDateString('en-IN', { month: 'short' })
export const weekday = (iso) => d(iso).toLocaleDateString('en-IN', { weekday: 'short' })
export const timeOf = (iso) =>
  d(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(/\s?([ap])m/i, (_, x) => ` ${x.toLowerCase()}m`)
// Built from parts so the punctuation is the same in every browser ("Saturday 5 December 2026").
const parts = (iso, opts) =>
  Object.fromEntries(new Intl.DateTimeFormat('en-GB', opts).formatToParts(d(iso)).map((p) => [p.type, p.value]))
export const dateLong = (iso) => {
  const p = parts(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return `${p.weekday} ${p.day} ${p.month} ${p.year}`
}
export const dateShort = (iso) => {
  const p = parts(iso, { weekday: 'short', day: 'numeric', month: 'short' })
  return `${p.weekday} ${p.day} ${p.month}`
}
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
export const mmss = (secs) => {
  const s = Math.max(0, Math.floor(secs))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
export const bookingRef = (id) => `SL-${String(id).padStart(6, '0')}`
