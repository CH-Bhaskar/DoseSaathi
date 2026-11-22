import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { CalendarDays, Plus } from 'lucide-react'
import DoseActions from '../components/DoseActions'
import DoseStatusBadge from '../components/DoseStatusBadge'
import EmptyState from '../components/EmptyState'
import { useNow, usePatientData } from '../hooks/useDoses'
import { dosesForDate } from '../lib/doseLogic'
import { addDaysISO, formatDateLong, formatTime12h, todayISO } from '../lib/time'
import { useAppStore } from '../store/appStore'

function slotFor(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  if (hour < 21) return 'evening'
  return 'night'
}

export default function SchedulePage() {
  const { t } = useTranslation()
  const profile = useAppStore((s) => s.profile)
  const now = useNow()
  const [dateISO, setDateISO] = useState(() => todayISO())
  const { medications, schedules, doseEvents, graceMinutes } = usePatientData(
    profile?.id ?? null,
  )

  const doses = useMemo(() => {
    if (!profile) return []
    return dosesForDate({
      medications,
      schedules,
      events: doseEvents,
      dateISO,
      now,
      graceMinutes,
    })
  }, [profile, medications, schedules, doseEvents, dateISO, now, graceMinutes])

  const grouped = useMemo(() => {
    const groups: Record<string, typeof doses> = {
      morning: [],
      afternoon: [],
      evening: [],
      night: [],
    }
    for (const d of doses) groups[slotFor(d.hour)]?.push(d)
    return groups
  }, [doses])

  if (!profile) return null
  const isToday = dateISO === todayISO(now)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{t('schedule.title')}</h1>
          <p className="mt-1 text-base text-slate-600">{t('schedule.subtitle')}</p>
        </div>
        <Link to="/medications/new" className="btn-primary">
          <Plus size={20} aria-hidden="true" />
          {t('dashboard.addMedication')}
        </Link>
      </div>

      <div className="card flex flex-wrap items-center gap-3">
        <CalendarDays size={22} className="text-brand-700" aria-hidden="true" />
        <label className="label !mb-0" htmlFor="schedule-date">
          {t('schedule.pickDate')}
        </label>
        <input
          id="schedule-date"
          type="date"
          className="input !w-auto"
          value={dateISO}
          onChange={(e) => setDateISO(e.target.value)}
        />
        <button
          type="button"
          className="btn-secondary !min-h-10 !py-2"
          onClick={() => setDateISO(addDaysISO(dateISO, -1))}
        >
          {t('common.yesterday')}
        </button>
        <button
          type="button"
          className="btn-secondary !min-h-10 !py-2"
          onClick={() => setDateISO(todayISO(now))}
        >
          {t('common.today')}
        </button>
        <span className="text-base font-semibold text-slate-800">
          {formatDateLong(dateISO)}
        </span>
      </div>

      {doses.length === 0 ? (
        <EmptyState
          title={t('schedule.noDoses')}
          action={
            <Link to="/medications/new" className="btn-primary">
              <Plus size={20} aria-hidden="true" />
              {t('dashboard.addMedication')}
            </Link>
          }
        />
      ) : (
        (['morning', 'afternoon', 'evening', 'night'] as const).map((slot) => {
          const slotDoses = grouped[slot] ?? []
          if (slotDoses.length === 0) return null
          return (
            <section key={slot} aria-label={t(`schedule.${slot}`)}>
              <h2 className="mb-3 text-xl font-bold text-slate-900">
                {t(`schedule.${slot}`)}
              </h2>
              <div className="flex flex-col gap-4">
                {slotDoses.map((d) => (
                  <article key={d.key} className="card" data-testid={`dose-${d.key}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-wide text-brand-800">
                          {formatTime12h(d.scheduled_time)}
                        </p>
                        <h3 className="mt-1 text-xl font-bold text-slate-900">
                          {d.medication_name} {d.strength}
                        </h3>
                        <p className="mt-1 text-base text-slate-700">
                          {d.dose_amount} — {d.instructions}
                        </p>
                        {d.food_rule !== 'none' ? (
                          <p className="mt-1 text-base text-slate-600">
                            {t(`meds.food${d.food_rule === 'before' ? 'Before' : d.food_rule === 'with' ? 'With' : 'After'}`)}
                          </p>
                        ) : null}
                        {d.note ? (
                          <p className="mt-1 text-base italic text-slate-600">
                            {t('history.noteLabel')}: {d.note}
                          </p>
                        ) : null}
                      </div>
                      <DoseStatusBadge status={d.status} />
                    </div>
                    {isToday ? (
                      <div className="mt-4">
                        <DoseActions dose={d} />
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          )
        })
      )}
    </div>
  )
}
