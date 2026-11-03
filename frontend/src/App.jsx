import { Suspense, lazy, useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import Lenis from 'lenis'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import ThemePanel from './theme/ThemePanel'
import Home from './pages/Home'
import TripsPage from './pages/TripsPage'
import CreateTrip from './pages/CreateTrip'
import TripPage from './pages/trip/TripPage'
import NotFound from './pages/NotFound'
import PicksTray from './components/PicksTray'
import { setLenis } from './lib/smoothScroll'
import { RequireAuth } from './auth/guards'
import Signup from './pages/auth/Signup'
import Login, { ForgotPassword, NotMe, ResetPassword } from './pages/auth/Login'
import { ConsentGate, DriverProfile, LegalPage, PersonProfile } from './pages/PublicPages'
import { PaymentReturnPage, PaymentTestPage } from './pages/trip/TripMoney'

// Destination pages load when first opened
const DestinationsPage = lazy(() => import('./pages/DestinationsPage'))
const DistrictPage = lazy(() => import('./pages/DistrictPage'))
const PlacePage = lazy(() => import('./pages/PlacePage'))
// Signed-in areas load when first opened
const named = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })))
const Verify = lazy(() => import('./pages/me/Verify'))
const MyTrips = lazy(() => import('./pages/me/MyTrips'))
const Profile = lazy(() => import('./pages/me/Profile'))
const Security = lazy(() => import('./pages/me/Security'))
const Payments = lazy(() => import('./pages/me/Payments'))
const Messages = lazy(() => import('./pages/me/Messages'))
const partner = () => import('./pages/partner/PartnerPages')
const PartnerDashboard = named(partner, 'PartnerDashboard')
const PartnerRequests = named(partner, 'PartnerRequests')
const PartnerOffers = named(partner, 'PartnerOffers')
const PartnerVehicles = named(partner, 'PartnerVehicles')
const PartnerCalendar = named(partner, 'PartnerCalendar')
const PartnerEarnings = named(partner, 'PartnerEarnings')
const AdminArea = lazy(() => import('./pages/admin/AdminArea'))
const AdminLogin = named(() => import('./pages/admin/AdminShell'), 'AdminLogin')
const PARTNER = ['DRIVER', 'FLEET']

let lenis

// Go to the top on page change, or to the #section in the link
function ScrollManager() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) {
      const el = document.querySelector(hash)
      if (el) {
        setTimeout(() => lenis?.scrollTo(el, { offset: -80 }) ?? el.scrollIntoView(), 50)
        return
      }
    }
    window.scrollTo(0, 0)
    lenis?.scrollTo(0, { immediate: true, force: true })
  }, [pathname, hash])
  return null
}

export default function App() {
  useEffect(() => {
    // allowNestedScroll: the page keeps scrolling over sideways rows (cards, chips)
    lenis = new Lenis({ autoRaf: true, lerp: 0.12, allowNestedScroll: true })
    setLenis(lenis)
    return () => {
      lenis.destroy()
      lenis = undefined
      setLenis(null)
    }
  }, [])

  const { pathname } = useLocation()
  if (pathname.startsWith('/admin')) {
    return (
      <Suspense fallback={<div className="min-h-screen" />}>
        <Routes>
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/*" element={<RequireAuth admin><AdminArea /></RequireAuth>} />
        </Routes>
      </Suspense>
    )
  }

  const auth = (el, role) => <RequireAuth role={role}>{el}</RequireAuth>
  return (
    <>
      <ScrollManager />
      <ConsentGate />
      <Navbar />
      <main>
        <Suspense fallback={<div className="min-h-screen" />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/trips" element={<TripsPage />} />
            <Route path="/trips/new" element={auth(<CreateTrip />)} />
            <Route path="/trips/:code/edit" element={auth(<CreateTrip />)} />
            <Route path="/trips/:id" element={<TripPage />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password/:token" element={<ResetPassword />} />
            <Route path="/not-me/:token" element={<NotMe />} />
            <Route path="/verify" element={auth(<Verify />)} />
            <Route path="/me" element={auth(<MyTrips />)} />
            <Route path="/me/profile" element={auth(<Profile />)} />
            <Route path="/me/payments" element={auth(<Payments />)} />
            <Route path="/settings/security" element={auth(<Security />)} />
            <Route path="/messages/:threadId?" element={auth(<Messages />)} />
            <Route path="/pay/test/:orderId" element={auth(<PaymentTestPage />)} />
            <Route path="/pay/return" element={auth(<PaymentReturnPage />)} />
            <Route path="/pay/cancelled" element={auth(<PaymentReturnPage cancelled />)} />
            <Route path="/partner" element={auth(<PartnerDashboard />, PARTNER)} />
            <Route path="/partner/requests" element={auth(<PartnerRequests />, PARTNER)} />
            <Route path="/partner/offers" element={auth(<PartnerOffers />, PARTNER)} />
            <Route path="/partner/vehicles" element={auth(<PartnerVehicles />, PARTNER)} />
            <Route path="/partner/calendar" element={auth(<PartnerCalendar />, PARTNER)} />
            <Route path="/partner/earnings" element={auth(<PartnerEarnings />, PARTNER)} />
            <Route path="/drivers/:id" element={<DriverProfile />} />
            <Route path="/people/:id" element={<PersonProfile />} />
            <Route path="/legal/:slug" element={<LegalPage />} />
            <Route path="/places" element={<DestinationsPage />} />
            <Route path="/places/:districtId" element={<DistrictPage />} />
            <Route path="/places/:districtId/:placeId" element={<PlacePage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
      <Footer />
      <PicksTray />
      <ThemePanel />
    </>
  )
}
