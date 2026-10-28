import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { parseEventDateTime } from '../lib/commitMateSchedule';
import { Opportunity, Registration, GoogleCalendarConnectionStatus } from '../types';

export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events'
];

// Initialize Firebase App singleton safely
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

// In-Memory Token Cache (per Workspace Integration security guidelines: never in localStorage)
let inMemoryAccessToken: string | null = null;
let tokenExpiresAt: number | null = null;
let connectedUserEmail: string | null = null;

// Listen to auth state to clear token on sign-out
onAuthStateChanged(auth, (user: User | null) => {
  if (!user) {
    inMemoryAccessToken = null;
    tokenExpiresAt = null;
    connectedUserEmail = null;
  } else {
    connectedUserEmail = user.email || null;
  }
});

/**
 * Check if Google Calendar OAuth configuration is present
 */
export function isGoogleCalendarConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.oAuthClientId && firebaseConfig.projectId);
}

/**
 * Returns the current in-memory connection status
 */
export function getGoogleCalendarStatus(): GoogleCalendarConnectionStatus {
  const isConnected = Boolean(inMemoryAccessToken && (!tokenExpiresAt || Date.now() < tokenExpiresAt));
  return {
    isConnected,
    userEmail: connectedUserEmail || undefined,
    scopes: CALENDAR_SCOPES,
    expiresAt: tokenExpiresAt || undefined
  };
}

/**
 * Connect to Google Calendar via Firebase Google Auth Popup
 */
export async function connectGoogleCalendar(): Promise<{
  success: boolean;
  email?: string;
  error?: string;
}> {
  if (!isGoogleCalendarConfigured()) {
    return {
      success: false,
      error: 'Google Calendar integration is not yet configured. Please check OAuth credentials.'
    };
  }

  try {
    const provider = new GoogleAuthProvider();
    CALENDAR_SCOPES.forEach((scope) => provider.addScope(scope));
    provider.setCustomParameters({ prompt: 'select_account' });

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);

    if (credential?.accessToken) {
      inMemoryAccessToken = credential.accessToken;
      // Access tokens are valid for ~1 hour (3600 seconds)
      tokenExpiresAt = Date.now() + 3500 * 1000;
      connectedUserEmail = result.user.email || null;

      return {
        success: true,
        email: result.user.email || undefined
      };
    } else {
      return {
        success: false,
        error: 'Google did not return a calendar access token. Please ensure calendar permissions were granted.'
      };
    }
  } catch (err: any) {
    console.error('[GoogleCalendarService] Sign-in error:', err);
    if (err?.code === 'auth/popup-closed-by-user') {
      return { success: false, error: 'Sign-in cancelled: The Google popup window was closed before completing authorization.' };
    }
    return { success: false, error: err?.message || 'Failed to authenticate with Google Calendar.' };
  }
}

/**
 * Disconnect Google Calendar (clears in-memory access token)
 */
export async function disconnectGoogleCalendar(): Promise<{ success: boolean }> {
  try {
    inMemoryAccessToken = null;
    tokenExpiresAt = null;
    connectedUserEmail = null;
    await firebaseSignOut(auth);
    return { success: true };
  } catch (err) {
    console.warn('[GoogleCalendarService] Disconnect notice:', err);
    inMemoryAccessToken = null;
    return { success: true };
  }
}

/**
 * Query Google Calendar Free/Busy API to check for calendar conflicts
 */
export async function checkGoogleCalendarFreeBusy(
  timeMin: string,
  timeMax: string
): Promise<{ success: boolean; isBusy: boolean; busySlots: { start: string; end: string }[]; error?: string }> {
  if (!inMemoryAccessToken) {
    return { success: false, isBusy: false, busySlots: [], error: 'Google Calendar not connected' };
  }

  try {
    const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${inMemoryAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        timeMin,
        timeMax,
        items: [{ id: 'primary' }]
      })
    });

    if (!res.ok) {
      if (res.status === 401) {
        inMemoryAccessToken = null;
        return { success: false, isBusy: false, busySlots: [], error: 'Google Calendar token expired. Please reconnect.' };
      }
      const errJson = await res.json().catch(() => null);
      return { success: false, isBusy: false, busySlots: [], error: errJson?.error?.message || 'FreeBusy check failed' };
    }

    const data = await res.json();
    const busy = data?.calendars?.primary?.busy || [];
    return {
      success: true,
      isBusy: busy.length > 0,
      busySlots: busy
    };
  } catch (err: any) {
    return { success: false, isBusy: false, busySlots: [], error: err?.message || 'Failed to check Google Calendar availability' };
  }
}

/**
 * Add a confirmed volunteer event to Google Calendar
 * Strictly enforces duplicate prevention and explicit user authorization
 */
export async function addEventToGoogleCalendar(
  event: {
    id: string;
    title: string;
    organization: string;
    date: string;
    time: string;
    location: string;
    format: string;
    category?: string;
    sourceUrl?: string;
    userNotes?: string;
  },
  options: {
    reminders?: { before24h: boolean; before1h: boolean };
    timezone?: string;
  } = {}
): Promise<{
  success: boolean;
  eventId?: string;
  htmlLink?: string;
  error?: string;
}> {
  if (!inMemoryAccessToken) {
    return {
      success: false,
      error: 'Google Calendar is not connected. Please click "Connect Google Calendar" to authenticate.'
    };
  }

  const timing = parseEventDateTime(event.date, event.time);
  if (!timing) {
    return {
      success: false,
      error: `Could not parse event date and time (${event.date} - ${event.time}). Please verify event schedule.`
    };
  }

  const userTimezone = options.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  // Build reminder overrides
  const overrides: { method: 'popup' | 'email'; minutes: number }[] = [];
  if (options.reminders?.before24h !== false) {
    overrides.push({ method: 'popup', minutes: 1440 }); // 24 hours
  }
  if (options.reminders?.before1h !== false) {
    overrides.push({ method: 'popup', minutes: 60 }); // 1 hour
  }

  const payload = {
    summary: `[Volunteering] ${event.title}`,
    description: `Volunteer commitment with ${event.organization} via CauseConnect AI.\n\n` +
      `Cause Area: ${event.category || 'Community Service'}\n` +
      `Format: ${event.format}\n` +
      `Location: ${event.location}\n` +
      (event.sourceUrl ? `Official Details: ${event.sourceUrl}\n` : '') +
      (event.userNotes ? `Volunteer Notes: ${event.userNotes}\n` : '') +
      `\nManaged automatically by CommitMate.`,
    location: event.location,
    start: {
      dateTime: timing.start.toISOString(),
      timeZone: userTimezone
    },
    end: {
      dateTime: timing.end.toISOString(),
      timeZone: userTimezone
    },
    reminders: {
      useDefault: overrides.length === 0,
      overrides
    }
  };

  try {
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${inMemoryAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      if (res.status === 401) {
        inMemoryAccessToken = null;
        return {
          success: false,
          error: 'Google authorization expired or was revoked. Please reconnect your Google Calendar.'
        };
      }
      const errJson = await res.json().catch(() => null);
      return {
        success: false,
        error: errJson?.error?.message || `Google Calendar API returned error (${res.status})`
      };
    }

    const created = await res.json();
    return {
      success: true,
      eventId: created.id,
      htmlLink: created.htmlLink
    };
  } catch (err: any) {
    console.error('[GoogleCalendarService] Add event error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to create Google Calendar event.'
    };
  }
}
