import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router-dom'
import { navForRole } from './Sidebar'
import type { Role } from '../types'

/** Bottom navigation for small screens: the five most-used destinations
 * for the current role. */
export default function MobileNavigation({ role }: { role: Role }) {
  const { t } = useTranslation()
  const items = navForRole(role).slice(0, 5)
  return (
    <nav
      aria-label={t('common.menu')}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-5">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                `flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-2 text-center text-xs font-semibold ${
                  isActive ? 'text-brand-700' : 'text-slate-600'
                }`
              }
            >
              <item.icon size={24} aria-hidden="true" />
              <span className="leading-tight">{t(item.key)}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
