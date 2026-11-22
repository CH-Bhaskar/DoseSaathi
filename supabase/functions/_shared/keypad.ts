/* Keypad (DTMF) menu mapping for the call flow.
 *
 *   1 — "I have taken it"        -> confirm step (never recorded until
 *                                  the patient confirms the repeat-back)
 *   2 — "Remind me later"        -> snooze / retry per policy, NOT taken
 *   3 — "I need help"            -> flag for help (escalation pending),
 *                                  NOT taken
 *   anything else                -> repeat the menu
 *
 * The mapping is deliberately total: every input produces exactly one
 * outcome, and only 'confirm' can ever lead to a dose being recorded. */

export type MenuAction = 'confirm' | 'later' | 'help' | 'repeat'

export type ConfirmAction = 'confirmed' | 'back_to_menu' | 'repeat_confirm'

/** Map a keypad press on the main menu to an action. */
export function mapMenuKey(key: string | null | undefined): MenuAction {
  switch ((key ?? '').trim()) {
    case '1':
      return 'confirm'
    case '2':
      return 'later'
    case '3':
      return 'help'
    default:
      return 'repeat'
  }
}

/** Map a keypad press on the confirmation repeat-back step.
 * 1 = "yes, that is correct", 2 = "no, take me back to the menu". */
export function mapConfirmKey(key: string | null | undefined): ConfirmAction {
  switch ((key ?? '').trim()) {
    case '1':
      return 'confirmed'
    case '2':
      return 'back_to_menu'
    default:
      return 'repeat_confirm'
  }
}

/** Maximum times the menu is repeated before the call ends politely
 * without recording anything. */
export const MAX_MENU_REPEATS = 3

/** Maximum times the confirmation step is repeated before the call ends
 * politely without recording anything. */
export const MAX_CONFIRM_REPEATS = 2
