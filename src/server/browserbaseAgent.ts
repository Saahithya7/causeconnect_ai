import { Browserbase } from '@browserbasehq/sdk';
import type {
  BrowserbaseOpportunity,
  BrowserbaseSearchParams,
  BrowserbaseSearchResponse,
  BrowserbaseVerificationStatus
} from '../types/index.js';

export const BROWSERBASE_AGENT_NAME = 'CauseConnect Volunteer Event Finder';

export const BROWSERBASE_AGENT_SYSTEM_PROMPT = `You are the CauseConnect Volunteer Event Finder, an autonomous AI web agent specialized in discovering genuine, upcoming volunteering opportunities.
Your mission is to search the web and navigate real NGO, nonprofit, community foundation, educational, and public-interest web pages.

Prioritize:
1. Official NGO, charitable trust, and 501(c)(3) nonprofit websites
2. Local community organizations and social-impact initiatives
3. Established volunteer platforms (e.g., VolunteerMatch, Idealist, Point of Light, local volunteer centers, Mobilize)
4. Environmental cleanups, tree-planting, beach restorations, and sustainability drives
5. Teaching, tutoring, school support, and adult literacy programs
6. Food banks, soup kitchens, meal packing, and community outreach
7. Animal rescue shelters and wildlife rehabilitation centers

Strict Guidelines:
- Extract real, authentic event details directly from source web pages.
- Never invent, fabricate, or hallucinate event dates, times, addresses, or registration links.
- If any detail is unavailable on the webpage, set that field to null.
- Check dates to ensure past or expired events are excluded.
- Clearly set verification_status:
  * "verified_official": for official NGO websites or established direct listings
  * "community_listed": for community bulletin boards, social announcements, or aggregator posts
  * "unverified": if key details (date/location/organizer) could not be cross-verified
- Provide a concise match_reason explaining why this event fits the volunteer's specified location, causes, and skills.`;

export const BROWSERBASE_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    opportunities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Opportunity title or event name' },
          event_name: { type: 'string', description: 'Opportunity title or event name' },
          organization: { type: 'string', description: 'Host organization or NGO name' },
          organizer_name: { type: 'string', description: 'Host organization or NGO name' },
          city: { type: ['string', 'null'], description: 'City where opportunity takes place' },
          location: { type: ['string', 'null'], description: 'City and specific location address or online' },
          date: { type: ['string', 'null'], description: 'Event date or scheduled time if published, otherwise null' },
          event_date: { type: ['string', 'null'], description: 'Event date if published, otherwise null' },
          event_time: { type: ['string', 'null'], description: 'Event hours or time if published, otherwise null' },
          description: { type: 'string', description: 'Factual description extracted from the page' },
          category: { type: 'string', description: 'Volunteer category e.g. Animal Welfare, Education, Environment' },
          eligibility: { type: ['string', 'null'], description: 'Eligibility, requirements, or minimum age if published, otherwise null' },
          required_skills: {
            type: 'array',
            items: { type: 'string' }
          },
          registration_deadline: { type: ['string', 'null'] },
          registration_url: { type: ['string', 'null'], description: 'Direct registration or volunteer sign-up URL' },
          source_url: { type: ['string', 'null'], description: 'URL of the page where this opportunity was found' },
          verification_status: {
            type: 'string',
            enum: ['verified_official', 'community_listed', 'unverified']
          },
          match_reason: { type: 'string', description: 'Why this opportunity matches the search' }
        },
        required: [
          'description',
          'category',
          'verification_status'
        ]
      }
    }
  },
  required: ['opportunities']
};

/**
 * Check whether Browserbase is configured with a valid API key.
 * Never logs or exposes the key value.
 */
export function isBrowserbaseConfigured(): boolean {
  const key = process.env.BROWSERBASE_API_KEY?.trim();
  if (!key) return false;
  if (
    key === 'your_browserbase_api_key_here' ||
    key === 'MY_BROWSERBASE_API_KEY' ||
    key.length < 10
  ) {
    return false;
  }
  return true;
}

export function getBrowserbaseStatus() {
  const configured = isBrowserbaseConfigured();
  return {
    configured,
    agent_name: BROWSERBASE_AGENT_NAME,
    api_key_set: !!process.env.BROWSERBASE_API_KEY,
    project_id_set: !!process.env.BROWSERBASE_PROJECT_ID,
    project_id: process.env.BROWSERBASE_PROJECT_ID || null,
    message: configured
      ? 'Browserbase API is configured and ready for live web volunteer event discovery.'
      : 'Browserbase API key (BROWSERBASE_API_KEY) is not yet set. Set BROWSERBASE_API_KEY in your server environment to enable live NGO web browsing.'
  };
}

/**
 * Validate and sanitize search parameters.
 */
export function sanitizeSearchParams(raw: any): {
  valid: boolean;
  params: BrowserbaseSearchParams;
  errorMessage?: string;
} {
  if (!raw || typeof raw !== 'object') {
    return {
      valid: false,
      params: { location: '', max_results: 6 },
      errorMessage: 'Invalid request body. Expected JSON object with search parameters.'
    };
  }

  const rawLocation = typeof raw.location === 'string'
    ? raw.location.trim()
    : typeof raw.city === 'string'
    ? raw.city.trim()
    : '';

  if (!rawLocation || rawLocation.length < 2) {
    return {
      valid: false,
      params: { location: '', max_results: 6 },
      errorMessage: 'Please provide a valid location or city to search for volunteer opportunities.'
    };
  }

  // Sanitize location (limit length, remove dangerous chars)
  const location = rawLocation.slice(0, 100).replace(/[<>{}\\]/g, '');

  // Interests / Categories (supports array or comma-separated string)
  let interests: string[] = [];
  if (Array.isArray(raw.interests)) {
    interests = raw.interests
      .filter((i: any) => typeof i === 'string' && i.trim().length > 0)
      .map((i: string) => i.trim().slice(0, 50))
      .slice(0, 10);
  } else if (typeof raw.interests === 'string' && raw.interests.trim()) {
    interests = raw.interests
      .split(',')
      .map((i: string) => i.trim())
      .filter((i: string) => i.length > 0)
      .slice(0, 10);
  }

  // Skills (supports array or comma-separated string)
  let skills: string[] = [];
  if (Array.isArray(raw.skills)) {
    skills = raw.skills
      .filter((s: any) => typeof s === 'string' && s.trim().length > 0)
      .map((s: string) => s.trim().slice(0, 50))
      .slice(0, 10);
  } else if (typeof raw.skills === 'string' && raw.skills.trim()) {
    skills = raw.skills
      .split(',')
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0)
      .slice(0, 10);
  }

  // Preferred Dates / Availability
  let preferred_dates: string | null = null;
  const rawDate = raw.preferred_date ?? raw.preferred_dates ?? raw.preferredDate ?? raw.date;
  if (typeof rawDate === 'string' && rawDate.trim()) {
    preferred_dates = rawDate.trim().slice(0, 80);
  }

  // Radius
  let radius: number | null = null;
  if (typeof raw.radius === 'number' && !isNaN(raw.radius) && raw.radius > 0) {
    radius = Math.min(Math.max(Math.round(raw.radius), 1), 200);
  }

  // Max results
  let max_results = 6;
  const rawMax = raw.max_results ?? raw.maxResults;
  if (typeof rawMax === 'number' && !isNaN(rawMax)) {
    max_results = Math.min(Math.max(Math.round(rawMax), 1), 20);
  }

  return {
    valid: true,
    params: {
      location,
      interests,
      skills,
      preferred_date: preferred_dates,
      preferred_dates,
      radius,
      max_results
    }
  };
}

/**
 * Normalizes and deduplicates opportunity records.
 */
export function cleanAndDeduplicateOpportunities(
  rawList: any[],
  searchParams: BrowserbaseSearchParams
): BrowserbaseOpportunity[] {
  if (!Array.isArray(rawList)) return [];

  const seen = new Set<string>();
  const results: BrowserbaseOpportunity[] = [];

  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;

    const title = typeof item.title === 'string' && item.title.trim()
      ? item.title.trim()
      : typeof item.event_name === 'string' && item.event_name.trim()
      ? item.event_name.trim()
      : '';

    const organization = typeof item.organization === 'string' && item.organization.trim()
      ? item.organization.trim()
      : typeof item.organizer_name === 'string' && item.organizer_name.trim()
      ? item.organizer_name.trim()
      : '';

    if (!title || !organization) continue;

    // Deduplication key
    const dedupKey = `${title.toLowerCase()}||${organization.toLowerCase()}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    const description = typeof item.description === 'string' && item.description.trim()
      ? item.description.trim()
      : `Volunteer opportunity hosted by ${organization} in ${searchParams.location}.`;

    const category = typeof item.category === 'string' && item.category.trim()
      ? item.category.trim()
      : (searchParams.interests?.[0] || 'Community Service');

    const date = typeof item.date === 'string' && item.date.trim()
      ? item.date.trim()
      : typeof item.event_date === 'string' && item.event_date.trim()
      ? item.event_date.trim()
      : null;

    const event_time = typeof item.event_time === 'string' && item.event_time.trim()
      ? item.event_time.trim()
      : null;

    const city = typeof item.city === 'string' && item.city.trim()
      ? item.city.trim()
      : searchParams.location.split(',')[0].trim();

    const location = typeof item.location === 'string' && item.location.trim()
      ? item.location.trim()
      : `${city}, ${searchParams.location}`;

    const eligibility = typeof item.eligibility === 'string' && item.eligibility.trim()
      ? item.eligibility.trim()
      : Array.isArray(item.required_skills) && item.required_skills.length > 0
      ? `Skills: ${item.required_skills.join(', ')}`
      : 'Open to public volunteers';

    const required_skills = Array.isArray(item.required_skills)
      ? item.required_skills
          .filter((s: any) => typeof s === 'string' && s.trim())
          .map((s: string) => s.trim().slice(0, 50))
      : [];

    const registration_deadline = typeof item.registration_deadline === 'string' && item.registration_deadline.trim()
      ? item.registration_deadline.trim()
      : null;

    const registration_url = typeof item.registration_url === 'string' && item.registration_url.startsWith('http')
      ? item.registration_url.trim()
      : null;

    const source_url = typeof item.source_url === 'string' && item.source_url.startsWith('http')
      ? item.source_url.trim()
      : (registration_url || null);

    let verification_status: BrowserbaseVerificationStatus = 'unverified';
    if (item.verification_status === 'verified_official') {
      verification_status = 'verified_official';
    } else if (item.verification_status === 'community_listed') {
      verification_status = 'community_listed';
    } else if (registration_url && source_url) {
      verification_status = 'verified_official';
    }

    const match_reason = typeof item.match_reason === 'string' && item.match_reason.trim()
      ? item.match_reason.trim()
      : `Verified opportunity matching ${category} in ${searchParams.location}.`;

    results.push({
      title,
      event_name: title,
      organization,
      organizer_name: organization,
      city,
      location,
      date,
      event_date: date,
      description,
      category,
      eligibility,
      event_time,
      required_skills,
      registration_deadline,
      registration_url,
      source_url,
      verification_status,
      match_reason
    });
  }

  // Rank by match quality: items matching specified interests and with official verification come first
  results.sort((a, b) => {
    let scoreA = 0;
    let scoreB = 0;

    if (a.verification_status === 'verified_official') scoreA += 5;
    if (b.verification_status === 'verified_official') scoreB += 5;

    if (searchParams.interests?.some((cat) => a.category.toLowerCase().includes(cat.toLowerCase()))) {
      scoreA += 4;
    }
    if (searchParams.interests?.some((cat) => b.category.toLowerCase().includes(cat.toLowerCase()))) {
      scoreB += 4;
    }

    if (a.registration_url) scoreA += 3;
    if (b.registration_url) scoreB += 3;

    return scoreB - scoreA;
  });

  return results.slice(0, searchParams.max_results || 6);
}

/**
 * Release active browser sessions on Browserbase to free up runner concurrency.
 */
export async function releaseAllRunningSessions(): Promise<{
  releasedCount: number;
  message: string;
}> {
  if (!isBrowserbaseConfigured()) {
    return { releasedCount: 0, message: 'Browserbase is not configured.' };
  }

  const apiKey = process.env.BROWSERBASE_API_KEY!.trim();
  const projectId = process.env.BROWSERBASE_PROJECT_ID?.trim() || undefined;
  const bb = new Browserbase({ apiKey });

  try {
    const runningSessions = await bb.sessions.list({ status: 'RUNNING' });
    let count = 0;

    if (Array.isArray(runningSessions) && runningSessions.length > 0) {
      for (const session of runningSessions) {
        try {
          await bb.sessions.update(session.id, {
            status: 'REQUEST_RELEASE',
            projectId
          });
          count++;
        } catch (releaseErr) {
          console.warn(`Could not release session ${session.id}:`, releaseErr);
        }
      }
    }

    return {
      releasedCount: count,
      message: count > 0
        ? `Successfully requested release of ${count} active Browserbase session(s).`
        : 'No active Browserbase sessions were pending release.'
    };
  } catch (err: any) {
    console.error('Error releasing sessions:', err?.message || err);
    return {
      releasedCount: 0,
      message: `Failed to inspect/release sessions: ${err?.message || 'Unknown error'}`
    };
  }
}

/**
 * Execute real Browserbase Agent search with automatic retry for transient runner session limits.
 */
export async function executeVolunteerDiscoveryAgent(
  searchParams: BrowserbaseSearchParams
): Promise<BrowserbaseSearchResponse> {
  const isConfigured = isBrowserbaseConfigured();

  if (!isConfigured) {
    return {
      success: false,
      configured: false,
      agent_name: BROWSERBASE_AGENT_NAME,
      opportunities: [],
      error: 'BROWSERBASE_API_KEY is not configured in the server environment.',
      instructions:
        'To enable live web discovery of genuine volunteer events, add BROWSERBASE_API_KEY to your environment variables. The CauseConnect Volunteer Event Finder agent is built and ready to execute live browser runs once configured.'
    };
  }

  const apiKey = process.env.BROWSERBASE_API_KEY!.trim();
  const bb = new Browserbase({ apiKey });

  // Construct task description for the Browserbase agent
  const causesText = searchParams.interests?.length
    ? searchParams.interests.join(', ')
    : 'Education, Environment, Animal Welfare, Food Bank, Community Outreach';
  const skillsText = searchParams.skills?.length
    ? searchParams.skills.join(', ')
    : 'General volunteering, No specific skills required';
  const datesText = searchParams.preferred_dates || 'upcoming within the next 30 days';
  const radiusText = searchParams.radius ? `within ${searchParams.radius} miles of ` : '';

  const taskDescription = `Search the live web for genuine, upcoming volunteer events and opportunities in ${radiusText}${searchParams.location}.
Target causes/sectors: ${causesText}.
Target skills: ${skillsText}.
Dates/Availability: ${datesText}.
Find up to ${searchParams.max_results || 4} genuine opportunities.
Visit official NGO, charity foundation, chapter, and volunteer center websites in the target region.
Extract the official page URL as source_url and the volunteer signup or apply form URL as registration_url.
Do NOT attempt to submit forms requiring OTP, phone verification, or logins; if a form requires sign-in or OTP, capture the signup form URL as registration_url and record requirements without submitting.
If an event date is not specified on the page, set date to null. Return structured results conforming to the schema.`;

  // Internal helper to run agent and poll
  async function attemptRun(): Promise<{
    success: boolean;
    finalRun?: any;
    runId?: string;
    isSessionLimit?: boolean;
    rawError?: string;
  }> {
    // 1. Launch run directly with task and schema
    let run: any;
    try {
      run = await bb.agents.runs.create({
        task: taskDescription,
        resultSchema: BROWSERBASE_RESULT_SCHEMA
      });
    } catch (createErr: any) {
      const msg = createErr?.message || '';
      const isLimit =
        msg.includes('RUNNER_SESSION_LIMIT') ||
        msg.includes('session creation limit') ||
        msg.includes('429');
      return {
        success: false,
        isSessionLimit: isLimit,
        rawError: msg
      };
    }

    const runId = run.runId;

    // 2. Poll for completion (up to 120 seconds to allow deep web navigation)
    const startTime = Date.now();
    const maxWaitMs = 120000;
    let currentRun = run;

    while (Date.now() - startTime < maxWaitMs) {
      if (
        currentRun.status === 'COMPLETED' ||
        currentRun.status === 'FAILED' ||
        currentRun.status === 'STOPPED' ||
        currentRun.status === 'TIMED_OUT'
      ) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 3000));
      try {
        currentRun = await bb.agents.runs.retrieve(runId);
      } catch (pollErr) {
        console.warn('Error polling run status:', pollErr);
      }
    }

    // Safely release session if sessionId is attached to the run
    if (currentRun?.sessionId) {
      try {
        await bb.sessions.update(currentRun.sessionId, {
          status: 'REQUEST_RELEASE',
          projectId: process.env.BROWSERBASE_PROJECT_ID?.trim() || undefined
        });
      } catch (releaseErr) {
        // Runner session may already be releasing
      }
    }

    if (currentRun.status === 'COMPLETED') {
      return { success: true, finalRun: currentRun, runId };
    }

    const causeCode = currentRun.cause?.code;
    const isLimit =
      causeCode === 'RUNNER_SESSION_LIMIT' ||
      currentRun.cause?.message?.includes('session creation limit');

    return {
      success: false,
      finalRun: currentRun,
      runId,
      isSessionLimit: isLimit
    };
  }

  try {
    // Attempt 1
    let runResult = await attemptRun();

    // If runner session limit was reached, auto-retry once after 7 seconds
    // to allow a just-completed browser session slot to release
    if (!runResult.success && runResult.isSessionLimit) {
      console.log('[Browserbase Agent] Runner session limit encountered. Waiting 7s for runner slot to clear, then retrying...');
      await releaseAllRunningSessions().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 7000));
      runResult = await attemptRun();
    }

    if (runResult.success && runResult.finalRun) {
      const finalRun = runResult.finalRun;
      // Note: Browserbase agent run results store structured schema output in result.output.opportunities or result.opportunities
      const rawOpportunities =
        (finalRun.result as any)?.output?.opportunities ||
        (finalRun.result as any)?.opportunities ||
        [];

      const cleaned = cleanAndDeduplicateOpportunities(rawOpportunities, searchParams);

      return {
        success: true,
        configured: true,
        agent_name: BROWSERBASE_AGENT_NAME,
        run_id: runResult.runId,
        status: finalRun.status,
        opportunities: cleaned,
        searched_at: new Date().toISOString(),
        source_count: cleaned.length
      };
    }

    if (runResult.finalRun && (runResult.finalRun.status === 'RUNNING' || runResult.finalRun.status === 'PENDING')) {
      return {
        success: true,
        configured: true,
        agent_name: BROWSERBASE_AGENT_NAME,
        run_id: runResult.runId,
        status: runResult.finalRun.status,
        opportunities: [],
        message: 'The Browserbase Agent is currently navigating NGO pages and extracting event details. Results are compiling.'
      };
    }

    // Handled failure
    if (runResult.isSessionLimit) {
      return {
        success: false,
        configured: true,
        agent_name: BROWSERBASE_AGENT_NAME,
        run_id: runResult.runId,
        status: runResult.finalRun?.status || 'FAILED',
        opportunities: [],
        error:
          'Your Browserbase project concurrency limit (1 concurrent browser session) was reached because another browser search was recently active or winding down. Please wait 15-20 seconds and try again, or click "Release Active Sessions".'
      };
    }

    const causeDetails = runResult.finalRun?.cause
      ? typeof runResult.finalRun.cause === 'object'
        ? runResult.finalRun.cause.message || JSON.stringify(runResult.finalRun.cause)
        : String(runResult.finalRun.cause)
      : runResult.rawError || 'The agent was unable to find matching volunteer listings.';

    return {
      success: false,
      configured: true,
      agent_name: BROWSERBASE_AGENT_NAME,
      run_id: runResult.runId,
      status: runResult.finalRun?.status || 'FAILED',
      opportunities: [],
      error: `Browserbase search notice: ${causeDetails}`
    };
  } catch (error: any) {
    const rawMsg = error?.message || 'Error occurred communicating with Browserbase API.';
    const sanitizedMsg = rawMsg.replace(/bb_[a-zA-Z0-9_-]+/g, '[REDACTED_KEY]');

    return {
      success: false,
      configured: true,
      agent_name: BROWSERBASE_AGENT_NAME,
      opportunities: [],
      error: sanitizedMsg
    };
  }
}
