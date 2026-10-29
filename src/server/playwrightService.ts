import { chromium, Browser, BrowserContext, Page } from 'playwright';
import crypto from 'crypto';
import dns from 'dns';
import { isIP } from 'net';
import type {
  VolunteerProfile,
  ApplicationStatus,
  ApplicationRecord
} from '../types/index.js';

// Only retain platforms whose volunteer-search purpose is independently established.
export const APPROVED_TARGET_DOMAINS = [
  'volunteermatch.org',
  'idealist.org'
];

function isApprovedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  return APPROVED_TARGET_DOMAINS.some(
    (domain) => normalized === domain || normalized.endsWith(`.${domain}`)
  );
}

function isPublicIpAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const octets = address.split('.').map(Number);
    const [first, second] = octets;
    return !(
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 0) ||
      (first === 192 && second === 168) ||
      (first === 198 && (second === 18 || second === 19 || second === 51)) ||
      (first === 203 && second === 0) ||
      first >= 224
    );
  }

  if (family === 6) {
    const normalized = address.toLowerCase();
    return /^[23][0-9a-f]{3}:/.test(normalized) && !normalized.startsWith('2001:db8:');
  }

  return false;
}

async function resolvesOnlyToPublicAddresses(hostname: string): Promise<boolean> {
  if (isIP(hostname)) return isPublicIpAddress(hostname);

  const addresses = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  return addresses.length > 0 && addresses.every(({ address }) => isPublicIpAddress(address));
}

/**
 * Strict SSRF check & URL security validator
 * Validates protocol, domain whitelist, and ensures no internal/private IP ranges.
 */
export async function validateTargetUrl(rawUrl: string): Promise<{ valid: boolean; reason?: string; url?: URL }> {
  try {
    if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim() === '') {
      return { valid: false, reason: 'Target registration URL cannot be empty.' };
    }

    const trimmed = rawUrl.trim();
    if (trimmed.toLowerCase() === 'public-web' || trimmed.includes('//public-web')) {
      return {
        valid: false,
        reason: 'Target URL is an invalid domain classification label ("public-web"). A genuine web registration URL is required.'
      };
    }

    const parsed = new URL(trimmed);

    if (parsed.protocol !== 'https:') {
      return { valid: false, reason: `Disallowed protocol "${parsed.protocol}". HTTPS is required.` };
    }

    if (parsed.username || parsed.password || (parsed.port && parsed.port !== '443')) {
      return { valid: false, reason: 'Target URLs cannot include credentials or non-standard ports.' };
    }

    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');

    if (hostname === 'public-web') {
      return {
        valid: false,
        reason: 'Target URL cannot use internal destination label "public-web". A valid web domain is required.'
      };
    }

    if (!isApprovedHostname(hostname)) {
      return {
        valid: false,
        reason: `Target domain "${hostname}" is not in the approved NGO/partner domain registry. Automated submission is restricted to approved platforms.`
      };
    }

    try {
      if (!(await resolvesOnlyToPublicAddresses(hostname))) {
        return { valid: false, reason: 'Target host resolved to a private, reserved, or non-public network address.' };
      }
    } catch (err: any) {
      return { valid: false, reason: `Failed to resolve target host "${hostname}": ${err?.message || err}` };
    }

    return { valid: true, url: parsed };
  } catch (err: any) {
    return { valid: false, reason: `Invalid URL format: ${err?.message || 'Parse error'}` };
  }
}

/**
 * Singleton Browser Pool with automatic reuse and timeout management
 */
class PlaywrightManager {
  private browser: Browser | null = null;
  private isLaunching = false;

  async getBrowser(): Promise<Browser> {
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }

    if (this.isLaunching) {
      // Wait for existing launch
      while (this.isLaunching) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (this.browser && this.browser.isConnected()) {
        return this.browser;
      }
    }

    this.isLaunching = true;
    try {
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-background-networking'
        ]
      });
      return this.browser;
    } finally {
      this.isLaunching = false;
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }
}

export const playwrightManager = new PlaywrightManager();

/**
 * Executes a scoped browser action with safe isolated lifecycle and timeout bounds
 */
export async function withPlaywrightPage<T>(
  action: (page: Page, context: BrowserContext) => Promise<T>,
  options: { timeoutMs?: number; userAgent?: string } = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs || 25000;
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--disable-background-networking'
      ]
    });

    const context = await browser.newContext({
      userAgent:
        options.userAgent ||
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 CauseConnectBot/2.0',
      viewport: { width: 1280, height: 800 },
      locale: 'en-US'
    });

    const page = await context.newPage();
    await page.route('**/*', async (route) => {
      const requestUrl = route.request().url();
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(requestUrl);
      } catch {
        await route.abort();
        return;
      }

      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        await route.continue();
        return;
      }

      try {
        if (!(await resolvesOnlyToPublicAddresses(parsedUrl.hostname.replace(/^\[|\]$/g, '')))) {
          await route.abort('blockedbyclient');
          return;
        }
        await route.continue();
      } catch {
        await route.abort('blockedbyclient');
      }
    });
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);

    try {
      return await action(page, context);
    } finally {
      await page.close().catch(() => {});
      await context.close().catch(() => {});
    }
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

/**
 * Normalized Discovered Opportunity
 */
export interface DiscoveredOpportunityResult {
  id: string;
  title: string;
  organization?: string;
  location?: string;
  city?: string;
  date?: string;
  time?: string;
  applicationDeadline?: string;
  description?: string;
  category?: string;
  minAge?: number;
  maxAge?: number;
  backgroundCheckRequired?: boolean;
  requiredSkills?: string[];
  eligibility?: string;
  applicationUrl?: string;
  sourceUrl: string;
  sourceDomain: string;
  lastRetrieved: string;
  registrationMethod: 'external_manual';
}

function sanitizeSearchLocation(location: string): string {
  return location
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted email]')
    .replace(/\b\d{1,6}\s+[\w.'-]+(?:\s+[\w.'-]+){0,4}\s+(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|boulevard|blvd)\b/gi, '[redacted address]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[redacted number]')
    .replace(/[^\p{L}\p{N}, .'-]/gu, '')
    .slice(0, 120);
}

function sanitizeSearchError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted email]')
    .replace(/\b(bearer\s+)[A-Z0-9._~+/-]+=*/gi, '$1[redacted]')
    .replace(/\b(token|secret|password|api[_-]?key)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .replace(/https?:\/\/[^\s"'<>]+/gi, (value) => {
      try {
        const url = new URL(value);
        return `${url.origin}${url.pathname}`;
      } catch {
        return '[redacted URL]';
      }
    })
    .slice(0, 500);
}

function sanitizeSearchUrl(value: string): string {
  try {
    const url = new URL(value);
    for (const key of url.searchParams.keys()) {
      url.searchParams.set(key, '[redacted]');
    }
    return url.href;
  } catch {
    return '[invalid URL]';
  }
}

function logPlaywrightSearch(event: string, details: Record<string, unknown>): void {
  console.info(`[Playwright Search] ${JSON.stringify({ event, ...details })}`);
}

type IdealistResultsResponse = {
  url(): string;
  status(): number;
};

type IdealistResultsResponseWaiter = {
  waitForResponse(
    predicate: (response: IdealistResultsResponse) => boolean,
    options: { timeout: number }
  ): Promise<IdealistResultsResponse>;
};

export function isIdealistResultsResponse(response: Pick<IdealistResultsResponse, 'url'>): boolean {
  try {
    const url = new URL(response.url());
    return url.protocol === 'https:' &&
      url.hostname.toLowerCase() === 'www.idealist.org' &&
      url.pathname === '/en/volunteer.data';
  } catch {
    return false;
  }
}

export function classifyNavigationError(error: unknown): 'navigation_timeout' | 'navigation_blocked' | 'navigation_failed' {
  const message = sanitizeSearchError(error);
  if (/timeout/i.test(message)) return 'navigation_timeout';
  if (/blocked|ERR_BLOCKED_BY_CLIENT|ERR_BLOCKED_BY_RESPONSE/i.test(message)) return 'navigation_blocked';
  return 'navigation_failed';
}

export function classifySearchResponseStatus(status: number): 'success' | 'blocked' | 'http_failure' {
  if (status >= 200 && status < 400) return 'success';
  if (status === 401 || status === 403 || status === 429) return 'blocked';
  return 'http_failure';
}

export type LiveSearchErrorCode =
  | 'browser_launch_failed'
  | 'navigation_timeout'
  | 'navigation_blocked'
  | 'page_render_timeout'
  | 'source_blocked'
  | 'source_http_failure'
  | 'manual_step_required'
  | 'source_response_timeout'
  | 'source_url_rejected'
  | 'unexpected_page_structure'
  | 'extraction_failed'
  | 'network_error';

export function classifyLiveSearchError(
  error: string,
  browserLaunched: boolean
): LiveSearchErrorCode {
  const message = error.toLowerCase();
  if (!browserLaunched) return 'browser_launch_failed';
  if (/navigation.*timeout|timeout.*navigation/.test(message)) return 'navigation_timeout';
  if (/navigation.*blocked|blocked.*navigation/.test(message)) return 'navigation_blocked';
  if (/results content.*timed out|listing content.*timed out|matching listing content.*timed out/.test(message)) return 'page_render_timeout';
  if (/captcha|consent gate|manual login|manual robot/.test(message)) return 'manual_step_required';
  if (/redirected to a blocked destination|unapproved|not in the approved/.test(message)) return 'source_url_rejected';
  if (/blocked the browser request|source blocked|http 403|http 429|http 401/.test(message)) return 'source_blocked';
  if (/http \d{3}|unsuccessful http/.test(message)) return 'source_http_failure';
  if (/timed out|timeout/.test(message)) return 'source_response_timeout';
  if (/unexpected page structure|did not contain the observed|no recognizable listing cards|search form/.test(message)) return 'unexpected_page_structure';
  if (/returned listings|could not be safely extracted|none matched/.test(message)) return 'extraction_failed';
  return 'network_error';
}

export async function waitForIdealistSearchResponse(
  page: IdealistResultsResponseWaiter,
  timeout = 15000
): Promise<IdealistResultsResponse> {
  return page.waitForResponse(isIdealistResultsResponse, { timeout });
}

export interface IdealistListingSource {
  title: string;
  organization?: string;
  location?: string;
  description?: string;
  sourceUrl: string;
}

export function isRelevantIdealistListing(
  listing: Pick<IdealistListingSource, 'title' | 'location' | 'sourceUrl'>,
  cityAliases: string[]
): boolean {
  const searchableText = `${listing.title} ${listing.location || ''} ${listing.sourceUrl}`.toLowerCase();
  return cityAliases.some((alias) => searchableText.includes(alias)) ||
    (/\bremote\b/i.test(`${listing.title} ${listing.location || ''}`) &&
      /\banywhere\b/i.test(listing.location || ''));
}

export function isValidIdealistListingUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' &&
      isApprovedHostname(url.hostname) &&
      /^\/en\/volunteer-opportunity\//.test(url.pathname);
  } catch {
    return false;
  }
}

export function normalizeIdealistListing(source: IdealistListingSource): IdealistListingSource | null {
  const title = source.title.trim();
  if (!title || !isValidIdealistListingUrl(source.sourceUrl)) return null;

  return {
    title,
    ...(source.organization?.trim() && { organization: source.organization.trim() }),
    ...(source.location?.trim() && { location: source.location.trim() }),
    ...(source.description?.trim() && { description: source.description.trim() }),
    sourceUrl: new URL(source.sourceUrl).href
  };
}

export type IdealistResultState = 'results' | 'no_results' | 'extraction_failed';

export function classifyIdealistResultState(
  listingElements: number,
  extractedListings: number,
  hasNoResultsMessage: boolean
): IdealistResultState {
  if (extractedListings > 0) return 'results';
  if (listingElements === 0 && hasNoResultsMessage) return 'no_results';
  return 'extraction_failed';
}

/**
 * Public Volunteer Search via Playwright
 * Follows the live VolunteerMatch search redirect, applies the location in the
 * rendered Idealist search form, and extracts only source-page listing details.
 */
export async function searchPublicOpportunities(params: {
  location: string;
  interests?: string[];
  preferredDates?: string;
  maxResults?: number;
}): Promise<{
  success: boolean;
  opportunities: DiscoveredOpportunityResult[];
  sourceSummary: string;
  checkedAt: string;
  error?: string;
  errorCode?: LiveSearchErrorCode;
}> {
  const checkedAt = new Date().toISOString();
  const maxResults = Math.max(1, Math.min(params.maxResults || 6, 12));
  const safeLocation = sanitizeSearchLocation(params.location);
  const searchUrl = `https://www.volunteermatch.org/search/?l=${encodeURIComponent(params.location)}`;
  let browserLaunched = false;

  try {
    logPlaywrightSearch('search_started', { location: safeLocation, maxResults });

    const outcome = await withPlaywrightPage(async (page) => {
      browserLaunched = true;
      logPlaywrightSearch('browser_launched', { location: safeLocation });

      const validation = await validateTargetUrl(searchUrl);

      if (!validation.valid) {
        const error = validation.reason || 'Search source URL failed validation.';
        logPlaywrightSearch('source_url_rejected', {
          location: safeLocation,
          error: sanitizeSearchError(error)
        });
        return {
          opportunities: [],
          sourceSummary: 'Live event discovery could not start because the search source URL was rejected.',
          error
        };
      }

      const sourceUrl = new URL(validation.url!.href);
      for (const key of sourceUrl.searchParams.keys()) {
        sourceUrl.searchParams.set(key, '[redacted]');
      }
      logPlaywrightSearch('source_url_validated', {
        location: safeLocation,
        sourceUrl: sourceUrl.href
      });

      let navigationResponse;
      try {
        navigationResponse = await page.goto(validation.url!.href, {
          waitUntil: 'domcontentloaded',
          timeout: 20000
        });
      } catch (navigationError) {
        const title = await page.title().catch(() => '');
        const message = sanitizeSearchError(navigationError);
        const outcome = classifyNavigationError(message);
        logPlaywrightSearch(outcome, {
          location: safeLocation,
          responseStatus: null,
          pageTitle: sanitizeSearchError(title),
          error: message
        });
        return {
          opportunities: [],
          sourceSummary: `Live discovery ${outcome.replaceAll('_', ' ')} while opening the volunteer search page.`,
          error: `Could not open the live volunteer search page (${outcome.replaceAll('_', ' ')}): ${message}`
        };
      }

      const responseStatus = navigationResponse?.status() ?? null;
      const finalUrl = page.url();
      const pageTitle = await page.title().catch(() => '');
      const landingValidation = await validateTargetUrl(finalUrl);
      logPlaywrightSearch('navigation_completed', {
        location: safeLocation,
        sourceUrl: sanitizeSearchUrl(finalUrl),
        responseStatus,
        pageTitle: sanitizeSearchError(pageTitle),
        allowedLanding: landingValidation.valid
      });

      if (!landingValidation.valid) {
        const error = `The search redirected to a blocked destination: ${landingValidation.reason || 'destination is not approved'}`;
        logPlaywrightSearch('redirect_rejected', {
          location: safeLocation,
          responseStatus,
          pageTitle: sanitizeSearchError(pageTitle),
          error: sanitizeSearchError(error)
        });
        return {
          opportunities: [],
          sourceSummary: 'Live discovery stopped because the search redirected outside the approved domains.',
          error
        };
      }

      const navigationStatus = responseStatus === null
        ? 'http_failure'
        : classifySearchResponseStatus(responseStatus);
      if (navigationStatus !== 'success') {
        const blocked = navigationStatus === 'blocked';
        const error = blocked
          ? `The live source blocked the browser request (HTTP ${responseStatus}).`
          : `The live source returned an unsuccessful HTTP response${responseStatus ? ` (HTTP ${responseStatus})` : ''}.`;
        logPlaywrightSearch(blocked ? 'source_blocked' : 'http_failure', {
          location: safeLocation,
          responseStatus,
          pageTitle: sanitizeSearchError(pageTitle),
          error
        });
        return {
          opportunities: [],
          sourceSummary: 'Live discovery failed because the source did not return a usable page.',
          error
        };
      }

      const bodyText = await page.locator('body').innerText().catch(() => '');
      const hasSearchForm = await page.locator('form[data-qa-id="search-inputs"]').count() > 0;
      const hasRobotChallenge = /\b(captcha|verify (that )?you are human|unusual traffic|automated requests)\b/i.test(bodyText);
      const hasConsentBlock = /\b(consent required|privacy choices required|accept cookies to continue|cookie consent required)\b/i.test(bodyText);

      if (hasRobotChallenge || hasConsentBlock) {
        const reason = hasRobotChallenge ? 'robot/CAPTCHA challenge' : 'consent gate';
        const error = `The source requires a manual ${reason}; discovery stopped without interacting with the gate.`;
        logPlaywrightSearch('manual_gate_detected', {
          location: safeLocation,
          responseStatus,
          pageTitle: sanitizeSearchError(pageTitle),
          gate: reason
        });
        return {
          opportunities: [],
          sourceSummary: `Live discovery stopped at a ${reason}.`,
          error
        };
      }

      if (!hasSearchForm) {
        const error = 'The live page did not contain the observed volunteer search form; its page structure may have changed.';
        logPlaywrightSearch('unexpected_page_structure', {
          location: safeLocation,
          responseStatus,
          pageTitle: sanitizeSearchError(pageTitle),
          listingElements: 0,
          error
        });
        return {
          opportunities: [],
          sourceSummary: 'Live discovery could not identify the volunteer search form on the source page.',
          error
        };
      }

      const locationInput = page.locator('input[data-qa-id="location-input"]:visible').first();
      try {
        await locationInput.waitFor({ state: 'visible', timeout: 10000 });
      } catch {
        const error = 'The source search form no longer exposes a visible location field.';
        logPlaywrightSearch('unexpected_search_form', {
          location: safeLocation,
          responseStatus,
          pageTitle: sanitizeSearchError(pageTitle),
          error
        });
        return {
          opportunities: [],
          sourceSummary: 'Live discovery could not apply the requested location to the source search.',
          error
        };
      }

      const requestedCity = params.location.split(',')[0].trim();
      try {
        await locationInput.fill(params.location);
        const locationOption = page.getByRole('option').filter({ hasText: requestedCity }).first();
        await locationOption.waitFor({ state: 'visible', timeout: 10000 });
        await locationOption.click();
      } catch (locationError) {
        const error = `The source did not offer a location suggestion for "${safeLocation}": ${sanitizeSearchError(locationError)}`;
        logPlaywrightSearch('location_selection_failed', {
          location: safeLocation,
          responseStatus,
          pageTitle: sanitizeSearchError(pageTitle),
          error: sanitizeSearchError(error)
        });
        return {
          opportunities: [],
          sourceSummary: 'Live discovery could not select the requested location on the source page.',
          error
        };
      }

      const selectedLocation = (await locationInput.inputValue().catch(() => '')).trim();
      if (!selectedLocation.toLowerCase().includes(requestedCity.toLowerCase())) {
        const error = 'The source did not retain the requested location after selecting its location suggestion.';
        logPlaywrightSearch('location_selection_unconfirmed', {
          location: safeLocation,
          responseStatus,
          pageTitle: sanitizeSearchError(pageTitle),
          error
        });
        return {
          opportunities: [],
          sourceSummary: 'Live discovery could not confirm the requested location in the source search form.',
          error
        };
      }
      logPlaywrightSearch('location_selected', {
        location: safeLocation,
        selectedLocation: sanitizeSearchLocation(selectedLocation)
      });

      const filterCity = params.location.split(',')[0].trim();
      const normalizedCity = filterCity.toLowerCase();
      const cityAliases = normalizedCity === 'bengaluru'
        ? ['bengaluru', 'bangalore']
        : normalizedCity === 'bangalore'
          ? ['bangalore', 'bengaluru']
          : [normalizedCity];
      const searchButton = page.locator('button[data-qa-id="search-button"]:visible').first();
      let sourceSearchResponse: IdealistResultsResponse | null = null;
      try {
        if (await searchButton.count() === 0) {
          throw new Error('The source search button is not available.');
        }
        const [response] = await Promise.all([
          waitForIdealistSearchResponse(page, 15000),
          searchButton.click()
        ]);
        sourceSearchResponse = response;
        const sourceSearchStatus = classifySearchResponseStatus(sourceSearchResponse.status());
        if (sourceSearchStatus !== 'success') {
          const error = `Idealist returned HTTP ${sourceSearchResponse.status()} while loading search results.`;
          logPlaywrightSearch('source_search_http_failure', {
            location: safeLocation,
            responseStatus: sourceSearchResponse.status(),
            pageTitle: sanitizeSearchError(await page.title().catch(() => '')),
            error,
            failureKind: sourceSearchStatus === 'blocked' ? 'source_blocked' : 'source_http_failure'
          });
          return {
            opportunities: [],
            sourceSummary: 'The source did not return usable search results.',
            error
          };
        }

        await page.waitForFunction(
          ({ requestedCities }) => {
            const resultsRegion = document.querySelector('main[data-qa-id="search-results"]');
            if (!resultsRegion) return false;

            const cards = [...resultsRegion.querySelectorAll('[data-qa-id="search-result"] a[href*="/en/volunteer-opportunity/"]')];
            const noResults = /\b(no results|no volunteer opportunities|0 volunteer opportunities)\b/i.test(resultsRegion.textContent || '');
            const hasRelevantListing = cards.some((card) => {
              const title = card.querySelector('[data-qa-id="search-result-link"]')?.textContent?.trim() || '';
              const locationIcon = card.querySelector('[aria-label="location-filled icon"]');
              const location = locationIcon?.parentElement?.parentElement?.textContent?.trim() || '';
              const cardUrl = (card as HTMLAnchorElement).href;
              const text = `${title} ${location} ${cardUrl}`.toLowerCase();
              return requestedCities.some((city) => text.includes(city)) ||
                (/\bremote\b/i.test(`${title} ${location}`) && /\banywhere\b/i.test(location));
            });
            return noResults || hasRelevantListing;
          },
          { requestedCities: cityAliases },
          { timeout: 15000 }
        );
        logPlaywrightSearch('source_search_completed', {
          location: safeLocation,
          responseStatus: sourceSearchResponse.status(),
          pageTitle: sanitizeSearchError(await page.title().catch(() => '')),
          resultHeading: sanitizeSearchError(await page.locator('h2').first().innerText().catch(() => ''))
        });
      } catch (searchError) {
        const message = sanitizeSearchError(searchError);
        const timedOut = /timeout/i.test(message);
        const error = timedOut
          ? sourceSearchResponse
            ? 'Idealist returned a successful search response, but matching listing content did not render before the page timed out.'
            : 'Idealist did not return its volunteer search response before the request timed out.'
          : `The location-filtered source search could not be completed: ${message}`;
        logPlaywrightSearch('source_search_failed', {
          location: safeLocation,
          responseStatus: sourceSearchResponse?.status() ?? responseStatus,
          pageTitle: sanitizeSearchError(await page.title().catch(() => '')),
          error: sanitizeSearchError(error),
          failureKind: timedOut
            ? sourceSearchResponse ? 'page_render_timeout' : 'source_response_timeout'
            : 'source_search_failed'
        });
        return {
          opportunities: [],
          sourceSummary: sourceSearchResponse
            ? 'The source responded, but its matching listing content did not render.'
            : 'Live discovery did not receive a completed results response from the source.',
          error
        };
      }
      if (!sourceSearchResponse) {
        return {
          opportunities: [],
          sourceSummary: 'Live discovery did not receive a completed results response from the source.',
          error: 'Idealist did not return its volunteer search response.'
        };
      }

      const renderedListings = await page
        .locator('main[data-qa-id="search-results"] [data-qa-id="search-result"] a[href*="/en/volunteer-opportunity/"]')
        .evaluateAll((anchors) => anchors.map((anchor) => {
          const title = anchor.querySelector('[data-qa-id="search-result-link"]')?.textContent?.trim() || '';
          const locationIcon = anchor.querySelector('[aria-label="location-filled icon"]');
          return {
            title,
            organization: anchor.querySelector('h4')?.textContent?.trim() || '',
            location: locationIcon?.parentElement?.parentElement?.textContent?.trim() || '',
            description: anchor.querySelector('[data-qa-id="summary"]')?.textContent?.trim() || '',
            sourceUrl: (anchor as HTMLAnchorElement).href
          };
        }));
      const listingCount = renderedListings.length;
      const extracted: DiscoveredOpportunityResult[] = [];
      let locationMatchedListings = 0;

      for (const sourceListing of renderedListings) {
        if (extracted.length >= maxResults) break;
        const title = sourceListing.title.trim();
        if (!title || !sourceListing.sourceUrl) continue;

        const eventUrl = new URL(sourceListing.sourceUrl, page.url());

        if (!isValidIdealistListingUrl(eventUrl.href)) {
          continue;
        }

        const eventValidation = await validateTargetUrl(eventUrl.href);
        if (!eventValidation.valid) {
          continue;
        }

        const organization = sourceListing.organization.trim();
        const location = sourceListing.location.trim();
        const description = sourceListing.description.trim();
        if (!isRelevantIdealistListing({ title, location, sourceUrl: eventUrl.href }, cityAliases)) continue;

        const listing = normalizeIdealistListing({
          title,
          ...(organization && { organization }),
          ...(location && { location }),
          ...(description && { description }),
          sourceUrl: eventUrl.href
        });
        if (!listing) continue;

        locationMatchedListings++;
        extracted.push({
          id: `pw-${crypto.createHash('sha1').update(listing.sourceUrl).digest('hex').slice(0, 16)}`,
          ...listing,
          ...(listing.location && { city: listing.location }),
          sourceDomain: eventUrl.hostname,
          lastRetrieved: checkedAt,
          registrationMethod: 'external_manual'
        });
      }

      const updatedTitle = await page.title().catch(() => '');
      const updatedBodyText = await page.locator('body').innerText().catch(() => '');
      const noResultsMessage = /\b(no results|no volunteer opportunities|0 volunteer opportunities)\b/i.test(updatedBodyText);
      const resultState = classifyIdealistResultState(listingCount, extracted.length, noResultsMessage);
      logPlaywrightSearch('listings_extracted', {
        location: safeLocation,
        responseStatus: sourceSearchResponse.status(),
        pageTitle: sanitizeSearchError(updatedTitle),
        listingElements: listingCount,
        extractedListings: extracted.length,
        resultState
      });

      if (resultState === 'extraction_failed' && listingCount === 0) {
        const error = 'The source returned the search page without recognizable listing cards or a no-results message.';
        logPlaywrightSearch('unexpected_listing_structure', {
          location: safeLocation,
          responseStatus,
          pageTitle: sanitizeSearchError(updatedTitle),
          listingElements: listingCount,
          error
        });
        return {
          opportunities: [],
          sourceSummary: 'Live discovery could not interpret the source search results page.',
          error
        };
      }

      if (resultState === 'extraction_failed') {
        const error = locationMatchedListings === 0
          ? `The source returned listings, but none matched "${safeLocation}" or a location-independent remote listing. No unrelated listings were returned.`
          : 'The source displayed listing elements, but none contained a valid title and approved original event URL.';
        logPlaywrightSearch('unusable_listings', {
          location: safeLocation,
          responseStatus,
          pageTitle: sanitizeSearchError(updatedTitle),
          listingElements: listingCount,
          extractedListings: extracted.length,
          locationMatchedListings,
          error
        });
        return {
          opportunities: [],
          sourceSummary: locationMatchedListings === 0
            ? 'The source returned listings but none matched the requested location.'
            : 'The source displayed listings that could not be safely extracted.',
          error
        };
      }

      return {
        opportunities: extracted,
        sourceSummary: extracted.length
          ? `Live search found ${extracted.length} source-linked volunteer listing${extracted.length === 1 ? '' : 's'} for ${safeLocation}.`
          : `Live search completed for ${safeLocation} and returned no volunteer listings.`,
        error: undefined
      };
    }, { timeoutMs: 15000 });

    return {
      success: !outcome.error,
      opportunities: outcome.opportunities,
      sourceSummary: outcome.sourceSummary,
      checkedAt,
      ...(outcome.error && {
        error: outcome.error,
        errorCode: classifyLiveSearchError(outcome.error, browserLaunched)
      })
    };
  } catch (err: any) {
    const safeError = sanitizeSearchError(err);
    const error = `Live event discovery failed: ${safeError}`;
    const outcome = browserLaunched ? 'search_failed' : 'browser_launch_failed';
    logPlaywrightSearch(outcome, {
      location: safeLocation,
      error: safeError
    });
    return {
      success: false,
      opportunities: [],
      sourceSummary: 'Live event discovery could not be completed.',
      checkedAt,
      error,
      errorCode: classifyLiveSearchError(error, browserLaunched)
    };
  }
}

/**
 * Adapter Architecture for Auto-Apply Form Submissions
 */
export interface ApplicationFormAdapter {
  name: string;
  canHandle(url: string): boolean;
  submit(
    page: Page,
    data: {
      profile: VolunteerProfile;
      event: { id: string; title: string; organization: string; destinationUrl: string };
      consents: { backgroundCheck: boolean; terms: boolean };
    }
  ): Promise<{
    status: ApplicationStatus;
    confirmationReference?: string;
    evidenceText: string;
    observedUrl: string;
  }>;
  verify(
    page: Page,
    application: ApplicationRecord
  ): Promise<{
    verified: boolean;
    status: ApplicationStatus;
    referenceNumber?: string;
    evidence: string;
    observedUrl: string;
  }>;
}

/**
 * Set up realistic mock NGO registration form route interceptors for Playwright
 * Handles test domains with full interactive DOM forms and submission endpoints
 */
export async function setupNGOPlaywrightInterceptors(page: Page): Promise<void> {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Simulated registration pages are available only when NODE_ENV is explicitly set to "test".');
  }

  await page.route('**/*', async (route, request) => {
    const urlStr = request.url();
    let hostname = '';
    try {
      hostname = new URL(urlStr).hostname.toLowerCase();
    } catch {
      await route.continue();
      return;
    }

    const isMockTarget =
      hostname.endsWith('-test.org') ||
      hostname === 'greenhyderabad.org' ||
      hostname === 'openlearnstem.org' ||
      hostname === 'silveroakcommunity.org' ||
      hostname === 'rapidreliefaid.org' ||
      hostname === 'brightvisionaccess.org' ||
      hostname === 'arogyacommunity.org';

    if (!isMockTarget) {
      await route.continue();
      return;
    }

    const method = request.method();

    if (method === 'POST') {
      const isWaitlist = urlStr.includes('waitlist') || urlStr.includes('lake-cleanup');
      const refCode = isWaitlist
        ? `WL-${Math.floor(1000 + Math.random() * 9000)}`
        : `PW-CONF-${Math.floor(10000 + Math.random() * 90000)}`;

      const outcomeHtml = `<!DOCTYPE html>
<html>
<head><title>${isWaitlist ? 'Waitlist Confirmed' : 'Registration Confirmed'}</title></head>
<body>
  <div id="registration-outcome" data-status="${isWaitlist ? 'waitlisted' : 'confirmed'}">
    <h2 id="outcome-heading">${isWaitlist ? 'Placed on Event Waitlist' : 'Application Confirmed & Received'}</h2>
    <p id="outcome-message">${isWaitlist ? 'Active capacity reached. Your volunteer profile has been placed on the priority waitlist.' : 'Your volunteer registration has been successfully confirmed.'}</p>
    <div id="confirmation-code">#${refCode}</div>
  </div>
</body>
</html>`;

      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: outcomeHtml
      });
      return;
    }

    // GET request: Serve full volunteer intake form with standard fields
    const formHtml = `<!DOCTYPE html>
<html>
<head><title>Volunteer Registration</title></head>
<body>
  <h1>Official Volunteer Intake Form</h1>
  <form id="volunteer-registration-form" method="POST" action="${urlStr}">
    <div>
      <label for="fullName">Full Name</label>
      <input type="text" name="name" id="fullName" placeholder="Full Name" required />
    </div>
    <div>
      <label for="email">Email Address</label>
      <input type="email" name="email" id="email" placeholder="Email" required />
    </div>
    <div>
      <label for="phone">Phone Number</label>
      <input type="tel" name="phone" id="phone" placeholder="Phone" />
    </div>
    <div>
      <label for="age">Verified Age</label>
      <input type="number" name="age" id="age" min="16" max="99" required />
    </div>
    <div>
      <label for="city">Residential City</label>
      <input type="text" name="city" id="city" placeholder="City" />
    </div>
    <div>
      <label for="availability">Availability</label>
      <select name="availability" id="availability">
        <option value="Saturday">Saturday Shifts</option>
        <option value="Sunday">Sunday Shifts</option>
        <option value="Weekend">Both Weekend Days</option>
      </select>
    </div>
    <div>
      <label for="motivation">Statement of Purpose</label>
      <textarea name="motivation" id="motivation"></textarea>
    </div>
    <div>
      <label for="terms"><input type="checkbox" name="terms" id="terms" required /> I agree to volunteer guidelines</label>
    </div>
    <div>
      <label for="backgroundCheck"><input type="checkbox" name="background_check" id="backgroundCheck" /> I consent to background check</label>
    </div>
    <div>
      <button type="submit" id="submit-btn">Submit Application</button>
    </div>
  </form>
</body>
</html>`;

    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: formHtml
    });
  });
}

/**
 * Standard NGO Form Adapter
 */
export class StandardNGOFormAdapter implements ApplicationFormAdapter {
  name = 'StandardNGOFormAdapter';

  canHandle(url: string): boolean {
    try {
      return isApprovedHostname(new URL(url).hostname.replace(/^\[|\]$/g, ''));
    } catch {
      return false;
    }
  }

  async submit(
    page: Page,
    data: {
      profile: VolunteerProfile;
      event: { id: string; title: string; organization: string; destinationUrl: string };
      consents: { backgroundCheck: boolean; terms: boolean };
    }
  ): Promise<{
    status: ApplicationStatus;
    confirmationReference?: string;
    evidenceText: string;
    observedUrl: string;
  }> {
    const validation = await validateTargetUrl(data.event.destinationUrl);
    if (!validation.valid) {
      throw new Error(`Target destination validation failed: ${validation.reason}`);
    }

    await page.goto(validation.url!.href, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const pageText = await page.locator('body').innerText().catch(() => '');
    const manualStep = /captcha|sign in|log in|consent|terms and conditions/i.test(pageText)
      ? 'The destination requires a login, CAPTCHA, consent, or another manual step. Complete it directly with the organization.'
      : 'Complete the application directly with the organization. No personal information was entered or submitted.';

    return {
      status: 'verification_inconclusive',
      evidenceText: `${manualStep} CauseConnect did not submit this application; confirmation is still pending.`,
      observedUrl: page.url()
    };
  }

  async verify(
    page: Page,
    application: ApplicationRecord
  ): Promise<{
    verified: boolean;
    status: ApplicationStatus;
    referenceNumber?: string;
    evidence: string;
    observedUrl: string;
  }> {
    const dest = application.destinationUrl;
    const validation = await validateTargetUrl(dest);

    if (!validation.valid || !validation.url) {
      return {
        verified: false,
        status: 'verification_inconclusive',
        evidence: validation.reason || 'Invalid registration destination.',
        observedUrl: dest
      };
    }

    try {
      await page.goto(validation.url.href, {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });

      const pageText = await page.locator('body').innerText();
      const confirmationElementText = await page
        .locator('h1, h2, [role="alert"], [data-status="confirmed"], [data-status="waitlisted"]')
        .allInnerTexts()
        .then((texts) => texts.join(' '))
        .catch(() => '');
      const confirmationVisible =
        /\b(application|registration)\s+(has been\s+)?(successfully\s+)?(submitted|received|confirmed)\b/i
          .test(confirmationElementText);
      const waitlistVisible =
        /\b(placed on (the )?(event )?waitlist|priority waitlist|waitlist confirmed)\b/i
          .test(confirmationElementText);

      if (!confirmationVisible && !waitlistVisible) {
        const manualStep = /captcha|sign in|log in|consent|terms and conditions/i.test(pageText)
          ? 'The destination requires a login, CAPTCHA, consent, or another manual step.'
          : 'No registration confirmation was visible on the destination page.';
        return {
          verified: false,
          status: 'verification_inconclusive',
          evidence: `${manualStep} Status remains unverified.`,
          observedUrl: page.url()
        };
      }

      const status: ApplicationStatus = waitlistVisible
        ? 'waitlisted'
        : 'verified';
      const referenceNumber = await page
        .locator('#confirmation-code, [class*="reference-code"], [data-testid*="confirmation-reference"]')
        .first()
        .innerText()
        .then((text) => text.trim() || undefined)
        .catch(() => undefined);

      return {
        verified: true,
        status,
        referenceNumber,
        evidence: `A registration ${waitlistVisible ? 'waitlist ' : ''}confirmation message was observed on the destination page.`,
        observedUrl: page.url()
      };
    } catch (err: any) {
      return {
        verified: false,
        status: 'verification_inconclusive',
        evidence: `Could not verify the destination: ${err?.message || err}`,
        observedUrl: dest
      };
    }
  }

}
export const standardNGOAdapter = new StandardNGOFormAdapter();
