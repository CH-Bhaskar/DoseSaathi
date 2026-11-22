import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Outlet, useNavigate } from 'react-router-dom'
import { LogOut, Menu, Pill, RefreshCw, X } from 'lucide-react'
import { useDueReminder } from '../hooks/useDoses'
import { useAppStore } from '../store/appStore'
import ConfirmDialog from './ConfirmDialog'
import LanguageSelector from './LanguageSelector'
import MobileNavigation from './MobileNavigation'
import OfflineBanner from './OfflineBanner'
import ReminderDialog from './ReminderDialog'
import Sidebar from './Sidebar'

export default function AppShell() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const profile = useAppStore((s) => s.profile)
  const signOut = useAppStore((s) => s.signOut)
  const toast = useAppStore((s) => s.toast)
  const syncState = useAppStore((s) => s.syncState)
  const outboxPending = useAppStore((s) => s.outboxPending)
  const syncNow = useAppStore((s) => s.syncNow)
  const [menuOpen, setMenuOpen] = useState(false)
  const [logoutOpen, setLogoutOpen] = useState(false)

  const patientId = profile?.role === 'patient' ? profile.id : null
  const dueDose = useDueReminder(patientId)

  if (!profile) return null

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <button
            type="button"
            className="rounded-xl p-2 text-slate-700 hover:bg-brand-50 md:hidden"
            aria-label={t('common.menu')}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X size={26} /> : <Menu size={26} />}
          </button>
          <Link to="/" className="flex items-center gap-2" aria-label={t('common.appName')}>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-700 text-white">
              <Pill size={24} aria-hidden="true" />
            </span>
            {/* Wordmark hidden on small phones: the pill icon carries
              the brand, and the full header otherwise overflows the
              375px viewport (horizontal scroll on every page). */}
            <span className="hidden text-xl font-bold text-slate-900 sm:inline">
              {t('common.appName')}
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              className="hidden items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-brand-50 sm:flex"
              onClick={() => void syncNow()}
              title={outboxPending > 0 ? t('common.pendingSync', { count: outboxPending }) : t('common.synced')}
            >
              <RefreshCw
                size={18}
                aria-hidden="true"
                className={syncState === 'syncing' ? 'animate-spin' : undefined}
              />
              {/* Sync text hidden below md: the icon + title carry the
                state, and the text would overflow mid-size viewports. */}
              <span className="hidden md:inline">
                {syncState === 'synced'
                  ? t('common.synced')
                  : syncState === 'syncing'
                    ? t('common.syncing')
                    : t('common.pendingSync', { count: outboxPending })}
              </span>
            </button>
            <LanguageSelector />
            <button
              type="button"
              className="btn-ghost !min-h-11 !px-3"
              onClick={() => setLogoutOpen(true)}
            >
              <LogOut size={20} aria-hidden="true" />
              <span className="hidden sm:inline">{t('common.logout')}</span>
            </button>
          </div>
        </div>
        {menuOpen ? (
          <div className="border-t border-slate-200 bg-white px-4 py-3 md:hidden">
            <Sidebar role={profile.role} />
          </div>
        ) : null}
      </header>

      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-6 pb-24 md:pb-6">
        <aside className="hidden w-64 shrink-0 md:block">
          <div className="sticky top-24">
            <Sidebar role={profile.role} />
          </div>
        </aside>
        <main className="min-w-0 flex-1">
          <OfflineBanner />
          <div className="mt-4">
            <Outlet />
          </div>
          <footer className="mt-10 border-t border-slate-200 pt-4 text-sm text-slate-500">
            {t('common.safetyNotice')} {t('common.emergencyNote')}
          </footer>
        </main>
      </div>

      <MobileNavigation role={profile.role} />
      <ReminderDialog dose={dueDose} />

      {toast ? (
        <div
          role="status"
          className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-slate-900 px-5 py-3 text-base font-semibold text-white shadow-xl md:bottom-6"
        >
          {toast}
        </div>
      ) : null}

      <ConfirmDialog
        open={logoutOpen}
        title={t('auth.logoutConfirmTitle')}
        text={t('auth.logoutConfirmText')}
        confirmLabel={t('common.logout')}
        onConfirm={() => {
          setLogoutOpen(false)
          void signOut().then(() => navigate('/login'))
        }}
        onCancel={() => setLogoutOpen(false)}
      />
    </div>
  )
}
