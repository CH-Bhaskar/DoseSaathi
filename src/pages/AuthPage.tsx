import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { Pill, TriangleAlert } from 'lucide-react'
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../i18n'
import { isConfigured } from '../lib/supabase'
import { useAppStore } from '../store/appStore'
import type { Role } from '../types'
import { authSchema, loginSchema } from '../validation/medication'
import { z } from 'zod'

type LoginValues = z.infer<typeof loginSchema>
type SignupValues = z.infer<typeof authSchema>

export default function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const signIn = useAppStore((s) => s.signIn)
  const signUp = useAppStore((s) => s.signUp)
  const loading = useAppStore((s) => s.loading)
  const language = useAppStore((s) => s.language)
  const setLanguage = useAppStore((s) => s.setLanguage)
  const [formError, setFormError] = useState<string | null>(null)

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })
  const signupForm = useForm<SignupValues>({
    resolver: zodResolver(authSchema),
    defaultValues: { full_name: '', email: '', password: '', role: 'patient' },
  })

  function homeForRole(role: Role): string {
    switch (role) {
      case 'patient':
        return '/dashboard'
      case 'caregiver':
        return '/caregiver/dashboard'
      case 'healthcare_professional':
        return '/hcp'
      case 'admin':
        return '/admin'
    }
  }

  async function onLogin(values: LoginValues) {
    setFormError(null)
    try {
      await signIn(values.email, values.password)
      const session = useAppStore.getState().session
      if (!session) throw new Error('auth.invalid')
      const profile = useAppStore.getState().profile
      if (profile && !profile.onboarding_completed && profile.role === 'patient') {
        navigate('/onboarding')
      } else {
        navigate(homeForRole(session.role))
      }
    } catch (e) {
      // Not-configured is an honest, specific error: no session is ever
      // created and no fake login happens.
      setFormError(
        e instanceof Error && e.message === 'supabase.notConfigured'
          ? t('auth.notConfiguredError')
          : t('auth.loginError'),
      )
    }
  }

  async function onSignup(values: SignupValues) {
    setFormError(null)
    try {
      await signUp(values)
      const session = useAppStore.getState().session
      if (!session) throw new Error('auth.signupFailed')
      navigate(
        session.role === 'patient' ? '/onboarding' : homeForRole(session.role),
      )
    } catch (e) {
      if (e instanceof Error && e.message === 'supabase.notConfigured') {
        setFormError(t('auth.notConfiguredError'))
      } else {
        setFormError(
          e instanceof Error && e.message === 'auth.emailTaken'
            ? t('auth.emailTaken')
            : t('auth.signupError'),
        )
      }
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-700 text-white">
            <Pill size={30} aria-hidden="true" />
          </span>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">
            {mode === 'login' ? t('auth.loginTitle') : t('auth.signupTitle')}
          </h1>
          <p className="mt-1 text-base text-slate-600">
            {mode === 'login' ? t('auth.loginSubtitle') : t('auth.signupSubtitle')}
          </p>
        </div>

        <div className="mt-4 flex items-center justify-center gap-3">
          <label className="label !mb-0" htmlFor="auth-language">
            {t('auth.languageLabel')}
          </label>
          <select
            id="auth-language"
            className="input !w-auto"
            value={language}
            onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
            data-testid="auth-language-select"
          >
            {SUPPORTED_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.nativeLabel} ({l.label})
              </option>
            ))}
          </select>
        </div>

        {!isConfigured ? (
          <div
            className="mt-4 flex gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-base font-medium text-amber-900"
            role="status"
          >
            <TriangleAlert size={22} className="mt-0.5 shrink-0" aria-hidden="true" />
            <p>{t('auth.notConfiguredNote')}</p>
          </div>
        ) : null}

        <div className="card mt-4">
          {formError ? (
            <div role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-base font-medium text-red-800">
              {formError}
            </div>
          ) : null}

          {mode === 'login' ? (
            <form onSubmit={loginForm.handleSubmit(onLogin)} noValidate>
              <div>
                <label className="label" htmlFor="login-email">{t('auth.email')}</label>
                <input
                  id="login-email"
                  type="email"
                  className="input"
                  autoComplete="email"
                  {...loginForm.register('email')}
                />
                {loginForm.formState.errors.email ? (
                  <p className="field-error">{t(loginForm.formState.errors.email.message ?? '')}</p>
                ) : null}
              </div>
              <div className="mt-4">
                <label className="label" htmlFor="login-password">{t('auth.password')}</label>
                <input
                  id="login-password"
                  type="password"
                  className="input"
                  autoComplete="current-password"
                  {...loginForm.register('password')}
                />
                {loginForm.formState.errors.password ? (
                  <p className="field-error">{t(loginForm.formState.errors.password.message ?? '')}</p>
                ) : null}
              </div>
              <button type="submit" className="btn-primary mt-6 w-full" disabled={loading}>
                {t('auth.loginButton')}
              </button>
            </form>
          ) : (
            <form onSubmit={signupForm.handleSubmit(onSignup)} noValidate>
              <div>
                <label className="label" htmlFor="signup-name">{t('auth.fullName')}</label>
                <input
                  id="signup-name"
                  type="text"
                  className="input"
                  autoComplete="name"
                  {...signupForm.register('full_name')}
                />
                {signupForm.formState.errors.full_name ? (
                  <p className="field-error">{t(signupForm.formState.errors.full_name.message ?? '')}</p>
                ) : null}
              </div>
              <div className="mt-4">
                <label className="label" htmlFor="signup-email">{t('auth.email')}</label>
                <input
                  id="signup-email"
                  type="email"
                  className="input"
                  autoComplete="email"
                  {...signupForm.register('email')}
                />
                {signupForm.formState.errors.email ? (
                  <p className="field-error">{t(signupForm.formState.errors.email.message ?? '')}</p>
                ) : null}
              </div>
              <div className="mt-4">
                <label className="label" htmlFor="signup-password">{t('auth.password')}</label>
                <input
                  id="signup-password"
                  type="password"
                  className="input"
                  autoComplete="new-password"
                  {...signupForm.register('password')}
                />
                <p className="mt-1 text-sm text-slate-500">{t('auth.passwordHint')}</p>
                {signupForm.formState.errors.password ? (
                  <p className="field-error">{t(signupForm.formState.errors.password.message ?? '')}</p>
                ) : null}
              </div>
              <fieldset className="mt-4">
                <legend className="label">{t('auth.role')}</legend>
                <div className="flex flex-col gap-2">
                  {(['patient', 'caregiver', 'healthcare_professional'] as const).map((r) => (
                    <label
                      key={r}
                      className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-slate-200 px-4 py-3 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50"
                    >
                      <input
                        type="radio"
                        value={r}
                        className="mt-1 h-5 w-5 accent-brand-700"
                        {...signupForm.register('role')}
                      />
                      <span>
                        <span className="block text-base font-semibold text-slate-900">
                          {t(`auth.role${r === 'patient' ? 'Patient' : r === 'caregiver' ? 'Caregiver' : 'Hcp'}`)}
                        </span>
                        <span className="block text-sm text-slate-600">
                          {t(`auth.role${r === 'patient' ? 'Patient' : r === 'caregiver' ? 'Caregiver' : 'Hcp'}Desc`)}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <button type="submit" className="btn-primary mt-6 w-full" disabled={loading}>
                {t('auth.signupButton')}
              </button>
            </form>
          )}

          <p className="mt-4 text-center text-base text-slate-600">
            {mode === 'login' ? t('auth.noAccount') : t('auth.haveAccount')}{' '}
            <Link
              to={mode === 'login' ? '/signup' : '/login'}
              className="font-semibold text-brand-700 underline"
            >
              {mode === 'login' ? t('auth.signupButton') : t('auth.loginButton')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
