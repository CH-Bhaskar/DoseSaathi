/* DoseSaathi end-to-end walkthrough (Playwright, plain node script).
 *
 * Runs the no-backend checks against a built preview server:
 *   npm run build && npx vite preview --port 4175 --strictPort --host 127.0.0.1
 *   E2E_BASE_URL=http://127.0.0.1:4175 npm run test:e2e
 * (E2E_BASE_URL overrides the base URL; the default :4173 preview is
 * left alone — it serves the running build.)
 *
 * The demo login and sample data were removed (2026-11-22): there is
 * no demo login and no sample data any more, so this walkthrough covers only what is
 * verifiable WITHOUT a live Supabase project: the language screen and
 * its dropdown, the login/signup page UI, the honest not-configured
 * state, protected-route redirects, keyboard navigation, and mobile
 * layout. Every authenticated flow is listed as NOT TESTED at the end
 * — nothing is faked to make those checks pass.
 *
 * Checks are counted and printed; the process exits non-zero on any
 * failure. Screenshots land in tests/screenshots/. */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = process.env.E2E_BASE_URL || 'http://localhost:4173'
const DIR = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = path.join(DIR, 'screenshots')
fs.mkdirSync(SHOTS, { recursive: true })

const results = []
const consoleErrors = []
const pageErrors = []

function check(name, ok, extra = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`)
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true })
}

const KANNADA_RE = /[\u0C80-\u0CFF]/

async function bodyHasKannada(page) {
  return page.evaluate(
    (re) => new RegExp(re).test(document.body.innerText),
    KANNADA_RE.source,
  )
}

/** Press Tab until the focused element has the given data-testid. */
async function tabToTestId(page, testId, maxTabs = 60) {
  for (let i = 0; i < maxTabs; i++) {
    const id = await page.evaluate(
      () => document.activeElement?.getAttribute('data-testid') || '',
    )
    if (id === testId) return true
    await page.keyboard.press('Tab')
  }
  return false
}

/** Depth-first search of a page.accessibility.snapshot() tree. */
function findInSnapshot(node, predicate) {
  if (!node) return null
  if (predicate(node)) return node
  for (const child of node.children || []) {
    const found = findInSnapshot(child, predicate)
    if (found) return found
  }
  return null
}

async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  })
  const page = await context.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => pageErrors.push(String(e)))

  // ---- Phase 1: first open, language dropdown ---------------------------
  await page.goto(BASE)
  await page.waitForURL('**/language', { timeout: 8000 })
  check('First visit redirects to language selection', page.url().includes('/language'))
  const langSelect = page.getByTestId('language-select')
  check('Language screen shows one dropdown (not two buttons)', (await langSelect.count()) === 1)
  const options = await langSelect.locator('option').allTextContents()
  check(
    'Dropdown lists English and Kannada with native + English labels',
    options.length === 2 &&
      options[0].includes('English') &&
      options[1].includes('ಕನ್ನಡ') &&
      options[1].includes('Kannada'),
    options.join(' | '),
  )
  const labelFor = await page.locator('label[for="language-select"]').count()
  check('Dropdown has a real associated <label>', labelFor === 1)
  check(
    'Continue button is present',
    (await page.getByTestId('language-continue').count()) === 1,
  )
  const langTree = await page.accessibility.snapshot()
  check(
    'Accessibility tree names the language combobox',
    Boolean(findInSnapshot(langTree, (n) => n.role === 'combobox' && /language/i.test(n.name || ''))),
  )
  await shot(page, '25-language-dropdown')

  // ---- Phase 2: Kannada re-render + not-configured state -----------------
  await langSelect.selectOption('kn')
  await page.waitForTimeout(500)
  check('Selecting Kannada re-renders the language screen in Kannada', await bodyHasKannada(page))
  await page.getByTestId('language-continue').click()
  await page.waitForURL(BASE + '/', { timeout: 8000 })
  check('Continue navigates to the home route', page.url() === `${BASE}/`)
  const notice = page.getByTestId('not-configured-page')
  await notice.waitFor({ timeout: 8000 })
  check('Home shows the full-screen not-configured state (no fake landing)', (await notice.count()) === 1)
  check(
    'Not-configured state names both env vars',
    (await page.getByText('VITE_SUPABASE_URL').count()) >= 1 &&
      (await page.getByText('VITE_SUPABASE_ANON_KEY').count()) >= 1,
  )
  check(
    'Not-configured state points at .env.example',
    (await page.getByText('.env.example').count()) >= 1,
  )
  check(
    'Not-configured state is readable in Kannada',
    await bodyHasKannada(page),
  )
  check(
    'No demo login or sample data is offered anywhere on the page',
    (await page.getByText(/demo/i).count()) === 0,
  )
  await shot(page, '27-not-configured')

  // /language still renders directly, so the notice can be re-read in
  // the other language.
  await page.goto(`${BASE}/language`)
  await page.getByTestId('language-select').waitFor({ timeout: 8000 })
  check('Language screen still renders when visited directly', (await page.getByTestId('language-select').count()) === 1)
  await page.getByTestId('language-select').selectOption('en')
  await page.getByTestId('language-continue').click()
  await page.waitForURL(BASE + '/', { timeout: 8000 })
  // changeLanguage is async: wait for the English title rather than
  // asserting in the same tick as the navigation.
  await page.getByText('Supabase is not configured').waitFor({ timeout: 8000 })
  check(
    'Switching back to English re-renders the notice in English',
    (await page.getByText('Supabase is not configured').count()) === 1,
  )

  // ---- Phase 3: login page UI --------------------------------------------
  await page.goto(`${BASE}/login`)
  await page.waitForSelector('#login-email', { timeout: 8000 })
  check(
    'Login form renders (email + password + submit)',
    (await page.locator('#login-email').count()) === 1 &&
      (await page.locator('#login-password').count()) === 1 &&
      (await page.getByRole('button', { name: 'Log in' }).count()) === 1,
  )
  check(
    'Login page shows the not-configured note (no fake login offered)',
    (await page.getByText(/Supabase is not configured yet/).count()) === 1 &&
      (await page.getByText(/demo/i).count()) === 0,
  )
  const authSelect = page.getByTestId('auth-language-select')
  check('Login page has its own language dropdown', (await authSelect.count()) === 1)
  await page.getByRole('button', { name: 'Log in' }).click()
  check('Login shows validation errors on empty submit', (await page.locator('.field-error').count()) >= 1)
  await authSelect.selectOption('kn')
  await page.waitForTimeout(500)
  check('Login language dropdown re-renders the page in Kannada', await bodyHasKannada(page))
  await authSelect.selectOption('en')
  await page.waitForTimeout(500)
  check('Login language dropdown switches back to English', (await page.getByText('Welcome back').count()) === 1)
  await shot(page, '26-login-dropdown')
  // Submitting with credentials must fail honestly and never log in.
  await page.fill('#login-email', 'someone@example.com')
  await page.fill('#login-password', 'some-password-123')
  await page.getByRole('button', { name: 'Log in' }).click()
  const loginAlert = page.getByRole('alert')
  await loginAlert.waitFor({ timeout: 8000 })
  check(
    'Login submit shows the honest not-configured error',
    (await loginAlert.getByText(/Supabase is not configured/).count()) === 1,
  )
  await page.waitForTimeout(500)
  check('Login submit does NOT log in (stays on /login)', page.url().includes('/login'))
  check(
    'No session is created by the failed login',
    (await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('supabase') || k.includes('sb-')).length)) === 0,
  )

  // ---- Phase 4: signup page UI -------------------------------------------
  await page.goto(`${BASE}/signup`)
  await page.waitForSelector('#signup-email', { timeout: 8000 })
  check(
    'Signup form renders (name + email + password + role)',
    (await page.locator('#signup-name').count()) === 1 &&
      (await page.locator('#signup-email').count()) === 1 &&
      (await page.locator('#signup-password').count()) === 1 &&
      (await page.locator('input[type="radio"]').count()) === 3,
  )
  check('Signup page has the language dropdown', (await page.getByTestId('auth-language-select').count()) === 1)
  await page.getByRole('button', { name: 'Create account' }).click()
  check('Signup shows validation errors on empty submit', (await page.locator('.field-error').count()) >= 2)
  await page.getByTestId('auth-language-select').selectOption('kn')
  await page.waitForTimeout(500)
  check('Signup language dropdown re-renders the page in Kannada', await bodyHasKannada(page))
  await page.getByTestId('auth-language-select').selectOption('en')
  await page.waitForTimeout(500)
  await page.fill('#signup-name', 'Walkthrough Person')
  await page.fill('#signup-email', 'walkthrough@example.com')
  await page.fill('#signup-password', 'walkthrough-123')
  await page.getByRole('button', { name: 'Create account' }).click()
  const signupAlert = page.getByRole('alert')
  await signupAlert.waitFor({ timeout: 8000 })
  check(
    'Signup submit shows the honest not-configured error',
    (await signupAlert.getByText(/Supabase is not configured/).count()) === 1,
  )
  await page.waitForTimeout(500)
  check('Signup submit does NOT create a session (stays on /signup)', page.url().includes('/signup'))

  // ---- Phase 5: protected routes redirect to /login ----------------------
  for (const route of ['/dashboard', '/medications', '/calls', '/settings/profile', '/admin', '/onboarding']) {
    await page.goto(`${BASE}${route}`)
    await page.waitForURL('**/login', { timeout: 8000 })
    check(`Protected route ${route} redirects to /login`, page.url().includes('/login'))
  }

  // ---- Phase 6: unknown route --------------------------------------------
  await page.goto(`${BASE}/no-such-page`)
  check('Unknown route shows the not-found page', (await page.getByText('Page not found').count()) === 1)

  // ---- Phase 7: keyboard-only language flow (fresh context) --------------
  const kb = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const kpage = await kb.newPage()
  kpage.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  kpage.on('pageerror', (e) => pageErrors.push(String(e)))
  await kpage.goto(BASE)
  await kpage.waitForURL('**/language', { timeout: 8000 })
  const foundSelect = await tabToTestId(kpage, 'language-select')
  check('Language dropdown is reachable by keyboard (Tab)', foundSelect)
  const focusVisible = await kpage.evaluate(() => {
    const el = document.activeElement
    return Boolean(el && el.matches(':focus-visible'))
  })
  check('Keyboard focus is visible on the dropdown (:focus-visible)', focusVisible)
  // Arrow keys change a focused native select; ArrowDown moves en -> kn.
  await kpage.keyboard.press('ArrowDown')
  await kpage.waitForTimeout(500)
  const kbValue = await kpage.inputValue('[data-testid="language-select"]')
  check('Dropdown value changes with the keyboard (ArrowDown -> kn)', kbValue === 'kn')
  check('Keyboard language change re-renders the page in Kannada', await bodyHasKannada(kpage))
  const foundContinue = await tabToTestId(kpage, 'language-continue')
  check('Continue button is reachable by keyboard (Tab)', foundContinue)
  await kpage.keyboard.press('Enter')
  await kpage.waitForURL(BASE + '/', { timeout: 8000 })
  check('Keyboard Continue navigates to the not-configured page', kpage.url() === `${BASE}/`)
  await kb.close()

  // ---- Phase 8: mobile layout --------------------------------------------
  const mobile = await browser.newContext({ viewport: { width: 375, height: 667 } })
  const mpage = await mobile.newPage()
  mpage.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  mpage.on('pageerror', (e) => pageErrors.push(String(e)))
  await mpage.goto(`${BASE}/language`)
  await mpage.getByTestId('language-select').waitFor({ timeout: 8000 })
  check(
    'Language screen fits the mobile width (no horizontal overflow)',
    await mpage.evaluate(() => document.documentElement.scrollWidth <= 375),
  )
  await mpage.getByTestId('language-continue').click()
  await mpage.waitForURL(BASE + '/', { timeout: 8000 })
  check(
    'Not-configured page fits the mobile width (no horizontal overflow)',
    await mpage.evaluate(() => document.documentElement.scrollWidth <= 375),
  )
  await mpage.goto(`${BASE}/login`)
  await mpage.waitForSelector('#login-email', { timeout: 8000 })
  check(
    'Login page fits the mobile width (no horizontal overflow)',
    await mpage.evaluate(() => document.documentElement.scrollWidth <= 375),
  )
  await mobile.close()

  // ---- Console / page errors ----------------------------------------------
  check('No page errors during the walkthrough', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))
  if (consoleErrors.length > 0) {
    console.log(`NOTE: ${consoleErrors.length} console error(s) captured (not failing):`)
    for (const e of consoleErrors.slice(0, 5)) console.log(`  - ${e.slice(0, 200)}`)
  }

  await browser.close()

  const passed = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${passed}/${results.length} checks passed.`)
  if (failed.length > 0) {
    console.log('Failed checks:')
    for (const f of failed) console.log(`  - ${f.name}`)
    process.exit(1)
  }

  console.log(`
NOT TESTED without a live Supabase project (no backend was faked):
  - Sign-in / sign-up with real accounts, onboarding, all roles
  - Dashboard, medications (add/edit/review/conflicts), schedule,
    dose recording, history, analytics, export
  - Offline queue + sync, grace escalation, caregiver/HCP views
  - Medicine photos (upload/OCR/replace/delete), voice-call settings,
    consent grant/revoke, pregnancy setting, call history
  - Profile, privacy, reminders, help, admin
  - A real voice-call reminder (also needs a funded Twilio account)`)
}

main().catch((e) => {
  console.error('Walkthrough crashed:', e)
  process.exit(1)
})
