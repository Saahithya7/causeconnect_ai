import type {
  VolunteerProfile,
  Opportunity,
  EligibilityResult,
  ProposedRegistrationAction,
  RegistrationApprovalRecord,
  VerificationResult,
  OfficialTestRun,
  ActionTraceStep,
  ApplicationRecord,
  ApplyPilotFieldMapping
} from '../types';

/**
 * Dynamic API Base URL for detached frontend deployments (e.g. Vercel)
 */
export const API_BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
  ? String(import.meta.env.VITE_API_BASE_URL).replace(/\/$/, '')
  : '');

/**
 * Helper to build auth headers
 */
function getAuthHeaders(token?: string | null, userId?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (userId) {
    headers['x-user-id'] = userId;
  }
  return headers;
}

/**
 * Health check
 */
export async function getBackendHealth(): Promise<{ status: string; browserAutomation: string; version: string }> {
  const res = await fetch(`${API_BASE_URL}/health`);
  return res.json();
}

/**
 * Retrieve single application record by ID
 */
export async function getApplicationRecord(
  applicationId: string,
  token?: string | null,
  userId?: string | null
): Promise<{ success: boolean; application?: ApplicationRecord; error?: string }> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/applications/${applicationId}`, {
      headers: getAuthHeaders(token, userId)
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to fetch application record' };
  }
}

/**
 * Fetch authenticated profile from backend
 */
export async function getAuthenticatedProfile(
  token?: string | null,
  userId?: string | null
): Promise<{ success: boolean; profile?: VolunteerProfile | null; error?: string }> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/profile/me`, {
      headers: getAuthHeaders(token, userId)
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to fetch profile from server' };
  }
}

/**
 * Update authenticated profile on backend
 */
export async function updateAuthenticatedProfile(
  updates: Partial<VolunteerProfile>,
  token?: string | null,
  userId?: string | null
): Promise<{ success: boolean; profile?: VolunteerProfile; error?: string }> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/profile/me`, {
      method: 'PATCH',
      headers: getAuthHeaders(token, userId),
      body: JSON.stringify(updates)
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to update profile' };
  }
}

/**
 * Search volunteer opportunities using Playwright
 */
export async function searchPlaywrightEvents(params: {
  location: string;
  interests?: string[];
  preferredDates?: string;
  maxResults?: number;
}): Promise<{
  success: boolean;
  opportunities: any[];
  sourceSummary?: string;
  checkedAt?: string;
  error?: string;
}> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/events/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, opportunities: [], error: err?.message || 'Search request failed' };
  }
}

/**
 * Auto-Apply Step 1-11: Prepare application draft
 */
export async function prepareAutoApplication(
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
  },
  options: {
    userNotes?: string;
    overrideProfile?: Partial<VolunteerProfile>;
  } = {},
  token?: string | null,
  userId?: string | null
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
  try {
    const res = await fetch(`${API_BASE_URL}/api/applications/prepare`, {
      method: 'POST',
      headers: getAuthHeaders(token, userId),
      body: JSON.stringify({ event, ...options })
    });
    return await res.json();
  } catch (err: any) {
    return {
      success: false,
      eligibility: null,
      missingInformation: [],
      isIneligible: false,
      error: err?.message || 'Failed to prepare application'
    };
  }
}

/**
 * Auto-Apply Step 13-14: Approve application draft
 */
export async function approveAutoApplication(
  applicationId: string,
  approvalInput: {
    expectedVersion: number;
    expectedActionHash: string;
    backgroundCheckConsented?: boolean;
  },
  token?: string | null,
  userId?: string | null
): Promise<{
  success: boolean;
  application?: ApplicationRecord;
  error?: string;
}> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/applications/${applicationId}/approve`, {
      method: 'POST',
      headers: getAuthHeaders(token, userId),
      body: JSON.stringify(approvalInput)
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to approve application' };
  }
}

/**
 * Auto-Apply Step 15-17: Execute Playwright submission
 */
export async function executeAutoApplication(
  applicationId: string,
  options: { testMode?: boolean } = {},
  token?: string | null,
  userId?: string | null
): Promise<{
  success: boolean;
  application: ApplicationRecord;
  verificationEvidence?: string;
  error?: string;
}> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/applications/${applicationId}/execute`, {
      method: 'POST',
      headers: getAuthHeaders(token, userId),
      body: JSON.stringify(options)
    });
    return await res.json();
  } catch (err: any) {
    return {
      success: false,
      application: {} as any,
      error: err?.message || 'Failed to execute application submission'
    };
  }
}

/**
 * Auto-Apply Step 16: Independent post-submission verification
 */
export async function verifyAutoApplication(
  applicationId: string,
  token?: string | null,
  userId?: string | null
): Promise<{
  success: boolean;
  application: ApplicationRecord;
  verified: boolean;
  evidence: string;
  error?: string;
}> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/applications/${applicationId}/verify`, {
      method: 'POST',
      headers: getAuthHeaders(token, userId)
    });
    return await res.json();
  } catch (err: any) {
    return {
      success: false,
      application: {} as any,
      verified: false,
      evidence: '',
      error: err?.message || 'Failed to verify application'
    };
  }
}

/**
 * Check deterministic volunteer eligibility against published criteria
 */
export async function checkEligibility(
  volunteer: Partial<VolunteerProfile>,
  opportunity: Partial<Opportunity>
): Promise<{ success: boolean; eligibility?: EligibilityResult; error?: string }> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/agent/eligibility/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ volunteer, opportunity })
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error checking eligibility' };
  }
}

/**
 * Phase A — Prepare proposed registration action, calculate action hash & idempotency key
 */
export async function prepareRegistration(
  volunteer: VolunteerProfile,
  opportunity: Opportunity,
  options?: { userNotes?: string; backgroundCheckConsented?: boolean }
): Promise<{ success: boolean; proposal?: ProposedRegistrationAction; error?: string }> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/agent/registration/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ volunteer, opportunity, options })
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error preparing proposal' };
  }
}

/**
 * Phase A Confirmation — Record explicit volunteer approval for proposal version & action hash
 */
export async function approveRegistration(
  proposalId: string,
  approvalInput: {
    expectedVersion: number;
    expectedActionHash: string;
    explicitConsentGiven: boolean;
    backgroundCheckConsented: boolean;
  }
): Promise<{
  success: boolean;
  approvalRecord?: RegistrationApprovalRecord;
  proposal?: ProposedRegistrationAction;
  error?: string;
}> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/agent/registration/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proposalId,
        ...approvalInput
      })
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error recording approval' };
  }
}

/**
 * Phase B — Execute approved registration and trigger independent verification
 */
export async function executeRegistration(
  proposalId: string,
  executionOptions?: { testMode?: boolean; simulatedWaitlist?: boolean }
): Promise<{
  success: boolean;
  state: string;
  proposal: ProposedRegistrationAction;
  verificationResult: VerificationResult;
  actionTrace: ActionTraceStep[];
  error?: string;
}> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/agent/registration/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposalId, executionOptions })
    });
    return await res.json();
  } catch (err: any) {
    return {
      success: false,
      state: 'failed',
      proposal: {} as any,
      verificationResult: {} as any,
      actionTrace: [],
      error: err?.message || 'Network error executing registration'
    };
  }
}

/**
 * Run the Four Official Test Runs (TC1 - TC4)
 */
export async function runOfficialTestSuite(): Promise<{
  success: boolean;
  totalRuns: number;
  passedCount: number;
  failedCount: number;
  testRuns: OfficialTestRun[];
  error?: string;
}> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/agent/test-suite/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    return await res.json();
  } catch (err: any) {
    return {
      success: false,
      totalRuns: 0,
      passedCount: 0,
      failedCount: 0,
      testRuns: [],
      error: err?.message || 'Network error running test suite'
    };
  }
}

/**
 * Fetch latest official test run records
 */
export async function getOfficialTestResults(): Promise<{
  success: boolean;
  testRuns: OfficialTestRun[];
  error?: string;
}> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/agent/test-suite/results`);
    return await res.json();
  } catch (err: any) {
    return { success: false, testRuns: [], error: err?.message || 'Network error fetching test results' };
  }
}
