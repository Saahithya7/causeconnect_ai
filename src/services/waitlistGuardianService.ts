import { supabase } from '../lib/supabase';
import type {
  Registration,
  WaitlistNotification,
  WaitlistAvailabilityStatus,
  WaitlistMonitoringStatus
} from '../types';

const API_BASE_URL = typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_BASE_URL
  ? String((import.meta as any).env.VITE_API_BASE_URL).replace(/\/$/, '')
  : '';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token) {
      headers['Authorization'] = `Bearer ${data.session.access_token}`;
    }
  }
  return headers;
}

/**
 * Fetch all waitlisted registrations for the current user
 */
export async function getWaitlistedRegistrations(
  userId?: string
): Promise<{ success: boolean; registrations: Registration[]; error?: string }> {
  try {
    const headers = await getAuthHeaders();
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    const res = await fetch(`${API_BASE_URL}/api/waitlist/registrations${query}`, {
      headers
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch waitlisted registrations (HTTP ${res.status})`);
    }

    const data = await res.json();
    return {
      success: true,
      registrations: data.registrations || []
    };
  } catch (err: any) {
    console.error('[waitlistGuardianService] getWaitlistedRegistrations error:', err);
    return {
      success: false,
      registrations: [],
      error: err?.message || 'Failed to fetch waitlist'
    };
  }
}

/**
 * Toggle automated availability monitoring for a waitlisted event
 */
export async function toggleWaitlistMonitoring(
  registrationId: string,
  enabled: boolean
): Promise<{ success: boolean; monitoringEnabled: boolean; monitoringStatus: WaitlistMonitoringStatus; error?: string }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE_URL}/api/waitlist/${registrationId}/toggle`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ enabled })
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `Failed to update monitoring setting (HTTP ${res.status})`);
    }

    const data = await res.json();
    return {
      success: true,
      monitoringEnabled: data.monitoringEnabled,
      monitoringStatus: data.monitoringStatus
    };
  } catch (err: any) {
    console.error('[waitlistGuardianService] toggleWaitlistMonitoring error:', err);
    return {
      success: false,
      monitoringEnabled: !enabled,
      monitoringStatus: 'paused',
      error: err?.message || 'Failed to toggle monitoring'
    };
  }
}

/**
 * Trigger an immediate manual availability status check
 */
export async function checkWaitlistStatusNow(
  registrationId: string,
  options: { forceStatus?: WaitlistAvailabilityStatus } = {}
): Promise<{
  success: boolean;
  registration?: any;
  inspection?: any;
  notificationCreated?: WaitlistNotification | null;
  error?: string;
}> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE_URL}/api/waitlist/${registrationId}/check-now`, {
      method: 'POST',
      headers,
      body: JSON.stringify(options)
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `Status check failed (HTTP ${res.status})`);
    }

    const data = await res.json();
    return {
      success: true,
      registration: data.registration,
      inspection: data.inspection,
      notificationCreated: data.notificationCreated
    };
  } catch (err: any) {
    console.error('[waitlistGuardianService] checkWaitlistStatusNow error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to check status'
    };
  }
}

/**
 * Fetch WaitlistGuardian notifications for the user
 */
export async function getWaitlistNotifications(
  userId?: string
): Promise<{ success: boolean; notifications: WaitlistNotification[]; error?: string }> {
  try {
    const headers = await getAuthHeaders();
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    const res = await fetch(`${API_BASE_URL}/api/waitlist/notifications${query}`, {
      headers
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch notifications (HTTP ${res.status})`);
    }

    const data = await res.json();
    return {
      success: true,
      notifications: data.notifications || []
    };
  } catch (err: any) {
    console.error('[waitlistGuardianService] getWaitlistNotifications error:', err);
    return {
      success: false,
      notifications: [],
      error: err?.message || 'Failed to fetch notifications'
    };
  }
}

/**
 * Mark a waitlist notification as read
 */
export async function markWaitlistNotificationRead(
  notificationId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE_URL}/api/waitlist/notifications/${notificationId}/read`, {
      method: 'PATCH',
      headers
    });

    return { success: res.ok };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

/**
 * Execute the Safe Re-registration workflow:
 * 1. Checks that a spot is verified available.
 * 2. Requires explicit user approval before execution.
 * 3. Uses Playwright ApplyPilot to register on official page.
 * 4. Only upon confirmed verified outcome, updates Supabase registration status to 'confirmed'.
 */
export async function executeSafeReRegistration(
  registrationId: string,
  approvalInput: {
    explicitConsentGiven: boolean;
    userNotes?: string;
  }
): Promise<{
  success: boolean;
  registration?: Registration;
  verificationEvidence?: string;
  confirmationReference?: string;
  error?: string;
}> {
  if (!approvalInput.explicitConsentGiven) {
    return {
      success: false,
      error: 'Explicit volunteer approval is required to claim an available spot.'
    };
  }

  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE_URL}/api/waitlist/${registrationId}/re-register`, {
      method: 'POST',
      headers,
      body: JSON.stringify(approvalInput)
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Re-registration execution was not verified by the target portal.');
    }

    return {
      success: true,
      registration: data.registration,
      verificationEvidence: data.verificationEvidence,
      confirmationReference: data.confirmationReference
    };
  } catch (err: any) {
    console.error('[waitlistGuardianService] executeSafeReRegistration error:', err);
    return {
      success: false,
      error: err?.message || 'Safe re-registration failed. Existing waitlist status preserved.'
    };
  }
}
