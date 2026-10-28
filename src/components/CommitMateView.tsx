import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Clock,
  Bell,
  AlertTriangle,
  CheckCircle2,
  CalendarCheck,
  CalendarX,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  RefreshCw,
  LogOut,
  Info,
  ChevronRight,
  Sliders,
  Check,
  AlertCircle,
  MapPin,
  Building,
  BellRing,
  Send,
  Zap,
  Globe,
  Plus
} from 'lucide-react';
import {
  Opportunity,
  Registration,
  VolunteerProfile,
  ScheduleConflict,
  CommitMateReminder,
  GoogleCalendarConnectionStatus
} from '../types';
import {
  detectScheduleConflicts,
  parseEventDateTime
} from '../lib/commitMateSchedule';
import {
  isGoogleCalendarConfigured,
  getGoogleCalendarStatus,
  connectGoogleCalendar,
  disconnectGoogleCalendar,
  addEventToGoogleCalendar,
  checkGoogleCalendarFreeBusy
} from '../services/googleCalendarService';
import {
  getCommitMateReminders,
  scheduleEventReminder,
  markReminderAsRead,
  linkRegistrationCalendarEvent,
  requestBrowserNotificationPermission,
  showBrowserNotification
} from '../services/commitMateService';

interface CommitMateViewProps {
  userProfile: VolunteerProfile;
  registrations: Registration[];
  supabaseUserId?: string | null;
  onUpdateProfile: (updates: Partial<VolunteerProfile>) => Promise<any>;
  onRefreshRegistrations: () => Promise<void>;
  onNavigateToDiscover?: () => void;
}

export const CommitMateView: React.FC<CommitMateViewProps> = ({
  userProfile,
  registrations,
  supabaseUserId,
  onUpdateProfile,
  onRefreshRegistrations,
  onNavigateToDiscover
}) => {
  const [activeTab, setActiveTab] = useState<'schedule' | 'calendar' | 'availability' | 'reminders'>('schedule');

  // Availability state
  const [timezone, setTimezone] = useState<string>(
    userProfile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  );
  const [weeklyHours, setWeeklyHours] = useState<number>(userProfile.weeklyHoursTarget || 5);
  const [preferredDays, setPreferredDays] = useState<string[]>(
    userProfile.preferredDays?.map(String) || ['Saturday', 'Sunday']
  );
  const [prefStartTime, setPrefStartTime] = useState<string>(
    userProfile.preferredWorkingHours?.start || '08:00'
  );
  const [prefEndTime, setPrefEndTime] = useState<string>(
    userProfile.preferredWorkingHours?.end || '18:00'
  );
  const [isSavingAvailability, setIsSavingAvailability] = useState(false);
  const [availabilitySavedSuccess, setAvailabilitySavedSuccess] = useState(false);

  // Google Calendar state
  const [calendarStatus, setCalendarStatus] = useState<GoogleCalendarConnectionStatus>(getGoogleCalendarStatus());
  const [isConnectingCalendar, setIsConnectingCalendar] = useState(false);
  const [calendarActionError, setCalendarActionError] = useState<string | null>(null);
  const [syncingEventId, setSyncingEventId] = useState<string | null>(null);
  const [freeBusyResult, setFreeBusyResult] = useState<{ isBusy: boolean; checkedEvent?: string } | null>(null);

  // Reminders state
  const [reminders, setReminders] = useState<CommitMateReminder[]>([]);
  const [isLoadingReminders, setIsLoadingReminders] = useState(false);
  const [remindersEnabled24h, setRemindersEnabled24h] = useState<boolean>(
    userProfile.reminderPreferences?.before24h !== false
  );
  const [remindersEnabled1h, setRemindersEnabled1h] = useState<boolean>(
    userProfile.reminderPreferences?.before1h !== false
  );
  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] = useState<boolean>(
    userProfile.reminderPreferences?.browserNotifications !== false
  );
  const [browserPermissionStatus, setBrowserPermissionStatus] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );
  const [testReminderSent, setTestReminderSent] = useState(false);

  // Modal for explicit Google Calendar event export authorization
  const [confirmExportModalEvent, setConfirmExportModalEvent] = useState<Registration | null>(null);

  // Refresh calendar status on mount
  useEffect(() => {
    setCalendarStatus(getGoogleCalendarStatus());
  }, []);

  // Fetch reminders on mount or user change
  const fetchReminders = async () => {
    if (!supabaseUserId) return;
    setIsLoadingReminders(true);
    try {
      const res = await getCommitMateReminders(supabaseUserId);
      if (res.success && res.reminders) {
        setReminders(res.reminders);
      }
    } finally {
      setIsLoadingReminders(false);
    }
  };

  useEffect(() => {
    fetchReminders();
  }, [supabaseUserId]);

  // Conflict evaluation across registered events
  const conflictsMap = useMemo(() => {
    const map = new Map<string, ScheduleConflict>();
    const activeProfile: Partial<VolunteerProfile> = {
      preferredDays: preferredDays as any,
      preferredWorkingHours: { start: prefStartTime, end: prefEndTime }
    };

    registrations.forEach((reg) => {
      const conflict = detectScheduleConflicts(
        { id: reg.id, title: reg.opportunityTitle, date: reg.date, time: reg.time },
        registrations,
        activeProfile
      );
      map.set(reg.id, conflict);
    });

    return map;
  }, [registrations, preferredDays, prefStartTime, prefEndTime]);

  const totalConflicts = useMemo(() => {
    let count = 0;
    conflictsMap.forEach((c) => {
      if (c.hasConflict && c.severity === 'blocking') count++;
    });
    return count;
  }, [conflictsMap]);

  // Handle saving availability preferences
  const handleSaveAvailability = async () => {
    setIsSavingAvailability(true);
    setAvailabilitySavedSuccess(false);
    try {
      await onUpdateProfile({
        timezone,
        weeklyHoursTarget: weeklyHours,
        preferredDays: preferredDays as any,
        preferredWorkingHours: { start: prefStartTime, end: prefEndTime },
        reminderPreferences: {
          before24h: remindersEnabled24h,
          before1h: remindersEnabled1h,
          browserNotifications: browserNotificationsEnabled
        }
      });
      setAvailabilitySavedSuccess(true);
      setTimeout(() => setAvailabilitySavedSuccess(false), 3500);
    } catch (err: any) {
      console.error('Failed to save availability:', err);
    } finally {
      setIsSavingAvailability(false);
    }
  };

  // Connect Google Calendar handler
  const handleConnectGoogleCalendar = async () => {
    setIsConnectingCalendar(true);
    setCalendarActionError(null);
    try {
      const res = await connectGoogleCalendar();
      if (res.success) {
        setCalendarStatus(getGoogleCalendarStatus());
        await onUpdateProfile({
          googleCalendarConnected: true,
          googleCalendarEmail: res.email
        });
      } else {
        setCalendarActionError(res.error || 'Failed to connect Google Calendar');
      }
    } catch (err: any) {
      setCalendarActionError(err?.message || 'Connection failed');
    } finally {
      setIsConnectingCalendar(false);
    }
  };

  // Disconnect Google Calendar handler
  const handleDisconnectGoogleCalendar = async () => {
    await disconnectGoogleCalendar();
    setCalendarStatus(getGoogleCalendarStatus());
    await onUpdateProfile({
      googleCalendarConnected: false,
      googleCalendarEmail: undefined
    });
  };

  // Add event to Google Calendar (with explicit confirmation)
  const handleExecuteCalendarExport = async (reg: Registration) => {
    setSyncingEventId(reg.id);
    setCalendarActionError(null);
    try {
      const result = await addEventToGoogleCalendar(
        {
          id: reg.opportunityId,
          title: reg.opportunityTitle,
          organization: reg.organization,
          date: reg.date,
          time: reg.time,
          location: reg.location,
          format: reg.format,
          category: reg.category,
          userNotes: reg.userNotes
        },
        {
          timezone,
          reminders: { before24h: remindersEnabled24h, before1h: remindersEnabled1h }
        }
      );

      if (result.success && result.eventId) {
        // Persist calendar event ID to Supabase registration record
        await linkRegistrationCalendarEvent(reg.id, result.eventId);
        await onRefreshRegistrations();
        setConfirmExportModalEvent(null);
      } else {
        setCalendarActionError(result.error || 'Failed to add event to Google Calendar.');
      }
    } catch (err: any) {
      setCalendarActionError(err?.message || 'Export error');
    } finally {
      setSyncingEventId(null);
    }
  };

  // Trigger test reminder
  const handleSendTestReminder = async () => {
    if (!supabaseUserId) return;
    setTestReminderSent(true);

    const message = `CommitMate Test Alert: Next commitment check is verified. Timezone set to ${timezone}.`;

    // 1. In-app reminder
    await scheduleEventReminder({
      userId: supabaseUserId,
      opportunityTitle: 'CommitMate Availability & Alert Test',
      reminderType: 'test',
      scheduledFor: new Date().toISOString(),
      channel: 'in_app',
      message
    });

    // 2. Native browser notification if enabled
    if (browserNotificationsEnabled && Notification.permission === 'granted') {
      showBrowserNotification('CommitMate — Schedule Alert', {
        body: message
      });
    }

    await fetchReminders();
    setTimeout(() => setTestReminderSent(false), 3000);
  };

  // Request browser permission
  const handleRequestBrowserPermission = async () => {
    const perm = await requestBrowserNotificationPermission();
    setBrowserPermissionStatus(perm);
    if (perm === 'granted') {
      setBrowserNotificationsEnabled(true);
    }
  };

  // Mark reminder as read
  const handleMarkRead = async (id: string) => {
    await markReminderAsRead(id);
    setReminders((prev) => prev.map((r) => (r.id === id ? { ...r, isRead: true } : r)));
  };

  const daysList = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Hero Header */}
      <div className="bg-[#244C3A] text-white p-6 sm:p-8 rounded-3xl shadow-sm relative overflow-hidden border border-[#315D48]">
        <div className="absolute right-0 top-0 w-96 h-96 bg-[#D6C49A]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-[#D6C49A] text-xs font-semibold backdrop-blur-xs border border-white/10">
            <CalendarCheck className="w-4 h-4 text-[#E6D5AC]" />
            <span>CommitMate · Availability & Calendar Agent</span>
          </div>

          <div className="max-w-2xl">
            <h1 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white">
              Smart Availability, Conflict Detection & Calendar Sync
            </h1>
            <p className="mt-2 text-sm sm:text-base text-[#E8F0E9]/80 leading-relaxed">
              Never double-book a commitment. CommitMate compares your preferred hours, detects event overlaps, synchronizes with Google Calendar, and delivers scheduled reminders.
            </p>
          </div>

          {/* Quick Stats Pills */}
          <div className="pt-2 flex flex-wrap items-center gap-3">
            <div className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
              calendarStatus.isConnected
                ? 'bg-emerald-950/60 border-emerald-400/40 text-emerald-200'
                : 'bg-white/10 border-white/20 text-[#E8F0E9]'
            }`}>
              {calendarStatus.isConnected ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Google Calendar: Connected ({calendarStatus.userEmail})</span>
                </>
              ) : (
                <>
                  <CalendarX className="w-3.5 h-3.5 text-[#D6C49A]" />
                  <span>Google Calendar: Not Connected</span>
                </>
              )}
            </div>

            <div className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/20 text-xs font-semibold text-[#E8F0E9] flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-[#D6C49A]" />
              <span>Timezone: {timezone}</span>
            </div>

            {totalConflicts > 0 ? (
              <div className="px-3 py-1.5 rounded-xl bg-red-950/60 border border-red-400/50 text-xs font-semibold text-red-200 flex items-center gap-2 animate-pulse">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                <span>{totalConflicts} Schedule Conflict{totalConflicts > 1 ? 's' : ''} Detected</span>
              </div>
            ) : (
              <div className="px-3 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-400/30 text-xs font-semibold text-emerald-200 flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Schedule Verified (0 Overlaps)</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex border-b border-[#D5E0D7] bg-white rounded-2xl p-1.5 shadow-xs gap-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab('schedule')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'schedule'
              ? 'bg-[#244C3A] text-white shadow-xs'
              : 'text-[#5A7868] hover:text-[#244C3A] hover:bg-[#E8F0E9]/50'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Upcoming Schedule & Conflicts</span>
          {registrations.length > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              activeTab === 'schedule' ? 'bg-white text-[#244C3A]' : 'bg-[#E8F0E9] text-[#244C3A]'
            }`}>
              {registrations.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('calendar')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'calendar'
              ? 'bg-[#244C3A] text-white shadow-xs'
              : 'text-[#5A7868] hover:text-[#244C3A] hover:bg-[#E8F0E9]/50'
          }`}
        >
          <Globe className="w-4 h-4" />
          <span>Google Calendar Sync</span>
          <span className={`w-2 h-2 rounded-full ${calendarStatus.isConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
        </button>

        <button
          onClick={() => setActiveTab('availability')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'availability'
              ? 'bg-[#244C3A] text-white shadow-xs'
              : 'text-[#5A7868] hover:text-[#244C3A] hover:bg-[#E8F0E9]/50'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Working Hours & Days</span>
        </button>

        <button
          onClick={() => setActiveTab('reminders')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'reminders'
              ? 'bg-[#244C3A] text-white shadow-xs'
              : 'text-[#5A7868] hover:text-[#244C3A] hover:bg-[#E8F0E9]/50'
          }`}
        >
          <Bell className="w-4 h-4" />
          <span>Smart Reminders Engine</span>
          {reminders.filter((r) => !r.isRead && r.status === 'delivered').length > 0 && (
            <span className="w-2 h-2 rounded-full bg-red-500" />
          )}
        </button>
      </div>

      {calendarActionError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-900 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold block">CommitMate Notice</span>
            <span>{calendarActionError}</span>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: Upcoming Schedule & Conflict Inspector */}
      {/* ========================================================================= */}
      {activeTab === 'schedule' && (
        <div className="space-y-6">
          {/* Conflict Summary Alert if any conflict exists */}
          {totalConflicts > 0 && (
            <div className="p-5 bg-red-50 border border-red-200 rounded-3xl space-y-3">
              <div className="flex items-center gap-2.5 text-red-800 font-bold text-sm">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <span>Schedule Conflicts Detected Between Your Registered Commitments</span>
              </div>
              <p className="text-xs text-red-700 leading-relaxed">
                CommitMate identified overlapping hours among your confirmed volunteer activities. Review the highlighted events below to adjust your schedule.
              </p>
            </div>
          )}

          {registrations.length === 0 ? (
            <div className="bg-white rounded-3xl border border-[#D5E0D7] p-12 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-[#E8F0E9] text-[#244C3A] flex items-center justify-center mx-auto">
                <Calendar className="w-7 h-7 text-[#244C3A]" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="font-serif text-lg font-bold text-[#244C3A]">No Commitments Registered Yet</h3>
                <p className="text-xs text-[#5A7868] leading-relaxed">
                  As you discover and register for volunteer opportunities, CommitMate will automatically inspect your schedule for conflicts and keep your calendar in sync.
                </p>
              </div>
              {onNavigateToDiscover && (
                <button
                  onClick={onNavigateToDiscover}
                  className="px-5 py-2.5 rounded-xl bg-[#244C3A] text-white text-xs font-semibold hover:bg-[#315D48] transition-colors cursor-pointer shadow-xs"
                >
                  Explore Volunteer Opportunities
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {registrations.map((reg) => {
                const conflict = conflictsMap.get(reg.id);
                const isSynced = Boolean(reg.googleCalendarEventId);

                return (
                  <div
                    key={reg.id}
                    className={`bg-white rounded-3xl border transition-all p-5 sm:p-6 shadow-xs space-y-4 ${
                      conflict?.hasConflict && conflict.severity === 'blocking'
                        ? 'border-red-300 ring-1 ring-red-200'
                        : conflict?.isIncomplete
                        ? 'border-amber-200'
                        : 'border-[#D5E0D7]'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#E8F0E9] text-[#244C3A] border border-[#D5E0D7]">
                            {reg.category}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-white text-[#5A7868] border border-[#D5E0D7]">
                            {reg.format === 'in-person' ? 'In-Person' : 'Remote'}
                          </span>
                          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                            reg.status === 'confirmed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {reg.status === 'confirmed' ? 'Confirmed Spot' : 'Waitlisted'}
                          </span>
                        </div>

                        <h3 className="font-serif text-lg sm:text-xl font-bold text-[#244C3A]">
                          {reg.opportunityTitle}
                        </h3>

                        <div className="text-xs text-[#5A7868] flex items-center gap-2 flex-wrap pt-0.5">
                          <span className="flex items-center gap-1 font-medium text-[#244C3A]">
                            <Building className="w-3.5 h-3.5 text-[#315D48]" />
                            {reg.organization}
                          </span>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-[#315D48]" />
                            {reg.location}
                          </span>
                        </div>
                      </div>

                      {/* Calendar Sync Status / Action */}
                      <div className="flex items-center gap-2 shrink-0">
                        {isSynced ? (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span>Synced to Google Calendar</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              if (!calendarStatus.isConnected) {
                                handleConnectGoogleCalendar();
                              } else {
                                setConfirmExportModalEvent(reg);
                              }
                            }}
                            disabled={syncingEventId === reg.id}
                            className="px-3.5 py-2 rounded-xl border border-[#D5DACA] bg-white hover:bg-[#E8F0E9] text-[#244C3A] text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                          >
                            <CalendarCheck className="w-4 h-4 text-[#244C3A]" />
                            <span>{calendarStatus.isConnected ? 'Add to Google Calendar' : 'Connect Calendar'}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Schedule Time Bar */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-[#FAFDF9] rounded-2xl border border-[#D5E0D7]/70 text-xs">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-[#315D48]" />
                        <div>
                          <span className="text-[#5A7868] block text-[10px] uppercase font-bold">Event Date</span>
                          <span className="font-semibold text-[#244C3A]">{reg.date}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-[#315D48]" />
                        <div>
                          <span className="text-[#5A7868] block text-[10px] uppercase font-bold">Scheduled Shift</span>
                          <span className="font-semibold text-[#244C3A]">{reg.time}</span>
                        </div>
                      </div>
                    </div>

                    {/* Conflict Analysis Badge */}
                    {conflict && (
                      <div className={`p-3.5 rounded-2xl text-xs flex items-start gap-2.5 ${
                        conflict.hasConflict && conflict.severity === 'blocking'
                          ? 'bg-red-50 border border-red-200 text-red-900'
                          : conflict.isIncomplete
                          ? 'bg-amber-50 border border-amber-200 text-amber-900'
                          : conflict.hasConflict
                          ? 'bg-amber-50 border border-amber-200 text-amber-900'
                          : 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                      }`}>
                        {conflict.hasConflict && conflict.severity === 'blocking' ? (
                          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                        ) : conflict.isIncomplete ? (
                          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        ) : conflict.hasConflict ? (
                          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        )}

                        <div className="space-y-0.5">
                          <span className="font-bold block">
                            {conflict.hasConflict && conflict.severity === 'blocking'
                              ? 'Schedule Overlap Detected'
                              : conflict.isIncomplete
                              ? 'Timing Check Incomplete'
                              : conflict.hasConflict
                              ? 'Schedule Advisory'
                              : 'Schedule Verified Clear'}
                          </span>
                          <p className="text-[11px] leading-relaxed opacity-90">
                            {conflict.explanation}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: Google Calendar Integration */}
      {/* ========================================================================= */}
      {activeTab === 'calendar' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-[#D5E0D7] p-6 sm:p-8 space-y-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#D5E0D7]">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#5A7868]">
                  <Globe className="w-4 h-4 text-[#244C3A]" />
                  <span>Official Google Calendar Integration</span>
                </div>
                <h3 className="font-serif text-xl sm:text-2xl font-bold text-[#244C3A]">
                  Synchronize Volunteer Commitments
                </h3>
                <p className="text-xs sm:text-sm text-[#5A7868]">
                  Connect your primary Google Calendar using OAuth 2.0. Export authorized volunteer shifts with venue location, shift timing, and custom 24h & 1h reminders.
                </p>
              </div>

              <div>
                {calendarStatus.isConnected ? (
                  <button
                    onClick={handleDisconnectGoogleCalendar}
                    className="px-4 py-2.5 rounded-xl border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Disconnect Calendar</span>
                  </button>
                ) : (
                  <button
                    onClick={handleConnectGoogleCalendar}
                    disabled={isConnectingCalendar}
                    className="px-5 py-3 rounded-xl bg-[#244C3A] text-white hover:bg-[#315D48] text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {isConnectingCalendar ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <CalendarCheck className="w-4 h-4 text-[#D6C49A]" />
                    )}
                    <span>Connect Google Calendar</span>
                  </button>
                )}
              </div>
            </div>

            {/* Connection Status Details */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-[#FAFDF9] border border-[#D5E0D7]/70 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#5A7868] block">Connection State</span>
                <span className={`text-sm font-bold flex items-center gap-1.5 ${
                  calendarStatus.isConnected ? 'text-emerald-700' : 'text-amber-700'
                }`}>
                  {calendarStatus.isConnected ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Active & Authorized</span>
                    </>
                  ) : (
                    <>
                      <CalendarX className="w-4 h-4 text-amber-600" />
                      <span>Not Connected</span>
                    </>
                  )}
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-[#FAFDF9] border border-[#D5E0D7]/70 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#5A7868] block">Connected Account</span>
                <span className="text-sm font-medium text-[#244C3A] truncate block">
                  {calendarStatus.userEmail || 'No account linked'}
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-[#FAFDF9] border border-[#D5E0D7]/70 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#5A7868] block">Configured Scope</span>
                <span className="text-xs font-mono text-[#315D48] truncate block">
                  calendar.events (Least Privilege)
                </span>
              </div>
            </div>

            {/* Live Calendar Sync Actions */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h4 className="font-serif text-base font-bold text-[#244C3A]">
                  Confirmed Commitments Awaiting Calendar Export
                </h4>
                <button
                  onClick={onRefreshRegistrations}
                  className="text-xs font-semibold text-[#315D48] hover:text-[#244C3A] flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Refresh list</span>
                </button>
              </div>

              {registrations.length === 0 ? (
                <p className="text-xs text-[#5A7868]">No registered commitments to export.</p>
              ) : (
                <div className="space-y-2">
                  {registrations.map((reg) => (
                    <div
                      key={reg.id}
                      className="p-3.5 rounded-2xl border border-[#D5E0D7] bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-0.5">
                        <span className="font-bold text-xs text-[#244C3A] block">{reg.opportunityTitle}</span>
                        <span className="text-[11px] text-[#5A7868]">
                          {reg.date} · {reg.time} · {reg.location}
                        </span>
                      </div>

                      <div>
                        {reg.googleCalendarEventId ? (
                          <div className="flex items-center gap-1.5 text-emerald-700 text-xs font-semibold">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span>Event ID: {reg.googleCalendarEventId.slice(0, 12)}...</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              if (!calendarStatus.isConnected) {
                                handleConnectGoogleCalendar();
                              } else {
                                setConfirmExportModalEvent(reg);
                              }
                            }}
                            className="px-3.5 py-1.5 rounded-xl bg-[#244C3A] text-white hover:bg-[#315D48] text-xs font-semibold transition-colors cursor-pointer"
                          >
                            Add to Google Calendar
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: Working Hours & Availability */}
      {/* ========================================================================= */}
      {activeTab === 'availability' && (
        <div className="bg-white rounded-3xl border border-[#D5E0D7] p-6 sm:p-8 space-y-6 shadow-xs">
          <div className="space-y-1 pb-4 border-b border-[#D5E0D7]">
            <h3 className="font-serif text-xl sm:text-2xl font-bold text-[#244C3A]">
              Volunteer Availability Settings
            </h3>
            <p className="text-xs sm:text-sm text-[#5A7868]">
              Define your preferred volunteering days and time windows. CommitMate uses these rules to flag commitments that fall outside your personal schedule.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Preferred Days */}
            <div className="space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-[#5A7868]">
                Preferred Volunteering Days
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {daysList.map((day) => {
                  const isSelected = preferredDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => {
                        setPreferredDays((prev) =>
                          isSelected ? prev.filter((d) => d !== day) : [...prev, day]
                        );
                      }}
                      className={`p-3 rounded-2xl border text-xs font-semibold transition-all text-left flex items-center justify-between cursor-pointer ${
                        isSelected
                          ? 'bg-[#E8F0E9] border-[#244C3A] text-[#244C3A]'
                          : 'bg-white border-[#D5E0D7] text-[#5A7868] hover:border-[#315D48]'
                      }`}
                    >
                      <span>{day}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-[#244C3A]" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Daily Hours & Targets */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#5A7868] mb-1.5">
                  Timezone
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#D5E0D7] text-xs font-medium text-[#244C3A] bg-[#FAFDF9]"
                    placeholder="e.g. Asia/Kolkata or America/New_York"
                  />
                  <button
                    type="button"
                    onClick={() => setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)}
                    className="px-3 py-2 rounded-xl border border-[#D5E0D7] text-xs font-semibold text-[#244C3A] hover:bg-[#E8F0E9] transition-colors shrink-0 cursor-pointer"
                  >
                    Detect
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#5A7868] mb-1.5">
                    Start Window
                  </label>
                  <input
                    type="time"
                    value={prefStartTime}
                    onChange={(e) => setPrefStartTime(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-[#D5E0D7] text-xs font-semibold text-[#244C3A] bg-[#FAFDF9]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#5A7868] mb-1.5">
                    End Window
                  </label>
                  <input
                    type="time"
                    value={prefEndTime}
                    onChange={(e) => setPrefEndTime(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-[#D5E0D7] text-xs font-semibold text-[#244C3A] bg-[#FAFDF9]"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#5A7868]">
                    Weekly Volunteer Target
                  </label>
                  <span className="text-xs font-bold text-[#244C3A]">{weeklyHours} Hours / week</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="25"
                  value={weeklyHours}
                  onChange={(e) => setWeeklyHours(parseInt(e.target.value, 10))}
                  className="w-full accent-[#244C3A] cursor-pointer"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[#D5E0D7] flex items-center justify-between">
            {availabilitySavedSuccess ? (
              <span className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Availability preferences saved to Supabase!
              </span>
            ) : (
              <span className="text-xs text-[#5A7868]">
                CommitMate evaluates conflicts in real time using these constraints.
              </span>
            )}

            <button
              onClick={handleSaveAvailability}
              disabled={isSavingAvailability}
              className="px-6 py-2.5 rounded-xl bg-[#244C3A] text-white hover:bg-[#315D48] text-xs font-semibold transition-colors cursor-pointer shadow-xs disabled:opacity-50"
            >
              {isSavingAvailability ? 'Saving...' : 'Save Availability Preferences'}
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: Smart Reminders Engine */}
      {/* ========================================================================= */}
      {activeTab === 'reminders' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-[#D5E0D7] p-6 sm:p-8 space-y-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#D5E0D7]">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#5A7868]">
                  <BellRing className="w-4 h-4 text-[#244C3A]" />
                  <span>Scheduled Reminder Automation</span>
                </div>
                <h3 className="font-serif text-xl sm:text-2xl font-bold text-[#244C3A]">
                  Event Notification Channels
                </h3>
                <p className="text-xs sm:text-sm text-[#5A7868]">
                  CommitMate's server-side background worker delivers reminders prior to your volunteer shift, independent of whether this webpage remains open.
                </p>
              </div>

              <button
                onClick={handleSendTestReminder}
                disabled={testReminderSent}
                className="px-4 py-2.5 rounded-xl border border-[#D5DACA] bg-[#FAFDF9] hover:bg-[#E8F0E9] text-[#244C3A] text-xs font-semibold transition-colors flex items-center gap-2 cursor-pointer shadow-xs"
              >
                <Zap className="w-4 h-4 text-[#315D48]" />
                <span>{testReminderSent ? 'Test Alert Dispatched!' : 'Send Test Alert Now'}</span>
              </button>
            </div>

            {/* Reminder Timing Preferences */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label className="p-4 rounded-2xl border border-[#D5E0D7] bg-[#FAFDF9] flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={remindersEnabled24h}
                  onChange={(e) => setRemindersEnabled24h(e.target.checked)}
                  className="mt-0.5 accent-[#244C3A] cursor-pointer"
                />
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-[#244C3A] block">24 Hours Prior</span>
                  <span className="text-[11px] text-[#5A7868] leading-tight block">
                    Receive summary notice 1 day before event with address and notes.
                  </span>
                </div>
              </label>

              <label className="p-4 rounded-2xl border border-[#D5E0D7] bg-[#FAFDF9] flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={remindersEnabled1h}
                  onChange={(e) => setRemindersEnabled1h(e.target.checked)}
                  className="mt-0.5 accent-[#244C3A] cursor-pointer"
                />
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-[#244C3A] block">1 Hour Prior</span>
                  <span className="text-[11px] text-[#5A7868] leading-tight block">
                    Final call notification before your shift starts.
                  </span>
                </div>
              </label>

              <div className="p-4 rounded-2xl border border-[#D5E0D7] bg-[#FAFDF9] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#244C3A]">Browser Notifications</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    browserPermissionStatus === 'granted' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {browserPermissionStatus}
                  </span>
                </div>
                {browserPermissionStatus !== 'granted' ? (
                  <button
                    onClick={handleRequestBrowserPermission}
                    className="w-full py-1.5 rounded-lg bg-[#244C3A] text-white text-[11px] font-semibold hover:bg-[#315D48] transition-colors cursor-pointer"
                  >
                    Enable Browser Popups
                  </button>
                ) : (
                  <p className="text-[11px] text-emerald-800 font-medium">
                    Native desktop and mobile push enabled.
                  </p>
                )}
              </div>
            </div>

            {/* Scheduled & Delivered Reminders List */}
            <div className="space-y-3 pt-4">
              <h4 className="font-serif text-base font-bold text-[#244C3A]">
                Reminders Log & Active Schedules
              </h4>

              {isLoadingReminders ? (
                <div className="p-6 text-center text-xs text-[#5A7868]">Loading scheduled reminders...</div>
              ) : reminders.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#5A7868] border border-dashed border-[#D5E0D7] rounded-2xl">
                  No active reminders queued. Reminders are automatically scheduled when you confirm an event.
                </div>
              ) : (
                <div className="space-y-2">
                  {reminders.map((rem) => (
                    <div
                      key={rem.id}
                      className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 text-xs ${
                        rem.status === 'delivered' ? 'bg-[#FAFDF9] border-[#D5E0D7]' : 'bg-white border-[#D5E0D7]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                          rem.status === 'delivered' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          <Bell className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#244C3A]">{rem.opportunityTitle}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                              rem.status === 'delivered' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}>
                              {rem.status === 'delivered' ? 'Delivered' : 'Scheduled'}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#5A7868] mt-0.5">{rem.message}</p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[10px] font-mono text-[#5A7868] block">
                          {new Date(rem.scheduledFor).toLocaleString()}
                        </span>
                        {!rem.isRead && rem.status === 'delivered' && (
                          <button
                            onClick={() => handleMarkRead(rem.id)}
                            className="text-[10px] text-[#244C3A] hover:underline font-semibold cursor-pointer"
                          >
                            Mark as read
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Explicit User Authorization Modal for Google Calendar Export */}
      {/* ========================================================================= */}
      {confirmExportModalEvent && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-[#D5E0D7] p-6 max-w-lg w-full space-y-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#E8F0E9] text-[#244C3A] flex items-center justify-center shrink-0">
                <CalendarCheck className="w-5 h-5 text-[#244C3A]" />
              </div>
              <div>
                <h3 className="font-serif text-lg font-bold text-[#244C3A]">
                  Authorize Google Calendar Event
                </h3>
                <span className="text-xs text-[#5A7868]">CommitMate Calendar Synchronization</span>
              </div>
            </div>

            <p className="text-xs text-[#5A7868] leading-relaxed">
              Are you sure you want to create an event on your primary Google Calendar (<strong>{calendarStatus.userEmail}</strong>) for:
            </p>

            <div className="p-4 bg-[#FAFDF9] rounded-2xl border border-[#D5E0D7] text-xs space-y-1.5">
              <span className="font-bold text-[#244C3A] block text-sm">{confirmExportModalEvent.opportunityTitle}</span>
              <div className="text-[#5A7868]">
                <span>{confirmExportModalEvent.date}</span> · <span>{confirmExportModalEvent.time}</span>
              </div>
              <div className="text-[#5A7868]">{confirmExportModalEvent.location}</div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setConfirmExportModalEvent(null)}
                className="px-4 py-2 rounded-xl border border-[#D5DACA] text-xs font-semibold text-[#5A7868] hover:bg-[#E8F0E9] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleExecuteCalendarExport(confirmExportModalEvent)}
                disabled={syncingEventId === confirmExportModalEvent.id}
                className="px-5 py-2 rounded-xl bg-[#244C3A] text-white text-xs font-semibold hover:bg-[#315D48] transition-colors cursor-pointer shadow-xs disabled:opacity-50"
              >
                {syncingEventId === confirmExportModalEvent.id ? 'Creating Event...' : 'Authorize & Add to Calendar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
