import crypto from 'crypto';
import type {
  VolunteerProfile,
  Opportunity,
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
  standardNGOAdapter,
  searchPublicOpportunities
} from './playwrightService.js';
import { isBrowserbaseConfigured } from './browserbaseAgent.js';
import { ensureValidUuid } from '../lib/uuidHelper.js';

// In-memory application storage with Supabase database synchronization
const applicationsStore = new Map<string, ApplicationRecord>();

export function getApplicationById(id: string): ApplicationRecord | null {
  return applicationsStore.get(id) || null;
}

/**
 * Generate tailored motivation statement for the volunteer and event
 */
export function generateTailoredMotivation(
  profile: VolunteerProfile,
  event: { title: string; organization: string }
): string {
  const topSkills = profile.skills && profile.skills.length > 0
    ? profile.skills.slice(0, 3).join(', ')
    : 'community teamwork and problem-solving';
  const cause = profile.preferredCauses && profile.preferredCauses.length > 0
    ? profile.preferredCauses[0]
    : 'community empowerment';

  return `I am eager to contribute as a volunteer for "${event.title}" hosted by ${event.organization}. With practical experience in ${topSkills} and a strong commitment to ${cause}, I look forward to supporting your mission and collaborating effectively with the event team in ${profile.city || 'the local area'}.`;
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
      status: profile.age !== undefined && profile.age !== null ? 'mapped' : 'missing'
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
export async function getProfileByUserId(userId: string): Promise<VolunteerProfile | null> {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    let calculatedAge = data.age || 21;
    if (data.date_of_birth) {
      const birthDate = new Date(data.date_of_birth);
      if (!isNaN(birthDate.getTime())) {
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }
        calculatedAge = age;
      }
    }

    return {
      name: data.full_name || 'Volunteer',
      email: data.email || '',
      age: calculatedAge,
      dateOfBirth: data.date_of_birth || undefined,
      phone: data.phone || undefined,
      educationExperience: data.bio || undefined,
      city: data.location || 'Local Area',
      hasBackgroundCheck: Boolean(data.has_background_check),
      backgroundCheckConsent: Boolean(data.background_check_consent),
      preferredCauses: Array.isArray(data.interests) ? data.interests : ['Community Service'],
      skills: Array.isArray(data.skills) ? data.skills : ['Volunteer Assistance'],
      preferredDays: Array.isArray(data.availability) ? data.availability : ['Saturday', 'Sunday'],
      preferredFormat: 'all',
      maxDistanceMiles: 25,
      bio: data.bio || ''
    };
  } catch (err) {
    console.warn('[ApplicationWorkflow] Supabase profile fetch fallback:', err);
    return null;
  }
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
    overrideProfile?: Partial<VolunteerProfile>;
  } = {}
): Promise<{
  success: boolean;
  application?: ApplicationRecord;
  fieldMapping?: ApplyPilotFieldMapping;
  generatedMotivation?: string;
  eligibility: any;
  missingInformation: string[];
  isIneligible: boolean;
  ineligibilityReason?: string;
  error?: string;
}> {
  // 1. Fetch user's saved profile from database
  let profile = await getProfileByUserId(userId);

  if (!profile && options.overrideProfile) {
    let overrideAge = options.overrideProfile.age || 21;
    if (options.overrideProfile.dateOfBirth) {
      const bDate = new Date(options.overrideProfile.dateOfBirth);
      if (!isNaN(bDate.getTime())) {
        const today = new Date();
        let calculated = today.getFullYear() - bDate.getFullYear();
        const m = today.getMonth() - bDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < bDate.getDate())) {
          calculated--;
        }
        overrideAge = calculated;
      }
    }

    profile = {
      name: options.overrideProfile.name || 'Volunteer',
      email: options.overrideProfile.email || '',
      age: overrideAge,
      dateOfBirth: options.overrideProfile.dateOfBirth,
      phone: options.overrideProfile.phone,
      educationExperience: options.overrideProfile.educationExperience,
      city: options.overrideProfile.city || 'City',
      hasBackgroundCheck: Boolean(options.overrideProfile.hasBackgroundCheck),
      backgroundCheckConsent: Boolean(options.overrideProfile.backgroundCheckConsent),
      preferredCauses: options.overrideProfile.preferredCauses || ['Community Service'],
      skills: options.overrideProfile.skills || ['Communication'],
      preferredDays: options.overrideProfile.preferredDays || ['Saturday', 'Sunday'],
      preferredFormat: 'all',
      maxDistanceMiles: 25,
      bio: options.overrideProfile.bio || ''
    };
  }

  if (!profile) {
    return {
      success: false,
      eligibility: null,
      missingInformation: ['Saved Volunteer Profile'],
      isIneligible: false,
      error: 'Authenticated volunteer profile could not be loaded from Supabase.'
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

  // 4. Duplicate Check: Search existing applications for this user and event
  const existingApp = Array.from(applicationsStore.values()).find(
    (app) => app.userId === userId && app.eventId === event.id
  );

  if (existingApp && (existingApp.status === 'verified' || existingApp.status === 'waitlisted')) {
    return {
      success: false,
      eligibility,
      missingInformation: [],
      isIneligible: false,
      error: `You have already submitted an application for this event (Status: ${existingApp.status}). Duplicate submissions are prevented.`
    };
  }

  // 5. Check Missing Information
  const missingFields: string[] = [];
  if (!profile.name || profile.name.trim().length === 0) missingFields.push('Full Name');
  if (!profile.email || !profile.email.includes('@')) missingFields.push('Valid Email Address');
  if (profile.age === undefined || profile.age === null) missingFields.push('Verified Age or Date of Birth');

  if (missingFields.length > 0) {
    return {
      success: false,
      eligibility,
      missingInformation: missingFields,
      isIneligible: false,
      error: `Please update your profile with missing required information: ${missingFields.join(', ')}`
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
  const applicationId = existingApp?.id || `app_${crypto.randomUUID().slice(0, 16)}`;

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

  applicationsStore.set(applicationId, application);

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
export function approveApplicationWorkflow(
  applicationId: string,
  userId: string,
  approvalInput: {
    expectedVersion: number;
    expectedActionHash: string;
    backgroundCheckConsented?: boolean;
  }
): {
  success: boolean;
  application?: ApplicationRecord;
  error?: string;
} {
  const application = applicationsStore.get(applicationId);

  if (!application) {
    return { success: false, error: 'Application record not found.' };
  }

  // Ownership verification
  if (application.userId !== userId) {
    return { success: false, error: 'Unauthorized: Cannot approve an application belonging to another user.' };
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

  application.status = 'approved';
  application.approvedByUserId = userId;
  application.approvalTimestamp = new Date().toISOString();
  application.updatedAt = new Date().toISOString();

  if (approvalInput.backgroundCheckConsented !== undefined) {
    application.dataToSubmit.backgroundCheckConsented = approvalInput.backgroundCheckConsented;
  }

  return { success: true, application };
}

/**
 * Step 15-17: Execute Application with Playwright & Independent Verification
 */
export async function executeApplicationWorkflow(
  applicationId: string,
  userId: string,
  options: {
    testMode?: boolean;
  } = {}
): Promise<{
  success: boolean;
  application: ApplicationRecord;
  verificationEvidence?: string;
  error?: string;
}> {
  const application = applicationsStore.get(applicationId);

  if (!application) {
    return {
      success: false,
      application: {} as any,
      error: 'Application record not found.'
    };
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

  application.status = 'submitting';
  application.updatedAt = new Date().toISOString();

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
          terms: true
        }
      });
    }, { timeoutMs: 18000 });

    application.status = result.status;
    application.confirmationReference = result.confirmationReference;
    application.verificationEvidence = result.evidenceText;
    application.observedStatus = result.status;
    application.updatedAt = new Date().toISOString();

    // Persist to Supabase registrations table
    try {
      const supabase = getSupabaseServerClient();
      const oppUuid = ensureValidUuid(application.eventId);

      // Ensure opportunity row exists for foreign key constraint
      await supabase.from('opportunities').upsert({
        id: oppUuid,
        title: application.eventTitle,
        organization_name: application.organization,
        source_url: application.destinationUrl
      }, { onConflict: 'id' });

      const regStatus = result.status === 'verified' ? 'confirmed' : result.status;
      const { error: dbErr } = await supabase.from('registrations').upsert({
        user_id: userId,
        opportunity_id: oppUuid,
        status: regStatus,
        confirmation_reference: result.confirmationReference || null,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,opportunity_id' });

      if (dbErr) {
        console.error('[ApplicationWorkflow] Database registration insertion error:', dbErr.message);
      }
    } catch (dbErr: any) {
      console.error('[ApplicationWorkflow] Database registration insertion exception:', dbErr?.message);
    }

    return {
      success: true,
      application,
      verificationEvidence: result.evidenceText
    };
  } catch (err: any) {
    application.status = 'failed';
    application.error = err?.message || 'Automation submission failed';
    application.updatedAt = new Date().toISOString();

    return {
      success: false,
      application,
      error: err?.message || 'Failed to submit application'
    };
  }
}

/**
 * Step 16: Independent Verification Routine
 */
export async function verifyApplicationWorkflow(
  applicationId: string,
  userId: string
): Promise<{
  success: boolean;
  application: ApplicationRecord;
  verified: boolean;
  evidence: string;
  error?: string;
}> {
  const application = applicationsStore.get(applicationId);

  if (!application) {
    return {
      success: false,
      application: {} as any,
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

  try {
    const verification = await withPlaywrightPage(async (page) => {
      return await standardNGOAdapter.verify(page, application);
    }, { timeoutMs: 15000 });

    application.status = verification.status;
    application.verificationEvidence = verification.evidence;
    application.observedStatus = verification.status;
    application.lastCheckedAt = new Date().toISOString();
    application.updatedAt = new Date().toISOString();

    return {
      success: true,
      application,
      verified: verification.verified,
      evidence: verification.evidence
    };
  } catch (err: any) {
    return {
      success: false,
      application,
      verified: false,
      evidence: 'Verification inconclusive due to destination connectivity notice.',
      error: err?.message
    };
  }
}
