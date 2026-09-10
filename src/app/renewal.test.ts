import { describe, it, expect } from 'vitest'
import { renewalDecision, RENEW_LEAD_MS } from './renewal'

const NOW = 1_800_000_000_000
const HOUR = 60 * 60 * 1000

const base = {
  now: NOW,
  expiresAt: NOW + HOUR,
  saveState: 'saved',
  editing: false,
}

describe('renewalDecision', () => {
  it('waits while the token is still fresh', () => {
    expect(renewalDecision(base)).toBe('wait')
  })

  it('renews once inside the lead window', () => {
    expect(renewalDecision({ ...base, expiresAt: NOW + RENEW_LEAD_MS - 1 })).toBe('renew')
  })

  it('waits just outside the lead window', () => {
    expect(renewalDecision({ ...base, expiresAt: NOW + RENEW_LEAD_MS + 1 })).toBe('wait')
  })

  it('never interrupts an unsaved edit', () => {
    expect(renewalDecision({ ...base, expiresAt: NOW + 1, saveState: 'dirty' })).toBe('wait')
  })

  it('never interrupts a save in flight', () => {
    expect(renewalDecision({ ...base, expiresAt: NOW + 1, saveState: 'saving' })).toBe('wait')
  })

  it('holds off while the user is typing and there is still time', () => {
    expect(renewalDecision({ ...base, expiresAt: NOW + 1000, editing: true })).toBe('wait')
  })

  it('renews once expired even if the user is typing', () => {
    expect(renewalDecision({ ...base, expiresAt: NOW - 1, editing: true })).toBe('renew')
  })

  it('never interrupts an edit whose save failed', () => {
    expect(renewalDecision({ ...base, expiresAt: NOW + 1, saveState: 'error' })).toBe('wait')
  })

  it('waits on an unrecognised save state rather than risking work', () => {
    expect(renewalDecision({ ...base, expiresAt: NOW - 1, saveState: 'whatever' })).toBe('wait')
  })

  it('renews from the idle state', () => {
    expect(renewalDecision({ ...base, expiresAt: NOW - 1, saveState: 'idle' })).toBe('renew')
  })

  it('still refuses to renew an expired token over unsaved work', () => {
    expect(renewalDecision({ ...base, expiresAt: NOW - HOUR, saveState: 'dirty' })).toBe('wait')
  })
})
