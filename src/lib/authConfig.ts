/**
 * Supabase Auth Callback and Redirect Configuration for CauseConnect AI
 * Published app URL: https://causeconnect-volunteermatch-ai.ai.studio
 */

export const PUBLISHED_APP_URL = 'https://causeconnect-volunteermatch-ai.ai.studio';

/**
 * Resolves the canonical callback URL for Supabase Auth verification emails and password reset links.
 * 
 * 1. If running in a browser environment:
 *    - If on localhost / loopback, returns PUBLISHED_APP_URL to prevent verification emails from failing with localhost.
 *    - If on a public domain or the published AI Studio URL, returns current origin.
 * 2. Fallback to PUBLISHED_APP_URL.
 */
export function getAuthRedirectUrl(): string {
  if (typeof window !== 'undefined' && window.location) {
    const origin = window.location.origin;
    if (
      origin.includes('localhost') ||
      origin.includes('127.0.0.1') ||
      origin.includes('0.0.0.0') ||
      origin.startsWith('file:')
    ) {
      return PUBLISHED_APP_URL;
    }
    return origin;
  }
  return PUBLISHED_APP_URL;
}
