import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
  Calendar,
  MapPin,
  Clock,
  User,
  Mail,
  Phone,
  AlertCircle,
  FileCheck,
  AlertTriangle,
  Fingerprint,
  ExternalLink,
  Loader2,
  Lock,
  ArrowRight,
  Sparkles,
  ClipboardCheck,
  Hourglass,
  Bot,
  Edit3,
  Check,
  Building,
  HelpCircle
} from 'lucide-react';
import {
  Opportunity,
  VolunteerProfile,
  Registration,
  EligibilityResult,
  ProposedRegistrationAction,
  VerificationResult,
  ApplyPilotFieldMapping,
  ApplyPilotEligibilityOutcome
} from '../types';
import {
  checkEligibility,
  prepareRegistration,
  approveRegistration,
  executeRegistration
} from '../services/registrationAgentService';
import { detectScheduleConflicts } from '../lib/commitMateSchedule';

interface RegistrationModalProps {
  opportunity: Opportunity | null;
  userProfile: VolunteerProfile;
  registrations?: Registration[];
  isOpen: boolean;
  onClose: () => void;
  onConfirmRegistration: (
    opportunity: Opportunity,
    userNotes: string,
    options?: { status?: string; confirmationReference?: string }
  ) => Promise<{ success: boolean; error: string | null; registration?: Registration }>;
  onGoToRegisteredEvents: () => void;
  onPromptSignIn?: () => void;
  isAuthenticated?: boolean;
}

export const RegistrationModal: React.FC<RegistrationModalProps> = ({
  opportunity,
  userProfile,
  registrations = [],
  isOpen,
  onClose,
  onConfirmRegistration,
  onGoToRegisteredEvents,
  onPromptSignIn,
  isAuthenticated = true
}) => {
  // Deterministic Eligibility State
  const [eligibility, setEligibility] = useState<EligibilityResult | null>(null);
  const [isCheckingEligibility, setIsCheckingEligibility] = useState<boolean>(true);

  // Proposal State
  const [proposal, setProposal] = useState<ProposedRegistrationAction | null>(null);
  const [isPreparingProposal, setIsPreparingProposal] = useState<boolean>(false);
  const [userNotes, setUserNotes] = useState<string>('');
  const [bgConsentChecked, setBgConsentChecked] = useState<boolean>(userProfile.backgroundCheckConsent || false);
  const [hasExplicitlyApproved, setHasExplicitlyApproved] = useState<boolean>(false);

  // Field mapping & motivation statement review
  const [isEditingMotivation, setIsEditingMotivation] = useState<boolean>(false);
  const [tailoredMotivation, setTailoredMotivation] = useState<string>('');
  const [showFieldMappingTable, setShowFieldMappingTable] = useState<boolean>(true);

  // Phase B: Execution State
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [verificationOutcome, setVerificationOutcome] = useState<VerificationResult | null>(null);
  const [finalState, setFinalState] = useState<'confirmed' | 'waitlisted' | 'failed' | null>(null);
  const [submittedRegistration, setSubmittedRegistration] = useState<Registration | null>(null);

  // Missing info prompt state
  const [volunteerAge, setVolunteerAge] = useState<number>(userProfile.age || 21);
  const [volunteerDob, setVolunteerDob] = useState<string>(userProfile.dateOfBirth || '');
  const [volunteerPhone, setVolunteerPhone] = useState<string>(userProfile.phone || '');

  // CommitMate Schedule Conflict Evaluation
  const scheduleConflict = useMemo(() => {
    if (!opportunity) return null;
    return detectScheduleConflicts(opportunity, registrations || [], userProfile);
  }, [opportunity, registrations, userProfile]);

  // Verified Destination URL & Domain
  const destinationUrl = useMemo(() => {
    const raw = (proposal?.destinationUrl || (opportunity as any)?.applicationUrl || (opportunity as any)?.registrationUrl || opportunity?.sourceUrl || '').trim();
    if (!raw || raw.toLowerCase() === 'public-web' || raw.includes('//public-web')) {
      return '';
    }
    return raw;
  }, [proposal, opportunity]);

  const isDestinationUsable = useMemo(() => {
    return Boolean(
      destinationUrl &&
      (destinationUrl.startsWith('http://') || destinationUrl.startsWith('https://')) &&
      !destinationUrl.includes('public-web')
    );
  }, [destinationUrl]);

  const destinationDomain = useMemo(() => {
    if (!destinationUrl) return opportunity?.sourceDomain && opportunity.sourceDomain !== 'public-web' ? opportunity.sourceDomain : 'causeconnect.org';
    try {
      return new URL(destinationUrl).hostname.replace(/^www\./, '');
    } catch {
      return opportunity?.sourceDomain && opportunity.sourceDomain !== 'public-web' ? opportunity.sourceDomain : 'causeconnect.org';
    }
  }, [destinationUrl, opportunity]);

  // Pre-flight eligibility evaluation on modal open
  useEffect(() => {
    if (isOpen && opportunity) {
      // Generate initial motivation statement
      const skillsStr = userProfile.skills?.length
        ? userProfile.skills.slice(0, 3).join(', ')
        : 'community collaboration';
      const causeStr = userProfile.preferredCauses?.length
        ? userProfile.preferredCauses[0]
        : 'social good';
      const generated = `I am excited to apply for ${opportunity.title} with ${opportunity.organization}. With practical skills in ${skillsStr} and a passion for ${causeStr}, I look forward to contributing to your mission in ${userProfile.city || 'the community'}.`;
      setTailoredMotivation(generated);
      if (!userNotes) {
        setUserNotes(generated);
      }

      runPreFlightEligibility();
    }
  }, [isOpen, opportunity, volunteerAge, volunteerDob, bgConsentChecked]);

  const runPreFlightEligibility = async () => {
    if (!opportunity) return;
    setIsCheckingEligibility(true);
    setExecutionError(null);

    const res = await checkEligibility(
      {
        ...userProfile,
        age: volunteerAge,
        dateOfBirth: volunteerDob || undefined,
        phone: volunteerPhone || userProfile.phone,
        backgroundCheckConsent: bgConsentChecked
      },
      opportunity
    );

    setIsCheckingEligibility(false);
    if (res.success && res.eligibility) {
      setEligibility(res.eligibility);

      // If eligible or awaiting consent, prepare proposal
      if (res.eligibility.status !== 'Ineligible') {
        runPrepareProposal(res.eligibility);
      } else {
        setProposal(null);
      }
    }
  };

  const runPrepareProposal = async (currentEligibility?: EligibilityResult) => {
    if (!opportunity) return;
    setIsPreparingProposal(true);

    const res = await prepareRegistration(
      {
        ...userProfile,
        age: volunteerAge,
        dateOfBirth: volunteerDob || undefined,
        phone: volunteerPhone || userProfile.phone,
        backgroundCheckConsent: bgConsentChecked
      },
      opportunity,
      {
        userNotes: userNotes || tailoredMotivation,
        backgroundCheckConsented: bgConsentChecked
      }
    );

    setIsPreparingProposal(false);
    if (res.success && res.proposal) {
      setProposal(res.proposal);
    }
  };

  if (!isOpen || !opportunity) return null;

  // Phase B: Explicit Approval & Execution
  const handleApproveAndExecute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proposal) return;

    if (!hasExplicitlyApproved) {
      setExecutionError('You must explicitly approve this exact proposal before ApplyPilot can submit on your behalf.');
      return;
    }

    if (eligibility?.requiresBackgroundCheckConsent && !bgConsentChecked) {
      setExecutionError('This event requires explicit background check consent before registration can proceed.');
      return;
    }

    setIsExecuting(true);
    setExecutionError(null);

    try {
      // 1. Record explicit user approval on backend (locks version & action hash)
      const approvalRes = await approveRegistration(proposal.proposalId, {
        expectedVersion: proposal.version,
        expectedActionHash: proposal.actionHash,
        explicitConsentGiven: true,
        backgroundCheckConsented: bgConsentChecked
      });

      if (!approvalRes.success) {
        throw new Error(approvalRes.error || 'Failed to record explicit proposal approval.');
      }

      // 2. Execute registration workflow with independent Playwright verification
      const execRes = await executeRegistration(proposal.proposalId);
      if (!execRes.success || !execRes.verificationResult) {
        throw new Error(execRes.error || 'Registration execution could not be verified by destination portal.');
      }

      if (execRes.verificationResult.status === 'failed' || execRes.state === 'failed') {
        throw new Error(execRes.error || 'Target organization registration could not be completed.');
      }

      // 3. Determine verified outcome status
      const outcomeStatus = execRes.verificationResult.status === 'waitlisted' ? 'waitlisted' : 'confirmed';

      // 4. Synchronize and persist with Supabase database for the authenticated user
      const syncRes = await onConfirmRegistration(
        opportunity,
        userNotes || tailoredMotivation,
        {
          status: outcomeStatus,
          confirmationReference: execRes.verificationResult.confirmationReference
        }
      );

      if (!syncRes.success) {
        throw new Error(syncRes.error || 'Failed to persist verified registration in Supabase database.');
      }

      // 5. Update UI with verified proof and confirmed state ONLY after successful database write
      setVerificationOutcome(execRes.verificationResult);
      setSubmittedRegistration(syncRes.registration || null);
      setFinalState(outcomeStatus);
    } catch (err: any) {
      console.error('[RegistrationModal] Submission error:', err);
      setExecutionError(err?.message || 'Registration execution encountered an error.');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleClose = () => {
    setEligibility(null);
    setProposal(null);
    setHasExplicitlyApproved(false);
    setUserNotes('');
    setExecutionError(null);
    setVerificationOutcome(null);
    setFinalState(null);
    setSubmittedRegistration(null);
    setIsEditingMotivation(false);
    onClose();
  };

  const isExcluded = eligibility?.status === 'Ineligible';
  const isAwaitingConsent = eligibility?.status === 'Awaiting consent';
  const isNeedsInfo = eligibility?.status === 'Needs more information';

  // Detected fields mapping list for transparent UI inspection
  const fieldMappingList = [
    { label: 'Full Legal Name', value: userProfile.name, formField: 'input[name="name"]', status: userProfile.name ? 'mapped' : 'missing' },
    { label: 'Email Address', value: userProfile.email, formField: 'input[name="email"]', status: userProfile.email?.includes('@') ? 'mapped' : 'missing' },
    { label: 'Phone Number', value: volunteerPhone || userProfile.phone || 'Not provided', formField: 'input[name="phone"]', status: (volunteerPhone || userProfile.phone) ? 'mapped' : 'optional' },
    { label: 'Verified Age', value: `${volunteerAge} years`, formField: 'input[name="age"]', status: volunteerAge ? 'mapped' : 'missing' },
    { label: 'City & Location', value: userProfile.city || 'Local Area', formField: 'input[name="city"]', status: 'mapped' },
    { label: 'Skills & Qualifications', value: userProfile.skills?.join(', ') || 'General volunteer', formField: 'input[name="skills"]', status: 'mapped' },
    { label: 'Schedule Availability', value: userProfile.preferredDays?.join(', ') || 'Flexible', formField: 'select[name="availability"]', status: 'mapped' },
    { label: 'Motivation Statement', value: userNotes || tailoredMotivation, formField: 'textarea[name="motivation"]', status: 'mapped' }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-[#FFFFFF] border border-[#D5E0D7] rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden my-6 relative flex flex-col max-h-[92vh]">
        
        {/* Modal Header with ApplyPilot Branding */}
        <div className="p-5 sm:p-6 border-b border-[#D5E0D7] flex items-center justify-between bg-gradient-to-r from-[#1A382A] to-[#244C3A] text-white flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-xs border border-white/20 flex items-center justify-center text-[#D6C49A] shadow-xs">
              <Bot className="w-5 h-5 text-[#E6D5AC]" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#D6C49A]">
                <span>ApplyPilot</span>
                <span>·</span>
                <span>Autonomous Volunteer Agent</span>
              </div>
              <h3 className="font-serif text-lg sm:text-xl font-bold text-white">
                {finalState ? 'Registration Outcome Verified' : 'Application Review & Autonomous Submission'}
              </h3>
            </div>
          </div>

          <button
            onClick={handleClose}
            aria-label="Close modal"
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 sm:p-8 overflow-y-auto space-y-6">
          {/* Final Outcome Screen (Confirmed or Waitlisted) */}
          {finalState ? (
            <div className="text-center space-y-6 py-2">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto shadow-sm ${
                finalState === 'waitlisted'
                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                  : 'bg-[#E8F0E9] text-[#244C3A] border border-[#315D48]/30'
              }`}>
                {finalState === 'waitlisted' ? (
                  <Hourglass className="w-8 h-8" />
                ) : (
                  <CheckCircle2 className="w-8 h-8" />
                )}
              </div>

              <div className="space-y-2 max-w-md mx-auto">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider inline-block ${
                  finalState === 'waitlisted'
                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                    : 'bg-[#E8F0E9] text-[#244C3A] border border-[#D5E0D7]'
                }`}>
                  {finalState === 'waitlisted' ? 'Outcome: Placed on Waitlist' : 'Outcome: Registration Confirmed'}
                </span>
                <h4 className="font-serif text-2xl font-bold text-[#244C3A]">
                  {finalState === 'waitlisted' ? 'You are on the Event Waitlist' : 'Application Submitted & Verified!'}
                </h4>
                <p className="text-xs sm:text-sm text-[#59665C] leading-relaxed">
                  {finalState === 'waitlisted'
                    ? 'The event has reached maximum active capacity. ApplyPilot secured your approved application on the priority waitlist and recorded independent evidence.'
                    : `ApplyPilot has submitted your application for "${opportunity.title}". Autonomous verification confirmed your registration.`}
                </p>
              </div>

              {/* Verified Evidence Box */}
              {verificationOutcome && (
                <div className="bg-[#F7FAF7] rounded-2xl border border-[#D5E0D7] p-4 text-left text-xs space-y-2.5">
                  <div className="flex items-center justify-between pb-2 border-b border-[#D5E0D7]">
                    <span className="font-bold text-[#244C3A] uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      Autonomous Verification Evidence
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-[#E8F0E9] text-[10px] font-mono text-[#315D48]">
                      Verified at {new Date(verificationOutcome.verifiedAt).toLocaleTimeString()}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-[#244C3A]">
                    {verificationOutcome.confirmationReference && (
                      <div className="flex justify-between">
                        <span className="text-[#59665C]">Reference Code:</span>
                        <span className="font-mono font-bold text-[#1A382A]">#{verificationOutcome.confirmationReference}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-[#59665C]">Target Domain:</span>
                      <span className="font-medium text-[#1A382A]">{proposal?.destinationDomain || opportunity.sourceDomain}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#59665C]">Action Hash:</span>
                      <span className="font-mono text-[10px] text-[#59665C]">{proposal?.actionHash.slice(0, 16)}...</span>
                    </div>
                    <div className="pt-2 border-t border-[#D5E0D7]/60">
                      <span className="text-[#59665C] block mb-1">Observed Proof / Confirmation Evidence:</span>
                      <div className="p-2.5 bg-white rounded-xl border border-[#D5E0D7] text-[#244C3A] font-mono text-[11px] leading-relaxed">
                        {verificationOutcome.sanitizedEvidence}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  onClick={() => {
                    handleClose();
                    onGoToRegisteredEvents();
                  }}
                  className="w-full sm:w-1/2 py-3 px-4 rounded-xl bg-[#244C3A] text-white text-xs font-semibold hover:bg-[#315D48] transition-colors cursor-pointer shadow-xs"
                >
                  View My Registered Events
                </button>
                <button
                  onClick={handleClose}
                  className="w-full sm:w-1/2 py-3 px-4 rounded-xl border border-[#D5DACA] bg-white text-xs font-semibold text-[#244C3A] hover:bg-[#E8F0E9] transition-colors cursor-pointer"
                >
                  Continue Browsing
                </button>
              </div>
            </div>
          ) : (
            /* Main ApplyPilot Workflow Form */
            <form onSubmit={handleApproveAndExecute} className="space-y-6">
              {!isAuthenticated && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <User className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">Sign In Required to Auto-Apply</span>
                      <span>An authenticated volunteer account is required to link and persist your registered event.</span>
                    </div>
                  </div>
                  {onPromptSignIn && (
                    <button
                      type="button"
                      onClick={onPromptSignIn}
                      className="px-3.5 py-1.5 rounded-lg bg-[#244C3A] text-white font-bold text-xs hover:bg-[#315D48] transition-colors shrink-0 cursor-pointer shadow-xs"
                    >
                      Sign In Now
                    </button>
                  )}
                </div>
              )}

              {executionError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <span className="font-semibold block">Submission Blocked</span>
                    <span>{executionError}</span>
                  </div>
                </div>
              )}

              {/* Opportunity Summary Card */}
              <div className="p-4 bg-[#E8F0E9] rounded-2xl border border-[#D5E0D7] space-y-2.5">
                <div className="flex items-center justify-between text-[11px] font-bold tracking-wider uppercase text-[#5A7868]">
                  <span>Target Opportunity</span>
                  <span className="px-2 py-0.5 rounded-full bg-white text-[#244C3A] border border-[#D5E0D7]">
                    {opportunity.category}
                  </span>
                </div>
                <div className="font-serif text-lg font-bold text-[#244C3A]">
                  {opportunity.title}
                </div>
                <div className="text-xs font-medium text-[#315D48] flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5 text-[#315D48]" />
                  <span>{opportunity.organization}</span>
                  <span>·</span>
                  <MapPin className="w-3.5 h-3.5 text-[#315D48]" />
                  <span>{opportunity.location}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-[#244C3A]/80 pt-2 border-t border-[#D5E0D7]/60">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-[#315D48]" />
                    <span>{opportunity.date}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#315D48]" />
                    <span>{opportunity.time}</span>
                  </div>
                </div>
              </div>

              {/* CommitMate Schedule & Availability Conflict Check */}
              {scheduleConflict && (
                <div
                  className={`p-4 rounded-2xl border text-xs space-y-2 transition-all ${
                    scheduleConflict.hasConflict
                      ? 'bg-red-50 border-red-200 text-red-900'
                      : scheduleConflict.isIncomplete
                      ? 'bg-blue-50/80 border-blue-200 text-blue-900'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                      {scheduleConflict.hasConflict ? (
                        <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                      ) : scheduleConflict.isIncomplete ? (
                        <HelpCircle className="w-4 h-4 text-blue-600 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      )}
                      <span>CommitMate Availability Check</span>
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        scheduleConflict.hasConflict
                          ? 'bg-red-100 text-red-800'
                          : scheduleConflict.isIncomplete
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {scheduleConflict.hasConflict
                        ? 'Conflict Detected'
                        : scheduleConflict.isIncomplete
                        ? 'Timing Advisory (Flexible)'
                        : 'Schedule Clear'}
                    </span>
                  </div>

                  <p className="font-medium text-xs leading-relaxed">
                    {scheduleConflict.hasConflict
                      ? scheduleConflict.conflictDescription
                      : scheduleConflict.isIncomplete
                      ? (scheduleConflict.incompleteReason || 'Event timing is flexible or self-scheduled. Schedule conflict check is advisory and does not block your application.')
                      : 'No schedule overlaps detected with your registered commitments or preferred volunteering window.'}
                  </p>

                  {scheduleConflict.isIncomplete && !scheduleConflict.hasConflict && (
                    <div className="text-[11px] bg-white/70 p-2 rounded-xl border border-blue-200 text-blue-800 flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>Advisory note: ApplyPilot will proceed with your registration for this flexible opportunity.</span>
                    </div>
                  )}

                  {scheduleConflict.conflictingRegistration && (
                    <div className="text-[11px] font-mono bg-white/80 p-2.5 rounded-xl border border-red-200 text-red-950">
                      <span className="font-semibold block">Conflicting Registered Event:</span>
                      <span>{scheduleConflict.conflictingRegistration.opportunityTitle}</span> ({scheduleConflict.conflictingRegistration.date} · {scheduleConflict.conflictingRegistration.time})
                    </div>
                  )}
                </div>
              )}

              {/* Step A & B: Authenticated Volunteer Profile Retrieval */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#59665C] flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-[#244C3A]" />
                    Step A & B: Authenticated Volunteer Profile
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold">
                    Supabase Verified
                  </span>
                </div>

                <div className="p-3.5 bg-white border border-[#D5E0D7] rounded-2xl text-xs space-y-2.5">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-[#59665C] text-[10px] block">Full Name:</span>
                      <span className="font-semibold text-[#244C3A] truncate block">{userProfile.name}</span>
                    </div>
                    <div>
                      <span className="text-[#59665C] text-[10px] block">Email:</span>
                      <span className="font-semibold text-[#244C3A] truncate block">{userProfile.email}</span>
                    </div>
                    <div>
                      <span className="text-[#59665C] text-[10px] block">Location:</span>
                      <span className="font-semibold text-[#244C3A] truncate block">{userProfile.city || 'Local Area'}</span>
                    </div>
                  </div>

                  {/* Age / DOB validation inline */}
                  <div className="pt-2 border-t border-[#D5E0D7]/60 flex items-center justify-between">
                    <div>
                      <span className="text-[#59665C] text-[10px] block">Verified Age:</span>
                      <span className="font-semibold text-[#244C3A]">{volunteerAge} years</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-[#59665C]">Confirm Age:</span>
                      <input
                        type="number"
                        min="13"
                        max="100"
                        value={volunteerAge}
                        onChange={(e) => setVolunteerAge(Number(e.target.value))}
                        className="w-16 px-2 py-1 text-xs font-semibold bg-[#E8F0E9] border border-[#D5E0D7] rounded-lg text-[#244C3A]"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Step C: Server-Side Eligibility Engine */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#59665C] flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#244C3A]" />
                    Step C: Server-Side Eligibility Verification
                  </span>
                  {isCheckingEligibility ? (
                    <span className="text-xs text-[#5A7868] flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin text-[#244C3A]" />
                      Checking rules...
                    </span>
                  ) : (
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      eligibility?.status === 'Eligible'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : eligibility?.status === 'Awaiting consent'
                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                        : eligibility?.status === 'Ineligible'
                        ? 'bg-red-100 text-red-800 border border-red-300'
                        : 'bg-blue-100 text-blue-800 border border-blue-300'
                    }`}>
                      {eligibility?.status === 'Eligible' ? 'Status: Eligible' : eligibility?.status}
                    </span>
                  )}
                </div>

                {/* Hard Disqualification Notice */}
                {isExcluded && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-900 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-red-950">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>Applicant Disqualified — Ineligible for Application</span>
                    </div>
                    <p className="text-red-800 leading-relaxed">
                      {eligibility?.reasons.join('. ') || `Verified profile does not satisfy published minimum age or background requirements.`}
                    </p>
                    <p className="text-[11px] text-red-700 italic">
                      Deterministic safety constraint: ApplyPilot is prohibited from bypassing organization requirements.
                    </p>
                  </div>
                )}

                {/* Rules Evaluated Breakdown */}
                {eligibility && (
                  <div className="p-3 bg-white border border-[#D5E0D7] rounded-xl text-xs space-y-1.5">
                    {eligibility.rulesEvaluated.map((r, idx) => (
                      <div key={idx} className="flex items-start justify-between gap-2 py-1 border-b border-[#D5E0D7]/40 last:border-0">
                        <div className="space-y-0.5">
                          <span className="font-semibold text-[#244C3A] block">{r.rule}</span>
                          <span className="text-[11px] text-[#59665C] block">{r.details}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold flex-shrink-0 ${
                          r.passed ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                        }`}>
                          {r.passed ? 'PASSED' : 'CHECK'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Step D & E: Destination & Detected Field Mapping */}
              {!isExcluded && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#59665C] flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-emerald-600" />
                      Step D: Verified Destination & Field Mapping
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowFieldMappingTable(!showFieldMappingTable)}
                      className="text-[11px] text-[#315D48] hover:underline cursor-pointer"
                    >
                      {showFieldMappingTable ? 'Hide field details' : 'Show detected fields'}
                    </button>
                  </div>

                  {/* Destination URL card with SSRF verification */}
                  <div className="p-3.5 bg-[#F7FAF7] rounded-2xl border border-[#D5E0D7] space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-[#59665C] uppercase tracking-wider">
                        Destination Page (SSRF & Internal IP Guarded)
                      </span>
                      {isDestinationUsable ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-medium flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          Safe Public Host
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-medium flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-amber-700" />
                          No Automated Form URL
                        </span>
                      )}
                    </div>

                    {isDestinationUsable ? (
                      <div className="flex items-center justify-between gap-2 bg-white p-2 rounded-lg border border-[#D5E0D7]">
                        <span className="font-mono text-xs text-[#244C3A] truncate">
                          {destinationUrl}
                        </span>
                        <a
                          href={destinationUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#315D48] hover:text-[#244C3A] inline-flex items-center gap-1 shrink-0 text-[11px] font-medium hover:underline"
                        >
                          <span>Inspect</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    ) : (
                      <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 space-y-2">
                        <p className="font-medium text-xs">
                          No direct automated registration form URL is configured for this opportunity. Auto-Apply is disabled to prevent unverified submissions.
                        </p>
                        {opportunity.sourceUrl && opportunity.sourceUrl !== 'public-web' && (
                          <a
                            href={opportunity.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#244C3A] text-white text-xs font-semibold hover:bg-[#315D48] transition-colors"
                          >
                            <span>Open Official Organization Page</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Field Mapping Table */}
                  {showFieldMappingTable && (
                    <div className="p-3.5 bg-white border border-[#D5E0D7] rounded-2xl text-xs space-y-2">
                      <span className="font-semibold text-[#244C3A] block text-[11px] uppercase tracking-wider">
                        Detected Form Fields & Data Mapping:
                      </span>
                      <div className="divide-y divide-[#D5E0D7]/40">
                        {fieldMappingList.map((item, idx) => (
                          <div key={idx} className="py-1.5 flex items-center justify-between text-xs">
                            <div>
                              <span className="font-medium text-[#244C3A] block">{item.label}</span>
                              <span className="text-[10px] text-[#59665C] font-mono">{item.formField}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-[#244C3A] text-xs font-semibold block truncate max-w-[200px]">{item.value}</span>
                              <span className={`inline-block px-1.5 py-0.2 text-[9px] rounded font-medium ${
                                item.status === 'mapped'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : item.status === 'optional'
                                  ? 'bg-gray-100 text-gray-600'
                                  : 'bg-red-50 text-red-700'
                              }`}>
                                {item.status.toUpperCase()}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tailored Motivation Statement Card */}
                  <div className="p-4 bg-white border border-[#D5E0D7] rounded-2xl space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#244C3A] flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-[#315D48]" />
                        ApplyPilot Motivation Statement (Personalized)
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsEditingMotivation(!isEditingMotivation)}
                        className="text-[11px] text-[#315D48] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3" />
                        {isEditingMotivation ? 'Done Editing' : 'Edit Statement'}
                      </button>
                    </div>

                    {isEditingMotivation ? (
                      <textarea
                        value={userNotes || tailoredMotivation}
                        onChange={(e) => {
                          setUserNotes(e.target.value);
                          setTailoredMotivation(e.target.value);
                        }}
                        rows={3}
                        className="w-full p-2.5 text-xs bg-[#E8F0E9]/60 border border-[#D5E0D7] rounded-xl text-[#244C3A] focus:outline-none focus:ring-2 focus:ring-[#244C3A]/30"
                      />
                    ) : (
                      <p className="text-xs text-[#244C3A]/90 bg-[#F7FAF7] p-3 rounded-xl border border-[#D5E0D7] italic leading-relaxed">
                        "{userNotes || tailoredMotivation}"
                      </p>
                    )}
                  </div>

                  {/* Mandatory Background Check Consent Gate */}
                  {(opportunity.backgroundCheck === 'required' || (opportunity as any).backgroundCheckRequired) && (
                    <div className="p-4 bg-amber-50/80 rounded-2xl border border-amber-300 space-y-2">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={bgConsentChecked}
                          onChange={(e) => setBgConsentChecked(e.target.checked)}
                          className="mt-0.5 w-4 h-4 rounded text-[#244C3A] accent-[#244C3A] focus:ring-[#244C3A] cursor-pointer"
                        />
                        <div className="space-y-0.5">
                          <span className="text-xs font-bold text-amber-950 block">
                            Mandatory Background Check Consent
                          </span>
                          <span className="text-xs text-amber-900 leading-snug block">
                            I explicitly authorize <strong>{opportunity.organization}</strong> to verify my background check status as required for this volunteer role.
                          </span>
                        </div>
                      </label>
                    </div>
                  )}

                  {/* Explicit Two-Phase User Approval Gate */}
                  <div className="p-4 bg-[#DFEAE1]/60 rounded-2xl border border-[#D5DACA] space-y-2">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hasExplicitlyApproved}
                        onChange={(e) => setHasExplicitlyApproved(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded text-[#244C3A] accent-[#244C3A] focus:ring-[#244C3A] cursor-pointer"
                      />
                      <span className="text-xs text-[#244C3A] leading-snug">
                        <strong>Explicit User Authorization:</strong> I have reviewed the destination URL, mapped personal fields, and tailored statement above. I authorize ApplyPilot to execute this application and verify the outcome.
                      </span>
                    </label>

                    {proposal && (
                      <div className="pt-2 border-t border-[#D5DACA]/70 flex items-center justify-between text-[10px] font-mono text-[#59665C]">
                        <span>Action Hash: {proposal.actionHash.slice(0, 16)}...</span>
                        <span>Proposal v{proposal.version}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#D5E0D7]">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2.5 rounded-xl border border-[#D5DACA] bg-white text-xs font-semibold text-[#244C3A] hover:bg-[#E8F0E9] transition-colors cursor-pointer"
                >
                  Cancel
                </button>

                {!isExcluded ? (
                  <button
                    type="submit"
                    disabled={!hasExplicitlyApproved || isExecuting || !isDestinationUsable || (eligibility?.requiresBackgroundCheckConsent && !bgConsentChecked)}
                    className="px-6 py-2.5 rounded-xl bg-[#244C3A] hover:bg-[#315D48] text-white text-xs font-semibold transition-all shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isExecuting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-[#D6C49A]" />
                        <span>ApplyPilot Submitting & Verifying...</span>
                      </>
                    ) : !isDestinationUsable ? (
                      <>
                        <AlertTriangle className="w-4 h-4 text-[#D6C49A]" />
                        <span>Online Form URL Required</span>
                      </>
                    ) : (
                      <>
                        <Bot className="w-4 h-4 text-[#D6C49A]" />
                        <span>Authorize ApplyPilot Auto-Apply</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="px-6 py-2.5 rounded-xl bg-gray-200 text-gray-500 text-xs font-semibold cursor-not-allowed"
                  >
                    Application Blocked (Ineligible)
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
