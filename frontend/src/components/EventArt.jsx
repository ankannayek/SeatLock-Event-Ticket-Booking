import { useId } from 'react'

// Generated artwork for events that have no photo. Deterministic: the same title always gets the same picture.
const PALETTES = [
  ['#1b2a6b', '#7b2ff7', '#38bdf8'],
  ['#0f3d4c', '#2ec4b6', '#f2b51d'],
  ['#4a1942', '#f2704f', '#fbe7ad'],
  ['#12306b', '#1b8ae0', '#7ef0d4'],
  ['#331a63', '#d76d77', '#ffd36e'],
  ['#0b3d2e', '#1f9d6b', '#f2b51d'],
]

function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
function rng(seed) {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function Music({ r, c }) {
  const bars = Array.from({ length: 28 }, (_, i) => {
    const h = 20 + r() * 70
    return <rect key={i} x={8 + i * 14} y={240 - h} width="8" height={h} rx="2" fill="#fff" opacity={0.14 + r() * 0.16} />
  })
  return (
    <g>
      <polygon points="60,0 120,0 220,240 40,240" fill="#fff" opacity=".07" />
      <polygon points="230,0 280,0 380,240 250,240" fill="#fff" opacity=".06" />
      <g transform="translate(285 112)">
        <circle r="96" fill="#0a0f18" opacity=".85" />
        {[84, 74, 64, 54].map((rad) => <circle key={rad} r={rad} fill="none" stroke="#fff" strokeOpacity=".09" strokeWidth="1.5" />)}
        <path d="M-96 0A96 96 0 0 1 0 -96" stroke="#fff" strokeOpacity=".25" strokeWidth="3" fill="none" strokeLinecap="round" />
        <circle r="30" fill={c[2]} />
        <circle r="30" fill="none" stroke="#000" strokeOpacity=".15" strokeWidth="2" />
        <circle r="5" fill="#0a0f18" />
      </g>
      {bars}
    </g>
  )
}

function Conference({ r, c }) {
  const nodes = Array.from({ length: 9 }, () => [30 + r() * 340, 20 + r() * 150])
  const bars = [46, 78, 62, 108, 90, 138]
  return (
    <g>
      <g stroke="#fff" strokeOpacity=".22" strokeWidth="1.2">
        {nodes.map((n, i) => nodes.slice(i + 1, i + 3).map((m, j) => <line key={`${i}-${j}`} x1={n[0]} y1={n[1]} x2={m[0]} y2={m[1]} />))}
      </g>
      {nodes.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 6 : 3.5} fill="#fff" opacity={i % 3 === 0 ? 0.7 : 0.4} />)}
      <rect x="228" y="70" width="150" height="150" rx="14" fill="#0a0f18" opacity=".55" />
      {bars.map((h, i) => <rect key={i} x={244 + i * 22} y={206 - h} width="13" height={h} rx="3" fill={i === bars.length - 1 ? c[2] : '#fff'} opacity={i === bars.length - 1 ? 1 : 0.55} />)}
      <rect x="40" y="150" width="120" height="70" rx="10" fill="#fff" opacity=".12" />
      <rect x="54" y="166" width="60" height="7" rx="3.5" fill="#fff" opacity=".6" />
      <rect x="54" y="182" width="88" height="7" rx="3.5" fill="#fff" opacity=".35" />
      <rect x="54" y="198" width="44" height="7" rx="3.5" fill="#fff" opacity=".35" />
    </g>
  )
}


function Stage({ r, c }) {
  return (
    <g>
      <polygon points="165,0 235,0 330,240 70,240" fill="#fff" opacity=".13" />
      <polygon points="120,0 150,0 120,240 40,240" fill="#fff" opacity=".05" />
      {Array.from({ length: 14 }, (_, i) => <circle key={i} cx={30 + r() * 340} cy={14 + r() * 90} r={1 + r() * 2} fill="#fff" opacity={0.3 + r() * 0.5} />)}
      <ellipse cx="200" cy="232" rx="150" ry="20" fill="#000" opacity=".35" />
      <ellipse cx="200" cy="226" rx="120" ry="12" fill={c[2]} opacity=".55" />
      <path d="M0 0H118C96 70 108 150 74 240H0Z" fill="#8c1224" opacity=".85" />
      <path d="M400 0H282C304 70 292 150 326 240H400Z" fill="#8c1224" opacity=".85" />
      {[24, 50, 76, 98].map((x) => <path key={x} d={`M${x} 0C${x - 8} 90 ${x + 6} 170 ${x - 10} 240`} stroke="#000" strokeOpacity=".2" strokeWidth="3" fill="none" />)}
      {[376, 350, 324, 302].map((x) => <path key={x} d={`M${x} 0C${x + 8} 90 ${x - 6} 170 ${x + 10} 240`} stroke="#000" strokeOpacity=".2" strokeWidth="3" fill="none" />)}
    </g>
  )
}

function Festival({ r, c }) {
  const flags = Array.from({ length: 11 }, (_, i) => {
    const x = 18 + i * 36
    const y = 10 + Math.sin(i / 1.7) * 10
    const fill = [c[2], '#fff', c[1]][i % 3]
    return <polygon key={i} points={`${x},${y + 4} ${x + 24},${y + 4} ${x + 12},${y + 40}`} fill={fill} opacity=".9" />
  })
  const confetti = Array.from({ length: 34 }, (_, i) => (
    <rect key={i} x={r() * 390} y={70 + r() * 160} width={5 + r() * 6} height={3 + r() * 4} rx="1"
      fill={[c[2], '#fff', c[1], '#ffd36e'][i % 4]} opacity={0.5 + r() * 0.4} transform={`rotate(${r() * 180} 200 150)`} />
  ))
  return (
    <g>
      <circle cx="310" cy="150" r="82" fill={c[2]} opacity=".35" />
      <circle cx="310" cy="150" r="52" fill={c[2]} opacity=".6" />
      <path d="M0 14C100 44 300 44 400 14" stroke="#fff" strokeOpacity=".6" strokeWidth="2" fill="none" />
      {flags}
      {confetti}
    </g>
  )
}

function Sports({ r, c }) {
  return (
    <g>
      <rect x="22" y="40" width="356" height="170" rx="10" fill="none" stroke="#fff" strokeOpacity=".4" strokeWidth="2.5" />
      <line x1="200" y1="40" x2="200" y2="210" stroke="#fff" strokeOpacity=".4" strokeWidth="2.5" />
      <circle cx="200" cy="125" r="34" fill="none" stroke="#fff" strokeOpacity=".4" strokeWidth="2.5" />
      <rect x="22" y="85" width="44" height="80" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="2.5" />
      <rect x="334" y="85" width="44" height="80" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="2.5" />
      {Array.from({ length: 6 }, (_, i) => <rect key={i} x={22 + i * 60} y="40" width="30" height="170" fill="#fff" opacity=".05" />)}
      <g transform="translate(300 62)">
        <circle r="26" fill="#fff" />
        <circle r="26" fill="none" stroke="#000" strokeOpacity=".25" strokeWidth="2" />
        <polygon points="0,-10 9,-3 6,8 -6,8 -9,-3" fill={c[0]} />
        {[[0, -10, 0, -26], [9, -3, 24, -8], [6, 8, 16, 20], [-6, 8, -16, 20], [-9, -3, -24, -8]].map((l, i) => (
          <line key={i} x1={l[0]} y1={l[1]} x2={l[2]} y2={l[3]} stroke={c[0]} strokeWidth="2" />
        ))}
      </g>
    </g>
  )
}

function Generic({ r, c }) {
  return (
    <g>
      {[150, 110, 70].map((rad, i) => <circle key={rad} cx="300" cy="120" r={rad} fill="none" stroke="#fff" strokeOpacity={0.1 + i * 0.05} strokeWidth="2" />)}
      <circle cx="300" cy="120" r="34" fill={c[2]} opacity=".9" />
      {Array.from({ length: 6 }, (_, i) => <rect key={i} x={-20 + i * 70} y="-20" width="26" height="320" fill="#fff" opacity={0.04 + r() * 0.04} transform="rotate(20 200 120)" />)}
    </g>
  )
}

export const ART_STYLES = [
  { id: 'music', label: 'Music', Motif: Music },
  { id: 'tech', label: 'Tech', Motif: Conference },
  { id: 'stage', label: 'Stage', Motif: Stage },
  { id: 'festival', label: 'Festival', Motif: Festival },
  { id: 'sports', label: 'Sports', Motif: Sports },
  { id: 'abstract', label: 'Abstract', Motif: Generic },
]
export const PALETTE_COUNT = PALETTES.length

const GUESS = [
  ['music', /music|concert|band|live|gig|dj/i],
  ['tech', /conf|summit|tech|talk|meetup|workshop|hack/i],
  ['stage', /comedy|theat|drama|play|dance|stage|standup|stand-up|opera/i],
  ['festival', /festival|fair|food|carnival|mela|puja|celebrat/i],
  ['sports', /sport|cricket|football|match|run|marathon|league|tournament/i],
]

// image_url values like "art:stage:3" pick a design and palette on purpose.
export function parseArt(url) {
  const m = /^art:([a-z]+):(\d+)$/.exec(url || '')
  return m ? { style: m[1], palette: Number(m[2]) % PALETTES.length } : null
}

// Shows the cover for an event: uploaded photo, chosen design, or an automatic design.
export function EventCover({ event, className = '', alt = '' }) {
  const art = parseArt(event.image_url)
  if (event.image_url && !art) return <img className={`art ${className}`} src={event.image_url} alt={alt} loading="lazy" />
  return <EventArt title={event.title} category={event.category} style={art?.style} palette={art?.palette} className={className} />
}

export default function EventArt({ title = '', category = '', className = '', style = null, palette = null }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const seed = hash(`${title}|${category}`)
  const r = rng(seed)
  const c = PALETTES[(palette ?? seed) % PALETTES.length]
  const text = `${category} ${title}`
  const kind = style || GUESS.find(([, re]) => re.test(text))?.[0] || 'abstract'
  const Motif = (ART_STYLES.find((x) => x.id === kind) || ART_STYLES[5]).Motif
  return (
    <svg className={`art ${className}`} viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`g${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c[0]} />
          <stop offset="0.6" stopColor={c[1]} />
          <stop offset="1" stopColor={c[2]} />
        </linearGradient>
        <radialGradient id={`v${uid}`} cx=".2" cy=".1" r=".9">
          <stop offset="0" stopColor="#fff" stopOpacity=".28" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="240" fill={`url(#g${uid})`} />
      <rect width="400" height="240" fill={`url(#v${uid})`} />
      <Motif r={r} c={c} />
    </svg>
  )
}
