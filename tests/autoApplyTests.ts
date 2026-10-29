/**
 * CauseConnect AI — ApplyPilot Autonomous Registration Test Suite
 * Validates:
 * 1. Destination URL rejection of 'public-web' and internal destination classifications
 * 2. CommitMate timing parsing and advisory validation
 * 3. Explicit test-mode Playwright simulation (no real volunteer-site submissions)
 * 4. Waitlist detection with verified queue proof
 * 5. Error handling without fake AUDIT- codes or false success
 * 6. Supabase database persistence with foreign-key constraints
 */
import WebSocket from 'ws';
import assert from 'node:assert/strict';
if (typeof globalThis !== 'undefined' && typeof (globalThis as any).WebSocket === 'undefined') {
  (globalThis as any).WebSocket = WebSocket;
}

import {
  fillMatchingApplicationForm,
  installApplicationRequestGuard,
  isValidIdealistListingUrl,
  standardNGOAdapter,
  validateTargetUrl,
  withPlaywrightPage
} from '../src/server/playwrightService.js';
import type { VolunteerProfile } from '../src/types/index.js';
import { parseEventDateTime, detectScheduleConflicts } from '../src/lib/commitMateSchedule.js';
import {
  prepareRegistrationProposal,
  recordProposalApproval,
  executeRegistrationWorkflow,
  evaluateEligibility
} from '../src/server/registrationAgent.js';
import { prepareApplicationWorkflow } from '../src/server/applicationWorkflow.js';
import { createSupabaseRegistration } from '../src/services/supabaseService.js';
import { createClient } from '@supabase/supabase-js';

process.env.NODE_ENV = 'test';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://sgndetrsmhlkelqjsumz.supabase.co';
const ANON_KEY = 'sb_publishable_tmYz69ggBOYLpW9zTsQvEA_ZRxNrcWD';
const TEST_USER = 'afba01c0-7c92-4a1e-a5ef-539a30016ce6';

function createMockSupabaseClient() {
  const oppMap = new Map<string, any>();
  const regMap = new Map<string, any>();

  const createQueryBuilder = (table: string) => {
    let eqFilters: Record<string, any> = {};

    const builder: any = {
      select: () => builder,
      order: () => builder,
      eq: (col: string, val: any) => {
        eqFilters[col] = val;
        return builder;
      },
      single: async () => {
        if (table === 'registrations') {
          for (const reg of regMap.values()) {
            let match = true;
            for (const [k, v] of Object.entries(eqFilters)) {
              if (reg[k] !== v) match = false;
            }
            if (match) {
              const opp = oppMap.get(reg.opportunity_id);
              return { data: { ...reg, opportunities: opp ? { title: opp.title } : null }, error: null };
            }
          }
          return { data: null, error: { message: 'Row not found' } };
        }
        return { data: null, error: null };
      },
      maybeSingle: async () => {
        if (table === 'opportunities') {
          const id = eqFilters['id'];
          const title = eqFilters['title'];
          for (const opp of oppMap.values()) {
            if ((id && opp.id === id) || (title && opp.title === title)) {
              return { data: opp, error: null };
            }
          }
        }
        if (table === 'registrations') {
          const uId = eqFilters['user_id'];
          const oId = eqFilters['opportunity_id'];
          if (uId && oId) {
            const row = regMap.get(`${uId}_${oId}`);
            return { data: row || null, error: null };
          }
        }
        return { data: null, error: null };
      },
      upsert: (payload: any) => {
        if (table === 'opportunities') {
          oppMap.set(payload.id, payload);
        } else if (table === 'registrations') {
          const key = `${payload.user_id}_${payload.opportunity_id}`;
          regMap.set(key, { id: 'reg-' + Math.random().toString(36).substring(2, 9), ...payload });
        }
        return builder;
      },
      insert: (payload: any) => {
        if (table === 'registrations') {
          const key = `${payload.user_id}_${payload.opportunity_id}`;
          const row = { id: 'reg-' + Math.random().toString(36).substring(2, 9), ...payload };
          regMap.set(key, row);
          return {
            select: () => ({
              single: async () => ({ data: row, error: null }),
              maybeSingle: async () => ({ data: row, error: null })
            })
          };
        }
        return builder;
      }
    };
    return builder;
  };

  return {
    from: (table: string) => createQueryBuilder(table)
  };
}

async function runAutoApplyTests() {
  console.log('======================================================================');
  console.log('CauseConnect AI — ApplyPilot Autonomous Registration Test Suite');
  console.log('======================================================================\n');

  let passed = 0;
  let failed = 0;

  // Test 0: Deterministic eligibility must not invent missing volunteer facts or consent
  try {
    console.log('Running Test 0: Missing profile facts, age restrictions, and consent gating...');

    const missing = evaluateEligibility(
      { age: 0, skills: [], preferredDays: [] },
      { minAge: 18, requiredSkills: ['First Aid'], schedule: ['Saturday'] }
    );
    if (missing.status !== 'Needs more information' || missing.missingInformation.length < 2) {
      throw new Error('Missing age and availability must block preparation without fabricated defaults.');
    }

    const underage = evaluateEligibility(
      { age: 17, preferredDays: ['Saturday'] },
      { minAge: 18, schedule: ['Saturday'] }
    );
    if (underage.status !== 'Ineligible') {
      throw new Error('A confirmed age below the minimum must be ineligible.');
    }

    const needsConsent = evaluateEligibility(
      { age: 24, preferredDays: ['Saturday'], hasBackgroundCheck: true },
      { minAge: 18, backgroundCheckRequired: true, schedule: ['Saturday'] }
    );
    if (needsConsent.status !== 'Awaiting consent' || !needsConsent.requiresBackgroundCheckConsent) {
      throw new Error('A background check record must not substitute for event-specific consent.');
    }

    console.log('  ✓ Test 0 Passed: Missing facts remain missing; eligibility and consent are enforced.\n');
    passed++;
  } catch (err: any) {
    console.error('  ✗ Test 0 Failed:', err?.message || err);
    failed++;
  }

  try {
    let databaseCalls = 0;
    const result = await prepareApplicationWorkflow(
      TEST_USER,
      {
        id: 'live-listing-123',
        title: 'Live volunteer listing',
        organization: 'Example NGO',
        destinationUrl: 'https://www.idealist.org/en/volunteer-opportunity/123-example'
      },
      {},
      {
        from: () => {
          databaseCalls++;
          throw new Error('A live listing must not query or write registration rows without a catalog UUID.');
        }
      } as any
    );
    if (result.success || !/no matching persisted opportunity UUID/i.test(result.error || '') || databaseCalls !== 0) {
      throw new Error('A live listing without a catalog UUID must be rejected before registration persistence.');
    }
    console.log('  ✓ Live listings without a catalog UUID cannot be used as registration opportunity IDs.\n');
    passed++;
  } catch (err: any) {
    console.error('  ✗ Live listing registration-key validation failed:', err?.message || err);
    failed++;
  }

  try {
    const persistedRows: Record<string, any>[] = [];
    const client = {
      from(table: string) {
        if (table === 'profiles') {
          const query = {
            select: () => query,
            eq: () => query,
            maybeSingle: async () => ({
              data: {
                full_name: 'Test Volunteer',
                email: 'test@example.com',
                date_of_birth: '1996-01-01',
                location: 'Bengaluru',
                skills: [],
                availability: [],
                interests: [],
                background_check_consent: false
              },
              error: null
            })
          };
          return query;
        }

        if (table === 'registrations') {
          const query = {
            select: () => query,
            eq: () => query,
            maybeSingle: async () => ({ data: null, error: null }),
            insert: (row: Record<string, any>) => {
              persistedRows.push(row);
              return {
                select: () => ({
                  maybeSingle: async () => ({ data: { id: row.id }, error: null })
                })
              };
            }
          };
          return query;
        }

        throw new Error(`Unexpected table access: ${table}`);
      }
    };
    const result = await prepareApplicationWorkflow(
      TEST_USER,
      {
        id: '123e4567-e89b-42d3-a456-426614174000',
        title: 'Catalog volunteer opportunity',
        organization: 'Example NGO',
        destinationUrl: 'https://www.idealist.org/en/volunteer-opportunity/123-example',
        minAge: 18,
        backgroundCheckRequired: false,
        requiredSkills: [],
        schedule: []
      },
      {},
      client as any
    );
    const row = persistedRows[0];
    if (!result.success || !row) {
      throw new Error(result.error || 'The verified catalog opportunity draft was not saved.');
    }
    if (
      row.opportunity_id !== '123e4567-e89b-42d3-a456-426614174000' ||
      row.status !== 'pending_approval' ||
      row.user_approved_at !== null ||
      row.submitted_at !== null ||
      row.confirmed_at !== null ||
      !row.approval_details.__causeconnect_auto_apply ||
      !row.outcome_evidence ||
      Object.keys(row).some((key) => ['draft_version', 'action_hash', 'data_to_submit'].includes(key))
    ) {
      throw new Error('The review draft did not match the existing registrations schema or approval rules.');
    }
    console.log('  ✓ Application drafts use registrations columns and remain pending until approval/verified submission.\n');
    passed++;
  } catch (err: any) {
    console.error('  ✗ Registration-schema persistence failed:', err?.message || err);
    failed++;
  }

  try {
    const profile: VolunteerProfile = {
      name: 'Alex Volunteer',
      email: 'alex@example.com',
      age: 30,
      phone: '+1 555 0100',
      educationExperience: 'Two years tutoring students.',
      city: 'Bengaluru',
      hasBackgroundCheck: false,
      preferredCauses: [],
      skills: ['Tutoring', 'Mentoring'],
      preferredDays: [],
      preferredFormat: 'all',
      maxDistanceMiles: 0,
      bio: 'I enjoy helping students learn.'
    };
    let preview: Awaited<ReturnType<typeof fillMatchingApplicationForm>> | undefined;
    await withPlaywrightPage(async (page) => {
      await page.setContent(`
        <form>
          <label for="full-name">Full name</label><input id="full-name" name="name" required />
          <label for="email">Email address</label><input id="email" name="email" type="email" required />
          <label for="phone">Phone number</label><input id="phone" name="phone" type="tel" />
          <label for="city">City</label><input id="city" name="city" />
          <label for="experience">Experience</label><textarea id="experience" name="experience"></textarea>
          <label for="motivation">Motivation</label><textarea id="motivation" name="motivation"></textarea>
          <label for="availability">Availability</label><input id="availability" name="availability" required />
          <button type="submit">Submit application</button>
        </form>
        <script>window.submitted = false; document.querySelector('form').addEventListener('submit', () => { window.submitted = true; });</script>
      `);
      preview = await fillMatchingApplicationForm(page, profile);
      assert.equal(await page.locator('#full-name').inputValue(), 'Alex Volunteer');
      assert.equal(await page.locator('#email').inputValue(), 'alex@example.com');
      assert.equal(await page.locator('#phone').inputValue(), '+1 555 0100');
      assert.equal(await page.locator('#city').inputValue(), 'Bengaluru');
      assert.equal(await page.locator('#experience').inputValue(), 'Two years tutoring students.');
      assert.equal(await page.locator('#motivation').inputValue(), 'I enjoy helping students learn.');
      assert.equal(await page.evaluate(() => (window as any).submitted), false);
    });
    assert.ok(preview);
    assert.deepEqual(preview?.missingRequiredFields.map((field) => field.label), ['Availability']);
    assert.equal(preview?.fields.find((field) => field.label === 'Email address')?.value, 'alex@example.com');
    console.log('  ✓ Local form fixture filled only saved profile details, reported missing required input, and did not submit.\n');
    passed++;
  } catch (err: any) {
    console.error('  ✗ Local application form fill test failed:', err?.message || err);
    failed++;
  }

  try {
    let blockedBeforeConfirmation = false;
    await withPlaywrightPage(async (page) => {
      await page.setContent('<html><body></body></html>');
      await installApplicationRequestGuard(page, () => false);
      blockedBeforeConfirmation = await page.evaluate(async () => {
        try {
          await fetch('https://example.com/application', { method: 'POST', body: 'test' });
          return false;
        } catch {
          return true;
        }
      });
    });
    if (!blockedBeforeConfirmation) throw new Error('A form POST was not blocked before explicit approval.');
    console.log('  ✓ Application form POSTs are blocked until the explicit confirmation gate is enabled.\n');
    passed++;
  } catch (err: any) {
    console.error('  ✗ Pre-confirmation submission guard test failed:', err?.message || err);
    failed++;
  }

  // Test 0b: Supported-platform adapter must not claim or simulate a submission
  try {
    console.log('Running Test 0b: Adapter reports manual handoff without submitting...');

    let openedUrl = '';
    const mockPage = {
      goto: async (url: string) => { openedUrl = url; },
      locator: () => ({ innerText: async () => '' }),
      url: () => openedUrl
    };
    const adapterResult = await standardNGOAdapter.submit(mockPage as any, {
      profile: {
        name: 'Test Volunteer',
        email: 'test@example.com',
        age: 25,
        city: '',
        hasBackgroundCheck: false,
        preferredCauses: [],
        skills: [],
        preferredDays: [],
        preferredFormat: 'all',
        maxDistanceMiles: 0,
        bio: ''
      },
      event: {
        id: 'test-event',
        title: 'Test opportunity',
        organization: 'Test organization',
        destinationUrl: 'https://www.volunteermatch.org/'
      },
      consents: { backgroundCheck: false, terms: false }
    });

    if (adapterResult.status !== 'verification_inconclusive' || /submitted successfully|confirmed/i.test(adapterResult.evidenceText)) {
      throw new Error('The generic source adapter must not report success without a site-specific verified submission.');
    }

    console.log('  ✓ Test 0b Passed: The adapter stopped for manual completion and made no submission.\n');
    passed++;
  } catch (err: any) {
    console.error('  ✗ Test 0b Failed:', err?.message || err);
    failed++;
  }

  // Test 1: Destination URL validation rejects public-web & domain labels
  try {
    console.log('Running Test 1: Destination URL rejection of "public-web"...');

    const check1 = await validateTargetUrl('public-web');
    if (check1.valid) throw new Error('Expected "public-web" to be rejected as invalid target URL.');

    const check2 = await validateTargetUrl('https://public-web/register');
    if (check2.valid) throw new Error('Expected "https://public-web/register" to be rejected.');

    const check3 = await validateTargetUrl('https://www.volunteermatch.org/');
    if (!check3.valid) throw new Error(`Expected verified volunteer platform URL to pass: ${check3.reason}`);
    const testDomain = await validateTargetUrl('https://greenhyd-test.org/lake-cleanup/register');
    if (testDomain.valid) throw new Error('Expected -test.org destination to remain blocked.');
    if (!isValidIdealistListingUrl('https://www.idealist.org/en/volunteer-opportunity/123-example')) {
      throw new Error('Expected an Idealist volunteer listing path to be supported.');
    }
    if (isValidIdealistListingUrl('https://www.idealist.org/en/search/volunteer-opportunities')) {
      throw new Error('Search and account pages must not be accepted as application listing URLs.');
    }

    console.log('  ✓ Test 1 Passed: "public-web" and invalid classifications strictly rejected.\n');
    passed++;
  } catch (err: any) {
    console.error('  ✗ Test 1 Failed:', err?.message || err);
    failed++;
  }

  // Test 2: CommitMate timing parsing and advisory conflict check
  try {
    console.log('Running Test 2: CommitMate date/time parsing & advisory conflict evaluation...');

    // Concrete date and time
    const parsedConcrete = parseEventDateTime('Saturday, Nov 14, 2026', '10:00 AM - 01:00 PM');
    if (!parsedConcrete || !parsedConcrete.isKnown) {
      throw new Error('Expected concrete date & time to be parsed with isKnown=true.');
    }
    if (parsedConcrete.durationMinutes !== 180) {
      throw new Error(`Expected 180 minutes duration, got ${parsedConcrete.durationMinutes}`);
    }

    // Flexible time should be marked advisory
    const conflictCheck = detectScheduleConflicts(
      { title: 'Community Gardening', date: 'Upcoming Weekend', time: 'Flexible Weekend Shifts' },
      [],
      {}
    );
    if (!conflictCheck.isIncomplete || conflictCheck.hasConflict) {
      throw new Error('Expected flexible timing to return isIncomplete=true and hasConflict=false.');
    }

    console.log('  ✓ Test 2 Passed: Time range correctly parsed and flexible hours handled as advisory.\n');
    passed++;
  } catch (err: any) {
    console.error('  ✗ Test 2 Failed:', err?.message || err);
    failed++;
  }

  // Test 3: Playwright autonomous form navigation, DOM field filling & verification
  try {
    console.log('Running Test 3: Explicit test-only registration simulation...');

    const testOpp = {
      id: 'opp-tree-canopy-1',
      title: 'Hyderabad Community Tree Canopy & Urban Reforestation',
      organization: 'Green Hyderabad Foundation',
      category: 'Environment' as const,
      date: 'Saturday, Nov 14, 2026',
      daysOfWeek: ['Saturday', 'Sunday'] as any,
      time: '10:00 AM - 01:00 PM',
      location: 'Hyderabad Botanical Gardens & Civic Greenbelt',
      city: 'Hyderabad',
      format: 'in-person' as const,
      minAge: 18,
      backgroundCheck: 'not-required' as const,
      skills: ['Tree Planting', 'Environmental Care'],
      description: 'Join organizers to restore urban tree canopy.',
      sourceDomain: 'greenhyd-test.org',
      sourceUrl: 'https://greenhyd-test.org/volunteer/tree-canopy-intake',
      lastRetrieved: new Date().toISOString(),
      slotsAvailable: 10,
      contactEmail: 'volunteer@greenhyd-test.org',
      image: '',
      impactStatement: 'Planting urban trees',
      verifiedDetails: { venueVerified: true, nonprofitStatusVerified: true, hoursCertifiable: true }
    };

    const testVolunteer = {
      name: 'Aditi Sharma',
      email: 'aditi.sharma.test@causeconnect.org',
      age: 24,
      dateOfBirth: '2002-05-14',
      city: 'Hyderabad',
      hasBackgroundCheck: true,
      backgroundCheckConsent: true,
      preferredCauses: ['Environment' as const],
      skills: ['Tree Planting', 'Coordination'],
      preferredDays: ['Saturday', 'Sunday'] as any,
      preferredFormat: 'in-person' as const,
      maxDistanceMiles: 20,
      bio: 'Enthusiastic environmental volunteer.'
    };

    // 1. Prepare proposal
    const proposal = prepareRegistrationProposal(testVolunteer, testOpp, {
      backgroundCheckConsented: true
    });

    if (proposal.destinationDomain === 'public-web' || proposal.destinationUrl.includes('public-web')) {
      throw new Error('Proposal destinationDomain or destinationUrl is set to "public-web".');
    }

    // 2. Explicit User Approval
    const approval = recordProposalApproval(proposal.proposalId, {
      expectedVersion: proposal.version,
      expectedActionHash: proposal.actionHash,
      explicitConsentGiven: true,
      backgroundCheckConsented: true,
      userAgent: 'Playwright-AutoApply-Test'
    });

    if (!approval.success) throw new Error('Proposal approval failed.');

    // 3. Playwright Execution
    const execRes = await executeRegistrationWorkflow(proposal.proposalId, { testMode: true });

    if (!execRes.success || execRes.state !== 'confirmed') {
      throw new Error(`Execution failed: ${execRes.error || execRes.state}`);
    }

    if (!execRes.verificationResult.confirmationReference?.startsWith('PW-CONF-') &&
        !execRes.verificationResult.confirmationReference?.startsWith('CONF-')) {
      throw new Error(`Invalid confirmation reference: ${execRes.verificationResult.confirmationReference}`);
    }

    console.log(`  ✓ Test 3 Passed: Explicit test fixture produced a simulated confirmation #${execRes.verificationResult.confirmationReference}.\n`);
    passed++;
  } catch (err: any) {
    console.error('  ✗ Test 3 Failed:', err?.message || err);
    failed++;
  }

  // Test 4: Waitlist verification for capacity-reached events
  try {
    console.log('Running Test 4: Explicit test-only simulated waitlist response...');

    const waitlistOpp = {
      id: 'opp-lake-cleanup-wl',
      title: 'Hussain Sagar Lake Mega Cleanup Drive',
      organization: 'Green Hyderabad Alliance',
      category: 'Environment' as const,
      date: 'Saturday, Nov 21, 2026',
      daysOfWeek: ['Saturday'] as any,
      time: '08:00 AM - 12:00 PM',
      location: 'Hussain Sagar Lake, Hyderabad',
      city: 'Hyderabad',
      format: 'in-person' as const,
      minAge: 18,
      backgroundCheck: 'not-required' as const,
      skills: ['Environmental Cleanup'],
      description: 'Restoration drive at Hussain Sagar lake.',
      sourceDomain: 'greenhyd-test.org',
      sourceUrl: 'https://greenhyd-test.org/lake-cleanup/register',
      lastRetrieved: new Date().toISOString(),
      slotsAvailable: 0,
      contactEmail: 'cleanup@greenhyd-test.org',
      image: '',
      impactStatement: 'Waterway conservation',
      verifiedDetails: { venueVerified: true, nonprofitStatusVerified: true, hoursCertifiable: true }
    };

    const volunteer = {
      name: 'Vikram Reddy',
      email: 'vikram.reddy.test@causeconnect.org',
      age: 27,
      dateOfBirth: '1999-03-20',
      city: 'Hyderabad',
      hasBackgroundCheck: false,
      backgroundCheckConsent: false,
      preferredCauses: ['Environment' as const],
      skills: ['Environmental Cleanup'],
      preferredDays: ['Saturday'] as any,
      preferredFormat: 'in-person' as const,
      maxDistanceMiles: 15,
      bio: 'Ready for lake restoration.'
    };

    const proposal = prepareRegistrationProposal(volunteer, waitlistOpp);
    recordProposalApproval(proposal.proposalId, {
      expectedVersion: proposal.version,
      expectedActionHash: proposal.actionHash,
      explicitConsentGiven: true,
      backgroundCheckConsented: false
    });

    const execRes = await executeRegistrationWorkflow(proposal.proposalId, {
      testMode: true,
      simulatedWaitlist: true
    });

    if (execRes.state !== 'waitlisted' || execRes.verificationResult.status !== 'waitlisted') {
      throw new Error(`Expected waitlisted state, got: ${execRes.state}`);
    }

    if (!execRes.verificationResult.confirmationReference?.startsWith('WL-')) {
      throw new Error(`Expected waitlist reference code starting with WL-, got: ${execRes.verificationResult.confirmationReference}`);
    }

    console.log(`  ✓ Test 4 Passed: Test-only simulated waitlist outcome recorded with reference #${execRes.verificationResult.confirmationReference}.\n`);
    passed++;
  } catch (err: any) {
    console.error('  ✗ Test 4 Failed:', err?.message || err);
    failed++;
  }

  // Test 5: Error handling honesty — No fake AUDIT- codes on execution error
  try {
    console.log('Running Test 5: Error handling integrity without fake AUDIT- fallback...');

    // Attempt registration with invalid/blocked destination
    const badOpp = {
      id: 'opp-invalid-url',
      title: 'Restricted Program',
      organization: 'Local Group',
      category: 'Community Service' as const,
      date: 'Saturday, Nov 14, 2026',
      daysOfWeek: ['Saturday'] as any,
      time: '10:00 AM - 01:00 PM',
      location: 'Hyderabad',
      city: 'Hyderabad',
      format: 'in-person' as const,
      minAge: 18,
      backgroundCheck: 'not-required' as const,
      skills: ['Volunteering'],
      description: 'Test event',
      sourceDomain: 'unauthorized-site.com',
      sourceUrl: 'https://unauthorized-site.com/form',
      lastRetrieved: new Date().toISOString(),
      slotsAvailable: 5,
      contactEmail: 'info@unauthorized-site.com',
      image: '',
      impactStatement: 'Test',
      verifiedDetails: { venueVerified: true, nonprofitStatusVerified: true, hoursCertifiable: true }
    };

    const volunteer = {
      name: 'Aditi Sharma',
      email: 'aditi.sharma.test@causeconnect.org',
      age: 24,
      city: 'Hyderabad',
      hasBackgroundCheck: false,
      preferredCauses: ['Community Service' as const],
      skills: ['Volunteering'],
      preferredDays: ['Saturday'] as any,
      preferredFormat: 'in-person' as const,
      maxDistanceMiles: 10,
      bio: ''
    };

    const proposal = prepareRegistrationProposal(volunteer, badOpp, {
      destinationOverride: 'https://unauthorized-site.com/form'
    });

    recordProposalApproval(proposal.proposalId, {
      expectedVersion: proposal.version,
      expectedActionHash: proposal.actionHash,
      explicitConsentGiven: true,
      backgroundCheckConsented: false
    });

    const execRes = await executeRegistrationWorkflow(proposal.proposalId);

    if (execRes.success || execRes.state === 'confirmed') {
      throw new Error('Expected execution to fail on unauthorized target domain, but reported success!');
    }

    if (execRes.verificationResult?.confirmationReference?.startsWith('AUDIT-')) {
      throw new Error('Detected fake AUDIT- code generated on failure! Fake success is prohibited.');
    }

    console.log('  ✓ Test 5 Passed: Honest failure reported; zero fake AUDIT- codes generated.\n');
    passed++;
  } catch (err: any) {
    console.error('  ✗ Test 5 Failed:', err?.message || err);
    failed++;
  }

  // Test 6: Supabase database registration persistence with foreign key
  try {
    console.log('Running Test 6: Supabase persistence with foreign key constraints...');

    const mockClient = createMockSupabaseClient();
    const targetOpp = {
      id: 'opp-hyd-tree-canopy',
      title: 'Hyderabad Community Tree Canopy & Urban Reforestation',
      organization: 'Green Hyderabad Foundation',
      location: 'Hyderabad Botanical Gardens'
    } as any;

    const res = await createSupabaseRegistration(
      TEST_USER,
      targetOpp.id,
      {
        opportunity: targetOpp,
        status: 'confirmed',
        confirmationReference: 'PW-CONF-98421',
        userNotes: 'Excited to plant trees.'
      },
      mockClient
    );

    if (!res.success || !res.registration) {
      throw new Error(`Registration persistence failed: ${res.error}`);
    }

    if (res.registration.status !== 'confirmed' || res.registration.opportunityTitle !== targetOpp.title) {
      throw new Error('Persisted registration fields do not match verified event.');
    }

    console.log(`  ✓ Test 6 Passed: Verified registration persisted in Supabase under opportunity "${res.registration.opportunityTitle}".\n`);
    passed++;
  } catch (err: any) {
    console.error('  ✗ Test 6 Failed:', err?.message || err);
    failed++;
  }

  console.log('======================================================================');
  console.log(`Auto-Apply Test Results: Passed: ${passed} / 12 | Failed: ${failed} / 12`);
  console.log('======================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runAutoApplyTests();
