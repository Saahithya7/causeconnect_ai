import assert from 'node:assert/strict';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { ReactElement, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  classifyIdealistResultState,
  detectIdealistPageGate,
  classifyLiveSearchError,
  classifyNavigationError,
  classifySearchResponseStatus,
  isIdealistResultsResponse,
  isRelevantIdealistListing,
  normalizeIdealistListing,
  selectIdealistSearchLocation,
  validateTargetUrl,
  waitForIdealistSearchResponse,
  withPlaywrightPage
} from '../src/server/playwrightService.js';
import { resultsAfterSearch, searchVolunteerOpportunities } from '../src/services/browserbaseService.js';
import {
  canReviewLiveListing,
  hasLiveEligibilityInformation,
  hasStructuredLiveEligibility,
  isValidLiveListingUrl,
  prepareAutoApply
} from '../src/services/autoApplyService.js';
import { supabase } from '../src/lib/supabase.js';
import { LiveListingApplyButton } from '../src/components/BrowserbaseFinder.js';
import type { BrowserbaseOpportunity, Opportunity } from '../src/types/index.js';

async function runTests(): Promise<void> {
  assert.equal(classifyNavigationError(new Error('Navigation timeout')), 'navigation_timeout');
  assert.equal(classifyNavigationError(new Error('net::ERR_BLOCKED_BY_CLIENT')), 'navigation_blocked');
  assert.equal(classifyNavigationError(new Error('net::ERR_NAME_NOT_RESOLVED')), 'navigation_failed');

  assert.equal(classifySearchResponseStatus(200), 'success');
  assert.equal(classifySearchResponseStatus(403), 'blocked');
  assert.equal(classifySearchResponseStatus(503), 'http_failure');
  assert.equal(classifyLiveSearchError('Browser did not launch', false), 'browser_launch_failed');
  assert.equal(classifyLiveSearchError('The source returned HTTP 403', true), 'source_blocked');
  assert.equal(classifyLiveSearchError('Idealist results response timed out', true), 'source_response_timeout');
  assert.equal(classifyLiveSearchError('Matching listing content did not render before the page timed out', true), 'page_render_timeout');
  assert.equal(classifyLiveSearchError('Unexpected page structure', true), 'unexpected_page_structure');
  assert.equal(detectIdealistPageGate('Access denied. Your request was blocked.'), 'access denied page');
  assert.equal(detectIdealistPageGate('Please verify that you are human.'), 'robot/CAPTCHA challenge');
  assert.equal(detectIdealistPageGate('Search for volunteer opportunities'), null);
  assert.equal((await validateTargetUrl('https://unapproved.example/search')).valid, false);
  console.log('✓ Search navigation and HTTP failure states are distinguished.');

  const fixtureBrowser = await chromium.launch({ headless: true });
  try {
    const fixturePage = await fixtureBrowser.newPage();
    await fixturePage.setContent(`
      <label for="location">Location</label>
      <input id="location" role="combobox" aria-label="Location" aria-expanded="false">
      <div id="suggestions" role="listbox" hidden>
        <div id="bengaluru" role="option">Bengaluru Karnataka, India</div>
      </div>
      <script>
        const input = document.querySelector('#location');
        const suggestions = document.querySelector('#suggestions');
        input.addEventListener('input', () => {
          suggestions.hidden = !input.value.toLowerCase().includes('bengaluru');
          input.setAttribute('aria-expanded', String(!suggestions.hidden));
        });
        document.querySelector('#bengaluru').addEventListener('click', () => {
          input.value = 'Bengaluru Karnataka, India';
          suggestions.hidden = true;
          input.setAttribute('aria-expanded', 'false');
        });
      </script>
    `);
    const chosenLocation = await selectIdealistSearchLocation(fixturePage, 'Bengaluru');
    assert.equal(chosenLocation.selectedLocation, 'Bengaluru Karnataka, India');
    assert.equal(chosenLocation.selectedSuggestion, 'Bengaluru Karnataka, India');

    await fixturePage.setContent('<main>Volunteer search is temporarily unavailable.</main>');
    await assert.rejects(
      selectIdealistSearchLocation(fixturePage, 'Bengaluru', 100),
      /no visible, enabled Location field/i
    );

    await fixturePage.setContent(`
      <label for="location">Location</label>
      <input id="location" role="combobox" aria-label="Location">
      <script>document.querySelector('#location').addEventListener('input', () => {});</script>
    `);
    await assert.rejects(
      selectIdealistSearchLocation(fixturePage, 'Bengaluru', 100),
      /did not offer a location suggestion for "Bengaluru"/i
    );
    console.log('✓ Accessible location inputs, suggestion selection, missing fields, and missing suggestions are handled without dropping the requested location.');
  } finally {
    await fixtureBrowser.close();
  }

  const validResultResponse = {
    url: () => 'https://www.idealist.org/en/volunteer.data?_routes=search',
    status: () => 200
  };
  assert.equal(isIdealistResultsResponse(validResultResponse), true);
  assert.equal(isIdealistResultsResponse({
    url: () => 'https://unapproved.example/en/volunteer.data'
  }), false);

  const fakePage = {
    waitForResponse: async (predicate: (response: typeof validResultResponse) => boolean) => {
      const candidates = [
        { url: () => 'https://www.idealist.org/en/volunteer', status: () => 200 },
        validResultResponse
      ];
      const match = candidates.find(predicate);
      if (!match) throw new Error('Timeout waiting for Idealist results');
      return match;
    }
  };
  const response = await waitForIdealistSearchResponse(fakePage);
  assert.equal(response.status(), 200);
  await assert.rejects(
    waitForIdealistSearchResponse({
      waitForResponse: async () => {
        throw new Error('Timeout waiting for Idealist results');
      }
    }),
    /Timeout/
  );
  console.log('✓ Search waits for the source results response, including a deterministic timeout case.');

  assert.equal(classifyIdealistResultState(0, 0, true), 'no_results');
  assert.equal(classifyIdealistResultState(0, 0, false), 'extraction_failed');
  assert.equal(classifyIdealistResultState(4, 0, false), 'extraction_failed');
  assert.equal(classifyIdealistResultState(4, 2, false), 'results');

  const listing = normalizeIdealistListing({
    title: 'Volunteer Tutor',
    organization: 'Example NGO',
    location: 'Bengaluru, India',
    description: 'Tutor local students',
    sourceUrl: 'https://www.idealist.org/en/volunteer-opportunity/123-volunteer-tutor'
  });
  assert.deepEqual(listing, {
    title: 'Volunteer Tutor',
    organization: 'Example NGO',
    location: 'Bengaluru, India',
    description: 'Tutor local students',
    sourceUrl: 'https://www.idealist.org/en/volunteer-opportunity/123-volunteer-tutor'
  });
  assert.equal(isRelevantIdealistListing(listing!, ['bengaluru', 'bangalore']), true);
  assert.equal(isRelevantIdealistListing({
    title: 'Remote volunteer',
    location: 'Anywhere',
    sourceUrl: 'https://www.idealist.org/en/volunteer-opportunity/456-remote'
  }, ['bengaluru']), true);

  assert.equal(normalizeIdealistListing({
    title: 'Fake listing',
    sourceUrl: 'https://unapproved.example/en/volunteer-opportunity/123'
  }), null);
  assert.equal(normalizeIdealistListing({
    title: 'Wrong path',
    sourceUrl: 'https://www.idealist.org/en/volunteer'
  }), null);
  console.log('✓ Empty results, extracted listing fixtures, unexpected pages, and unapproved URLs are handled safely.');

  const priorSearchResults = [{
    title: 'Earlier source listing',
    organization: 'Example NGO',
    city: 'Bengaluru',
    date: null,
    eligibility: null,
    event_name: 'Earlier source listing',
    organizer_name: 'Example NGO',
    description: '',
    category: '',
    event_date: null,
    event_time: null,
    location: 'Bengaluru',
    required_skills: [],
    registration_deadline: null,
    registration_url: null,
    source_url: 'https://www.idealist.org/en/volunteer-opportunity/123-earlier',
    verification_status: 'unverified' as const,
    match_reason: ''
  }];
  assert.equal(resultsAfterSearch(priorSearchResults, { success: false, opportunities: [] }), priorSearchResults);
  assert.deepEqual(resultsAfterSearch(priorSearchResults, { success: true, opportunities: [] }), []);

  const liveListing: BrowserbaseOpportunity = {
    id: 'pw-1234567890abcdef',
    title: 'Volunteer Tutor',
    organization: 'Example NGO',
    city: 'Bengaluru',
    date: 'Nov 7, 2026',
    eligibility: 'Ages 18 and up',
    event_name: 'Volunteer Tutor',
    organizer_name: 'Example NGO',
    description: 'Tutor local students',
    category: 'Education',
    event_date: 'Nov 7, 2026',
    event_time: null,
    location: 'Bengaluru, India',
    required_skills: ['Tutoring'],
    registration_deadline: null,
    registration_url: null,
    source_url: 'https://www.idealist.org/en/volunteer-opportunity/123-volunteer-tutor',
    min_age: 18,
    background_check_required: null,
    verification_status: 'unverified',
    match_reason: ''
  };
  assert.equal(isValidLiveListingUrl(liveListing.source_url), true);
  assert.equal(canReviewLiveListing(liveListing), true);
  assert.equal(hasLiveEligibilityInformation(liveListing), true);
  assert.equal(hasStructuredLiveEligibility(liveListing), true);
  assert.equal(isValidLiveListingUrl('http://www.idealist.org/en/volunteer-opportunity/123'), false);
  assert.equal(isValidLiveListingUrl('https://unapproved.example/en/volunteer-opportunity/123'), false);
  assert.equal(canReviewLiveListing({ ...liveListing, source_url: null }), false);
  assert.equal(hasLiveEligibilityInformation({
    ...liveListing,
    eligibility: null,
    required_skills: [],
    min_age: null
  }), false);
  assert.equal(hasStructuredLiveEligibility({
    ...liveListing,
    eligibility: 'Ages 18 and up',
    required_skills: [],
    min_age: null
  }), false);
  let selectedByApplyButton: BrowserbaseOpportunity | null = null;
  const liveApplyButton = LiveListingApplyButton({
    opportunity: liveListing,
    onApply: (selected) => { selectedByApplyButton = selected; }
  }) as ReactElement<{ disabled: boolean; children: ReactNode; onClick: () => void }>;
  assert.equal(liveApplyButton.props.disabled, false);
  liveApplyButton.props.onClick();
  assert.equal(selectedByApplyButton, liveListing);
  const invalidApplyButton = LiveListingApplyButton({
    opportunity: { ...liveListing, source_url: null },
    onApply: () => { throw new Error('An invalid listing must not be selectable.'); }
  }) as ReactElement<{ disabled: boolean }>;
  assert.equal(invalidApplyButton.props.disabled, true);
  console.log('✓ Live listing review requires a valid supported source URL and event identity.');

  const originalFetch = globalThis.fetch;
  try {
    let requestedUrl = '';
    let requestBody: Record<string, unknown> = {};
    globalThis.fetch = async (input, init) => {
      requestedUrl = String(input);
      requestBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      return new Response(JSON.stringify({
        success: true,
        configured: true,
        agent_name: 'CauseConnect Playwright Volunteer Finder',
        opportunities: [{
          id: 'listing-1',
          title: 'Volunteer Tutor',
          organization: 'Example NGO',
          city: 'Bengaluru',
          location: 'Bengaluru, India',
          date: 'Nov 7, 2026',
          description: 'Tutor local students',
          category: 'Education',
          requiredSkills: ['Tutoring'],
          applicationUrl: 'https://www.idealist.org/en/volunteer-opportunity/123-volunteer-tutor',
          sourceUrl: 'https://www.idealist.org/en/volunteer-opportunity/123-volunteer-tutor',
          lastRetrieved: 'Retrieved just now'
        }],
        sourceSummary: 'Search completed with a source-linked listing.',
        checkedAt: '2026-10-29T00:00:00.000Z'
      }), { status: 200 });
    };
    const result = await searchVolunteerOpportunities({
      location: 'Bengaluru',
      interests: ['Education'],
      preferred_dates: 'Saturday',
      max_results: 6
    });
    assert.equal(requestedUrl, '/api/events/search');
    assert.deepEqual(requestBody, {
      location: 'Bengaluru',
      interests: ['Education'],
      preferredDates: 'Saturday',
      maxResults: 6
    });
    assert.equal(result.success, true);
    assert.equal(result.opportunities.length, 1);
    assert.equal(result.opportunities[0].title, 'Volunteer Tutor');
    assert.equal(result.opportunities[0].id, 'listing-1');
    assert.equal(result.opportunities[0].location, 'Bengaluru, India');
    assert.deepEqual(result.opportunities[0].required_skills, ['Tutoring']);
    assert.equal(result.opportunities[0].source_url, 'https://www.idealist.org/en/volunteer-opportunity/123-volunteer-tutor');
    assert.equal(result.sourceSummary, 'Search completed with a source-linked listing.');
    assert.equal(result.searched_at, '2026-10-29T00:00:00.000Z');

    globalThis.fetch = async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({
        success: true,
        opportunities: [],
        sourceSummary: 'Search completed with no matching opportunities.'
      }), { status: 200 });
    };
    const emptyResult = await searchVolunteerOpportunities({ location: 'Bengaluru' });
    assert.equal(emptyResult.success, true);
    assert.equal(emptyResult.opportunities.length, 0);

    globalThis.fetch = async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({
        success: false,
        opportunities: [],
        error: 'Idealist results response timed out.',
        errorCode: 'source_response_timeout',
        sourceSummary: 'Live discovery did not receive a completed results response.'
      }), { status: 503 });
    };
    const failedResult = await searchVolunteerOpportunities({ location: 'Bengaluru' });
    assert.equal(requestedUrl, '/api/events/search');
    assert.equal(failedResult.success, false);
    assert.match(failedResult.error || '', /timed out/i);
    assert.match(failedResult.sourceSummary || '', /did not receive/i);
    assert.equal(failedResult.errorCode, 'source_response_timeout');
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log('✓ Discovery retains its prior result on failure and preserves the existing API route and response format.');

  if (!supabase) {
    throw new Error('Supabase client is required for the Auto-Apply request lifecycle test.');
  }

  const opportunity: Opportunity = {
    id: '123e4567-e89b-42d3-a456-426614174000',
    title: 'Volunteer Tutor',
    organization: 'Example NGO',
    category: 'Education',
    date: 'Nov 7, 2026',
    daysOfWeek: ['Saturday'],
    time: '10:00 AM - 1:00 PM',
    location: 'Bengaluru, India',
    city: 'Bengaluru',
    format: 'in-person',
    minAge: 18,
    backgroundCheck: 'not-required',
    skills: ['Tutoring'],
    description: 'Tutor local students',
    sourceDomain: 'idealist.org',
    sourceUrl: 'https://www.idealist.org/en/volunteer-opportunity/123-volunteer-tutor',
    lastRetrieved: 'Retrieved just now',
    slotsAvailable: 4,
    contactEmail: '',
    image: '',
    impactStatement: 'Support local students.',
    verifiedDetails: {
      venueVerified: true,
      nonprofitStatusVerified: true,
      hoursCertifiable: true
    }
  };

  const auth = supabase.auth;
  const originalSessionDescriptor = Object.getOwnPropertyDescriptor(auth, 'getSession');
  Object.defineProperty(auth, 'getSession', {
    configurable: true,
    value: async () => ({
      data: { session: { access_token: 'test-access-token' } as Session },
      error: null
    })
  });

  const fetchBeforeConcurrentRequests = globalThis.fetch;
  const requestedPaths: string[] = [];
  let releaseConcurrentRequests: (() => void) | undefined;
  const bothRequestsStarted = new Promise<void>((resolve) => {
    releaseConcurrentRequests = resolve;
  });
  let shouldFailApplicationPreparation = false;
  let shouldFailLiveFormReview = false;
  const liveFormRequests: Record<string, unknown>[] = [];
  try {
    globalThis.fetch = async (input, init) => {
      const requestPath = new URL(String(input), 'http://localhost').pathname;
      requestedPaths.push(requestPath);

      if (requestPath === '/api/events/search') {
        if (requestedPaths.includes('/api/applications/prepare')) {
          releaseConcurrentRequests?.();
        }
        await bothRequestsStarted;
        return new Response(JSON.stringify({
          success: true,
          opportunities: [{
            title: 'Volunteer Tutor',
            organization: 'Example NGO',
            city: 'Bengaluru',
            location: 'Bengaluru, India',
            description: 'Tutor local students',
            sourceUrl: opportunity.sourceUrl
          }],
          sourceSummary: 'Live search returned one source-linked listing.'
        }), { status: 200 });
      }

      if (requestPath === '/api/applications/prepare') {
        releaseConcurrentRequests?.();
        await bothRequestsStarted;
        return new Response(JSON.stringify(shouldFailApplicationPreparation
          ? { success: false, error: 'Eligibility preparation failed.' }
          : { success: true }), { status: shouldFailApplicationPreparation ? 400 : 200 });
      }

      if (requestPath === '/api/applications/live/review-form') {
        const requestBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
        liveFormRequests.push(requestBody);
        return new Response(JSON.stringify(shouldFailLiveFormReview
          ? {
            success: false,
            manualRequired: true,
            error: 'The application form could not be opened.',
            sourceUrl: liveListing.source_url
          }
          : {
            success: true,
            formReview: {
              sessionId: 'live-review-session',
              organization: liveListing.organization,
              sourceUrl: liveListing.source_url,
              applicationUrl: liveListing.source_url,
              fields: [],
              missingRequiredFields: [],
              completedStages: ['Loading profile', 'Opening application page', 'Detecting form'],
              expiresAt: new Date(Date.now() + 300000).toISOString()
            }
          }), { status: shouldFailLiveFormReview ? 422 : 200 });
      }

      throw new Error(`Unexpected request path: ${requestPath}`);
    };

    const [concurrentSearch, preparedApplication] = await Promise.all([
      searchVolunteerOpportunities({ location: 'Bengaluru' }),
      prepareAutoApply(opportunity)
    ]);
    assert.equal(concurrentSearch.success, true);
    assert.equal(concurrentSearch.opportunities.length, 1);
    assert.equal(preparedApplication.success, true);
    assert.deepEqual(new Set(requestedPaths), new Set([
      '/api/events/search',
      '/api/applications/prepare'
    ]));
    const searchAfterApplicationSuccess = await searchVolunteerOpportunities({ location: 'Bengaluru' });
    assert.equal(searchAfterApplicationSuccess.success, true);
    assert.equal(searchAfterApplicationSuccess.opportunities.length, 1);
    console.log('✓ Search and Auto-Apply preparation can complete concurrently through independent routes.');

    shouldFailApplicationPreparation = true;
    await assert.rejects(prepareAutoApply(opportunity), /Eligibility preparation failed/);
    const searchAfterApplicationFailure = await searchVolunteerOpportunities({ location: 'Bengaluru' });
    assert.equal(searchAfterApplicationFailure.success, true);
    assert.equal(searchAfterApplicationFailure.opportunities.length, 1);
    console.log('✓ Auto-Apply failure does not invalidate later discovery results.');

    shouldFailApplicationPreparation = false;
    const livePrepared = await prepareAutoApply(liveListing);
    assert.equal(livePrepared.success, true);
    assert.equal(livePrepared.formReview?.sessionId, 'live-review-session');
    assert.deepEqual(liveFormRequests.at(-1), {
      sourceUrl: liveListing.source_url,
      organization: liveListing.organization
    });
    console.log('✓ Live listing review opens the original source through its isolated form-review endpoint.');

    shouldFailLiveFormReview = true;
    await assert.rejects(prepareAutoApply(liveListing), /application form could not be opened/i);
    shouldFailLiveFormReview = false;

    await assert.rejects(
      prepareAutoApply({ ...liveListing, source_url: 'https://unapproved.example/opportunity/123' }),
      /valid Idealist listing URL/
    );
    console.log('✓ Invalid live listing URLs are rejected before making an application request.');
  } finally {
    globalThis.fetch = fetchBeforeConcurrentRequests;
    if (originalSessionDescriptor) {
      Object.defineProperty(auth, 'getSession', originalSessionDescriptor);
    } else {
      delete (auth as unknown as Record<string, unknown>).getSession;
    }
  }

  const originalLaunch = chromium.launch;
  let pageClosed = 0;
  let contextClosed = 0;
  let browserClosed = 0;
  const mockPage = {
    route: async () => undefined,
    setDefaultTimeout: () => undefined,
    setDefaultNavigationTimeout: () => undefined,
    close: async () => { pageClosed += 1; }
  } as unknown as Page;
  const mockContext = {
    newPage: async () => mockPage,
    close: async () => { contextClosed += 1; }
  } as unknown as BrowserContext;
  const mockBrowser = {
    newContext: async () => mockContext,
    close: async () => { browserClosed += 1; }
  } as unknown as Browser;

  chromium.launch = (async () => mockBrowser) as typeof chromium.launch;
  try {
    await assert.rejects(
      withPlaywrightPage(async () => {
        throw new Error('Simulated browser action failure');
      }),
      /Simulated browser action failure/
    );
    assert.equal(pageClosed, 1);
    assert.equal(contextClosed, 1);
    assert.equal(browserClosed, 1);
    console.log('✓ Page, isolated context, and browser are closed after a Playwright action fails.');
  } finally {
    chromium.launch = originalLaunch;
  }
}

runTests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
