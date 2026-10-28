import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  CheckCircle2,
  AlertCircle,
  FileText,
  Mail,
  Download,
  Trash2,
  PlusCircle,
  ArrowRight,
  RefreshCw,
  ShieldAlert
} from 'lucide-react';
import { Registration } from '../types';

interface RegisteredEventsViewProps {
  registrations: Registration[];
  onCancelRegistration: (id: string) => void;
  onLogHours: (id: string, hours: number) => void;
  onGoToDiscover: () => void;
  onGoToWaitlist?: () => void;
  onRefresh?: () => void;
}

export const RegisteredEventsView: React.FC<RegisteredEventsViewProps> = ({
  registrations,
  onCancelRegistration,
  onLogHours,
  onGoToDiscover,
  onGoToWaitlist,
  onRefresh
}) => {
  const [selectedRegForHours, setSelectedRegForHours] = useState<Registration | null>(null);
  const [hoursToLog, setHoursToLog] = useState<number>(3);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleDownloadCalendar = (reg: Registration) => {
    // Generate clean .ics calendar format
    const icsData = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//CauseConnect AI//EN',
      'BEGIN:VEVENT',
      `SUMMARY:Volunteering: ${reg.opportunityTitle}`,
      `DESCRIPTION:Volunteer shift with ${reg.organization}. Notes: ${reg.userNotes || 'None'}`,
      `LOCATION:${reg.location}`,
      `STATUS:${reg.status === 'confirmed' ? 'CONFIRMED' : 'TENTATIVE'}`,
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([icsData], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `volunteer-${reg.opportunityId}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Calendar invite (.ics) downloaded!');
  };

  const handleLogHoursSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedRegForHours) {
      onLogHours(selectedRegForHours.id, hoursToLog);
      showToast(`Logged ${hoursToLog} volunteer hours for ${selectedRegForHours.opportunityTitle}!`);
      setSelectedRegForHours(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 px-4 py-3 bg-[#244C3A] text-white rounded-xl shadow-lg border border-[#D6C49A]/30 text-xs font-semibold flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-[#D6C49A]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl text-[#244C3A] font-bold tracking-tight">
            Registered Events
          </h1>
          <p className="text-sm sm:text-base text-[#244C3A]/75 mt-1 font-normal">
            Your volunteer shifts, registration approval statuses, and verified hours log.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-white border border-[#D5E0D7] text-[#244C3A] hover:bg-[#DFEAE1] transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Refresh registered events from Supabase database"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#315D48]" />
              <span>Refresh</span>
            </button>
          )}
          <button
            onClick={onGoToDiscover}
            className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-[#244C3A] text-white hover:bg-[#315D48] transition-colors cursor-pointer"
          >
            Browse More Opportunities
          </button>
        </div>
      </div>

      {registrations.length === 0 ? (
        <div className="bg-white border border-[#D5E0D7] rounded-2xl p-12 text-center space-y-4">
          <Calendar className="w-10 h-10 text-[#244C3A]/40 mx-auto" />
          <h3 className="font-serif text-xl font-bold text-[#244C3A]">
            No Registered Events Yet
          </h3>
          <p className="text-sm text-[#244C3A]/70 max-w-md mx-auto">
            You haven't requested registration for any volunteer events yet. Discover opportunities matching your causes and skills!
          </p>
          <button
            onClick={onGoToDiscover}
            className="px-5 py-2.5 rounded-xl bg-[#244C3A] text-white text-xs font-semibold hover:bg-[#315D48]"
          >
            Explore Opportunities
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {registrations.map((reg) => {
            const isConfirmed = reg.status === 'confirmed';

            return (
              <div
                key={reg.id}
                className="bg-white border border-[#D5E0D7] rounded-2xl p-6 shadow-xs hover:border-[#244C3A]/30 transition-all flex flex-col md:flex-row md:items-center justify-between gap-6"
              >
                {/* Event info */}
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#E8F0E9] text-[#244C3A]">
                      {reg.category}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        reg.status === 'confirmed'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : reg.status === 'waitlisted'
                          ? 'bg-amber-100 text-amber-900 border border-amber-300'
                          : reg.status === 'completed'
                          ? 'bg-purple-50 text-purple-800 border border-purple-200'
                          : 'bg-blue-50 text-blue-800 border border-blue-200'
                      }`}
                    >
                      {reg.status === 'confirmed'
                        ? 'Registration Confirmed'
                        : reg.status === 'waitlisted'
                        ? 'On Priority Waitlist'
                        : reg.status === 'completed'
                        ? 'Shift Completed'
                        : 'Pending Coordinator Verification'}
                    </span>
                    <span className="text-[11px] text-[#244C3A]/60">
                      Approved by you on {reg.submittedAt}
                    </span>
                  </div>

                  <h3 className="font-serif text-xl sm:text-2xl font-bold text-[#244C3A]">
                    {reg.opportunityTitle}
                  </h3>
                  <p className="text-xs text-[#244C3A]/70 font-medium">
                    Organizer: {reg.organization}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-[#244C3A]/80 pt-1">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-[#315D48]" />
                      <span>{reg.date}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#315D48]" />
                      <span>{reg.time}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[#315D48]" />
                      <span>{reg.location}</span>
                    </div>
                  </div>

                  {reg.userNotes && (
                    <div className="p-3 bg-[#E8F0E9] rounded-xl text-xs text-[#244C3A]/80 border border-[#D5E0D7]/60">
                      <span className="font-semibold text-[#244C3A]">Your submission notes:</span>{' '}
                      {reg.userNotes}
                    </div>
                  )}

                  {reg.hoursLogged !== undefined && reg.hoursLogged > 0 && (
                    <div className="text-xs text-emerald-800 font-semibold flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{reg.hoursLogged} hours verified and added to your impact certificate</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row md:flex-col lg:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
                  {reg.status === 'waitlisted' && onGoToWaitlist && (
                    <button
                      onClick={onGoToWaitlist}
                      className="px-3.5 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                    >
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-800" />
                      <span>WaitlistGuardian</span>
                    </button>
                  )}

                  <button
                    onClick={() => handleDownloadCalendar(reg)}
                    className="px-3.5 py-2 rounded-xl border border-[#D5DACA] bg-white hover:bg-[#E8F0E9] text-xs font-semibold text-[#244C3A] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-[#315D48]" />
                    <span>Add to Calendar</span>
                  </button>

                  <button
                    onClick={() => setSelectedRegForHours(reg)}
                    className="px-3.5 py-2 rounded-xl bg-[#E8F0E9] hover:bg-[#D5DACA] text-xs font-semibold text-[#244C3A] flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <PlusCircle className="w-3.5 h-3.5 text-[#315D48]" />
                    <span>Log Hours</span>
                  </button>

                  <button
                    onClick={() => {
                      if (window.confirm(`Are you sure you want to cancel your registration for ${reg.opportunityTitle}?`)) {
                        onCancelRegistration(reg.id);
                        showToast('Registration cancelled.');
                      }
                    }}
                    className="px-3 py-2 rounded-xl border border-red-200 hover:bg-red-50 text-red-700 text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Cancel</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Log Hours Modal */}
      {selectedRegForHours && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#D5E0D7] rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <h3 className="font-serif text-xl font-bold text-[#244C3A] mb-2">
              Log Volunteer Hours
            </h3>
            <p className="text-xs text-[#244C3A]/75 mb-4">
              Recording verified contribution for: <strong>{selectedRegForHours.opportunityTitle}</strong> ({selectedRegForHours.organization}).
            </p>

            <form onSubmit={handleLogHoursSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-[#244C3A] block mb-1">
                  Hours Completed:
                </label>
                <input
                  type="number"
                  min="0.5"
                  max="24"
                  step="0.5"
                  value={hoursToLog}
                  onChange={(e) => setHoursToLog(parseFloat(e.target.value) || 0)}
                  className="w-full p-2.5 bg-[#E8F0E9] border border-[#D5E0D7] rounded-xl text-sm font-bold text-[#244C3A] focus:outline-none focus:ring-2 focus:ring-[#244C3A]/20"
                />
              </div>

              <div className="p-3 bg-[#E8F0E9]/60 rounded-xl text-xs text-[#244C3A]/80">
                Hours are credited to your community achievement badge and year-to-date volunteer transcript.
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedRegForHours(null)}
                  className="px-4 py-2 rounded-xl border border-[#D5DACA] bg-white text-xs font-semibold text-[#244C3A]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#244C3A] text-white text-xs font-semibold hover:bg-[#315D48]"
                >
                  Save & Update Hours
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
