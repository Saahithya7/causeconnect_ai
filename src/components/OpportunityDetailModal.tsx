import React from 'react';
import {
  X,
  Calendar,
  Clock,
  MapPin,
  User,
  ShieldCheck,
  ShieldAlert,
  ExternalLink,
  CheckCircle2,
  Mail,
  Users,
  Award,
  Sparkles,
  AlertTriangle,
  HelpCircle,
  CalendarCheck
} from 'lucide-react';
import { Opportunity, VolunteerProfile, Registration } from '../types';
import { detectScheduleConflicts } from '../lib/commitMateSchedule';

interface OpportunityDetailModalProps {
  opportunity: Opportunity | null;
  userProfile: VolunteerProfile;
  registrations?: Registration[];
  isOpen: boolean;
  onClose: () => void;
  onRequestRegistration: (opp: Opportunity) => void;
  onRequestAutoApply: (opp: Opportunity) => void;
  isAlreadyRegistered: boolean;
}

export const OpportunityDetailModal: React.FC<OpportunityDetailModalProps> = ({
  opportunity,
  userProfile,
  registrations = [],
  isOpen,
  onClose,
  onRequestRegistration,
  onRequestAutoApply,
  isAlreadyRegistered
}) => {
  if (!isOpen || !opportunity) return null;

  const hasAgeRequirement = opportunity.minAge > 0;
  const meetsAge = hasAgeRequirement && userProfile.age > 0 && userProfile.age >= opportunity.minAge;
  const scheduleConflict = detectScheduleConflicts(opportunity, registrations, userProfile);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#FFFFFF] border border-[#D5E0D7] rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden my-8 relative flex flex-col max-h-[90vh]">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-white/90 hover:bg-white text-[#244C3A] border border-[#D5E0D7] flex items-center justify-center shadow-xs transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Hero image with cause badge */}
        <div className="relative h-56 sm:h-64 w-full bg-[#244C3A] shrink-0">
          <img
            src={opportunity.image}
            alt={opportunity.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

          <div className="absolute top-4 left-4 flex gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#244C3A] text-[#E8F0E9] border border-white/20">
              {opportunity.category}
            </span>
          </div>

          <div className="absolute bottom-4 left-6 right-6 text-white">
            <p className="text-xs font-medium text-[#D6C49A] mb-1">
              {opportunity.organization}
            </p>
            <h2 className="font-serif text-2xl sm:text-3xl font-bold leading-tight">
              {opportunity.title}
            </h2>
          </div>
        </div>

        {/* Scrollable Modal Content */}
        <div className="p-6 sm:p-8 overflow-y-auto space-y-6 flex-1 text-[#244C3A]">
          {/* Key Quick Facts Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-[#E8F0E9] rounded-2xl border border-[#D5E0D7]">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[#244C3A]/60 font-semibold mb-1">
                Date & Schedule
              </div>
              <div className="text-xs font-bold text-[#244C3A] flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#315D48]" />
                <span>{opportunity.date}</span>
              </div>
              <div className="text-[11px] text-[#244C3A]/70 mt-0.5">{opportunity.time}</div>
            </div>

            <div>
              <div className="text-[11px] uppercase tracking-wider text-[#244C3A]/60 font-semibold mb-1">
                Location & Mode
              </div>
              <div className="text-xs font-bold text-[#244C3A] flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#315D48]" />
                <span className="truncate">{opportunity.location}</span>
              </div>
              <div className="text-[11px] text-[#244C3A]/70 mt-0.5 capitalize">{opportunity.format}</div>
            </div>

            <div>
              <div className="text-[11px] uppercase tracking-wider text-[#244C3A]/60 font-semibold mb-1">
                Min Volunteer Age
              </div>
              <div className="text-xs font-bold text-[#244C3A] flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-[#315D48]" />
                <span>{hasAgeRequirement ? `${opportunity.minAge}+ years` : 'Not specified'}</span>
              </div>
              <div className="text-[11px] text-[#244C3A]/70 mt-0.5">
                {!hasAgeRequirement
                  ? 'No age criterion recorded'
                  : userProfile.age <= 0
                    ? 'Add date of birth to check'
                    : meetsAge
                      ? '✓ Your age qualifies'
                      : '⚠️ Under required age'}
              </div>
            </div>

            <div>
              <div className="text-[11px] uppercase tracking-wider text-[#244C3A]/60 font-semibold mb-1">
                Open Slots
              </div>
              <div className="text-xs font-bold text-[#244C3A] flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[#315D48]" />
                <span>{opportunity.slotsAvailable >= 0 ? `${opportunity.slotsAvailable} spots left` : 'Not provided'}</span>
              </div>
              <div className="text-[11px] text-[#244C3A]/70 mt-0.5">Community cohort</div>
            </div>
          </div>

          {/* Role Description */}
          <div>
            <h4 className="font-serif text-lg font-bold text-[#244C3A] mb-2">
              Role Overview
            </h4>
            <p className="text-sm text-[#244C3A]/80 leading-relaxed">
              {opportunity.description}
            </p>
          </div>

          {/* Social Impact Statement */}
          <div className="p-4 bg-[#E8F0E9]/60 border border-[#D5DACA] rounded-xl flex items-start gap-3">
            <Award className="w-5 h-5 text-[#315D48] shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-[#244C3A] uppercase tracking-wider">
                Measurable Cause Impact
              </div>
              <p className="text-xs sm:text-sm text-[#244C3A]/85 mt-0.5">
                {opportunity.impactStatement}
              </p>
            </div>
          </div>

          {/* Skills Required */}
          <div>
            <h4 className="font-serif text-lg font-bold text-[#244C3A] mb-2">
              Required Skills & Competencies
            </h4>
            <div className="flex flex-wrap gap-2">
              {opportunity.skills.length === 0 && (
                <span className="text-sm text-[#244C3A]/60">No required skills listed</span>
              )}
              {opportunity.skills.map((skill) => (
                <span
                  key={skill}
                  className="px-3 py-1 rounded-lg text-xs font-medium bg-[#E8F0E9] text-[#244C3A] border border-[#D5DACA]"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>

          {/* Transparent Eligibility Verification Card */}
          <div className="bg-[#FFFFFF] border border-[#D5E0D7] rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-serif text-base font-bold text-[#244C3A]">
                Transparent Eligibility & Verification Status
              </h4>
              <span className="text-[11px] text-[#315D48] font-semibold bg-[#E8F0E9] px-2.5 py-0.5 rounded-full">
                Zero-Hallucination Policy
              </span>
            </div>

            <div className="space-y-2 text-xs">
              {/* Age criteria */}
              <div className="flex items-center justify-between py-1.5 border-b border-[#D5E0D7]/50">
                <span className="text-[#244C3A]/70">Minimum Age Constraint</span>
                <span className={`font-semibold ${meetsAge ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {!hasAgeRequirement
                    ? 'No age requirement recorded'
                    : userProfile.age <= 0
                      ? `Add date of birth (minimum age ${opportunity.minAge})`
                      : meetsAge
                        ? `✓ Age ${userProfile.age} meets requirement (Min: ${opportunity.minAge})`
                        : `⚠️ Min age is ${opportunity.minAge}`}
                </span>
              </div>

              {/* Background check constraint */}
              <div className="flex items-center justify-between py-1.5 border-b border-[#D5E0D7]/50">
                <span className="text-[#244C3A]/70">Background Check Protocol</span>
                {opportunity.backgroundCheck === 'not-confirmed' ? (
                  <span className="font-semibold text-amber-700 flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Unconfirmed by organizer listing
                  </span>
                ) : opportunity.backgroundCheck === 'required' ? (
                  <span className="font-semibold text-[#244C3A] flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#315D48]" />
                    Required by organization
                  </span>
                ) : (
                  <span className="font-semibold text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    No background check required
                  </span>
                )}
              </div>

              {/* Verified details flags */}
              <div className="flex items-center justify-between py-1.5 border-b border-[#D5E0D7]/50">
                <span className="text-[#244C3A]/70">Nonprofit Legitimacy Check</span>
                <span className={`font-semibold flex items-center gap-1 ${opportunity.verifiedDetails.nonprofitStatusVerified ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {opportunity.verifiedDetails.nonprofitStatusVerified ? <CheckCircle2 className="w-3.5 h-3.5" /> : <HelpCircle className="w-3.5 h-3.5" />}
                  {opportunity.verifiedDetails.nonprofitStatusVerified ? 'Verified tax-exempt organization' : 'Not independently verified'}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-[#D5E0D7]/50">
                <span className="text-[#244C3A]/70">Volunteer Hours Certification</span>
                <span className={`font-semibold flex items-center gap-1 ${opportunity.verifiedDetails.hoursCertifiable ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {opportunity.verifiedDetails.hoursCertifiable ? <CheckCircle2 className="w-3.5 h-3.5" /> : <HelpCircle className="w-3.5 h-3.5" />}
                  {opportunity.verifiedDetails.hoursCertifiable ? 'Eligible for certified volunteer hours log' : 'Certification not confirmed'}
                </span>
              </div>

              {/* CommitMate Availability Check Row */}
              <div className="flex items-center justify-between py-1.5">
                <span className="text-[#244C3A]/70 flex items-center gap-1">
                  <CalendarCheck className="w-3.5 h-3.5 text-[#315D48]" />
                  <span>CommitMate Schedule Status</span>
                </span>
                {scheduleConflict.hasConflict ? (
                  <span className="font-semibold text-red-700 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Conflict: {scheduleConflict.conflictDescription}
                  </span>
                ) : scheduleConflict.isIncomplete ? (
                  <span className="font-semibold text-amber-700 flex items-center gap-1">
                    <HelpCircle className="w-3.5 h-3.5" />
                    Timing check incomplete
                  </span>
                ) : (
                  <span className="font-semibold text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Schedule clear · No overlap
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Source Provenance */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-[#E8F0E9]/60 rounded-xl text-xs text-[#244C3A]/70">
            <div className="flex items-center gap-1.5">
              <span>Source URL:</span>
              {opportunity.sourceUrl ? (
                <a
                  href={opportunity.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-[#244C3A] underline flex items-center gap-1"
                >
                  {opportunity.sourceDomain}
                  <ExternalLink className="w-3 h-3" />
                </a>
              ) : <span>Not provided</span>}
            </div>
            <div>{opportunity.lastRetrieved}</div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 sm:p-6 border-t border-[#D5E0D7] bg-[#E8F0E9] flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          {opportunity.contactEmail && <div className="flex items-center gap-2 text-xs text-[#244C3A]/70">
            <Mail className="w-3.5 h-3.5 text-[#315D48]" />
            <span>Coordinator: {opportunity.contactEmail}</span>
          </div>}

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-[#D5DACA] bg-white text-xs font-semibold text-[#244C3A] hover:bg-[#E8F0E9]"
            >
              Close
            </button>
            <button
              onClick={() => onRequestAutoApply(opportunity)}
              disabled={!opportunity.sourceUrl}
              title={!opportunity.sourceUrl ? 'No application source URL is available for this event.' : 'Check eligibility and review this opportunity.'}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-[#244C3A] bg-white text-xs font-semibold text-[#244C3A] hover:bg-[#E8F0E9] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              aria-label="Apply with AI"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Apply with AI</span>
            </button>
            <button
              onClick={() => {
                onClose();
                onRequestRegistration(opportunity);
              }}
              disabled={isAlreadyRegistered}
              aria-label={isAlreadyRegistered ? 'Application Already Recorded' : 'Apply manually to Opportunity'}
              className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                isAlreadyRegistered
                  ? 'bg-[#E8F0E9] text-[#244C3A]/50 cursor-not-allowed'
                  : 'bg-[#244C3A] hover:bg-[#315D48] text-white shadow-xs'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-[#D6C49A] shrink-0" />
              <span>{isAlreadyRegistered ? 'Application Recorded' : 'Apply Manually'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
