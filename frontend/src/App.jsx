import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import RequireAuth from './components/RequireAuth.jsx'
import Manage from './pages/Manage.jsx'
import Home from './pages/Home.jsx'
import EventDetail from './pages/EventDetail.jsx'
import ShowSeats from './pages/ShowSeats.jsx'
import Checkout from './pages/Checkout.jsx'
import Tickets from './pages/Tickets.jsx'
import TicketDetail from './pages/TicketDetail.jsx'
import Waitlist from './pages/Waitlist.jsx'
import Auth from './pages/Auth.jsx'
import NotFound from './pages/NotFound.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="events/:eventId" element={<EventDetail />} />
        <Route path="shows/:showId" element={<ShowSeats />} />
        <Route path="checkout/:showId" element={<RequireAuth><Checkout /></RequireAuth>} />
        <Route path="tickets" element={<RequireAuth><Tickets /></RequireAuth>} />
        <Route path="tickets/:bookingId" element={<RequireAuth><TicketDetail /></RequireAuth>} />
        <Route path="waitlist" element={<RequireAuth><Waitlist /></RequireAuth>} />
        <Route path="login" element={<Auth mode="login" />} />
        <Route path="register" element={<Auth mode="register" />} />
        <Route path="manage" element={<RequireAuth creatorOnly><Manage /></RequireAuth>} />
        <Route path="admin" element={<Navigate to="/manage" replace />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
