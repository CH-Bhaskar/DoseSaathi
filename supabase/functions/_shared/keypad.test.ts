import { describe, expect, it } from 'vitest'
import {
  MAX_CONFIRM_REPEATS,
  MAX_MENU_REPEATS,
  mapConfirmKey,
  mapMenuKey,
} from './keypad'

describe('mapMenuKey', () => {
  it('maps 1/2/3 to confirm/later/help', () => {
    expect(mapMenuKey('1')).toBe('confirm')
    expect(mapMenuKey('2')).toBe('later')
    expect(mapMenuKey('3')).toBe('help')
  })
  it('trims whitespace', () => {
    expect(mapMenuKey(' 1 ')).toBe('confirm')
  })
  it('any other key repeats the menu', () => {
    for (const key of ['0', '4', '5', '9', '*', '#', '12', '', 'abc']) {
      expect(mapMenuKey(key)).toBe('repeat')
    }
  })
  it('missing input repeats the menu', () => {
    expect(mapMenuKey(null)).toBe('repeat')
    expect(mapMenuKey(undefined)).toBe('repeat')
  })
})

describe('mapConfirmKey', () => {
  it('maps 1 to confirmed and 2 to back to menu', () => {
    expect(mapConfirmKey('1')).toBe('confirmed')
    expect(mapConfirmKey('2')).toBe('back_to_menu')
  })
  it('any other key repeats the confirmation', () => {
    for (const key of ['0', '3', '9', '*', '', 'abc']) {
      expect(mapConfirmKey(key)).toBe('repeat_confirm')
    }
  })
  it('missing input repeats the confirmation', () => {
    expect(mapConfirmKey(null)).toBe('repeat_confirm')
    expect(mapConfirmKey(undefined)).toBe('repeat_confirm')
  })
})

describe('repeat limits', () => {
  it('the menu and confirmation steps both have finite repeat caps', () => {
    expect(MAX_MENU_REPEATS).toBeGreaterThan(0)
    expect(MAX_CONFIRM_REPEATS).toBeGreaterThan(0)
  })
})
