import type { ReactNode } from 'react'
import { Pill } from 'lucide-react'

export default function EmptyState({
  title,
  text,
  action,
}: {
  title: string
  text?: string
  action?: ReactNode
}) {
  return (
    <div className="card flex flex-col items-center gap-3 py-10 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-700">
        <Pill size={32} aria-hidden="true" />
      </span>
      <h2 className="text-xl font-bold text-slate-900">{title}</h2>
      {text ? <p className="max-w-md text-base text-slate-600">{text}</p> : null}
      {action}
    </div>
  )
}
