/**
 * CauseConnect AI — Modular Volunteer Browser Automation Agent
 * Server-side Playwright service for autonomous NGO registration and independent verification.
 */
import {
  withPlaywrightPage,
  validateTargetUrl,
  APPROVED_TARGET_DOMAINS,
  standardNGOAdapter,
  StandardNGOFormAdapter,
  searchPublicOpportunities,
  type ApplicationFormAdapter,
  type DiscoveredOpportunityResult
} from '../server/playwrightService.js';
import type {
  VolunteerProfile,
  Opportunity,
  ApplicationStatus,
  ApplicationRecord
} from '../types/index.js';

export {
  withPlaywrightPage,
  validateTargetUrl,
  APPROVED_TARGET_DOMAINS,
  standardNGOAdapter,
  StandardNGOFormAdapter,
  searchPublicOpportunities,
  type ApplicationFormAdapter,
  type DiscoveredOpportunityResult
};

/**
 * Registry of supported website adapters
 */
export const registeredAdapters: ApplicationFormAdapter[] = [
  standardNGOAdapter
];

/**
 * Find matching adapter for a given target URL
 */
export function getAdapterForUrl(url: string): ApplicationFormAdapter | null {
  for (const adapter of registeredAdapters) {
    if (adapter.canHandle(url)) {
      return adapter;
    }
  }
  return null;
}

/**
 * Submit volunteer registration through matched NGO adapter
 */
export async function executeVolunteerRegistration(params: {
  profile: VolunteerProfile;
  event: { id: string; title: string; organization: string; destinationUrl: string };
  consents: { backgroundCheck: boolean; terms: boolean };
  timeoutMs?: number;
}): Promise<{
  status: ApplicationStatus;
  confirmationReference?: string;
  evidenceText: string;
  observedUrl: string;
  adapterName: string;
}> {
  const { profile, event, consents, timeoutMs = 25000 } = params;

  // 1. Strict SSRF check & approved target domain verification
  const urlCheck = await validateTargetUrl(event.destinationUrl);
  if (!urlCheck.valid) {
    throw new Error(`Destination validation blocked: ${urlCheck.reason}`);
  }

  // 2. Resolve adapter
  const adapter = getAdapterForUrl(event.destinationUrl);
  if (!adapter) {
    throw new Error(
      `No automated submission adapter is available for "${event.destinationUrl}". Direct manual application is required.`
    );
  }

  // 3. Execute isolated Playwright browser automation
  const submissionResult = await withPlaywrightPage(
    async (page) => {
      return await adapter.submit(page, {
        profile,
        event,
        consents
      });
    },
    { timeoutMs }
  );

  return {
    ...submissionResult,
    adapterName: adapter.name
  };
}

/**
 * Independently verify an existing application status on the destination portal
 */
export async function verifyVolunteerRegistration(
  application: ApplicationRecord,
  timeoutMs = 20000
): Promise<{
  verified: boolean;
  status: ApplicationStatus;
  referenceNumber?: string;
  evidence: string;
  observedUrl: string;
}> {
  const adapter = getAdapterForUrl(application.destinationUrl) || standardNGOAdapter;

  return await withPlaywrightPage(
    async (page) => {
      return await adapter.verify(page, application);
    },
    { timeoutMs }
  );
}
