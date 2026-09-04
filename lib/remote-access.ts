/** Shared constants for opt-in remote access (Option A).
 *  Safe for client and server — no Node builtins. */

export const REMOTE_CSRF_HEADER = "x-spec-yard-csrf"
export const REMOTE_CSRF_VALUE = "1"
export const SESSION_COOKIE_NAME = "spec_yard_session"
export const REMOTE_TOKEN_FILENAME = "remote-token"
export const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60
