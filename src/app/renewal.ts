// Deciding when to silently re-authorise.
//
// Renewing means a top-level redirect to Google and back (see spec §5.1), which
// reloads the page. That is invisible when there is nothing to lose and rude
// when there is, so the decision is entirely about what the redirect would
// interrupt.

/** Renew this long before the token actually expires. */
export const RENEW_LEAD_MS = 5 * 60 * 1000

export interface RenewalContext {
  now: number
  /** When the current token stops working. */
  expiresAt: number
  /** The app's save state; anything unwritten must not be interrupted. */
  saveState: string
  /** True while the user has a text field focused. */
  editing: boolean
}

export function renewalDecision(context: RenewalContext): 'renew' | 'wait' {
  // Renewing is only ever safe when Drive holds everything the app does.
  // 'dirty' and 'saving' are obvious; 'error' matters just as much, because a
  // failed save leaves the only copy of the edit in memory. Listing what is
  // safe rather than what is not means an unfamiliar state waits by default.
  // Waiting risks the token expiring, which costs a reconnect prompt — far
  // cheaper than silently discarding the user's work.
  if (context.saveState !== 'idle' && context.saveState !== 'saved') return 'wait'

  const expired = context.now >= context.expiresAt

  // Once the token is dead the app cannot talk to Drive anyway, so there is
  // nothing left to protect and renewing beats showing an error.
  if (expired) return 'renew'

  // Otherwise leave the user alone while they are typing; there is still time.
  if (context.editing) return 'wait'

  return context.now >= context.expiresAt - RENEW_LEAD_MS ? 'renew' : 'wait'
}
