import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, tokenStore } from '../lib/api.js'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(!tokenStore.get())

  const signOut = useCallback(() => {
    tokenStore.clear()
    setUser(null)
  }, [])

  // Validate a stored token on first load.
  useEffect(() => {
    if (!tokenStore.get()) return
    api('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => tokenStore.clear())
      .finally(() => setReady(true))
  }, [])

  // Any 401 from an authenticated call signs the user out.
  useEffect(() => {
    window.addEventListener('seatlock:unauthorized', signOut)
    return () => window.removeEventListener('seatlock:unauthorized', signOut)
  }, [signOut])

  const accept = (d) => {
    tokenStore.set(d.token)
    setUser(d.user)
    return d.user
  }
  const value = useMemo(
    () => ({
      user,
      ready,
      signOut,
      signIn: (email, password) => api('/auth/login', { method: 'POST', body: { email, password }, auth: false }).then(accept),
      register: (name, email, password, role = 'customer') =>
        api('/auth/register', { method: 'POST', body: { name, email, password, role }, auth: false }).then(accept),
    }),
    [user, ready, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
