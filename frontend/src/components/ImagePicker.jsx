import { useRef, useState } from 'react'
import { api } from '../lib/api.js'
import EventArt, { ART_STYLES, EventCover, PALETTE_COUNT, parseArt } from './EventArt.jsx'

// Upload a file or paste a link. With no image, events get generated artwork.
export default function ImagePicker({ value, onChange, title, category }) {
  const input = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const upload = async (file) => {
    if (!file) return
    setError('')
    if (file.size > 3 * 1024 * 1024) return setError('That image is over 3 MB. Choose a smaller one.')
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api('/admin/uploads', { method: 'POST', body: fd })
      onChange(res.url)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  const art = parseArt(value)
  const isLink = value && !art && !value.startsWith('/api/uploads/')
  const pickStyle = (id) => onChange(`art:${id}:${art ? art.palette : 0}`)
  const shuffle = () => onChange(`art:${art ? art.style : 'abstract'}:${((art ? art.palette : 0) + 1) % PALETTE_COUNT}`)
  return (
    <div className="image-picker">
      <div className="image-preview">
        {value && !art
          ? <img className="art" src={value} alt="Event cover preview" onError={() => setError('That image could not be loaded.')} />
          : <EventCover event={{ title: title || 'Preview', category, image_url: value }} />}
        {(!value || art) && <span className="image-preview-note">{art ? 'Chosen design' : 'Automatic design'}</span>}
      </div>
      <div className="image-controls">
        <div className="image-buttons">
          <input ref={input} id="img-file" type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="visually-hidden" onChange={(e) => upload(e.target.files?.[0])} />
          <label htmlFor="img-file" className={`btn btn-small btn-quiet${busy ? ' is-busy' : ''}`}>{busy ? 'Uploading…' : value ? 'Replace image' : 'Upload image'}</label>
          {value && <button type="button" className="link-btn" onClick={() => { setError(''); onChange('') }}>{art ? 'Use automatic design' : 'Remove'}</button>}
        </div>
        <div className="field">
          <label htmlFor="img-url">Or paste an image link</label>
          <input id="img-url" type="url" placeholder="https://…" value={isLink ? value : ''} onChange={(e) => { setError(''); onChange(e.target.value.trim()) }} />
        </div>
        <div className="field">
          <span className="label">Or choose a design</span>
          <div className="art-styles" role="group" aria-label="Cover design">
            {ART_STYLES.map((st) => (
              <button key={st.id} type="button" className="art-style" aria-pressed={art?.style === st.id} aria-label={`${st.label} design`} title={st.label} onClick={() => pickStyle(st.id)}>
                <EventArt title={title || 'Preview'} category={category} style={st.id} palette={art ? art.palette : 0} />
                <span>{st.label}</span>
              </button>
            ))}
          </div>
          {art && <button type="button" className="link-btn" onClick={shuffle}>Shuffle colours</button>}
        </div>
        <p className="hint">PNG, JPG, GIF or WebP, up to 3 MB. Wide images (about 16:9) look best.</p>
        {error && <p className="field-error" role="alert">{error}</p>}
      </div>
    </div>
  )
}
