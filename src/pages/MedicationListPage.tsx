import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import MedicationCard from '../components/MedicationCard'
import { usePatientData } from '../hooks/useDoses'
import { useAppStore } from '../store/appStore'

export default function MedicationListPage() {
  const { t } = useTranslation()
  const profile = useAppStore((s) => s.profile)
  const { medications, schedules } = usePatientData(profile?.id ?? null)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return medications
    return medications.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.brand_name ?? '').toLowerCase().includes(q),
    )
  }, [medications, query])

  if (!profile) return null

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{t('meds.title')}</h1>
          <p className="mt-1 text-base text-slate-600">
            {t('meds.scheduleLabel')}
          </p>
        </div>
        <Link to="/medications/new" className="btn-primary">
          <Plus size={20} aria-hidden="true" />
          {t('dashboard.addMedication')}
        </Link>
      </div>

      {medications.length > 0 ? (
        <div className="relative max-w-md">
          <Search
            size={20}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            className="input !pl-11"
            placeholder={t('meds.searchPlaceholder')}
            aria-label={t('common.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-testid="medication-search"
          />
        </div>
      ) : null}

      {medications.length === 0 ? (
        <EmptyState
          title={t('meds.noMeds')}
          text={t('meds.noMedsText')}
          action={
            <Link to="/medications/new" className="btn-primary">
              <Plus size={20} aria-hidden="true" />
              {t('meds.addFirst')}
            </Link>
          }
        />
      ) : filtered.length === 0 ? (
        <p className="text-base text-slate-600">{t('meds.noMeds')}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((m) => (
            <MedicationCard
              key={m.id}
              medication={m}
              schedules={schedules.filter((s) => s.medication_id === m.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
