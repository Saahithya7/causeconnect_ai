import type {
  BrowserbaseSearchParams,
  BrowserbaseSearchResponse,
  BrowserbaseOpportunity
} from '../types';

export interface BrowserbaseStatusResult {
  configured: boolean;
  agent_name: string;
  api_key_set: boolean;
  project_id_set: boolean;
  project_id?: string | null;
  message: string;
}

/**
 * Check if Browserbase integration is configured on the server.
 */
export async function getBrowserbaseStatus(): Promise<BrowserbaseStatusResult> {
  try {
    const res = await fetch('/api/browserbase/status');
    if (!res.ok) {
      return {
        configured: false,
        agent_name: 'CauseConnect Volunteer Event Finder',
        api_key_set: false,
        project_id_set: false,
        message: 'Browserbase server status endpoint returned an error.'
      };
    }
    return await res.json();
  } catch (err: any) {
    return {
      configured: false,
      agent_name: 'CauseConnect Volunteer Event Finder',
      api_key_set: false,
      project_id_set: false,
      message: 'Unable to reach Browserbase status endpoint.'
    };
  }
}

/**
 * Call the secure server-side endpoint to discover real volunteer events using Browserbase.
 */
export async function searchVolunteerOpportunities(
  params: BrowserbaseSearchParams
): Promise<BrowserbaseSearchResponse> {
  try {
    const res = await fetch('/api/volunteer-search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        success: false,
        configured: data.configured ?? false,
        agent_name: 'CauseConnect Volunteer Event Finder',
        opportunities: [],
        error: data.error || 'Failed to search volunteer opportunities.'
      };
    }

    return data;
  } catch (err: any) {
    return {
      success: false,
      configured: false,
      agent_name: 'CauseConnect Volunteer Event Finder',
      opportunities: [],
      error: err?.message || 'Network error while contacting the Browserbase search endpoint.'
    };
  }
}

/**
 * Release active browser sessions on Browserbase to free concurrency.
 */
export async function releaseActiveSessions(): Promise<{
  success: boolean;
  releasedCount?: number;
  message?: string;
  error?: string;
}> {
  try {
    const res = await fetch('/api/browserbase/release-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    return await res.json();
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to communicate with release-sessions endpoint.'
    };
  }
}

/**
 * Check status of an in-progress agent run.
 */
export async function getBrowserbaseRunStatus(runId: string): Promise<any> {
  try {
    const res = await fetch(`/api/browserbase/runs/${encodeURIComponent(runId)}`);
    return await res.json();
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to check run status'
    };
  }
}
