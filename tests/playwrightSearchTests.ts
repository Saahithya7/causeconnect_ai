import assert from 'node:assert/strict';
import {
  classifyIdealistResultState,
  classifyLiveSearchError,
  classifyNavigationError,
  classifySearchResponseStatus,
  isIdealistResultsResponse,
  isRelevantIdealistListing,
  normalizeIdealistListing,
  waitForIdealistSearchResponse
} from '../src/server/playwrightService.js';
import { searchVolunteerOpportunities } from '../src/services/browserbaseService.js';

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
  console.log('✓ Search navigation and HTTP failure states are distinguished.');

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

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({
      success: true,
      opportunities: [],
      sourceSummary: 'Search completed with no matching opportunities.'
    }), { status: 200 });
    const emptyResult = await searchVolunteerOpportunities({ location: 'Bengaluru' });
    assert.equal(emptyResult.success, true);
    assert.equal(emptyResult.opportunities.length, 0);

    globalThis.fetch = async () => new Response(JSON.stringify({
      success: false,
      opportunities: [],
      error: 'Idealist results response timed out.',
      errorCode: 'source_response_timeout',
      sourceSummary: 'Live discovery did not receive a completed results response.'
    }), { status: 503 });
    const failedResult = await searchVolunteerOpportunities({ location: 'Bengaluru' });
    assert.equal(failedResult.success, false);
    assert.match(failedResult.error || '', /timed out/i);
    assert.match(failedResult.sourceSummary || '', /did not receive/i);
    assert.equal(failedResult.errorCode, 'source_response_timeout');
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log('✓ Frontend distinguishes a successful empty result from an API/search failure.');
}

runTests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
