export type CauseCategory =
  | 'Education'
  | 'Healthcare'
  | 'Community Service'
  | 'Animal Welfare'
  | 'Elderly Care'
  | 'Disaster Relief'
  | 'Environment'
  | 'Accessibility'
  | 'Fundraising';

export type EventFormat = 'in-person' | 'online' | 'hybrid';

export type BackgroundCheckStatus = 'not-required' | 'required' | 'not-confirmed';

export interface Opportunity {
  id: string;
  title: string;
  organization: string;
  category: CauseCategory;
  date: string; // e.g. "Nov 7, 2026"
  daysOfWeek: ('Saturday' | 'Sunday' | 'Weekday')[];
  time: string; // e.g. "10:00 AM - 1:00 PM"
  location: string; // e.g. "Remote · online" or "Bengaluru · in-person"
  city: string;
  format: EventFormat;
  minAge: number;
  backgroundCheck: BackgroundCheckStatus;
  skills: string[];
  description: string;
  sourceDomain: string; // e.g. "example.org"
  sourceUrl: string;
  lastRetrieved: string; // e.g. "Retrieved Oct 17, 03:00 PM"
  slotsAvailable: number;
  contactEmail: string;
  image: string;
  impactStatement: string;
  verifiedDetails: {
    venueVerified: boolean;
    nonprofitStatusVerified: boolean;
    hoursCertifiable: boolean;
  };
}

export interface MatchExplanation {
  totalScore: number; // 0 - 100
  causeMatch: { score: number; max: number; explanation: string };
  skillsMatch: { score: number; max: number; matchedSkills: string[]; missingSkills: string[] };
  availabilityMatch: { score: number; max: number; explanation: string };
  locationMatch: { score: number; max: number; explanation: string };
  eligibilityStatus: 'eligible' | 'warning' | 'ineligible';
  eligibilityNotes: string[];
  verifiedEligibility: boolean;
  unconfirmedFields: string[];
}

export interface VolunteerProfile {
  name: string;
  email: string;
  age: number;
  dateOfBirth?: string; // e.g. "2002-05-14"
  phone?: string;
  educationExperience?: string;
  preferredLocations?: string[];
  accessibilityRequirements?: string;
  city: string;
  hasBackgroundCheck: boolean;
  backgroundCheckConsent?: boolean;
  preferredCauses: CauseCategory[];
  skills: string[];
  preferredDays: ('Saturday' | 'Sunday' | 'Weekday')[];
  preferredFormat: 'all' | 'in-person' | 'online';
  maxDistanceMiles: number;
  bio: string;
  // CommitMate availability settings
  timezone?: string;
  weeklyHoursTarget?: number;
  preferredWorkingHours?: {
    start: string;
    end: string;
  };
  timeSlots?: TimeSlot[];
  googleCalendarConnected?: boolean;
  googleCalendarEmail?: string;
  reminderPreferences?: {
    before24h: boolean;
    before1h: boolean;
    browserNotifications: boolean;
    customMinutes?: number;
  };
}

export interface Registration {
  id: string;
  opportunityId: string;
  opportunityTitle: string;
  organization: string;
  category: CauseCategory;
  date: string;
  time: string;
  location: string;
  format: EventFormat;
  status: 'pending_approval' | 'confirmed' | 'waitlisted' | 'completed' | 'cancelled';
  submittedAt: string;
  approvedByUser: boolean;
  userNotes?: string;
  hoursLogged?: number;
  calendarExported?: boolean;
  // CommitMate calendar & reminder fields
  googleCalendarEventId?: string;
  calendarSyncedAt?: string;
  remindersEnabled?: boolean;
  // WaitlistGuardian monitoring fields
  monitoringEnabled?: boolean;
  monitoringStatus?: WaitlistMonitoringStatus;
  availabilityStatus?: WaitlistAvailabilityStatus;
  lastCheckedAt?: string | null;
  nextCheckAt?: string | null;
  checkRetryCount?: number;
  lastCheckError?: string | null;
  statusChangeHistory?: WaitlistStatusHistoryEntry[];
  sourceUrl?: string;
}

export interface AgentLog {
  id: string;
  timestamp: string;
  actionType: 'scrape' | 'verify' | 'match' | 'compliance' | 'notification';
  title: string;
  detail: string;
  status: 'success' | 'warning' | 'info';
  affectedOpportunityId?: string;
}

export interface TestCase {
  id: string;
  name: string;
  category: string;
  description: string;
  expectedOutcome: string;
  passed: boolean;
  details: string;
  runAt?: string;
}

export interface ImpactMetrics {
  totalHoursVolunteered: number;
  eventsCompleted: number;
  upcomingEvents: number;
  causesSupportedCount: number;
  badgesUnlocked: { id: string; title: string; description: string; icon: string; earnedDate: string }[];
  co2SavedKg?: number;
  peopleImpacted?: number;
}

export type BrowserbaseVerificationStatus = 'verified_official' | 'community_listed' | 'unverified';

export interface BrowserbaseOpportunity {
  // Canonical fields as required by specification
  title: string;
  organization: string;
  city: string;
  date: string | null;
  eligibility: string | null;

  // Additional detail fields
  event_name: string;
  organizer_name: string;
  description: string;
  category: string;
  event_date: string | null;
  event_time: string | null;
  location: string | null;
  required_skills: string[];
  registration_deadline: string | null;
  registration_url: string | null;
  source_url: string | null;
  verification_status: BrowserbaseVerificationStatus;
  match_reason: string;
}

export interface BrowserbaseSearchParams {
  location: string;
  interests?: string[];
  skills?: string[];
  preferred_date?: string | null;
  preferred_dates?: string | null;
  radius?: number | null;
  max_results?: number;
}

export interface BrowserbaseSearchResponse {
  success: boolean;
  configured: boolean;
  agent_name: string;
  run_id?: string;
  status?: string;
  opportunities: BrowserbaseOpportunity[];
  error?: string;
  errorCode?: string;
  message?: string;
  instructions?: string;
  searched_at?: string;
  source_count?: number;
  sourceSummary?: string;
}

// -------------------------------------------------------------------
// AI Volunteer Registration & Eligibility Agent Types
// -------------------------------------------------------------------

export type ApplyPilotEligibilityOutcome = 'eligible' | 'ineligible' | 'needs_review' | 'unknown';

export interface ApplyPilotFieldMapping {
  fullName: { field: string; value: string; status: 'mapped' | 'missing' | 'user_input' };
  email: { field: string; value: string; status: 'mapped' | 'missing' | 'user_input' };
  phone?: { field: string; value?: string; status: 'mapped' | 'missing' | 'optional' };
  age?: { field: string; value?: number; status: 'mapped' | 'missing' | 'optional' };
  city?: { field: string; value?: string; status: 'mapped' | 'missing' | 'optional' };
  skills?: { field: string; value?: string[]; status: 'mapped' | 'missing' | 'optional' };
  experience?: { field: string; value?: string; status: 'mapped' | 'missing' | 'optional' };
  availability?: { field: string; value?: string[]; status: 'mapped' | 'missing' | 'optional' };
  motivationStatement?: { field: string; value: string; isGenerated: boolean; userReviewed: boolean };
  unsupportedFields: string[];
  requiresConsentFor: string[];
}

export type EligibilityDecision =
  | 'Eligible'
  | 'Ineligible'
  | 'Needs more information'
  | 'Awaiting consent';

export interface EligibilityRuleEvaluation {
  rule: string;
  passed: boolean;
  deterministic: boolean;
  details: string;
}

export interface EligibilityResult {
  status: EligibilityDecision;
  applyPilotStatus?: ApplyPilotEligibilityOutcome;
  outcomeExplanation?: string;
  isEligible: boolean;
  requiresBackgroundCheckConsent: boolean;
  missingInformation: string[];
  reasons: string[];
  rulesEvaluated: EligibilityRuleEvaluation[];
  minAge?: number | null;
  maxAge?: number | null;
  verifiedAge?: number | null;
  hasBackgroundConsent?: boolean;
}

export type ApplicationStatus =
  | 'draft'
  | 'awaiting_approval'
  | 'approved'
  | 'submitting'
  | 'submitted_unverified'
  | 'verified'
  | 'waitlisted'
  | 'rejected'
  | 'failed'
  | 'verification_inconclusive';

export interface ApplicationRecord {
  id: string;
  userId: string;
  eventId: string;
  eventTitle: string;
  organization: string;
  destinationUrl: string;
  status: ApplicationStatus;
  draftVersion: number;
  actionHash: string;
  idempotencyKey: string;
  dataToSubmit: Record<string, any>;
  fieldMapping?: ApplyPilotFieldMapping;
  generatedMotivation?: string;
  approvalTimestamp?: string;
  approvedByUserId?: string;
  verificationEvidence?: string;
  confirmationReference?: string;
  observedStatus?: string;
  lastCheckedAt?: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export type RegistrationWorkflowState =
  | 'draft'
  | 'awaiting_approval'
  | 'approved'
  | 'executing'
  | 'pending_verification'
  | 'confirmed'
  | 'waitlisted'
  | 'failed'
  | 'excluded';

export interface ProposedRegistrationAction {
  proposalId: string;
  version: number;
  actionHash: string;
  idempotencyKey: string;
  opportunityId: string;
  opportunityTitle: string;
  organization: string;
  destinationDomain: string;
  destinationUrl: string;
  volunteerId: string;
  dataToSubmit: {
    fullName: string;
    email: string;
    verifiedAge: number;
    dateOfBirth?: string | null;
    city: string;
    skills: string[];
    availability: string[];
    experienceNotes?: string;
    backgroundCheckConsented: boolean;
    [key: string]: any;
  };
  consentRequirements: {
    type: 'background_check' | 'terms_of_service' | 'liability_waiver';
    description: string;
    consented: boolean;
  }[];
  intendedChanges: string[];
  eligibility: EligibilityResult;
  state: RegistrationWorkflowState;
  preparedAt: string;
  expiresAt: string;
}

export interface RegistrationApprovalRecord {
  approvalId: string;
  proposalId: string;
  proposalVersion: number;
  actionHash: string;
  idempotencyKey: string;
  volunteerId: string;
  approvedAt: string;
  explicitConsentGiven: boolean;
  backgroundCheckConsented: boolean;
  userAgent?: string;
}

export interface VerificationResult {
  status: 'confirmed' | 'waitlisted' | 'pending' | 'failed' | 'unknown';
  registrationId: string;
  observedSourceUrl: string;
  confirmationReference?: string;
  sanitizedEvidence: string;
  verifiedAt: string;
  mismatches: string[];
}

export interface ActionTraceStep {
  step: string;
  timestamp: string;
  status: 'ok' | 'blocked' | 'warning' | 'error';
  detail: string;
}

export interface OfficialTestRun {
  testCaseId: 'TC1' | 'TC2' | 'TC3' | 'TC4';
  scenarioLabel: string;
  inputFixture: {
    volunteer: {
      name: string;
      email: string;
      age: number;
      dateOfBirth?: string;
      city: string;
      skills: string[];
      availability: string[];
      hasBackgroundCheckConsent: boolean;
    };
    opportunity: {
      id: string;
      title: string;
      organization: string;
      minAge: number;
      backgroundCheckRequired: boolean;
      requiredSkills: string[];
      schedule: string[];
      destinationUrl: string;
    };
    testMode: boolean;
    testDestinationLabel?: string;
  };
  expectedResult: string;
  actualResult: string;
  status: 'passed' | 'failed' | 'blocked';
  timestamp: string;
  browserbaseSessionId?: string | null;
  sanitizedEvidence: string;
  observedSourceUrl: string;
  approvedProposalVersion?: number;
  idempotencyKey?: string;
  errorDetails?: string | null;
  actionTrace: ActionTraceStep[];
}

// -------------------------------------------------------------------
// CommitMate — Availability, Schedule Conflict & Reminder Agent Types
// -------------------------------------------------------------------

export interface TimeSlot {
  id?: string;
  day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday' | 'Weekday' | 'Weekend';
  startTime: string; // "09:00"
  endTime: string;   // "13:00"
  label?: string;    // "Morning Shift"
}

export interface VolunteerAvailability {
  timezone: string; // e.g. "Asia/Kolkata" or "America/New_York"
  weeklyHoursTarget: number;
  availableDays: string[];
  timeSlots: TimeSlot[];
  preferredWorkingHours?: {
    start: string;
    end: string;
  };
  bufferMinutesBetweenEvents?: number;
}

export interface ScheduleConflict {
  hasConflict: boolean;
  isIncomplete: boolean; // True if event time is unspecified/flexible
  conflictType?: 'overlap' | 'outside_preferred_hours' | 'outside_available_days' | 'insufficient_buffer';
  severity: 'blocking' | 'warning' | 'info';
  conflictingEventTitle?: string;
  conflictingEventTime?: string;
  conflictingRegistration?: Registration;
  conflictDescription?: string;
  incompleteReason?: string;
  explanation: string;
  suggestedAction?: string;
}

export interface GoogleCalendarConnectionStatus {
  isConnected: boolean;
  userEmail?: string;
  scopes?: string[];
  expiresAt?: number;
  lastSyncedAt?: string;
}

export interface CommitMateReminder {
  id: string;
  userId: string;
  registrationId?: string;
  opportunityId?: string;
  opportunityTitle: string;
  reminderType: '24h' | '1h' | 'custom' | 'test';
  scheduledFor: string;
  status: 'scheduled' | 'delivered' | 'failed' | 'cancelled';
  deliveredAt?: string | null;
  channel: 'in_app' | 'browser' | 'email';
  message: string;
  isRead: boolean;
  createdAt: string;
}

// -------------------------------------------------------------------
// WaitlistGuardian — Intelligent Waitlist & Cancellation Agent Types
// -------------------------------------------------------------------

export type WaitlistMonitoringStatus = 'active' | 'paused' | 'blocked' | 'completed';

export type WaitlistAvailabilityStatus =
  | 'waitlisted_only'
  | 'spot_available'
  | 'event_full'
  | 'event_cancelled'
  | 'registration_closed'
  | 'unknown';

export type WaitlistChangeType =
  | 'spot_available'
  | 'reopened'
  | 'event_full'
  | 'waitlist_closed'
  | 'deadline_passed'
  | 'event_cancelled'
  | 'rescheduled'
  | 'status_unknown';

export interface WaitlistStatusHistoryEntry {
  timestamp: string;
  previousStatus: string;
  newStatus: string;
  reason: string;
  verifiedBy: 'playwright' | 'manual' | 'scheduler';
  evidence?: string;
  sourceUrl?: string;
}

export interface WaitlistNotification {
  id: string;
  userId: string;
  registrationId: string;
  opportunityId: string;
  eventTitle: string;
  changeType: WaitlistChangeType;
  previousStatus?: string;
  newStatus: string;
  message: string;
  sourceUrl?: string;
  verifiedAt: string;
  isRead: boolean;
  actionTaken?: 'pending_review' | 're_registered' | 'dismissed';
  createdAt: string;
}

export interface WaitlistInspectionResult {
  availabilityStatus: WaitlistAvailabilityStatus;
  detectedChange?: WaitlistChangeType;
  spotsCount?: number | null;
  notes: string;
  evidence: string;
  sourceUrl: string;
  verifiedAt: string;
  isBlockedOrCaptcha?: boolean;
  blockReason?: string;
}
