import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { LifeBuoy, ShieldCheck, Siren } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { supportSchema } from '../validation/medication'
import { z } from 'zod'

type SupportValues = z.infer<typeof supportSchema>

export default function HelpPage() {
  const { t } = useTranslation()
  const addSupportRequest = useAppStore((s) => s.addSupportRequest)
  const setToast = useAppStore((s) => s.setToast)
  const session = useAppStore((s) => s.session)
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  const form = useForm<SupportValues>({
    resolver: zodResolver(supportSchema),
    defaultValues: { subject: '', message: '' },
  })

  async function onSupport(values: SupportValues) {
    await addSupportRequest(values.subject.trim(), values.message.trim())
    form.reset()
    setToast(t('help.supportSent'))
  }

  const faqs = [1, 2, 3, 4].map((n) => ({
    q: t(`help.faq${n}Q`),
    a: t(`help.faq${n}A`),
  }))

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">{t('help.title')}</h1>
        <p className="mt-1 text-base text-slate-600">{t('help.subtitle')}</p>
      </div>

      <div className="card flex gap-3 border-brand-200 bg-brand-50">
        <ShieldCheck size={26} className="mt-0.5 shrink-0 text-brand-700" aria-hidden="true" />
        <div>
          <h2 className="text-lg font-bold text-slate-900">{t('help.safetyTitle')}</h2>
          <p className="mt-1 text-base text-slate-700">{t('help.safetyText')}</p>
        </div>
      </div>

      <div className="card flex gap-3 border-red-200 bg-red-50">
        <Siren size={26} className="mt-0.5 shrink-0 text-red-700" aria-hidden="true" />
        <div>
          <h2 className="text-lg font-bold text-red-900">{t('help.emergencyTitle')}</h2>
          <p className="mt-1 text-base text-slate-800">{t('help.emergencyText')}</p>
        </div>
      </div>

      <div className="card">
        <h2 className="text-xl font-bold text-slate-900">{t('help.missedDoseTitle')}</h2>
        <p className="mt-2 text-base text-slate-700">{t('help.missedDoseText')}</p>
      </div>

      <div className="card">
        <h2 className="text-xl font-bold text-slate-900">{t('help.howToTitle')}</h2>
        <ol className="mt-3 space-y-4">
          {[1, 2, 3, 4].map((n) => (
            <li key={n}>
              <p className="text-base font-bold text-slate-900">
                {n}. {t(`help.step${n}Title`)}
              </p>
              <p className="mt-1 text-base text-slate-700">{t(`help.step${n}Text`)}</p>
            </li>
          ))}
        </ol>
      </div>

      <div className="card">
        <h2 className="text-xl font-bold text-slate-900">{t('help.faqTitle')}</h2>
        <div className="mt-3 flex flex-col gap-2">
          {faqs.map((f, i) => (
            <div key={f.q} className="rounded-xl border border-slate-200">
              <button
                type="button"
                className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left text-base font-semibold text-slate-900"
                aria-expanded={openFaq === i}
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
              >
                {f.q}
                <span aria-hidden="true">{openFaq === i ? '−' : '+'}</span>
              </button>
              {openFaq === i ? (
                <p className="px-4 pb-4 text-base text-slate-700">{f.a}</p>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {session ? (
        <div className="card">
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <LifeBuoy size={24} className="text-brand-700" aria-hidden="true" />
            {t('help.supportTitle')}
          </h2>
          <form onSubmit={form.handleSubmit(onSupport)} noValidate className="mt-4">
            <label className="label" htmlFor="support-subject">{t('help.supportSubject')}</label>
            <input id="support-subject" type="text" className="input" {...form.register('subject')} />
            {form.formState.errors.subject ? (
              <p className="field-error">{t(form.formState.errors.subject.message ?? '')}</p>
            ) : null}
            <label className="label mt-4" htmlFor="support-message">{t('help.supportMessage')}</label>
            <textarea id="support-message" className="input min-h-24" {...form.register('message')} />
            {form.formState.errors.message ? (
              <p className="field-error">{t(form.formState.errors.message.message ?? '')}</p>
            ) : null}
            <button type="submit" className="btn-primary mt-4" disabled={form.formState.isSubmitting}>
              {t('help.supportSend')}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  )
}
