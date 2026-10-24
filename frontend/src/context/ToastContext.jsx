import { createContext, useCallback, useContext, useRef, useState } from 'react'

const ToastContext = createContext(() => {})
export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const timer = useRef()
  const notify = useCallback((text, kind = 'info') => {
    clearTimeout(timer.current)
    setToast({ text, kind, id: Date.now() })
    timer.current = setTimeout(() => setToast(null), 5000)
  }, [])
  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className={`toast toast-${toast.kind}`}>
            <span>{toast.text}</span>
            <button type="button" className="toast-close" onClick={() => setToast(null)} aria-label="Dismiss message">
              Close
            </button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}
