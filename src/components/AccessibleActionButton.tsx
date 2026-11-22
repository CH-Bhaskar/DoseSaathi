/* The standard button for the extension's new flows (photo upload,
 * call dialog, consent, call history). It guarantees what the plain
 * .btn-* classes only happen to provide:
 *   - a touch target of at least 44x44px (min-h-11, min-w-11) — never
 *     overridden smaller (the old `!min-h-10` overrides were 40px and
 *     are gone from the new flows);
 *   - a visible focus state (the global :focus-visible ring in
 *     index.css);
 *   - full keyboard support (a native <button>, so Enter/Space work
 *     and it is in the tab order);
 *   - an accessible name: visible text, or aria-label for icon-only
 *     uses (pass aria-label explicitly — the component never invents
 *     one).
 * Variants reuse the shared .btn-* classes, so it looks like the rest
 * of the app. */
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
}

export default function AccessibleActionButton({
  variant = 'primary',
  type = 'button',
  className = '',
  children,
  ref,
  ...rest
}: {
  variant?: Variant
  children: ReactNode
  ref?: Ref<HTMLButtonElement>
  type?: 'button' | 'submit' | 'reset'
} & Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'ref' | 'type'
>) {
  return (
    <button
      ref={ref}
      type={type}
      className={`${VARIANT_CLASS[variant]} min-h-11 min-w-11 ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
