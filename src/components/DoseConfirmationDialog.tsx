import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BellRing, CheckCircle2, CircleHelp } from 'lucide-react'
import type { CallAttempt } from '../types/calls'
import AccessibleActionButton from './AccessibleActionButton'

type DialogResult = 'taken' | 'later' | 'help' | null

/** Accessible confirm dialog for a dose linked to a call record.
 * Three actions — confirm taken, remind later, need help — matching
 * the keypad menu (Press 1 / 2 / 3). Keyboard navigable with a focus
 * trap, Escape to close, and an aria-live result announcement.
 * Presentational — the parent performs the action via the callbacks.
 * The result is shown only after the callback resolves: a failed save
 * keeps the buttons visible and shows an error instead of claiming
 * the dose was recorded. Focus returns to the element that opened the
 * dialog when it closes. */
export default function DoseConfirmationDialog({
  open,
  attempt,
  medicationName,
  onConfirm,
  onRemindLater,
  onNeedHelp,
  onClose,
}: {
  open: boolean
  attempt: CallAttempt | null
  medicationName: string
  onConfirm: (attempt: CallAttempt) => void | Promise<void>
  onRemindLater: (attempt: CallAttempt) => void | Promise<void>
  onNeedHelp: (attempt: CallAttempt) => void | Promise<void>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const dialogRef = useRef<HTMLDivElement>(null)
  const firstButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const [result, setResult] = useState<DialogResult>(null)
  const [actionError, setActionError] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) {
      // Reset on CLOSE, not on open: a stale result would make the
      // next open render the result view first, so the focus call
      // below would find no action button to focus (the buttons only
      // appear after the reset re-renders). Resetting here means the
      // next open renders the action buttons immediately.
      setResult(null)
      setActionError(false)
      setBusy(false)
      return
    }
    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    firstButtonRef.current?.focus()
    return () => {
      // Restore focus to whatever opened the dialog. If the list
      // re-rendered while the dialog was open (e.g. after a save),
      // the trigger element may have been replaced — focusing a
      // detached node is a no-op, and focus stays where it is.
      previouslyFocusedRef.current?.focus()
    }
  }, [open])

  // When the result replaces the buttons, move focus to the Close
  // button — the clicked button unmounts, which would otherwise drop
  // keyboard focus to the top of the page.
  useEffect(() => {
    if (result !== null) closeButtonRef.current?.focus()
  }, [result])

  async function runAction(
    action: (attempt: CallAttempt) => void | Promise<void>,
    next: Exclude<DialogResult, null>,
  ) {
    if (!attempt || busy) return
    setBusy(true)
    setActionError(false)
    try {
      await action(attempt)
      setResult(next)
    } catch {
      setActionError(true)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || attempt === null) return null

  const scheduledAt = new Date(attempt.scheduled_for).toLocaleString()
  const resultKey =
    result === 'taken'
      ? 'calls.dialog.confirmedResult'
      : result === 'later'
        ? 'calls.dialog.laterResult'
        : result === 'help'
          ? 'calls.dialog.helpResult'
          : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={t('calls.dialog.title')}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-slate-900">
          {t('calls.dialog.title')}
        </h2>
        <p className="mt-2 text-base text-slate-600">
          {t('calls.dialog.text', { medicine: medicationName, date: scheduledAt })}
        </p>
        <p className="mt-2 text-base font-semibold text-slate-700">
          {t('calls.dialog.safetyNote')}
        </p>

        {actionError ? (
          <p className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-base font-medium text-red-800" role="alert">
            {t('common.errorGeneric')}
          </p>
        ) : null}
        {result === null ? (
          <div className="mt-6 flex flex-col gap-3">
            <AccessibleActionButton
              ref={firstButtonRef}
              variant="primary"
              disabled={busy}
              onClick={() => void runAction(onConfirm, 'taken')}
            >
              <CheckCircle2 size={20} aria-hidden="true" />
              {t('calls.dialog.confirm')}
            </AccessibleActionButton>
            <AccessibleActionButton
              variant="secondary"
              disabled={busy}
              onClick={() => void runAction(onRemindLater, 'later')}
            >
              <BellRing size={20} aria-hidden="true" />
              {t('calls.dialog.remindLater')}
            </AccessibleActionButton>
            <AccessibleActionButton
              variant="secondary"
              disabled={busy}
              onClick={() => void runAction(onNeedHelp, 'help')}
            >
              <CircleHelp size={20} aria-hidden="true" />
              {t('calls.dialog.needHelp')}
            </AccessibleActionButton>
            <AccessibleActionButton
              variant="secondary"
              disabled={busy}
              onClick={onClose}
            >
              {t('common.cancel')}
            </AccessibleActionButton>
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-3">
            <p className="text-base font-semibold text-green-800" aria-live="polite">
              {resultKey ? t(resultKey) : ''}
            </p>
            <AccessibleActionButton
              ref={closeButtonRef}
              variant="primary"
              onClick={onClose}
            >
              {t('calls.dialog.close')}
            </AccessibleActionButton>
          </div>
        )}
      </div>
    </div>
  )
}
