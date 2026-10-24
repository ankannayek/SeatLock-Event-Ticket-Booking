import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { Empty, Loading } from './Ui.jsx'

export default function RequireAuth({ creatorOnly = false, children }) {
  const { user, ready } = useAuth()
  const location = useLocation()
  if (!ready) return <Loading />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  if (creatorOnly && user.role !== 'creator') {
    return <Empty title="Event creators only" body="This page is for event creator accounts. Create one to host your own events." action={{ to: '/', label: 'Back to events' }} />
  }
  return children
}
