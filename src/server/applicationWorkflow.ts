import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  VolunteerProfile,
  ApplicationStatus,
  ApplicationRecord,
  ApplyPilotFieldMapping
} from '../types/index.js';
import { getSupabaseServerClient } from './supabaseServer.js';
import {
  evaluateEligibility,
  computeActionHash,
  generateIdempotencyKey
} from './registrationAgent.js';
import {
  withPlaywrightPage,
  standardNGOAdapter
} from './playwrightService.js';
import { isValidUuid } from '../lib/uuidHelper.js';

const AUTO_APPLY_DETAILS_KEY = '__causeconnect_auto_apply';

function applicationFromRow(row: Record<string, any>): ApplicationRecord {
  const approvalDetails = row.approval_details && typeof row.approval_details === 'object'
    ? row.approval_details
    : {};
  const workflow = approvalDetails[AUTO_APPLY_DETAILS_KEY] || {};

  return {
    id: row.id,
    userId: row.user_id,
    eventId: row.opportunity_id,
    eventTitle: workflow.eventTitle || '',
    organization: workflow.organization || '',
    destinationUrl: workflow.destinationUrl || '',
    status: (workflow.status || row.status) as ApplicationStatus,
    draftVersion: workflow.draftVersion || 1,
    actionHash: workflow.actionHash || '',
    idempotencyKey: workflow.idempotencyKey || '',
    dataToSubmit: workflow.dataToSubmit || {},
    fieldMapping: workflow.fieldMapping,
    generatedMotivation: workflow.generatedMotivation,
    approvalTimestamp: row.user_approved_at || undefined,
    approvedByUserId: row.user_approved_at ? row.user_id : undefined,
    verificationEvidence: row.outcome_evidence?.evidence || undefined,
    confirmationReference: row.confirmation_reference || undefined,
    observedStatus: row.outcome_evidence?.observedStatus || undefined,
    lastCheckedAt: workflow.lastCheckedAt || undefined,
    error: row.error_message || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function persistApplication(application: ApplicationRecord, client: SupabaseClient): Promise<void> {
  const { data: existing, error: lookupError } = await client
    .from('registrations')
    .select('id, approval_details')
    .eq('id', application.id)
    .eq('user_id', application.userId)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Failed to load registration ${application.id}: ${lookupError.message}`);
  }

  const approvalDetails = existing?.approval_details && typeof existing.approval_details === 'object'
    ? existing.approval_details
    : {};
  const registrationStatus = application.status === 'verified'
    ? 'confirmed'
    : application.status === 'waitlisted'
      ? 'waitlisted'
      : 'pending_approval';
  const verifiedOutcome = application.status === 'verified' || application.status === 'waitlisted';
  if (verifiedOutcome && !application.verificationEvidence?.trim()) {
    throw new Error('A registration cannot be marked successful without verified source evidence.');
  }
  const payload = {
    user_id: application.userId,
    opportunity_id: application.eventId,
    status: registrationStatus,
    user_approved_at: application.approvalTimestamp || null,
    approval_details: {
      ...approvalDetails,
      [AUTO_APPLY_DETAILS_KEY]: {
        status: application.status,
        eventTitle: application.eventTitle,
        organization: application.organization,
        destinationUrl: application.destinationUrl,
        draftVersion: application.draftVersion,
        actionHash: application.actionHash,
        idempotencyKey: application.idempotencyKey,
        dataToSubmit: application.dataToSubmit,
        fieldMapping: application.fieldMapping,
        generatedMotivation: application.generatedMotivation,
        lastCheckedAt: application.lastCheckedAt
      }
    },
    confirmation_reference: verifiedOutcome ? application.confirmationReference || null : null,
    outcome_evidence: {
      evidence: application.verificationEvidence || null,
      observedStatus: application.observedStatus || null
    },
    submitted_at: verifiedOutcome ? application.updatedAt : null,
    confirmed_at: application.status === 'verified' ? application.updatedAt : null,
    error_message: application.error || null,
    updated_at: application.updatedAt
  };

  const { data: saved, error } = existing
    ? await client.from('registrations').update(payload)
        .eq('id', application.id)
        .eq('user_id', application.userId)
        .select('id')
        .maybeSingle()
    : await client.from('registrations').insert({
        id: application.id,
        ...payload,
        created_at: application.createdAt
      }).select('id').maybeSingle();

  if (error) {
    throw new Error(`Failed to persist application review in registrations: ${error.message}`);
  }
  if (!saved) {
    throw new Error(`Registration ${application.id} was not saved for the authenticated user.`);
  }
}

export async function getApplicationById(
  id: string,
  client: SupabaseClient
): Promise<ApplicationRecord | null> {
  const { data, error } = await client
    .from('registrations')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load registration ${id}: ${error.message}`);
  }
  if (!data) return null;
  const application = applicationFromRow(data);
  return application;
}

/**
 * Generate tailored motivation statement for the volunteer and event
 */
export function generateTailoredMotivation(
  profile: VolunteerProfile,
  event: { title: string; organization: string }
): string {
  const details = [
    profile.skills?.length ? `My profile lists these skills: ${profile.skills.slice(0, 3).join(', ')}.` : '',
    profile.preferredCauses?.length ? `I am interested in ${profile.preferredCauses[0]}.` : '',
    profile.city ? `I am based in ${profile.city}.` : ''
  ].filter(Boolean);

  return [
    `I am interested in volunteering for "${event.title}" with ${event.organization}.`,
    ...details
  ].join(' ');
}

/**
 * Construct ApplyPilot detected field mapping
 */
export function buildApplyPilotFieldMapping(
  profile: VolunteerProfile,
  event: {
    title: string;
    organization: string;
    backgroundCheckRequired?: boolean;
    requiredSkills?: string[];
  },
  motivationStatement: string
): ApplyPilotFieldMapping {
  return {
    fullName: {
      field: 'Full Name / Legal Name',
      value: profile.name,
      status: profile.name && profile.name.trim().length > 0 ? 'mapped' : 'missing'
    },
    email: {
      field: 'Email Address',
      value: profile.email,
      status: profile.email && profile.email.includes('@') ? 'mapped' : 'missing'
    },
    phone: {
      field: 'Phone Number',
      value: profile.phone,
      status: profile.phone ? 'mapped' : 'optional'
    },
    age: {
      field: 'Age Verification / DOB',
      value: profile.age,
      status: profile.age > 0 ? 'mapped' : 'missing'
    },
    city: {
      field: 'Residential Location / City',
      value: profile.city,
      status: profile.city ? 'mapped' : 'optional'
    },
    skills: {
      field: 'Skills & Capabilities',
      value: profile.skills,
      status: profile.skills && profile.skills.length > 0 ? 'mapped' : 'optional'
    },
    experience: {
      field: 'Relevant Experience / Bio',
      value: profile.educationExperience || profile.bio,
      status: (profile.educationExperience || profile.bio) ? 'mapped' : 'optional'
    },
    availability: {
      field: 'Volunteer Schedule Availability',
      value: profile.preferredDays,
      status: profile.preferredDays && profile.preferredDays.length > 0 ? 'mapped' : 'optional'
    },
    motivationStatement: {
      field: 'Statement of Interest & Purpose',
      value: motivationStatement,
      isGenerated: true,
      userReviewed: false
    },
    unsupportedFields: [],
    requiresConsentFor: [
      ...(event.backgroundCheckRequired ? ['Background check verification'] : []),
      'Volunteer liability & code of conduct acknowledgment'
    ]
  };
}

/**
 * Fetch profile from Supabase profiles table
 */
export async function getProfileByUserId(
  userId: string,
  client: SupabaseClient = getSupabaseServerClient()
): Promise<VolunteerProfile | null> {
  const { data, error } = await client
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load volunteer profile: ${error.message}`);
  }
  if (!data) return null;

  let calculatedAge = 0;
  if (data.date_of_birth) {
    const birthDate = new Date(`${data.date_of_birth}T00:00:00`);
    if (!Number.isNaN(birthDate.getTime())) {
      const today = new Date();
      calculatedAge = today.getFullYear() - birthDate.getFullYear();
      if (
        today.getMonth() < birthDate.getMonth() ||
        (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate())
      ) {
        calculatedAge--;
      }
      if (calculatedAge < 0) calculatedAge = 0;
    }
  }

  return {
    name: data.full_name || '',
    email: data.email || '',
    age: calculatedAge,
    dateOfBirth: data.date_of_birth || undefined,
    phone: data.phone || undefined,
    educationExperience: data.education_experience || data.bio || undefined,
    city: data.location || '',
    hasBackgroundCheck: Boolean(data.has_background_check),
    backgroundCheckConsent: Boolean(data.background_check_consent),
    preferredCauses: Array.isArray(data.interests) ? data.interests : [],
    skills: Array.isArray(data.skills) ? data.skills : [],
    preferredDays: Array.isArray(data.availability) ? data.availability : [],
    preferredFormat: 'all',
    maxDistanceMiles: 25,
    bio: data.bio || ''
  };
}

/**
 * Update profile in Supabase profiles table
 */
export async function updateProfileByUserId(
  userId: string,
  updates: Partial<VolunteerProfile>
): Promise<{ success: boolean; profile?: VolunteerProfile; error?: string }> {
  try {
    const supabase = getSupabaseServerClient();

    const payload: Record<string, any> = {
      updated_at: new Date().toISOString()
    };

    if (updates.name !== undefined) payload.full_name = updates.name;
    if (updates.email !== undefined) payload.email = updates.email;
    if (updates.city !== undefined) payload.location = updates.city;
    if (updates.bio !== undefined) payload.bio = updates.bio;
    if (updates.skills !== undefined) payload.skills = updates.skills;
    if (updates.preferredCauses !== undefined) payload.interests = updates.preferredCauses;
    if (updates.preferredDays !== undefined) payload.availability = updates.preferredDays;
    if (updates.phone !== undefined) payload.phone = updates.phone;
    if (updates.dateOfBirth !== undefined) payload.date_of_birth = updates.dateOfBirth;
    if (updates.educationExperience !== undefined) payload.education_experience = updates.educationExperience;
    if (updates.hasBackgroundCheck !== undefined) payload.has_background_check = updates.hasBackgroundCheck;
    if (updates.backgroundCheckConsent !== undefined) payload.background_check_consent = updates.backgroundCheckConsent;

    const { error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('user_id', userId);

    if (error) {
      return { success: false, error: error.message };
    }

    const refreshed = await getProfileByUserId(userId);
    return { success: true, profile: refreshed || undefined };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to update profile in database' };
  }
}

/**
 * Step 1-11: Prepare Auto Apply Draft Application
 */
export async function prepareApplicationWorkflow(
  userId: string,
  event: {
    id: string;
    title: string;
    organization: string;
    destinationUrl: string;
    minAge?: number;
    maxAge?: number;
    backgroundCheckRequired?: boolean;
    requiredSkills?: string[];
    schedule?: string[];
    applicationDeadline?: string;
    isOpen?: boolean;
  },
  options: {
    userNotes?: string;
  } = {},
  client: SupabaseClient
): Promise<{
  success: boolean;
  application?: ApplicationRecord;
  alreadyApplied?: boolean;
  fieldMapping?: ApplyPilotFieldMapping;
  generatedMotivation?: string;
  eligibility: any;
  missingInformation: string[];
  isIneligible: boolean;
  ineligibilityReason?: string;
  error?: string;
}> {
  if (!isValidUuid(event.id)) {
    return {
      success: false,
      eligibility: null,
      missingInformation: [],
      isIneligible: false,
      error: 'This listing has no matching persisted opportunity UUID. Continue on the original source website; no registration was created.'
    };
  }

  // 1. Fetch user's saved profile from database
  const profile = await getProfileByUserId(userId, client);

  if (!profile) {
    return {
      success: false,
      eligibility: null,
      missingInformation: ['Saved Volunteer Profile'],
      isIneligible: false,
      error: 'Authenticated volunteer profile could not be loaded from Supabase.'
    };
  }

  const { data: existingRegistrationRow, error: existingRegistrationError } = await client
    .from('registrations')
    .select('*')
    .eq('user_id', userId)
    .eq('opportunity_id', event.id)
    .maybeSingle();

  if (existingRegistrationError) {
    throw new Error(`Failed to check existing registrations: ${existingRegistrationError.message}`);
  }

  const existingWorkflow = existingRegistrationRow?.approval_details?.[AUTO_APPLY_DETAILS_KEY];
  const existingApp = existingWorkflow ? applicationFromRow(existingRegistrationRow) : null;
  if (existingRegistrationRow && !existingApp) {
    return {
      success: false,
      alreadyApplied: true,
      eligibility: null,
      missingInformation: [],
      isIneligible: false,
      error: `A registration already exists for this event (Status: ${existingRegistrationRow.status || 'recorded'}). Duplicate attempts are prevented.`
    };
  }

  if (existingApp && existingApp.status !== 'draft' && existingApp.status !== 'awaiting_approval') {
    return {
      success: false,
      application: existingApp,
      alreadyApplied: true,
      eligibility: null,
      missingInformation: [],
      isIneligible: false,
      error: `An application record already exists for this event (Status: ${existingApp.status}). Duplicate attempts are prevented.`
    };
  }

  // 2. Check Event Deadline & Open Status
  if (event.isOpen === false) {
    return {
      success: false,
      eligibility: null,
      missingInformation: [],
      isIneligible: true,
      ineligibilityReason: 'This volunteer opportunity is currently closed for applications.',
      error: 'Opportunity intake is closed.'
    };
  }

  if (event.applicationDeadline) {
    const deadlineDate = new Date(event.applicationDeadline);
    if (!isNaN(deadlineDate.getTime()) && deadlineDate.getTime() < Date.now()) {
      return {
        success: false,
        eligibility: null,
        missingInformation: [],
        isIneligible: true,
        ineligibilityReason: `Application deadline (${event.applicationDeadline}) has passed.`,
        error: 'Application deadline has passed.'
      };
    }
  }

  // 3. Deterministic Eligibility Check
  const eligibility = evaluateEligibility(
    {
      age: profile.age,
      dateOfBirth: profile.dateOfBirth,
      skills: profile.skills,
      preferredDays: profile.preferredDays,
      backgroundCheckConsent: profile.backgroundCheckConsent
    },
    {
      minAge: event.minAge,
      maxAge: event.maxAge,
      backgroundCheckRequired: event.backgroundCheckRequired,
      requiredSkills: event.requiredSkills,
      schedule: event.schedule
    }
  );

  // If applicant is hard disqualified by deterministic rules (e.g. below minimum age)
  if (eligibility.status === 'Ineligible') {
    return {
      success: false,
      eligibility,
      missingInformation: [],
      isIneligible: true,
      ineligibilityReason: eligibility.reasons.join(' '),
      error: `Ineligible: ${eligibility.reasons.join(' ')}`
    };
  }

  // 5. Check Missing Information
  const missingFields: string[] = [...eligibility.missingInformation];
  if (!profile.name || profile.name.trim().length === 0) missingFields.push('Full Name');
  if (!profile.email || !profile.email.includes('@')) missingFields.push('Valid Email Address');
  if (!profile.age || profile.age <= 0) missingFields.push('Verified Age or Date of Birth');

  const uniqueMissingFields = [...new Set(missingFields)];

  if (uniqueMissingFields.length > 0) {
    return {
      success: false,
      eligibility,
      missingInformation: uniqueMissingFields,
      isIneligible: false,
      error: `Please update your profile with missing required information: ${uniqueMissingFields.join(', ')}`
    };
  }

  // 6. Build Proposal Payload, Tailored Motivation & Cryptographic Action Hash
  const draftVersion = existingApp ? existingApp.draftVersion + 1 : 1;
  const motivationStatement = generateTailoredMotivation(profile, event);
  const fieldMapping = buildApplyPilotFieldMapping(profile, event, motivationStatement);

  const dataToSubmit = {
    fullName: profile.name,
    email: profile.email,
    verifiedAge: profile.age,
    dateOfBirth: profile.dateOfBirth || null,
    phone: profile.phone || null,
    city: profile.city,
    skills: profile.skills,
    availability: profile.preferredDays,
    educationExperience: profile.educationExperience || profile.bio || null,
    userNotes: options.userNotes || motivationStatement,
    backgroundCheckConsented: Boolean(profile.backgroundCheckConsent)
  };

  const actionHash = computeActionHash(dataToSubmit);
  const idempotencyKey = generateIdempotencyKey(userId, event.id, draftVersion);
  const applicationId = existingApp?.id || crypto.randomUUID();

  const application: ApplicationRecord = {
    id: applicationId,
    userId,
    eventId: event.id,
    eventTitle: event.title,
    organization: event.organization,
    destinationUrl: event.destinationUrl,
    status: eligibility.status === 'Awaiting consent' ? 'awaiting_approval' : 'draft',
    draftVersion,
    actionHash,
    idempotencyKey,
    dataToSubmit,
    fieldMapping,
    generatedMotivation: motivationStatement,
    createdAt: existingApp?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  try {
    await persistApplication(application, client);
  } catch (err: any) {
    return {
      success: false,
      eligibility,
      missingInformation: [],
      isIneligible: false,
      error: err?.message || 'Failed to save the application draft.'
    };
  }

  return {
    success: true,
    application,
    fieldMapping,
    generatedMotivation: motivationStatement,
    eligibility,
    missingInformation: [],
    isIneligible: false
  };
}

/**
 * Step 13-14: Explicit User Approval
 */
export async function approveApplicationWorkflow(
  applicationId: string,
  userId: string,
  approvalInput: {
    expectedVersion: number;
    expectedActionHash: string;
    backgroundCheckConsented?: boolean;
  },
  client: SupabaseClient
): Promise<{
  success: boolean;
  application?: ApplicationRecord;
  error?: string;
}> {
  const application = await getApplicationById(applicationId, client);

  if (!application) {
    return { success: false, error: 'Application record not found.' };
  }

  // Ownership verification
  if (application.userId !== userId) {
    return { success: false, error: 'Unauthorized: Cannot approve an application belonging to another user.' };
  }

  if (application.status !== 'draft' && application.status !== 'awaiting_approval') {
    return {
      success: false,
      error: `Application cannot be approved from state "${application.status}".`
    };
  }

  // Verify unchanged draft version and payload action hash
  if (application.draftVersion !== approvalInput.expectedVersion) {
    return {
      success: false,
      error: `Proposal version mismatch: Application is on version ${application.draftVersion}, but approval requested version ${approvalInput.expectedVersion}. Please review the updated draft.`
    };
  }

  if (application.actionHash !== approvalInput.expectedActionHash) {
    return {
      success: false,
      error: 'Action hash mismatch: Application payload has changed since review. Re-approval required.'
    };
  }

  const approvedApplication: ApplicationRecord = {
    ...application,
    status: 'approved',
    approvedByUserId: userId,
    approvalTimestamp: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    dataToSubmit: { ...application.dataToSubmit }
  };

  if (approvalInput.backgroundCheckConsented !== undefined) {
    approvedApplication.dataToSubmit.backgroundCheckConsented = approvalInput.backgroundCheckConsented;
    approvedApplication.actionHash = computeActionHash(approvedApplication.dataToSubmit);
  }

  try {
    await persistApplication(approvedApplication, client);
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to persist application approval.'
    };
  }

  return { success: true, application: approvedApplication };
}

/**
 * Step 15-17: Execute Application with Playwright & Independent Verification
 */
export async function executeApplicationWorkflow(
  applicationId: string,
  userId: string,
  client: SupabaseClient,
  _options: { testMode?: boolean } = {}
): Promise<{
  success: boolean;
  application?: ApplicationRecord;
  verificationEvidence?: string;
  error?: string;
}> {
  const application = await getApplicationById(applicationId, client);

  if (!application) {
    return { success: false, error: 'Application record not found.' };
  }

  // Ownership verification
  if (application.userId !== userId) {
    return {
      success: false,
      application,
      error: 'Unauthorized: Cannot execute an application belonging to another user.'
    };
  }

  // Must have explicit approval
  if (application.status !== 'approved') {
    return {
      success: false,
      application,
      error: `Application cannot be executed in state "${application.status}". Explicit user approval is required.`
    };
  }

  if (!application.approvalTimestamp) {
    return {
      success: false,
      application,
      error: 'Explicit user approval is required before opening the source listing.'
    };
  }
  const submittingApplication = application;

  try {
    const profile: VolunteerProfile = {
      name: application.dataToSubmit.fullName,
      email: application.dataToSubmit.email,
      age: application.dataToSubmit.verifiedAge,
      dateOfBirth: application.dataToSubmit.dateOfBirth,
      phone: application.dataToSubmit.phone,
      educationExperience: application.dataToSubmit.educationExperience,
      city: application.dataToSubmit.city,
      hasBackgroundCheck: Boolean(application.dataToSubmit.backgroundCheckConsented),
      backgroundCheckConsent: Boolean(application.dataToSubmit.backgroundCheckConsented),
      preferredCauses: [],
      skills: application.dataToSubmit.skills,
      preferredDays: application.dataToSubmit.availability,
      preferredFormat: 'all',
      maxDistanceMiles: 25,
      bio: application.dataToSubmit.userNotes || ''
    };

    // Execute via Playwright
    const result = await withPlaywrightPage(async (page) => {
      return await standardNGOAdapter.submit(page, {
        profile,
        event: {
          id: application.eventId,
          title: application.eventTitle,
          organization: application.organization,
          destinationUrl: application.destinationUrl
        },
        consents: {
          backgroundCheck: Boolean(application.dataToSubmit.backgroundCheckConsented),
          terms: false
        }
      });
    }, { timeoutMs: 18000 });

    const updatedApplication: ApplicationRecord = {
      ...submittingApplication,
      status: result.status,
      confirmationReference: result.confirmationReference,
      verificationEvidence: result.evidenceText,
      observedStatus: result.status,
      updatedAt: new Date().toISOString()
    };
    await persistApplication(updatedApplication, client);
    const awaitingManualConfirmation = result.status === 'verification_inconclusive';
    return {
      success: !awaitingManualConfirmation,
      application: updatedApplication,
      verificationEvidence: result.evidenceText,
      ...(awaitingManualConfirmation && { error: result.evidenceText })
    };
  } catch (err: any) {
    const failedApplication: ApplicationRecord = {
      ...submittingApplication,
      status: 'failed',
      error: err?.message || 'Playwright could not open the destination.',
      updatedAt: new Date().toISOString()
    };

    try {
      await persistApplication(failedApplication, client);
    } catch (dbError: any) {
      return {
        success: false,
        application: submittingApplication,
        error: `${err?.message || 'Playwright could not open the destination.'} Application status could not be saved: ${dbError?.message || dbError}`
      };
    }

    return {
      success: false,
      application: failedApplication,
      error: failedApplication.error
    };
  }
}

/**
 * Step 16: Independent Verification Routine
 */
export async function verifyApplicationWorkflow(
  applicationId: string,
  userId: string,
  client: SupabaseClient
): Promise<{
  success: boolean;
  application?: ApplicationRecord;
  verified: boolean;
  evidence: string;
  error?: string;
}> {
  const application = await getApplicationById(applicationId, client);

  if (!application) {
    return {
      success: false,
      verified: false,
      evidence: '',
      error: 'Application not found'
    };
  }

  if (application.userId !== userId) {
    return {
      success: false,
      application,
      verified: false,
      evidence: '',
      error: 'Unauthorized access to application verification'
    };
  }

  if (application.status !== 'submitted_unverified') {
    return {
      success: false,
      application,
      verified: false,
      evidence: '',
      error: `Verification is unavailable for application state "${application.status}". A verified submission attempt is required.`
    };
  }

  try {
    const verification = await withPlaywrightPage(async (page) => {
      return await standardNGOAdapter.verify(page, application);
    }, { timeoutMs: 15000 });

    const updatedApplication: ApplicationRecord = {
      ...application,
      status: verification.status,
      verificationEvidence: verification.evidence,
      observedStatus: verification.status,
      confirmationReference: verification.verified ? verification.referenceNumber : undefined,
      lastCheckedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      await persistApplication(updatedApplication, client);
    } catch (err: any) {
      const inconclusiveApplication: ApplicationRecord = {
        ...updatedApplication,
        status: 'verification_inconclusive',
        confirmationReference: undefined,
        verificationEvidence: `Confirmation was observed, but the result could not be saved: ${err?.message || err}`,
        observedStatus: 'verification_inconclusive',
        updatedAt: new Date().toISOString()
      };

      try {
        await persistApplication(inconclusiveApplication, client);
      } catch (persistError: any) {
        return {
          success: false,
          application: inconclusiveApplication,
          verified: false,
          evidence: inconclusiveApplication.verificationEvidence || '',
          error: `Failed to persist verification: ${persistError?.message || persistError}`
        };
      }
      return {
        success: false,
        application: inconclusiveApplication,
        verified: false,
        evidence: inconclusiveApplication.verificationEvidence || '',
        error: inconclusiveApplication.verificationEvidence
      };
    }

    return {
      success: true,
      application: updatedApplication,
      verified: verification.verified,
      evidence: verification.evidence
    };
  } catch (err: any) {
    const inconclusiveApplication: ApplicationRecord = {
      ...application,
      status: 'verification_inconclusive',
      confirmationReference: undefined,
      verificationEvidence: `Verification could not be completed: ${err?.message || err}`,
      observedStatus: 'verification_inconclusive',
      lastCheckedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    try {
      await persistApplication(inconclusiveApplication, client);
    } catch (persistError: any) {
      return {
        success: false,
        application: inconclusiveApplication,
        verified: false,
        evidence: inconclusiveApplication.verificationEvidence || '',
        error: `Verification failed and its status could not be saved: ${persistError?.message || persistError}`
      };
    }
    return {
      success: true,
      application: inconclusiveApplication,
      verified: false,
      evidence: inconclusiveApplication.verificationEvidence || '',
      error: err?.message
    };
  }
}
