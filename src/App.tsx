import { lazy, Suspense, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'
import AppShell from './components/AppShell'
import AdminPage from './pages/AdminPage'

// Recharts is heavy; lazy-load the analytics page so the first paint
// stays light.
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'))
import AuthPage from './pages/AuthPage'
import CallHistoryContainer from './pages/CallHistoryContainer'
import CaregiverDashboardPage from './pages/CaregiverDashboardPage'
import CaregiverPage from './pages/CaregiverPage'
import HealthcarePage from './pages/HealthcarePage'
import HelpPage from './pages/HelpPage'
import HistoryPage from './pages/HistoryPage'
import LandingPage from './pages/LandingPage'
import LanguagePage from './pages/LanguagePage'
import MedicationDetailsPage from './pages/MedicationDetailsPage'
import MedicationFormPage from './pages/MedicationFormPage'
import MedicationListPage from './pages/MedicationListPage'
import NotFoundPage from './pages/NotFoundPage'
import NotConfiguredPage from './pages/NotConfiguredPage'
import OnboardingPage from './pages/OnboardingPage'
import PatientDashboard from './pages/PatientDashboard'
import PatientDetailPage from './pages/PatientDetailPage'
import PrivacyPage from './pages/PrivacyPage'
import ProfilePage from './pages/ProfilePage'
import ReminderSettingsPage from './pages/ReminderSettingsPage'
import SchedulePage from './pages/SchedulePage'
import { isConfigured } from './lib/supabase'
import { useAppStore } from './store/appStore'
import type { Role } from './types'

function homeForRole(role: Role): string {
  switch (role) {
    case 'patient':
      return '/dashboard'
    case 'caregiver':
      return '/caregiver/dashboard'
    case 'healthcare_professional':
      return '/hcp'
    case 'admin':
      return '/admin'
  }
}

/** Blocks until the store has loaded the session, then requires auth. */
function RequireAuth() {
  const initialized = useAppStore((s) => s.initialized)
  const session = useAppStore((s) => s.session)
  const profile = useAppStore((s) => s.profile)
  const location = useLocation()
  const { t } = useTranslation()

  if (!initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-lg font-semibold text-slate-700">{t('common.loading')}</p>
      </div>
    )
  }
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  // Patients who have not finished onboarding go there first.
  if (
    profile &&
    profile.role === 'patient' &&
    !profile.onboarding_completed &&
    location.pathname !== '/onboarding'
  ) {
    return <Navigate to="/onboarding" replace />
  }
  return <Outlet />
}

function RequireRole({ roles }: { roles: Role[] }) {
  const profile = useAppStore((s) => s.profile)
  if (!profile) return <Navigate to="/login" replace />
  if (!roles.includes(profile.role)) {
    return <Navigate to={homeForRole(profile.role)} replace />
  }
  return <Outlet />
}

function RootRoute() {
  const initialized = useAppStore((s) => s.initialized)
  const session = useAppStore((s) => s.session)
  const { t } = useTranslation()
  if (!initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-lg font-semibold text-slate-700">{t('common.loading')}</p>
      </div>
    )
  }
  if (session) return <Navigate to={homeForRole(session.role)} replace />
  if (!localStorage.getItem('dosesathi-lang-chosen')) {
    return <Navigate to="/language" replace />
  }
  // No Supabase credentials: an honest not-configured state instead of
  // the landing page — no fake login, no sample data.
  if (!isConfigured) return <NotConfiguredPage />
  return <LandingPage />
}

function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const session = useAppStore((s) => s.session)
  if (session) return <Navigate to={homeForRole(session.role)} replace />
  return <>{children}</>
}

export default function App() {
  const init = useAppStore((s) => s.init)

  useEffect(() => {
    void init()
  }, [init])

  return (
    <Routes>
      <Route path="/" element={<RootRoute />} />
      <Route path="/language" element={<LanguagePage />} />
      <Route
        path="/login"
        element={
          <RedirectIfAuthed>
            <AuthPage mode="login" />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="/signup"
        element={
          <RedirectIfAuthed>
            <AuthPage mode="signup" />
          </RedirectIfAuthed>
        }
      />

      <Route element={<RequireAuth />}>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route element={<AppShell />}>
          <Route element={<RequireRole roles={['patient']} />}>
            <Route path="/dashboard" element={<PatientDashboard />} />
            <Route path="/medications" element={<MedicationListPage />} />
            <Route path="/medications/new" element={<MedicationFormPage />} />
            <Route path="/medications/:id" element={<MedicationDetailsPage />} />
            <Route path="/medications/:id/edit" element={<MedicationFormPage />} />
            <Route path="/schedule" element={<SchedulePage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/calls" element={<CallHistoryContainer />} />
            <Route
              path="/analytics"
              element={
                <Suspense
                  fallback={
                    <p className="text-lg font-semibold text-slate-700">
                      Loading…
                    </p>
                  }
                >
                  <AnalyticsPage />
                </Suspense>
              }
            />
            <Route path="/caregiver" element={<CaregiverPage />} />
            <Route path="/settings/reminders" element={<ReminderSettingsPage />} />
          </Route>
          <Route element={<RequireRole roles={['caregiver']} />}>
            <Route path="/caregiver/dashboard" element={<CaregiverDashboardPage />} />
          </Route>
          <Route element={<RequireRole roles={['healthcare_professional']} />}>
            <Route path="/hcp" element={<HealthcarePage />} />
          </Route>
          <Route element={<RequireRole roles={['caregiver', 'healthcare_professional']} />}>
            <Route path="/patients/:patientId" element={<PatientDetailPage />} />
          </Route>
          <Route element={<RequireRole roles={['admin']} />}>
            <Route path="/admin" element={<AdminPage />} />
          </Route>
          <Route path="/settings/profile" element={<ProfilePage />} />
          <Route path="/settings/privacy" element={<PrivacyPage />} />
          <Route path="/help" element={<HelpPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
