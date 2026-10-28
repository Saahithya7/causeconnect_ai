import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  VolunteerProfile,
  Registration,
  CommitMateReminder,
  VolunteerAvailability
} from '../types';

export const API_BASE_URL = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_BASE_URL
  ? String((import.meta as any).env.VITE_API_BASE_URL).replace(/\/$/, '')
  : '');

/**
 * Fetch CommitMate reminders for a user
 */
export async function getCommitMateReminders(userId: string): Promise<{
  success: boolean;
  reminders: CommitMateReminder[];
  error?: string;
}> {
  if (!userId) {
    return { success: false, reminders: [], error: 'User ID is required' };
  }

  // 1. Try server API endpoint
  try {
    const res = await fetch(`${API_BASE_URL}/api/commitmate/reminders?userId=${encodeURIComponent(userId)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.reminders)) {
        return { success: true, reminders: data.reminders };
      }
    }
  } catch {
    // Fall back to direct Supabase query
  }

  // 2. Direct Supabase query fallback
  if (supabase && isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('event_reminders')
        .select('*')
        .eq('user_id', userId)
        .order('scheduled_for', { ascending: true });

      if (error) {
        return { success: false, reminders: [], error: error.message };
      }

      const mapped: CommitMateReminder[] = (data || []).map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        registrationId: row.registration_id,
        opportunityId: row.opportunity_id,
        opportunityTitle: row.opportunity_title,
        reminderType: row.reminder_type,
        scheduledFor: row.scheduled_for,
        status: row.status,
        deliveredAt: row.delivered_at,
        channel: row.channel,
        message: row.message,
        isRead: Boolean(row.is_read),
        createdAt: row.created_at
      }));

      return { success: true, reminders: mapped };
    } catch (err: any) {
      return { success: false, reminders: [], error: err?.message };
    }
  }

  return { success: true, reminders: [] };
}

/**
 * Schedule a new reminder for an event
 */
export async function scheduleEventReminder(params: {
  userId: string;
  registrationId?: string;
  opportunityId?: string;
  opportunityTitle: string;
  reminderType: '24h' | '1h' | 'custom' | 'test';
  scheduledFor: string;
  channel?: 'in_app' | 'browser' | 'email';
  message: string;
}): Promise<{ success: boolean; reminder?: CommitMateReminder; error?: string }> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/commitmate/reminders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        return { success: true, reminder: data.reminder };
      }
    }
  } catch {
    // Fallback
  }

  // Direct Supabase fallback
  if (supabase && isSupabaseConfigured()) {
    try {
      const payload = {
        user_id: params.userId,
        registration_id: params.registrationId || null,
        opportunity_id: params.opportunityId || null,
        opportunity_title: params.opportunityTitle,
        reminder_type: params.reminderType,
        scheduled_for: params.scheduledFor,
        channel: params.channel || 'in_app',
        message: params.message,
        status: 'scheduled'
      };

      const { data, error } = await supabase
        .from('event_reminders')
        .insert(payload)
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return {
        success: true,
        reminder: {
          id: data.id,
          userId: data.user_id,
          registrationId: data.registration_id,
          opportunityId: data.opportunity_id,
          opportunityTitle: data.opportunity_title,
          reminderType: data.reminder_type,
          scheduledFor: data.scheduled_for,
          status: data.status,
          deliveredAt: data.delivered_at,
          channel: data.channel,
          message: data.message,
          isRead: Boolean(data.is_read),
          createdAt: data.created_at
        }
      };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }

  return { success: false, error: 'Failed to schedule reminder' };
}

/**
 * Mark a reminder as read
 */
export async function markReminderAsRead(reminderId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/commitmate/reminders/${encodeURIComponent(reminderId)}/read`, {
      method: 'PATCH'
    });
    if (res.ok) return true;
  } catch {
    // fallback
  }

  if (supabase && isSupabaseConfigured()) {
    try {
      await supabase
        .from('event_reminders')
        .update({ is_read: true, updated_at: new Date().toISOString() })
        .eq('id', reminderId);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Link a Google Calendar event ID to a registration
 */
export async function linkRegistrationCalendarEvent(
  registrationId: string,
  calendarEventId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/registrations/${encodeURIComponent(registrationId)}/calendar-sync`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calendarEventId })
    });
    if (res.ok) {
      return { success: true };
    }
  } catch {
    // Fall back to direct query
  }

  if (supabase && isSupabaseConfigured()) {
    try {
      const { error } = await supabase
        .from('registrations')
        .update({
          google_calendar_event_id: calendarEventId,
          calendar_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', registrationId);

      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }

  return { success: true };
}

/**
 * Request native browser notification permission
 */
export async function requestBrowserNotificationPermission(): Promise<'granted' | 'denied' | 'default'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch {
    return 'denied';
  }
}

/**
 * Trigger a native browser notification if allowed
 */
export function showBrowserNotification(title: string, options?: NotificationOptions): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (Notification.permission === 'granted') {
    try {
      new Notification(title, {
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        ...options
      });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
