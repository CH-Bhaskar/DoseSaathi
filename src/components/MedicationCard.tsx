import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Clock, Pause, Pencil, Play } from 'lucide-react'
import { formatTime12h } from '../lib/time'
import { useAppStore } from '../store/appStore'
import type { Medication, MedicationSchedule } from '../types'
import MedicationPhotoPreview from './MedicationPhotoPreview'

export default function MedicationCard({
  medication,
  schedules,
}: {
  medication: Medication
  schedules: MedicationSchedule[]
}) {
  const { t } = useTranslation()
  const setMedicationStatus = useAppStore((s) => s.setMedicationStatus)
  const snapshot = useAppStore((s) => s.snapshot)
  const photo = (snapshot?.medicationImages.filter(
    (m) => m.medication_id === medication.id,
  ) ?? [])
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
  const times = [...schedules]
    .sort((a, b) => a.time_of_day.localeCompare(b.time_of_day))
    .map((s) => formatTime12h(s.time_of_day))
  const statusStyle =
    medication.status === 'active'
      ? 'bg-green-100 text-green-900'
      : medication.status === 'paused'
        ? 'bg-amber-100 text-amber-900'
        : 'bg-slate-200 text-slate-700'
  return (
    <article className="card flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {photo ? (
            <MedicationPhotoPreview
              image={photo}
              medicationName={medication.name}
              size="thumb"
            />
          ) : null}
          <div>
            <h3 className="text-xl font-bold text-slate-900">
              <Link
                to={`/medications/${medication.id}`}
                className="hover:text-brand-700 hover:underline"
              >
                {medication.name}
              </Link>
            </h3>
            <p className="text-base text-slate-600">
              {medication.strength} · {t(`meds.form${capitalize(medication.form)}`)}
              {medication.brand_name ? ` · ${medication.brand_name}` : ''}
            </p>
          </div>
        </div>
        <span className={`badge ${statusStyle}`}>
          {t(`meds.${medication.status}`)}
        </span>
      </div>
      <p className="text-base text-slate-700">
        {medication.dose_amount} — {t(`meds.freq${frequencyKey(medication.frequency)}`)}
      </p>
      <p className="flex items-center gap-2 text-base text-slate-700">
        <Clock size={18} aria-hidden="true" />
        {times.length > 0 ? times.join(' · ') : t('meds.noMeds')}
      </p>
      <p className="text-base text-slate-600">{medication.instructions}</p>
      <div className="mt-1 flex flex-wrap gap-2">
        <Link to={`/medications/${medication.id}/edit`} className="btn-secondary !min-h-10 !py-2">
          <Pencil size={18} aria-hidden="true" />
          {t('common.edit')}
        </Link>
        {medication.status === 'active' ? (
          <button
            type="button"
            className="btn-ghost !min-h-10 !py-2"
            onClick={() => void setMedicationStatus(medication.id, 'paused')}
          >
            <Pause size={18} aria-hidden="true" />
            {t('meds.pause')}
          </button>
        ) : medication.status === 'paused' ? (
          <button
            type="button"
            className="btn-ghost !min-h-10 !py-2"
            onClick={() => void setMedicationStatus(medication.id, 'active')}
          >
            <Play size={18} aria-hidden="true" />
            {t('meds.resume')}
          </button>
        ) : null}
      </div>
    </article>
  )
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function frequencyKey(f: Medication['frequency']): string {
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
    case 'custom':
      return 'Custom'
  }
}
