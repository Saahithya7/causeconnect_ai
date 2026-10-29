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
 * Call the server-side Playwright endpoint to discover live volunteer listings.
 */
export async function searchVolunteerOpportunities(
  params: BrowserbaseSearchParams
): Promise<BrowserbaseSearchResponse> {
  try {
    const res = await fetch('/api/events/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        location: params.location,
        interests: params.interests,
        preferredDates: params.preferred_dates || params.preferred_date || undefined,
        maxResults: params.max_results
      })
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        success: false,
        configured: true,
        agent_name: 'CauseConnect Playwright Live Event Finder',
        opportunities: [],
        error: data.error || 'Failed to search volunteer opportunities.',
        errorCode: data.errorCode || 'network_error',
        message: data.sourceSummary,
        sourceSummary: data.sourceSummary
      };
    }

    const opportunities: BrowserbaseOpportunity[] = (data.opportunities || []).map((item: any) => ({
      title: item.title,
      organization: item.organization || '',
      city: item.city || '',
      date: item.date || null,
      eligibility: item.eligibility || null,
      event_name: item.title,
      organizer_name: item.organization || '',
      description: item.description || '',
      category: item.category || '',
      event_date: item.date || null,
      event_time: item.time || null,
      location: item.location || null,
      required_skills: item.requiredSkills || [],
      registration_deadline: item.applicationDeadline || null,
      registration_url: item.applicationUrl || null,
      source_url: item.sourceUrl || null,
      verification_status: 'unverified',
      match_reason: ''
    }));

    return {
      success: data.success === true,
      configured: true,
      agent_name: 'CauseConnect Playwright Live Event Finder',
      opportunities,
      error: data.error,
      errorCode: data.errorCode,
      message: data.sourceSummary,
      sourceSummary: data.sourceSummary,
      searched_at: data.checkedAt
    };
  } catch (err: any) {
    return {
      success: false,
      configured: false,
      agent_name: 'CauseConnect Playwright Live Event Finder',
      opportunities: [],
      errorCode: 'network_error',
      error: err?.message || 'Network error while contacting the Playwright discovery endpoint.'
    };
  }
}
