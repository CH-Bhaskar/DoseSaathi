/* Add / edit medication. Two steps: (1) the form, validated with Zod;
 * (2) a review screen that shows exactly what will be saved, plus any
 * transparent conflict warnings. With warnings present, saving requires
 * an explicit acknowledgement — and nothing is ever auto-changed.
 *
 * A medicine photo is optional: while adding, the photo is held locally
 * and uploads after the medicine saves; while editing, it uploads
 * immediately (see MedicationPhotoUpload). OCR may suggest a name and
 * strength for the user to check — never a dosage or schedule. */
import { useEffect, useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, Plus, Trash2 } from 'lucide-react'
import MedicationPhotoUpload, {
  type PendingPhoto,
} from '../components/MedicationPhotoUpload'
import { detectConflicts } from '../lib/doseLogic'
import { formatTime12h, todayISO } from '../lib/time'
import { useAppStore } from '../store/appStore'
import type { ConflictWarning } from '../types'
import {
  medicationFormSchema,
  type MedicationFormValues,
} from '../validation/medication'

const FREQUENCY_DEFAULT_TIMES: Record<string, string[]> = {
  once_daily: ['08:00'],
  twice_daily: ['08:00', '20:00'],
  three_times_daily: ['08:00', '14:00', '20:00'],
  four_times_daily: ['08:00', '12:00', '16:00', '20:00'],
  as_needed: ['08:00'],
  weekly: ['08:00'],
  custom: ['08:00'],
}

const DAY_KEYS = ['dayMon', 'dayTue', 'dayWed', 'dayThu', 'dayFri', 'daySat', 'daySun']

export default function MedicationFormPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const profile = useAppStore((s) => s.profile)
  const snapshot = useAppStore((s) => s.snapshot)
  const saveMedication = useAppStore((s) => s.saveMedication)
  const uploadMedicationPhoto = useAppStore((s) => s.uploadMedicationPhoto)
  const setToast = useAppStore((s) => s.setToast)

  const existing = useMemo(
    () => snapshot?.medications.find((m) => m.id === id) ?? null,
    [snapshot, id],
  )
  const existingSchedules = useMemo(
    () => snapshot?.schedules.filter((s) => s.medication_id === id) ?? [],
    [snapshot, id],
  )

  const [step, setStep] = useState<'form' | 'review'>('form')
  const [warnings, setWarnings] = useState<ConflictWarning[]>([])
  const [acknowledged, setAcknowledged] = useState(false)
  const [reviewValues, setReviewValues] = useState<MedicationFormValues | null>(null)
  // A photo picked while adding a medicine: held locally until the
  // medicine saves, then uploaded. (While editing, photos upload
  // immediately through the component itself.)
  const [pendingPhoto, setPendingPhoto] = useState<PendingPhoto | null>(null)

  const form = useForm<MedicationFormValues>({
    resolver: zodResolver(medicationFormSchema),
    defaultValues: existing
      ? {
          name: existing.name,
          brand_name: existing.brand_name ?? '',
          strength: existing.strength,
          form: existing.form,
          instructions: existing.instructions,
          dose_amount: existing.dose_amount,
          frequency: existing.frequency,
          times:
            existingSchedules.length > 0
              ? existingSchedules.map((s) => s.time_of_day)
              : ['08:00'],
          days_of_week: existingSchedules[0]?.days_of_week ?? [1, 2, 3, 4, 5, 6, 7],
          food_rule: existingSchedules[0]?.food_rule ?? 'none',
          start_date: existing.start_date,
          end_date: existing.end_date ?? '',
          prescriber_name: existing.prescriber_name ?? '',
          notes: existing.notes ?? '',
        }
      : {
          name: '',
          brand_name: '',
          strength: '',
          form: 'tablet',
          instructions: '',
          dose_amount: '',
          frequency: 'once_daily',
          times: ['08:00'],
          days_of_week: [1, 2, 3, 4, 5, 6, 7],
          food_rule: 'none',
          start_date: todayISO(),
          end_date: '',
          prescriber_name: '',
          notes: '',
        },
  })
  // Times are a plain string[] in the form; useFieldArray only supports
  // object arrays, so add/remove go through watch + setValue.
  const times = form.watch('times')
  function addTime() {
    form.setValue('times', [...times, '12:00'], { shouldValidate: true })
  }
  function removeTime(index: number) {
    form.setValue(
      'times',
      times.filter((_, i) => i !== index),
      { shouldValidate: true },
    )
  }

  if (!profile || !snapshot) return null
  if (isEdit && !existing) {
    return (
      <div className="card">
        <h1 className="text-2xl font-bold text-slate-900">{t('errors.notFoundTitle')}</h1>
        <p className="mt-2 text-base text-slate-600">{t('errors.notFoundText')}</p>
      </div>
    )
  }

  function onFrequencyChange(freq: string) {
    const defaults = FREQUENCY_DEFAULT_TIMES[freq] ?? ['08:00']
    form.setValue('times', defaults, { shouldValidate: true })
  }

  function goToReview(values: MedicationFormValues) {
    const found = detectConflicts({
      candidate: {
        name: values.name,
        strength: values.strength,
        times: values.times,
        excludeMedicationId: id ?? null,
      },
      existingMedications: snapshot?.medications.filter(
        (m) => m.patient_id === profile?.id,
      ) ?? [],
      existingSchedules: snapshot?.schedules ?? [],
    })
    setWarnings(found)
    setAcknowledged(false)
    setReviewValues(values)
    setStep('review')
  }

  async function save() {
    if (!reviewValues || !profile) return
    if (warnings.length > 0 && !acknowledged) return
    const saved = await saveMedication(
      {
        name: reviewValues.name.trim(),
        brand_name: reviewValues.brand_name?.trim() || null,
        strength: reviewValues.strength.trim(),
        form: reviewValues.form,
        instructions: reviewValues.instructions.trim(),
        dose_amount: reviewValues.dose_amount.trim(),
        frequency: reviewValues.frequency,
        start_date: reviewValues.start_date,
        end_date: reviewValues.end_date?.trim() || null,
        prescriber_name: reviewValues.prescriber_name?.trim() || null,
        notes: reviewValues.notes?.trim() || null,
        times: reviewValues.times.map((time) => ({
          time_of_day: time,
          food_rule: reviewValues.food_rule,
          days_of_week: reviewValues.days_of_week,
        })),
      },
      id,
    )
    // A photo picked while adding uploads now that the medicine exists.
    // If it fails, the medicine is still saved — the user can add the
    // photo from the medicine's details page.
    if (pendingPhoto) {
      try {
        await uploadMedicationPhoto(
          saved.id,
          pendingPhoto.blob,
          pendingPhoto.fileName,
          pendingPhoto.ocrText,
          pendingPhoto.ocrConfirmed,
        )
      } catch {
        setToast(t('photos.uploadFailed'))
        navigate(`/medications/${saved.id}`)
        return
      }
    }
    setToast(isEdit ? t('meds.updatedToast') : t('meds.savedToast'))
    navigate(`/medications/${saved.id}`)
  }

  /** An OCR suggestion the user confirmed: fill name/strength so they
   * can check them against the prescription on the review step. Only
   * name and strength — never dosage, schedule, or instructions. */
  function applyOcrSuggestion(s: { name: string | null; strength: string | null }) {
    if (s.name) form.setValue('name', s.name, { shouldValidate: true })
    if (s.strength) form.setValue('strength', s.strength, { shouldValidate: true })
  }

  const err = (key: keyof MedicationFormValues) => {
    const message = form.formState.errors[key]?.message
    return message ? <p className="field-error">{t(message as string)}</p> : null
  }

  if (step === 'review' && reviewValues) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{t('meds.reviewTitle')}</h1>
          <p className="mt-1 text-base text-slate-600">{t('meds.reviewHint')}</p>
        </div>

        <dl className="card grid gap-3 sm:grid-cols-2">
          <ReviewRow label={t('meds.name')} value={reviewValues.name} />
          <ReviewRow label={t('meds.strength')} value={reviewValues.strength} />
          <ReviewRow
            label={t('meds.form')}
            value={t(`meds.form${capitalize(reviewValues.form)}`)}
          />
          <ReviewRow label={t('meds.doseAmount')} value={reviewValues.dose_amount} />
          <ReviewRow
            label={t('meds.frequency')}
            value={t(`meds.freq${frequencyKey(reviewValues.frequency)}`)}
          />
          <ReviewRow
            label={t('meds.times')}
            value={reviewValues.times.map(formatTime12h).join(', ')}
          />
          <ReviewRow
            label={t('meds.foodRule')}
            value={t(`meds.food${reviewValues.food_rule === 'none' ? 'None' : capitalize(reviewValues.food_rule)}`)}
          />
          <ReviewRow label={t('meds.startDate')} value={reviewValues.start_date} />
          <ReviewRow
            label={t('meds.instructions')}
            value={reviewValues.instructions}
            wide
          />
          {reviewValues.brand_name ? (
            <ReviewRow label={t('meds.brandName')} value={reviewValues.brand_name} />
          ) : null}
          {reviewValues.prescriber_name ? (
            <ReviewRow label={t('meds.prescriber')} value={reviewValues.prescriber_name} />
          ) : null}
          {reviewValues.notes ? (
            <ReviewRow label={t('meds.notes')} value={reviewValues.notes} wide />
          ) : null}
          {pendingPhoto ? (
            <div className="sm:col-span-2">
              <dt className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                {t('photos.reviewPhoto')}
              </dt>
              <dd className="mt-1">
                <PendingPhotoThumb blob={pendingPhoto.blob} />
              </dd>
            </div>
          ) : null}
        </dl>

        {warnings.length > 0 ? (
          <div className="card border-2 border-amber-300 bg-amber-50" role="alert">
            <h2 className="flex items-center gap-2 text-lg font-bold text-amber-900">
              <AlertTriangle size={22} aria-hidden="true" />
              {t('meds.conflictTitle')}
            </h2>
            <p className="mt-2 text-base text-amber-900">{t('meds.conflictIntro')}</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-base text-amber-900">
              {warnings.map((w, i) => (
                <li key={`${w.kind}-${i}`}>
                  {t(w.messageKey)} <span className="font-semibold">({w.details})</span>
                </li>
              ))}
            </ul>
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl bg-white px-4 py-3">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 accent-amber-700"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />
              <span className="text-base font-semibold text-slate-900">
                {t('meds.acknowledge')}
              </span>
            </label>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="button" className="btn-secondary flex-1" onClick={() => setStep('form')}>
            {t('common.back')}
          </button>
          <button
            type="button"
            className="btn-primary flex-1"
            disabled={warnings.length > 0 && !acknowledged}
            onClick={() => void save()}
            data-testid="confirm-save-medication"
          >
            {isEdit ? t('meds.editSave') : t('meds.confirmSave')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">
          {isEdit ? t('meds.editTitle') : t('meds.addTitle')}
        </h1>
        <p className="mt-1 text-base text-slate-600">{t('meds.reviewHint')}</p>
      </div>

      <form onSubmit={form.handleSubmit(goToReview)} noValidate className="card flex flex-col gap-5">
        <div>
          <label className="label" htmlFor="med-name">
            {t('meds.name')} * <span className="font-normal text-slate-500">({t('common.required')})</span>
          </label>
          <input id="med-name" type="text" className="input" placeholder={t('meds.nameHint')} {...form.register('name')} />
          {err('name')}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="med-brand">
              {t('meds.brandName')} ({t('common.optional')})
            </label>
            <input id="med-brand" type="text" className="input" {...form.register('brand_name')} />
          </div>
          <div>
            <label className="label" htmlFor="med-strength">
              {t('meds.strength')} *
            </label>
            <input id="med-strength" type="text" className="input" placeholder={t('meds.strengthHint')} {...form.register('strength')} />
            {err('strength')}
          </div>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="med-form">{t('meds.form')} *</label>
            <select id="med-form" className="input" {...form.register('form')}>
              {(['tablet', 'capsule', 'liquid', 'injection', 'inhaler', 'drops', 'cream', 'other'] as const).map((f) => (
                <option key={f} value={f}>{t(`meds.form${capitalize(f)}`)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="med-dose">
              {t('meds.doseAmount')} *
            </label>
            <input id="med-dose" type="text" className="input" placeholder={t('meds.doseAmountHint')} {...form.register('dose_amount')} />
            {err('dose_amount')}
          </div>
        </div>
        <div>
          <label className="label" htmlFor="med-instructions">
            {t('meds.instructions')} *
          </label>
          <textarea
            id="med-instructions"
            className="input min-h-20"
            placeholder={t('meds.instructionsHint')}
            {...form.register('instructions')}
          />
          {err('instructions')}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="med-frequency">{t('meds.frequency')} *</label>
            <select
              id="med-frequency"
              className="input"
              {...form.register('frequency', {
                onChange: (e: { target: { value: string } }) => onFrequencyChange(e.target.value),
              })}
            >
              {(['once_daily', 'twice_daily', 'three_times_daily', 'four_times_daily', 'as_needed', 'weekly', 'custom'] as const).map((f) => (
                <option key={f} value={f}>{t(`meds.freq${frequencyKey(f)}`)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="med-food">{t('meds.foodRule')}</label>
            <select id="med-food" className="input" {...form.register('food_rule')}>
              {(['none', 'before', 'with', 'after'] as const).map((f) => (
                <option key={f} value={f}>
                  {t(`meds.food${f === 'none' ? 'None' : capitalize(f)}`)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <fieldset>
          <legend className="label">{t('meds.times')} *</legend>
          <div className="flex flex-col gap-2">
            {times.map((time, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="time"
                  className="input"
                  aria-label={`${t('meds.times')} ${index + 1}`}
                  value={time}
                  onChange={(e) => {
                    const next = [...times]
                    next[index] = e.target.value
                    form.setValue('times', next, { shouldValidate: true })
                  }}
                />
                {times.length > 1 ? (
                  <button
                    type="button"
                    className="btn-ghost !min-h-11 !px-3"
                    aria-label={t('meds.removeTime')}
                    onClick={() => removeTime(index)}
                  >
                    <Trash2 size={20} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          {form.formState.errors.times ? (
            <p className="field-error">
              {t((form.formState.errors.times.message as string) ?? 'validation.timesRequired')}
            </p>
          ) : null}
          {times.length < 6 ? (
            <button
              type="button"
              className="btn-secondary mt-2 !min-h-10 !py-2"
              onClick={addTime}
            >
              <Plus size={18} aria-hidden="true" />
              {t('meds.addTime')}
            </button>
          ) : null}
        </fieldset>

        <fieldset>
          <legend className="label">{t('meds.daysOfWeek')}</legend>
          <div className="flex flex-wrap gap-2">
            {DAY_KEYS.map((dayKey, i) => {
              const day = i + 1
              const checked = form.watch('days_of_week').includes(day)
              return (
                <label
                  key={dayKey}
                  className={`flex min-h-11 cursor-pointer items-center rounded-xl border-2 px-4 py-2 text-base font-semibold ${
                    checked ? 'border-brand-700 bg-brand-50 text-brand-800' : 'border-slate-300 text-slate-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={() => {
                      const current = form.getValues('days_of_week')
                      form.setValue(
                        'days_of_week',
                        current.includes(day)
                          ? current.filter((d) => d !== day)
                          : [...current, day].sort(),
                        { shouldValidate: true },
                      )
                    }}
                  />
                  {t(`meds.${dayKey}`)}
                </label>
              )
            })}
          </div>
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="med-start">{t('meds.startDate')} *</label>
            <input id="med-start" type="date" className="input" {...form.register('start_date')} />
            {err('start_date')}
          </div>
          <div>
            <label className="label" htmlFor="med-end">
              {t('meds.endDate')} ({t('common.optional')})
            </label>
            <input id="med-end" type="date" className="input" {...form.register('end_date')} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="med-prescriber">
            {t('meds.prescriber')} ({t('common.optional')})
          </label>
          <input id="med-prescriber" type="text" className="input" {...form.register('prescriber_name')} />
        </div>
        <div>
          <label className="label" htmlFor="med-notes">
            {t('meds.notes')} ({t('common.optional')})
          </label>
          <textarea id="med-notes" className="input min-h-16" {...form.register('notes')} />
        </div>

        <div className="rounded-xl border border-slate-200 p-4">
          <MedicationPhotoUpload
            medicationId={isEdit ? (id ?? null) : null}
            medicationName={existing?.name ?? form.watch('name')}
            onPendingPhoto={setPendingPhoto}
            onOcrSuggestion={applyOcrSuggestion}
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="button" className="btn-secondary flex-1" onClick={() => navigate(-1)}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn-primary flex-1" data-testid="review-medication">
            {t('common.next')}
          </button>
        </div>
      </form>
    </div>
  )
}

function PendingPhotoThumb({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const created = URL.createObjectURL(blob)
    setUrl(created)
    return () => URL.revokeObjectURL(created)
  }, [blob])
  if (!url) return null
  return (
    <img
      src={url}
      alt=""
      data-testid="medication-photo-pending"
      className="h-24 w-24 rounded-xl border border-slate-200 object-cover"
    />
  )
}

function ReviewRow({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
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
