const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')
const TOKEN_KEY = 'seatlock_token'

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY) || '',
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

export async function api(path, { method = 'GET', body, headers = {}, auth = true } = {}) {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData
  const h = { ...(isForm ? {} : { 'Content-Type': 'application/json' }), ...headers }
  const token = tokenStore.get()
  if (auth && token) h.Authorization = `Bearer ${token}`

  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: h,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && auth && token) {
      window.dispatchEvent(new Event('seatlock:unauthorized'))
    }
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status)
  }
  return data
}
