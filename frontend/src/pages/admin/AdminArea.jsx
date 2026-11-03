import { Route, Routes } from 'react-router-dom'
import AdminShell from './AdminShell'
import { AdminAudit, AdminOutbox, AdminReports, AdminToday, AdminTrip, AdminTrips, AdminUser, AdminUsers, AdminVerification, AdminVerifications } from './AdminPages'
import { AdminDisputes, AdminPayments } from './AdminMoney'
import AdminSettings from './AdminSettings'
import NotFound from '../NotFound'

// The admin console: its own layout, no public navbar or footer
export default function AdminArea() {
  return (
    <AdminShell>
      <Routes>
        <Route index element={<AdminToday />} />
        <Route path="verifications" element={<AdminVerifications />} />
        <Route path="verifications/:id" element={<AdminVerification />} />
        <Route path="trips" element={<AdminTrips />} />
        <Route path="trips/:code" element={<AdminTrip />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="users/:id" element={<AdminUser />} />
        <Route path="payments" element={<AdminPayments />} />
        <Route path="disputes" element={<AdminDisputes />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="audit" element={<AdminAudit />} />
        <Route path="outbox" element={<AdminOutbox />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AdminShell>
  )
}
