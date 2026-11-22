/* Shared read-only patient view for caregivers and health
 * professionals: today's doses, adherence, medicines, and (for HCPs)
 * follow-up notes. No schedule editing is offered here, by design. */
import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { FileText, StickyNote } from 'lucide-react'
import DoseStatusBadge from '../components/DoseStatusBadge'
import EmptyState from '../components/EmptyState'
import { useNow, usePatientData } from '../hooks/useDoses'
import { adherenceSummary, dosesForDate } from '../lib/doseLogic'
import { exportAdherenceSummary } from '../lib/export'
import { formatDateLong, formatTime12h, todayISO } from '../lib/time'
import { useAppStore } from '../store/appStore'
import { noteSchema } from '../validation/medication'
import { z } from 'zod'

type NoteValues = z.infer<typeof noteSchema>

export default function PatientDetailPage() {
  const { t } = useTranslation()
  const { patientId } = useParams<{ patientId: string }>()
  const profile = useAppStore((s) => s.profile)
  const snapshot = useAppStore((s) => s.snapshot)
  const addFollowUpNote = useAppStore((s) => s.addFollowUpNote)
  const setToast = useAppStore((s) => s.setToast)
  const now = useNow()
  const [showNoteForm, setShowNoteForm] = useState(false)
  const { medications, schedules, doseEvents, graceMinutes } = usePatientData(
    patientId ?? null,
  )

  const form = useForm<NoteValues>({
    resolver: zodResolver(noteSchema),
    defaultValues: { note: '' },
  })

  if (!profile || !snapshot || !patientId) return null

  const patient = snapshot.profiles.find((p) => p.id === patientId)
  // Access check mirrors RLS: the patient must appear in the snapshot,
  // which only happens through an active connection.
  if (!patient) {
    return (
      <EmptyState
        title={t('errors.notFoundTitle')}
        text={t('errors.notFoundText')}
        action={
          <Link to="/" className="btn-primary">
            {t('common.goHome')}
          </Link>
        }
      />
    )
  }

  const isHcp = profile.role === 'healthcare_professional'
  const doses = dosesForDate({
    medications,
    schedules,
    events: doseEvents,
    dateISO: todayISO(now),
    now,
    graceMinutes,
  })
  const summary = adherenceSummary({
    medications,
    schedules,
    events: doseEvents,
    days: 7,
    now,
    graceMinutes,
  })
  const notes = snapshot.followUpNotes
    .filter((n) => n.patient_id === patientId)
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

  async function onNote(values: NoteValues) {
    if (!patientId) return
    await addFollowUpNote(patientId, values.note.trim())
    form.reset()
    setShowNoteForm(false)
    setToast(t('hcp.noteSaved'))
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{patient.full_name}</h1>
          <p className="mt-1 text-base text-slate-600">
            {t('hcp.adherence')}: <span className="font-bold text-brand-700">{summary.percent}%</span>{' '}
            · {summary.taken}/{summary.totalDoses} {t('common.taken')}
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() =>
            exportAdherenceSummary({ patient, medications, schedules, summary })
          }
        >
          <FileText size={20} aria-hidden="true" />
          {t('analytics.exportSummary')}
        </button>
      </div>

      <p className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-base text-slate-700">
        {isHcp ? t('hcp.cannotModifyNote') : t('caregiver.cannotEditNote')}
      </p>

      <section>
        <h2 className="mb-3 text-xl font-bold text-slate-900">
          {t('schedule.title')} — {formatDateLong(todayISO(now))}
        </h2>
        {doses.length === 0 ? (
          <p className="text-base text-slate-600">{t('schedule.noDoses')}</p>
        ) : (
          <ul className="card divide-y divide-slate-100 !p-0">
            {doses.map((d) => (
              <li key={d.key} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="text-base text-slate-800">
                  <span className="font-semibold">{formatTime12h(d.scheduled_time)}</span>{' '}
                  — {d.medication_name} {d.strength} ({d.dose_amount})
                </span>
                <DoseStatusBadge status={d.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xl font-bold text-slate-900">{t('hcp.medicinesTitle')}</h2>
        {medications.length === 0 ? (
          <p className="text-base text-slate-600">{t('meds.noMeds')}</p>
        ) : (
          <ul className="card divide-y divide-slate-100 !p-0">
            {medications.map((m) => (
              <li key={m.id} className="px-5 py-3">
                <p className="text-base font-semibold text-slate-900">
                  {m.name} {m.strength} — {m.dose_amount}
                </p>
                <p className="text-base text-slate-600">{m.instructions}</p>
                <p className="text-sm text-slate-500">
                  {schedules
                    .filter((s) => s.medication_id === m.id)
                    .map((s) => formatTime12h(s.time_of_day))
                    .join(', ')}
                  {m.prescriber_name ? ` · ${m.prescriber_name}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xl font-bold text-slate-900">{t('hcp.notesTitle')}</h2>
        {notes.length === 0 ? (
          <p className="text-base text-slate-600">{t('hcp.noNotes')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {notes.map((n) => (
              <li key={n.id} className="card">
                <p className="text-base text-slate-800">{n.note}</p>
                <p className="mt-2 text-sm text-slate-500">
                  {n.author_name ?? ''} · {new Date(n.created_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
        {isHcp ? (
          showNoteForm ? (
            <form
              onSubmit={form.handleSubmit(onNote)}
              noValidate
              className="card mt-3"
            >
              <label className="label" htmlFor="followup-note">
                {t('hcp.addNote')}
              </label>
              <textarea
                id="followup-note"
                className="input min-h-24"
                placeholder={t('hcp.notePlaceholder')}
                {...form.register('note')}
              />
              {form.formState.errors.note ? (
                <p className="field-error">{t(form.formState.errors.note.message ?? '')}</p>
              ) : null}
              <div className="mt-3 flex gap-2">
                <button type="submit" className="btn-primary" disabled={form.formState.isSubmitting}>
                  {t('common.save')}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setShowNoteForm(false)}
                >
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              className="btn-primary mt-3"
              onClick={() => setShowNoteForm(true)}
            >
              <StickyNote size={20} aria-hidden="true" />
              {t('hcp.addNote')}
            </button>
          )
        ) : null}
      </section>
    </div>
  )
}
