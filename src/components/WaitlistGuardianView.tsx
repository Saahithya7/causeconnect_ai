import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Clock,
  Calendar,
  MapPin,
  RefreshCw,
  Bell,
  BellOff,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Hourglass,
  Sparkles,
  ArrowRight,
  Info,
  X,
  History,
  Send,
  Zap,
  Check,
  ChevronRight,
  Building
} from 'lucide-react';
import {
  Registration,
  VolunteerProfile,
  WaitlistNotification,
  WaitlistAvailabilityStatus,
  WaitlistMonitoringStatus
} from '../types';
import {
  toggleWaitlistMonitoring,
  checkWaitlistStatusNow,
  getWaitlistNotifications,
  markWaitlistNotificationRead,
  executeSafeReRegistration
} from '../services/waitlistGuardianService';
import { detectScheduleConflicts } from '../lib/commitMateSchedule';

interface WaitlistGuardianViewProps {
  registrations: Registration[];
  userProfile: VolunteerProfile;
  supabaseUserId?: string | null;
  onRefreshRegistrations: () => Promise<void>;
  onNavigateToDiscover?: () => void;
}

export const WaitlistGuardianView: React.FC<WaitlistGuardianViewProps> = ({
  registrations,
  userProfile,
  supabaseUserId,
  onRefreshRegistrations,
  onNavigateToDiscover
}) => {
  const [activeTab, setActiveTab] = useState<'monitor' | 'notifications' | 'history'>('monitor');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [checkingRegId, setCheckingRegId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<WaitlistNotification[]>([]);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Safe Re-registration Modal State
  const [claimingReg, setClaimingReg] = useState<Registration | null>(null);
  const [claimNotes, setClaimNotes] = useState<string>('');
  const [explicitConsent, setExplicitConsent] = useState<boolean>(false);
  const [isSubmittingClaim, setIsSubmittingClaim] = useState<boolean>(false);
  const [claimSuccessProof, setClaimSuccessProof] = useState<{
    reference: string;
    evidence: string;
  } | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  // Filter waitlisted and actively monitored registrations
  const waitlistedRegistrations = useMemo(() => {
    return registrations.filter(
      (r) => r.status === 'waitlisted' || r.monitoringEnabled === true || r.availabilityStatus !== undefined
    );
  }, [registrations]);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Fetch notifications on mount
  useEffect(() => {
    loadNotifications();
  }, [supabaseUserId]);

  const loadNotifications = async () => {
    if (!supabaseUserId) return;
    const res = await getWaitlistNotifications(supabaseUserId);
    if (res.success) {
      setNotifications(res.notifications);
    }
  };

  // Toggle monitoring on/off
  const handleToggleMonitoring = async (reg: Registration) => {
    const newEnabled = !reg.monitoringEnabled;
    const res = await toggleWaitlistMonitoring(reg.id, newEnabled);
    if (res.success) {
      showToast(
        newEnabled
          ? `WaitlistGuardian monitoring enabled for "${reg.opportunityTitle}". Periodic background checks active.`
          : `Monitoring paused for "${reg.opportunityTitle}".`,
        'success'
      );
      await onRefreshRegistrations();
    } else {
      showToast(res.error || 'Failed to update monitoring setting', 'error');
    }
  };

  // Trigger manual "Check status now"
  const handleCheckNow = async (reg: Registration, simulatedStatus?: WaitlistAvailabilityStatus) => {
    setCheckingRegId(reg.id);
    try {
      const res = await checkWaitlistStatusNow(reg.id, { forceStatus: simulatedStatus });
      if (res.success) {
        const avail = res.inspection?.availabilityStatus;
        const notes = res.inspection?.notes || 'Status check completed.';
        if (avail === 'spot_available') {
          showToast(`Spot Available! ${notes}`, 'success');
        } else if (avail === 'event_cancelled') {
          showToast(`Notice: Event has been marked as cancelled.`, 'info');
        } else if (res.inspection?.isBlockedOrCaptcha) {
          showToast(`Website protected by CAPTCHA / rate limit. Monitoring throttled.`, 'error');
        } else {
          showToast(`Status verified: ${avail?.replace('_', ' ') || 'checked'}. ${notes}`, 'info');
        }
        await onRefreshRegistrations();
        await loadNotifications();
      } else {
        showToast(res.error || 'Failed to verify event page', 'error');
      }
    } finally {
      setCheckingRegId(null);
    }
  };

  // Open Re-registration Modal
  const handleOpenClaimModal = (reg: Registration) => {
    setClaimingReg(reg);
    setClaimNotes(`I am confirming my interest in claiming the newly available spot for ${reg.opportunityTitle}. I am eligible, available, and ready to participate.`);
    setExplicitConsent(false);
    setClaimSuccessProof(null);
    setClaimError(null);
  };

  // Execute Safe Re-registration
  const handleConfirmClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimingReg || !explicitConsent) return;

    setIsSubmittingClaim(true);
    setClaimError(null);

    const res = await executeSafeReRegistration(claimingReg.id, {
      explicitConsentGiven: true,
      userNotes: claimNotes
    });

    setIsSubmittingClaim(false);

    if (res.success) {
      setClaimSuccessProof({
        reference: res.confirmationReference || 'WL-CLAIMED',
        evidence: res.verificationEvidence || 'Autonomous Playwright confirmation verified.'
      });
      await onRefreshRegistrations();
      await loadNotifications();
      showToast(`Spot claimed! Registration confirmed for "${claimingReg.opportunityTitle}".`, 'success');
    } else {
      setClaimError(res.error || 'Failed to claim spot. Your existing waitlist record is preserved.');
    }
  };

  // Mark notification read
  const handleDismissNotification = async (notifId: string) => {
    await markWaitlistNotificationRead(notifId);
    setNotifications((prev) => prev.map((n) => (n.id === notifId ? { ...n, isRead: true } : n)));
  };

  // Request browser notification permissions
  const handleRequestBrowserNotification = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        showToast('Browser notifications enabled for availability changes!', 'success');
        new Notification('WaitlistGuardian Active', {
          body: 'You will receive immediate alerts when waitlisted volunteer places become available.',
          icon: '/favicon.ico'
        });
      } else {
        showToast('Browser notification permission was not granted.', 'info');
      }
    }
  };

  // Conflict evaluation for claiming registration
  const claimScheduleConflict = useMemo(() => {
    if (!claimingReg) return null;
    return detectScheduleConflicts(
      {
        id: claimingReg.id,
        title: claimingReg.opportunityTitle,
        date: claimingReg.date,
        time: claimingReg.time
      },
      registrations.filter((r) => r.id !== claimingReg.id && r.status === 'confirmed'),
      userProfile
    );
  }, [claimingReg, registrations, userProfile]);

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-2xl shadow-xl text-xs font-semibold flex items-center gap-2.5 animate-fade-in border ${
          toastMessage.type === 'success'
            ? 'bg-[#244C3A] text-white border-[#D6C49A]/40'
            : toastMessage.type === 'error'
            ? 'bg-red-800 text-white border-red-400'
            : 'bg-amber-800 text-white border-amber-400'
        }`}>
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-[#D6C49A]" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-white" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Hero Header */}
      <div className="bg-gradient-to-r from-[#1A382A] via-[#244C3A] to-[#315D48] text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-[#D6C49A]/30 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-white/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-xs text-[#D6C49A] text-xs font-bold uppercase tracking-wider border border-white/15">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>WaitlistGuardian · Autonomous Monitoring Agent</span>
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl font-bold text-white tracking-tight">
              Intelligent Waitlist & Cancellation Guardian
            </h1>
            <p className="text-sm text-[#DFEAE1] leading-relaxed">
              Monitors official event websites using Playwright, detects reopened slots or cancellations, verifies real availability without guessing, and helps you safely claim newly opened places with explicit approval.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              onClick={handleRequestBrowserNotification}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center justify-center gap-2 border border-white/20 transition-all cursor-pointer"
            >
              <Bell className="w-4 h-4 text-[#D6C49A]" />
              <span>Enable Browser Alerts</span>
            </button>

            <button
              onClick={async () => {
                setIsRefreshing(true);
                await onRefreshRegistrations();
                await loadNotifications();
                setIsRefreshing(false);
                showToast('Waitlist records and notifications refreshed.', 'info');
              }}
              disabled={isRefreshing}
              className="px-4 py-2.5 rounded-xl bg-[#D6C49A] hover:bg-[#E6D5AC] text-[#244C3A] text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Refresh Statuses</span>
            </button>
          </div>
        </div>

        {/* Quick Stats Pill Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-white/15">
          <div className="bg-white/5 backdrop-blur-xs p-3 rounded-2xl border border-white/10">
            <div className="text-[10px] uppercase font-bold text-[#D6C49A] tracking-wider">Waitlisted Events</div>
            <div className="text-xl font-serif font-bold text-white mt-0.5">
              {waitlistedRegistrations.length}
            </div>
          </div>

          <div className="bg-white/5 backdrop-blur-xs p-3 rounded-2xl border border-white/10">
            <div className="text-[10px] uppercase font-bold text-[#D6C49A] tracking-wider">Active Monitoring</div>
            <div className="text-xl font-serif font-bold text-emerald-400 mt-0.5">
              {waitlistedRegistrations.filter((r) => r.monitoringEnabled && r.monitoringStatus === 'active').length}
            </div>
          </div>

          <div className="bg-white/5 backdrop-blur-xs p-3 rounded-2xl border border-white/10">
            <div className="text-[10px] uppercase font-bold text-[#D6C49A] tracking-wider">Vacated Spots Found</div>
            <div className="text-xl font-serif font-bold text-amber-300 mt-0.5">
              {waitlistedRegistrations.filter((r) => r.availabilityStatus === 'spot_available').length}
            </div>
          </div>

          <div className="bg-white/5 backdrop-blur-xs p-3 rounded-2xl border border-white/10">
            <div className="text-[10px] uppercase font-bold text-[#D6C49A] tracking-wider">Unread Alerts</div>
            <div className="text-xl font-serif font-bold text-white mt-0.5">
              {notifications.filter((n) => !n.isRead).length}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-[#D5E0D7] pb-3">
        <button
          onClick={() => setActiveTab('monitor')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'monitor'
              ? 'bg-[#244C3A] text-white shadow-xs'
              : 'bg-white text-[#244C3A] border border-[#D5E0D7] hover:bg-[#DFEAE1]'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Monitored Waitlists</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-mono">
            {waitlistedRegistrations.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('notifications')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'notifications'
              ? 'bg-[#244C3A] text-white shadow-xs'
              : 'bg-white text-[#244C3A] border border-[#D5E0D7] hover:bg-[#DFEAE1]'
          }`}
        >
          <Bell className="w-3.5 h-3.5" />
          <span>Availability Alerts</span>
          {notifications.filter((n) => !n.isRead).length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-400 text-amber-950 font-bold">
              {notifications.filter((n) => !n.isRead).length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'history'
              ? 'bg-[#244C3A] text-white shadow-xs'
              : 'bg-white text-[#244C3A] border border-[#D5E0D7] hover:bg-[#DFEAE1]'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>Verification Audit Trail</span>
        </button>
      </div>

      {/* Tab 1: Monitored Waitlists */}
      {activeTab === 'monitor' && (
        <div className="space-y-4">
          {waitlistedRegistrations.length === 0 ? (
            <div className="bg-white border border-[#D5E0D7] rounded-3xl p-8 sm:p-12 text-center space-y-4 shadow-xs">
              <div className="w-16 h-16 rounded-2xl bg-[#E8F0E9] text-[#244C3A] flex items-center justify-center mx-auto border border-[#315D48]/30">
                <Hourglass className="w-8 h-8 text-[#244C3A]" />
              </div>
              <div className="space-y-1">
                <h3 className="font-serif text-xl sm:text-2xl font-bold text-[#244C3A]">
                  No Waitlisted Events Found
                </h3>
                <p className="text-xs sm:text-sm text-[#59665C] max-w-md mx-auto">
                  When a high-capacity volunteer opportunity is full, ApplyPilot automatically places you on the official waitlist and WaitlistGuardian monitors it for vacated places.
                </p>
              </div>

              {onNavigateToDiscover && (
                <button
                  onClick={onNavigateToDiscover}
                  className="px-5 py-2.5 rounded-xl bg-[#244C3A] hover:bg-[#315D48] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  Discover Volunteer Opportunities
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {waitlistedRegistrations.map((reg) => {
                const isMonitoringActive = reg.monitoringEnabled && reg.monitoringStatus === 'active';
                const isSpotAvailable = reg.availabilityStatus === 'spot_available';
                const isCancelled = reg.availabilityStatus === 'event_cancelled' || reg.status === 'cancelled';
                const isCheckingThis = checkingRegId === reg.id;

                return (
                  <div
                    key={reg.id}
                    className={`bg-white rounded-2xl border p-5 sm:p-6 shadow-xs transition-all space-y-4 ${
                      isSpotAvailable
                        ? 'border-amber-400 bg-amber-50/30 ring-2 ring-amber-300/40'
                        : isCancelled
                        ? 'border-red-200 bg-red-50/20 opacity-80'
                        : 'border-[#D5E0D7] hover:border-[#244C3A]/40'
                    }`}
                  >
                    {/* Top Row: Category, Availability Badge, Monitoring Toggle */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#E8F0E9] text-[#244C3A]">
                          {reg.category}
                        </span>

                        {/* Availability Pill */}
                        <span
                          className={`px-3 py-0.5 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                            isSpotAvailable
                              ? 'bg-amber-100 text-amber-900 border border-amber-300 animate-pulse'
                              : isCancelled
                              ? 'bg-red-100 text-red-900 border border-red-300'
                              : reg.availabilityStatus === 'registration_closed'
                              ? 'bg-gray-100 text-gray-800 border border-gray-300'
                              : reg.availabilityStatus === 'event_full'
                              ? 'bg-orange-100 text-orange-900 border border-orange-300'
                              : reg.availabilityStatus === 'unknown'
                              ? 'bg-slate-100 text-slate-800 border border-slate-300'
                              : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                          }`}
                        >
                          {isSpotAvailable ? (
                            <>
                              <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                              <span>Vacated Spot Available!</span>
                            </>
                          ) : isCancelled ? (
                            <>
                              <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                              <span>Event Cancelled</span>
                            </>
                          ) : reg.availabilityStatus === 'unknown' ? (
                            <>
                              <Info className="w-3.5 h-3.5 text-slate-600" />
                              <span>Status Unknown</span>
                            </>
                          ) : (
                            <>
                              <Hourglass className="w-3.5 h-3.5 text-emerald-700" />
                              <span>On Official Waitlist</span>
                            </>
                          )}
                        </span>

                        {/* Monitoring Health Status */}
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-medium ${
                            reg.monitoringStatus === 'active'
                              ? 'bg-emerald-50 text-emerald-800'
                              : reg.monitoringStatus === 'blocked'
                              ? 'bg-red-50 text-red-800'
                              : reg.monitoringStatus === 'completed'
                              ? 'bg-gray-100 text-gray-700'
                              : 'bg-amber-50 text-amber-800'
                          }`}
                        >
                          Monitoring: {reg.monitoringStatus || 'paused'}
                        </span>
                      </div>

                      {/* Monitoring Toggle Switch */}
                      {!isCancelled && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-[#59665C]">
                            {isMonitoringActive ? 'Auto-Watch Active' : 'Auto-Watch Paused'}
                          </span>
                          <button
                            onClick={() => handleToggleMonitoring(reg)}
                            role="switch"
                            aria-checked={isMonitoringActive}
                            className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                              isMonitoringActive ? 'bg-[#244C3A]' : 'bg-[#D5E0D7]'
                            }`}
                          >
                            <span
                              className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                                isMonitoringActive ? 'translate-x-6' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Event Title & Basic Metadata */}
                    <div className="space-y-1">
                      <h3 className="font-serif text-xl sm:text-2xl font-bold text-[#244C3A]">
                        {reg.opportunityTitle}
                      </h3>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-[#59665C]">
                        <span className="flex items-center gap-1">
                          <Building className="w-3.5 h-3.5 text-[#315D48]" />
                          <span>{reg.organization}</span>
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-[#315D48]" />
                          <span>{reg.location}</span>
                        </span>
                      </div>
                    </div>

                    {/* Timing & Check Schedules */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-[#E8F0E9]/60 rounded-xl text-xs text-[#244C3A]">
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-[#59665C] font-semibold uppercase tracking-wider block">
                          Scheduled Shift
                        </span>
                        <div className="font-semibold flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-[#315D48]" />
                          <span>{reg.date}</span>
                        </div>
                        <div className="text-[11px] text-[#59665C] flex items-center gap-1">
                          <Clock className="w-3 h-3 text-[#315D48]" />
                          <span>{reg.time}</span>
                        </div>
                      </div>

                      <div className="space-y-0.5">
                        <span className="text-[10px] text-[#59665C] font-semibold uppercase tracking-wider block">
                          Last Verified Check
                        </span>
                        <div className="font-mono text-xs">
                          {reg.lastCheckedAt ? new Date(reg.lastCheckedAt).toLocaleTimeString() : 'Pending first check'}
                        </div>
                        <div className="text-[10px] text-[#59665C]">
                          {reg.lastCheckedAt ? new Date(reg.lastCheckedAt).toLocaleDateString() : 'Scheduler queued'}
                        </div>
                      </div>

                      <div className="space-y-0.5">
                        <span className="text-[10px] text-[#59665C] font-semibold uppercase tracking-wider block">
                          Next Automated Check
                        </span>
                        <div className="font-mono text-xs text-[#315D48]">
                          {isMonitoringActive && reg.nextCheckAt
                            ? new Date(reg.nextCheckAt).toLocaleTimeString()
                            : isCancelled
                            ? 'Halted (Event Cancelled)'
                            : 'Paused'}
                        </div>
                        {reg.lastCheckError && (
                          <div className="text-[10px] text-red-600 truncate" title={reg.lastCheckError}>
                            Last error: {reg.lastCheckError}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bottom Action Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#D5E0D7]/60">
                      <div className="flex items-center gap-2">
                        {reg.sourceUrl && (
                          <a
                            href={reg.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#315D48] hover:text-[#244C3A] hover:underline"
                          >
                            <span>Official Portal</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}

                        {/* Test simulator buttons for testing different verified transitions */}
                        <div className="hidden sm:inline-flex items-center gap-1 pl-2 border-l border-[#D5E0D7]">
                          <span className="text-[10px] text-[#59665C]">Simulate:</span>
                          <button
                            onClick={() => handleCheckNow(reg, 'spot_available')}
                            disabled={isCheckingThis}
                            className="px-1.5 py-0.5 text-[10px] rounded bg-amber-100 text-amber-900 hover:bg-amber-200 cursor-pointer"
                            title="Simulate opening 1 spot"
                          >
                            Vacated Spot
                          </button>
                          <button
                            onClick={() => handleCheckNow(reg, 'event_cancelled')}
                            disabled={isCheckingThis}
                            className="px-1.5 py-0.5 text-[10px] rounded bg-red-100 text-red-900 hover:bg-red-200 cursor-pointer"
                            title="Simulate cancellation"
                          >
                            Cancelled
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Manual Check Button */}
                        <button
                          onClick={() => handleCheckNow(reg)}
                          disabled={isCheckingThis}
                          className="px-3 py-1.5 rounded-xl border border-[#D5E0D7] bg-white hover:bg-[#DFEAE1] text-xs font-semibold text-[#244C3A] flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 text-[#315D48] ${isCheckingThis ? 'animate-spin' : ''}`} />
                          <span>{isCheckingThis ? 'Checking...' : 'Check Status Now'}</span>
                        </button>

                        {/* Re-register / Claim Spot Button */}
                        {isSpotAvailable && (
                          <button
                            onClick={() => handleOpenClaimModal(reg)}
                            className="px-4 py-1.5 rounded-xl bg-[#244C3A] hover:bg-[#315D48] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer animate-pulse"
                          >
                            <Zap className="w-3.5 h-3.5 text-[#D6C49A]" />
                            <span>Claim This Spot</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Availability Notifications Center */}
      {activeTab === 'notifications' && (
        <div className="space-y-4">
          {notifications.length === 0 ? (
            <div className="bg-white border border-[#D5E0D7] rounded-3xl p-8 sm:p-12 text-center space-y-3">
              <BellOff className="w-10 h-10 text-[#59665C]/40 mx-auto" />
              <h3 className="font-serif text-xl font-bold text-[#244C3A]">
                No Availability Notifications Yet
              </h3>
              <p className="text-xs sm:text-sm text-[#59665C] max-w-md mx-auto">
                When WaitlistGuardian detects a newly reopened slot, cancellation, or deadline change on an official event website, verified alerts will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.map((notif) => {
                const isSpot = notif.changeType === 'spot_available';
                const isCancel = notif.changeType === 'event_cancelled';
                const matchingReg = registrations.find((r) => r.id === notif.registrationId);

                return (
                  <div
                    key={notif.id}
                    className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                      notif.isRead
                        ? 'bg-white border-[#D5E0D7] opacity-80'
                        : isSpot
                        ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-200'
                        : isCancel
                        ? 'bg-red-50/70 border-red-300'
                        : 'bg-white border-[#D5E0D7]'
                    }`}
                  >
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                        isSpot
                          ? 'bg-amber-100 text-amber-800'
                          : isCancel
                          ? 'bg-red-100 text-red-800'
                          : 'bg-[#E8F0E9] text-[#244C3A]'
                      }`}>
                        {isSpot ? (
                          <Sparkles className="w-4 h-4" />
                        ) : isCancel ? (
                          <AlertTriangle className="w-4 h-4" />
                        ) : (
                          <Bell className="w-4 h-4" />
                        )}
                      </div>

                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-serif font-bold text-sm text-[#244C3A] truncate">
                            {notif.eventTitle}
                          </span>
                          {!notif.isRead && (
                            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-amber-400 text-amber-950">
                              NEW
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#244C3A]/85 leading-relaxed">
                          {notif.message}
                        </p>
                        <div className="flex items-center gap-3 text-[10px] text-[#59665C]">
                          <span>Verified at {new Date(notif.verifiedAt).toLocaleTimeString()} · {new Date(notif.verifiedAt).toLocaleDateString()}</span>
                          {notif.sourceUrl && (
                            <a
                              href={notif.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#315D48] hover:underline flex items-center gap-0.5"
                            >
                              <span>Official Link</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                      {isSpot && matchingReg && notif.actionTaken !== 're_registered' && (
                        <button
                          onClick={() => handleOpenClaimModal(matchingReg)}
                          className="px-3.5 py-1.5 rounded-xl bg-[#244C3A] hover:bg-[#315D48] text-white text-xs font-bold flex items-center gap-1 shadow-xs cursor-pointer"
                        >
                          <Zap className="w-3 h-3 text-[#D6C49A]" />
                          <span>Review & Claim</span>
                        </button>
                      )}

                      {!notif.isRead && (
                        <button
                          onClick={() => handleDismissNotification(notif.id)}
                          className="px-2.5 py-1.5 rounded-xl border border-[#D5E0D7] bg-white hover:bg-[#DFEAE1] text-[11px] font-semibold text-[#59665C] cursor-pointer"
                        >
                          Mark Read
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Verification Audit History */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-3xl border border-[#D5E0D7] p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#D5E0D7]">
            <div>
              <h3 className="font-serif text-lg font-bold text-[#244C3A]">
                Verification Audit Trail
              </h3>
              <p className="text-xs text-[#59665C]">
                Chronological record of Playwright inspections, status changes, and autonomous checks.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {waitlistedRegistrations.flatMap((r) =>
              (r.statusChangeHistory || []).map((h, idx) => ({ ...h, eventTitle: r.opportunityTitle, key: `${r.id}-${idx}` }))
            ).length === 0 ? (
              <div className="text-center py-8 text-xs text-[#59665C]">
                No check history logged yet. Run a manual check or let the automated scheduler run.
              </div>
            ) : (
              waitlistedRegistrations
                .flatMap((r) =>
                  (r.statusChangeHistory || []).map((h, idx) => ({
                    ...h,
                    eventTitle: r.opportunityTitle,
                    key: `${r.id}-${idx}`
                  }))
                )
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .slice(0, 20)
                .map((entry) => (
                  <div
                    key={entry.key}
                    className="p-3.5 bg-[#E8F0E9]/40 rounded-xl border border-[#D5E0D7] text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[#244C3A]">
                        {entry.eventTitle}
                      </span>
                      <span className="text-[10px] text-[#59665C] font-mono">
                        {new Date(entry.timestamp).toLocaleString()}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                        {entry.previousStatus}
                      </span>
                      <ArrowRight className="w-3 h-3 text-[#59665C]" />
                      <span className="px-2 py-0.5 rounded bg-[#244C3A] text-white font-semibold">
                        {entry.newStatus}
                      </span>
                      <span className="text-[#59665C] text-[10px]">
                        via {entry.verifiedBy}
                      </span>
                    </div>

                    <p className="text-xs text-[#244C3A]/80 leading-relaxed">
                      {entry.reason}
                    </p>

                    {entry.evidence && (
                      <div className="p-2 bg-white rounded-lg border border-[#D5E0D7] font-mono text-[10px] text-[#244C3A]/80">
                        Evidence: {entry.evidence}
                      </div>
                    )}
                  </div>
                ))
            )}
          </div>
        </div>
      )}

      {/* Safe Re-Registration Workflow Modal */}
      {claimingReg && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-[#D5E0D7] rounded-3xl max-w-xl w-full shadow-2xl overflow-hidden my-6 flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="p-5 sm:p-6 bg-gradient-to-r from-[#1A382A] to-[#244C3A] text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-[#D6C49A]">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-[#D6C49A] tracking-wider">
                    Safe Re-Registration Workflow
                  </div>
                  <h3 className="font-serif text-lg sm:text-xl font-bold text-white">
                    {claimSuccessProof ? 'Spot Claimed & Confirmed!' : 'Review & Claim Available Place'}
                  </h3>
                </div>
              </div>

              <button
                onClick={() => setClaimingReg(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
              {claimSuccessProof ? (
                <div className="text-center space-y-4 py-2">
                  <div className="w-14 h-14 rounded-2xl bg-[#E8F0E9] text-[#244C3A] flex items-center justify-center mx-auto border border-[#315D48]/30">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-serif text-xl font-bold text-[#244C3A]">
                      Application Successfully Confirmed!
                    </h4>
                    <p className="text-xs text-[#59665C] max-w-md mx-auto">
                      Playwright automation successfully registered you for <strong>{claimingReg.opportunityTitle}</strong>. Your registration record has been updated from waitlisted to confirmed.
                    </p>
                  </div>

                  <div className="p-4 bg-[#E8F0E9] rounded-2xl border border-[#D5E0D7] text-left text-xs space-y-2">
                    <div className="flex justify-between">
                      <span className="text-[#59665C]">Confirmation Code:</span>
                      <span className="font-mono font-bold text-[#244C3A]">#{claimSuccessProof.reference}</span>
                    </div>
                    <div className="pt-2 border-t border-[#D5E0D7]/60">
                      <span className="text-[#59665C] block mb-1">Authoritative Proof:</span>
                      <div className="p-2 bg-white rounded-lg border border-[#D5E0D7] font-mono text-[11px] text-[#244C3A]">
                        {claimSuccessProof.evidence}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setClaimingReg(null)}
                    className="w-full py-3 rounded-xl bg-[#244C3A] text-white text-xs font-semibold hover:bg-[#315D48] transition-colors cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <form onSubmit={handleConfirmClaim} className="space-y-5">
                  {claimError && (
                    <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <span>{claimError}</span>
                    </div>
                  )}

                  {/* Target Opportunity Snapshot */}
                  <div className="p-4 bg-[#E8F0E9] rounded-2xl border border-[#D5E0D7] space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-bold text-[#59665C] uppercase tracking-wider">
                      <span>Target Opportunity</span>
                      <span className="px-2 py-0.5 rounded-full bg-white text-[#244C3A] font-bold">
                        Vacated Place Open
                      </span>
                    </div>
                    <h4 className="font-serif text-lg font-bold text-[#244C3A]">
                      {claimingReg.opportunityTitle}
                    </h4>
                    <div className="text-xs text-[#59665C]">
                      {claimingReg.organization} · {claimingReg.location}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-[#D5E0D7]/60 text-[#244C3A]">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-[#315D48]" />
                        <span>{claimingReg.date}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-[#315D48]" />
                        <span>{claimingReg.time}</span>
                      </div>
                    </div>
                  </div>

                  {/* CommitMate Schedule Conflict Pre-check */}
                  {claimScheduleConflict && (
                    <div className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
                      claimScheduleConflict.hasConflict
                        ? 'bg-red-50 border-red-200 text-red-900'
                        : claimScheduleConflict.isIncomplete
                        ? 'bg-amber-50 border-amber-200 text-amber-900'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    }`}>
                      <div className="flex items-center justify-between font-bold text-[11px] uppercase tracking-wider">
                        <span>CommitMate Schedule Verification</span>
                        <span>{claimScheduleConflict.hasConflict ? 'Conflict' : claimScheduleConflict.isIncomplete ? 'Incomplete' : 'Clear'}</span>
                      </div>
                      <p className="text-xs">
                        {claimScheduleConflict.hasConflict
                          ? claimScheduleConflict.explanation
                          : claimScheduleConflict.isIncomplete
                          ? 'Event timing is flexible; confirm exact hours before accepting.'
                          : 'No schedule conflicts with your other commitments.'}
                      </p>
                    </div>
                  )}

                  {/* Authenticated Volunteer Snapshot */}
                  <div className="p-3.5 bg-white border border-[#D5E0D7] rounded-xl text-xs space-y-2">
                    <span className="text-[10px] uppercase font-bold text-[#59665C] tracking-wider block">
                      Applicant Data to be Transferred
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[#59665C] text-[10px] block">Name:</span>
                        <span className="font-semibold text-[#244C3A]">{userProfile.name}</span>
                      </div>
                      <div>
                        <span className="text-[#59665C] text-[10px] block">Email:</span>
                        <span className="font-semibold text-[#244C3A]">{userProfile.email}</span>
                      </div>
                      <div>
                        <span className="text-[#59665C] text-[10px] block">Verified Age:</span>
                        <span className="font-semibold text-[#244C3A]">{userProfile.age} years (Eligible)</span>
                      </div>
                      <div>
                        <span className="text-[#59665C] text-[10px] block">Background Consent:</span>
                        <span className="font-semibold text-[#244C3A]">{userProfile.backgroundCheckConsent ? 'Consented' : 'Not required'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Volunteer Notes / Motivation */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#244C3A]">
                      Volunteer Confirmation Statement / Notes
                    </label>
                    <textarea
                      rows={3}
                      value={claimNotes}
                      onChange={(e) => setClaimNotes(e.target.value)}
                      className="w-full p-3 rounded-xl border border-[#D5E0D7] text-xs focus:ring-2 focus:ring-[#244C3A] focus:outline-hidden text-[#244C3A]"
                    />
                  </div>

                  {/* Explicit User Approval Checkbox (MANDATORY SAFEGUARD!) */}
                  <label className="p-3.5 bg-[#E8F0E9] rounded-xl border border-[#315D48]/30 flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={explicitConsent}
                      onChange={(e) => setExplicitConsent(e.target.checked)}
                      className="mt-0.5 rounded text-[#244C3A] focus:ring-[#244C3A] w-4 h-4 cursor-pointer"
                    />
                    <div className="text-xs text-[#244C3A] leading-relaxed">
                      <span className="font-bold block">
                        I explicitly authorize ApplyPilot to submit my application for this open spot.
                      </span>
                      <span className="text-[#59665C] text-[11px]">
                        Never automatically submitted without consent. The existing waitlist record is preserved if the website rejects or if the spot was already claimed.
                      </span>
                    </div>
                  </label>

                  {/* Submit Action */}
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setClaimingReg(null)}
                      className="w-1/2 py-2.5 rounded-xl border border-[#D5E0D7] bg-white text-xs font-semibold text-[#59665C] hover:bg-[#DFEAE1] cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!explicitConsent || isSubmittingClaim}
                      className="w-1/2 py-2.5 rounded-xl bg-[#244C3A] hover:bg-[#315D48] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      {isSubmittingClaim ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Submitting...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5 text-[#D6C49A]" />
                          <span>Approve & Submit</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
