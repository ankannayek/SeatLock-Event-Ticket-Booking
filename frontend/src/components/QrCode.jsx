import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

// Always black on white, in both themes and in print, so phone cameras and scanners can read it.
export default function QrCode({ value, size = 168, label }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let live = true
    QRCode.toDataURL(value, {
      width: size * 2,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((url) => live && setSrc(url))
      .catch(() => live && setSrc(''))
    return () => { live = false }
  }, [value, size])

  if (!src) return <div className="qr qr-empty" style={{ width: size, height: size }} aria-hidden="true" />
  return <img className="qr" src={src} width={size} height={size} alt={label || 'Ticket QR code'} />
}
