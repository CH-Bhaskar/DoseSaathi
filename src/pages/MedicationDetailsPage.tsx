import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CalendarDays, Pencil, Trash2 } from 'lucide-react'
import ConfirmDialog from '../components/ConfirmDialog'
import DoseStatusBadge from '../components/DoseStatusBadge'
import EmptyState from '../components/EmptyState'
import MedicationPhotoPreview from '../components/MedicationPhotoPreview'
import MedicationPhotoUpload from '../components/MedicationPhotoUpload'
import { formatDateLong, formatTime12h } from '../lib/time'
import { useAppStore } from '../store/appStore'

export default function MedicationDetailsPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const snapshot = useAppStore((s) => s.snapshot)
  const deleteMedication = useAppStore((s) => s.deleteMedication)
  const setToast = useAppStore((s) => s.setToast)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const med = snapshot?.medications.find((m) => m.id === id) ?? null
  const schedules = snapshot?.schedules.filter((s) => s.medication_id === id) ?? []
  const photo = (snapshot?.medicationImages.filter((m) => m.medication_id === id) ?? [])
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
  const events = (snapshot?.doseEvents.filter((e) => e.medication_id === id) ?? [])
    .slice()
    .sort(
      (a, b) =>
        b.scheduled_date.localeCompare(a.scheduled_date) ||
        b.scheduled_time.localeCompare(a.scheduled_time),
    )
    .slice(0, 14)

  if (!med) {
    return (
      <EmptyState
        title={t('errors.notFoundTitle')}
        text={t('errors.notFoundText')}
        action={
          <Link to="/medications" className="btn-primary">
            {t('nav.medications')}
          </Link>
        }
      />
    )
  }

  const statusStyle =
    med.status === 'active'
      ? 'bg-green-100 text-green-900'
      : med.status === 'paused'
        ? 'bg-amber-100 text-amber-900'
        : 'bg-slate-200 text-slate-700'

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-4">
          {photo ? (
            <MedicationPhotoPreview
              image={photo}
              medicationName={med.name}
              size="thumb"
            />
          ) : null}
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              {med.name} {med.strength}
            </h1>
            <p className="mt-1 text-base text-slate-600">
              {med.brand_name ? `${med.brand_name} · ` : ''}
              {t(`meds.form${capitalize(med.form)}`)} · {med.dose_amount}
            </p>
          </div>
        </div>
        <span className={`badge ${statusStyle}`}>{t(`meds.${med.status}`)}</span>
      </div>

      {med.status === 'paused' ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-base font-medium text-amber-900">
          {t('meds.pausedNote')}
        </div>
      ) : null}
      {med.status === 'completed' ? (
        <div className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-base font-medium text-slate-700">
          {t('meds.completedNote')}
        </div>
      ) : null}

      <dl className="card grid gap-4 sm:grid-cols-2">
        <Detail label={t('meds.instructions')} value={med.instructions} wide />
        <Detail
          label={t('meds.times')}
          value={schedules.map((s) => formatTime12h(s.time_of_day)).join(', ')}
        />
        <Detail
          label={t('meds.frequency')}
          value={t(`meds.freq${frequencyKey(med.frequency)}`)}
        />
        <Detail label={t('meds.startDate')} value={formatDateLong(med.start_date)} />
        <Detail
          label={t('meds.endDate')}
          value={med.end_date ? formatDateLong(med.end_date) : t('common.notSet')}
        />
        {med.prescriber_name ? (
          <Detail label={t('meds.prescriber')} value={med.prescriber_name} />
        ) : null}
        {med.notes ? <Detail label={t('meds.notes')} value={med.notes} wide /> : null}
        <Detail
          label={t('meds.createdOn', { date: '' }).replace(': ', '')}
          value={formatDateLong(med.created_at.slice(0, 10))}
        />
        <Detail
          label={t('common.lastUpdated', { date: '' }).replace('Last updated ', '')}
          value={formatDateLong(med.updated_at.slice(0, 10))}
        />
      </dl>

      <div className="flex flex-wrap gap-3">
        <Link to={`/medications/${med.id}/edit`} className="btn-primary">
          <Pencil size={20} aria-hidden="true" />
          {t('common.edit')}
        </Link>
        <Link to="/schedule" className="btn-secondary">
          <CalendarDays size={20} aria-hidden="true" />
          {t('nav.schedule')}
        </Link>
        <button type="button" className="btn-danger" onClick={() => setDeleteOpen(true)}>
          <Trash2 size={20} aria-hidden="true" />
          {t('meds.deleteMed')}
        </button>
      </div>

      <div className="card">
        <MedicationPhotoUpload medicationId={med.id} medicationName={med.name} />
      </div>

      <section>
        <h2 className="mb-3 text-xl font-bold text-slate-900">{t('history.title')}</h2>
        {events.length === 0 ? (
          <p className="text-base text-slate-600">{t('history.noHistory')}</p>
        ) : (
          <ul className="card divide-y divide-slate-100 !p-0">
            {events.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="text-base text-slate-800">
                  {formatDateLong(e.scheduled_date)} · {formatTime12h(e.scheduled_time)}
                  {e.note ? <span className="block text-sm italic text-slate-500">{e.note}</span> : null}
                </span>
                <DoseStatusBadge status={e.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={deleteOpen}
        title={t('meds.deleteConfirmTitle')}
        text={t('meds.deleteConfirmText')}
        danger
        confirmLabel={t('common.delete')}
        onConfirm={() => {
          setDeleteOpen(false)
          void deleteMedication(med.id).then(() => {
            setToast(t('meds.deletedToast'))
            navigate('/medications')
          })
        }}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  )
}

function Detail({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <dt className="text-sm font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-base text-slate-900">{value}</dd>
    </div>
  )
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function frequencyKey(f: string): string {
  switch (f) {
    case 'once_daily':
      return 'OnceDaily'
    case 'twice_daily':
      return 'TwiceDaily'
    case 'three_times_daily':
      return 'ThreeDaily'
    case 'four_times_daily':
      return 'FourDaily'
    case 'as_needed':
      return 'AsNeeded'
    case 'weekly':
      return 'Weekly'
    default:
      return 'Custom'
  }
}
