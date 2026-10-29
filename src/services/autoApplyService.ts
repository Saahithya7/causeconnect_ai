import type { BrowserbaseOpportunity, Opportunity } from '../types';
import { API_BASE_URL } from './supabaseService';
import { supabase } from '../lib/supabase';

export interface AutoApplyResponse {
  success: boolean;
  error?: string;
  manualRequired?: boolean;
  alreadyApplied?: boolean;
  formReview?: {
    sessionId: string;
    organization: string;
    sourceUrl: string;
    applicationUrl: string;
    fields: Array<{ id: number; label: string; value: string; required: boolean }>;
    missingRequiredFields: Array<{
      id: number;
      label: string;
      kind: 'text' | 'select' | 'checkbox' | 'radio' | 'unsupported';
      message?: string;
    }>;
    blockedReason?: string;
    completedStages: string[];
    expiresAt: string;
  };
  formReviewUpdate?: {
    fields: Array<{ id: number; label: string; value: string; required: boolean }>;
    missingRequiredFields: Array<{
      id: number;
      label: string;
      kind: 'text' | 'select' | 'checkbox' | 'radio' | 'unsupported';
      message?: string;
    }>;
  };
  result?: {
    submitted: boolean;
    verified: boolean;
    evidence: string;
    applicationUrl: string;
  };
  sourceUrl?: string;
  application?: {
    id: string;
    status: string;
    draftVersion: number;
    actionHash: string;
    dataToSubmit: Record<string, unknown>;
    destinationUrl: string;
    eventTitle: string;
    organization: string;
    fieldMapping?: Record<string, { field: string; value?: unknown; status?: string }>;
    generatedMotivation?: string;
    verificationEvidence?: string;
  };
  eligibility?: {
    status?: string;
    reasons?: string[];
    missingInformation?: string[];
    requiresBackgroundCheckConsent?: boolean;
  } | null;
  missingInformation?: string[];
  isIneligible?: boolean;
  ineligibilityReason?: string;
}

export type AutoApplyOpportunity = Opportunity | BrowserbaseOpportunity;

export class AutoApplyRequestError extends Error {
  constructor(
    message: string,
    readonly response?: AutoApplyResponse
  ) {
    super(message);
    this.name = 'AutoApplyRequestError';
  }
}

async function postAutoApply(path: string, body: Record<string, unknown>): Promise<AutoApplyResponse> {
  if (!supabase) {
    throw new AutoApplyRequestError('Sign in to CauseConnect before using Apply with AI.');
  }

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw new AutoApplyRequestError(`Could not verify your session: ${sessionError.message}`);
  }
  if (!session?.access_token) {
    throw new AutoApplyRequestError('Your session has expired. Sign in again to continue.');
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify(body)
    });
  } catch {
    throw new AutoApplyRequestError('The application service could not be reached. No application was submitted.');
  }

  let payload: AutoApplyResponse;
  try {
    payload = await response.json() as AutoApplyResponse;
  } catch {
    throw new AutoApplyRequestError(`The application service returned an invalid response (HTTP ${response.status}).`);
  }

  if (!response.ok || !payload.success) {
    throw new AutoApplyRequestError(
      payload.error || `The application request failed (HTTP ${response.status}).`,
      payload
    );
  }
  return payload;
}

function isLiveListing(opportunity: AutoApplyOpportunity): opportunity is BrowserbaseOpportunity {
  return 'event_name' in opportunity;
}

export function isValidLiveListingUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      (url.hostname === 'idealist.org' || url.hostname.endsWith('.idealist.org')) &&
      /^\/en\/volunteer-opportunity\//.test(url.pathname);
  } catch {
    return false;
  }
}

export function canReviewLiveListing(opportunity: BrowserbaseOpportunity): boolean {
  return Boolean(
    (opportunity.title || opportunity.event_name).trim() &&
    (opportunity.organization || opportunity.organizer_name).trim() &&
    isValidLiveListingUrl(opportunity.source_url)
  );
}

export function hasLiveEligibilityInformation(opportunity: BrowserbaseOpportunity): boolean {
  return Boolean(
    opportunity.eligibility?.trim() ||
    opportunity.required_skills.length > 0 ||
    opportunity.min_age != null ||
    opportunity.max_age != null ||
    opportunity.background_check_required != null
  );
}

export function hasStructuredLiveEligibility(opportunity: BrowserbaseOpportunity): boolean {
  return Boolean(
    opportunity.required_skills.length > 0 ||
    opportunity.min_age != null ||
    opportunity.max_age != null ||
    opportunity.background_check_required != null
  );
}

export async function prepareAutoApply(opportunity: AutoApplyOpportunity): Promise<AutoApplyResponse> {
  if (isLiveListing(opportunity)) {
    const destinationUrl = opportunity.source_url;
    if (!canReviewLiveListing(opportunity) || !destinationUrl) {
      throw new AutoApplyRequestError(
        'This live listing cannot be reviewed because its title, organization, or valid Idealist listing URL is missing.'
      );
    }

    return postAutoApply('/api/applications/live/review-form', {
      sourceUrl: destinationUrl,
      organization: opportunity.organization || opportunity.organizer_name
    });
  }

  return postAutoApply('/api/applications/prepare', {
    event: {
      id: opportunity.id,
      title: opportunity.title,
      organization: opportunity.organization,
      destinationUrl: opportunity.sourceUrl,
      minAge: opportunity.minAge,
      backgroundCheckRequired: opportunity.backgroundCheck === 'required',
      requiredSkills: opportunity.skills,
      schedule: opportunity.daysOfWeek
    }
  });
}

export function fillLiveFormMissingFields(
  sessionId: string,
  values: Array<{ id: number; value: string }>
): Promise<AutoApplyResponse> {
  return postAutoApply(`/api/applications/live/${encodeURIComponent(sessionId)}/fill-missing`, { values });
}

export function submitLiveApplication(sessionId: string): Promise<AutoApplyResponse> {
  return postAutoApply(`/api/applications/live/${encodeURIComponent(sessionId)}/submit`, { confirmed: true });
}

export function cancelLiveFormReview(sessionId: string): Promise<AutoApplyResponse> {
  return postAutoApply(`/api/applications/live/${encodeURIComponent(sessionId)}/cancel`, {});
}

export function approveAutoApply(
  applicationId: string,
  expectedVersion: number,
  expectedActionHash: string,
  backgroundCheckConsented: boolean
): Promise<AutoApplyResponse> {
  return postAutoApply(`/api/applications/${encodeURIComponent(applicationId)}/approve`, {
    expectedVersion,
    expectedActionHash,
    backgroundCheckConsented
  });
}

export function executeAutoApply(applicationId: string): Promise<AutoApplyResponse> {
  return postAutoApply(`/api/applications/${encodeURIComponent(applicationId)}/execute`, {});
}
