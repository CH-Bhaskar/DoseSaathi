import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router-dom'
import {
  BarChart3,
  Bell,
  CalendarDays,
  HeartHandshake,
  HelpCircle,
  Home,
  LayoutDashboard,
  LifeBuoy,
  Phone,
  Pill,
  ShieldCheck,
  Stethoscope,
  User,
  Users,
} from 'lucide-react'
import type { Role } from '../types'

interface NavItem {
  to: string
  key: string
  icon: typeof Home
}

const PATIENT_NAV: NavItem[] = [
  { to: '/dashboard', key: 'nav.dashboard', icon: LayoutDashboard },
  { to: '/schedule', key: 'nav.schedule', icon: CalendarDays },
  { to: '/medications', key: 'nav.medications', icon: Pill },
  { to: '/history', key: 'nav.history', icon: BarChart3 },
  // Call history sits fifth so it also appears in the mobile bottom
  // navigation (which shows the first five items); analytics stays in
  // the sidebar. The label reuses calls.historyTitle — no new key.
  { to: '/calls', key: 'calls.historyTitle', icon: Phone },
  { to: '/analytics', key: 'nav.analytics', icon: BarChart3 },
  { to: '/caregiver', key: 'nav.caregiver', icon: HeartHandshake },
  { to: '/settings/reminders', key: 'nav.reminders', icon: Bell },
  { to: '/settings/profile', key: 'nav.profile', icon: User },
  { to: '/settings/privacy', key: 'nav.privacy', icon: ShieldCheck },
  { to: '/help', key: 'nav.help', icon: HelpCircle },
]

const CAREGIVER_NAV: NavItem[] = [
  { to: '/caregiver/dashboard', key: 'nav.caregiverDashboard', icon: HeartHandshake },
  { to: '/settings/profile', key: 'nav.profile', icon: User },
  { to: '/settings/privacy', key: 'nav.privacy', icon: ShieldCheck },
  { to: '/help', key: 'nav.help', icon: HelpCircle },
]

const HCP_NAV: NavItem[] = [
  { to: '/hcp', key: 'nav.hcp', icon: Stethoscope },
  { to: '/settings/profile', key: 'nav.profile', icon: User },
  { to: '/settings/privacy', key: 'nav.privacy', icon: ShieldCheck },
  { to: '/help', key: 'nav.help', icon: HelpCircle },
]

const ADMIN_NAV: NavItem[] = [
  { to: '/admin', key: 'nav.admin', icon: LifeBuoy },
  { to: '/settings/profile', key: 'nav.profile', icon: User },
  { to: '/help', key: 'nav.help', icon: HelpCircle },
]

export function navForRole(role: Role): NavItem[] {
  switch (role) {
    case 'patient':
      return PATIENT_NAV
    case 'caregiver':
      return CAREGIVER_NAV
    case 'healthcare_professional':
      return HCP_NAV
    case 'admin':
      return ADMIN_NAV
  }
}

export default function Sidebar({ role }: { role: Role }) {
  const { t } = useTranslation()
  const items = navForRole(role)
  return (
    <nav aria-label={t('common.menu')} className="flex flex-col gap-1">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `flex min-h-12 items-center gap-3 rounded-xl px-4 py-3 text-base font-semibold transition-colors ${
              isActive
                ? 'bg-brand-700 text-white'
                : 'text-slate-700 hover:bg-brand-50 hover:text-brand-800'
            }`
          }
        >
          <item.icon size={22} aria-hidden="true" />
          {t(item.key)}
        </NavLink>
      ))}
      <span className="mt-6 flex items-center gap-2 px-4 text-sm text-slate-500">
        <Users size={16} aria-hidden="true" />
        {t('common.safetyNotice')}
      </span>
    </nav>
  )
}
