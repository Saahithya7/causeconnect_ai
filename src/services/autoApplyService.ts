import { Opportunity } from '../types';
import { API_BASE_URL } from './supabaseService';
import { supabase } from '../lib/supabase';

export interface AutoApplyResponse {
  success: boolean;
  error?: string;
  alreadyApplied?: boolean;
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

export function prepareAutoApply(opportunity: Opportunity): Promise<AutoApplyResponse> {
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
