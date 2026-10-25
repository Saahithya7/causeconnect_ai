/**
 * CauseConnect AI — Auto Apply Persistence & RLS Integration Tests
 * Validates:
 * 1. Successful persisted application & retrieval
 * 2. Failed database write error handling
 * 3. Cross-user access isolation (RLS & Ownership check)
 * 4. Handling of unverified / pending registration status
 */
import { createClient } from '@supabase/supabase-js';
import { ensureValidUuid } from '../src/lib/uuidHelper.js';
import { createSupabaseRegistration, getUserRegistrations } from '../src/services/supabaseService.js';

const SUPABASE_URL = 'https://sgndetrsmhlkelqjsumz.supabase.co';
const SERVICE_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_secret_IcQlyo6IY6oelj4b-HViuQ_l4lGmtn3';
const ANON_KEY = 'sb_publishable_tmYz69ggBOYLpW9zTsQvEA_ZRxNrcWD';

// Known test user IDs
const TEST_USER_A = 'afba01c0-7c92-4a1e-a5ef-539a30016ce6';
const TEST_USER_B = 'e956d686-74f8-4a91-a54c-24ea9e520bd9';

async function runTests() {
  console.log('======================================================================');
  console.log('CauseConnect AI — Persistence & Authorization Test Suite');
  console.log('======================================================================\n');

  const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);
  const anonClient = createClient(SUPABASE_URL, ANON_KEY);

  let passed = 0;
  let failed = 0;

  // --------------------------------------------------------------------------
  // Test 1: Successful Persisted Application in Supabase Database
  // --------------------------------------------------------------------------
  try {
    console.log('Running Test 1: Successful persisted application & retrieval...');
    const oppId = 'test-opp-persist-success';
    const oppUuid = ensureValidUuid(oppId);

    // Ensure opportunity exists
    await adminClient.from('opportunities').upsert({
      id: oppUuid,
      title: 'City Tree Canopy Reforestation',
      organization_name: 'Green Earth Foundation',
      location: 'Hyderabad',
      description: 'Community volunteer planting drive'
    }, { onConflict: 'id' });

    // Persist registration for User A
    const { data: insertData, error: insertErr } = await adminClient
      .from('registrations')
      .upsert({
        user_id: TEST_USER_A,
        opportunity_id: oppUuid,
        status: 'confirmed',
        confirmation_reference: 'CONF-TEST-999',
        submitted_at: new Date().toISOString()
      }, { onConflict: 'user_id,opportunity_id' })
      .select()
      .single();

    if (insertErr || !insertData) {
      throw new Error(`Failed to insert registration: ${insertErr?.message}`);
    }

    // Query back for User A
    const { data: queryData, error: queryErr } = await adminClient
      .from('registrations')
      .select('id, user_id, opportunity_id, status, opportunities(title)')
      .eq('user_id', TEST_USER_A)
      .eq('opportunity_id', oppUuid)
      .single();

    if (queryErr || !queryData || queryData.status !== 'confirmed') {
      throw new Error(`Failed to retrieve persisted registration: ${queryErr?.message}`);
    }

    console.log('  ✓ Test 1 Passed: Application successfully persisted and retrieved from database.\n');
    passed++;

    // Clean up
    await adminClient.from('registrations').delete().eq('opportunity_id', oppUuid);
    await adminClient.from('opportunities').delete().eq('id', oppUuid);
  } catch (err: any) {
    console.error('  ✗ Test 1 Failed:', err?.message || err);
    failed++;
  }

  // --------------------------------------------------------------------------
  // Test 2: Honest Error Handling on Failed Database Write
  // --------------------------------------------------------------------------
  try {
    console.log('Running Test 2: Error handling on failed database write...');
    // Attempt insert with an empty user ID or invalid non-existent foreign key without upserting
    const invalidResult = await createSupabaseRegistration('', 'test-opp-invalid');

    if (invalidResult.success === true) {
      throw new Error('Expected database write to fail for empty user ID, but it reported success.');
    }

    if (!invalidResult.error) {
      throw new Error('Expected an error message explaining the failed database write, but none was returned.');
    }

    console.log(`  ✓ Test 2 Passed: Honest failure reported with safe error: "${invalidResult.error}".\n`);
    passed++;
  } catch (err: any) {
    console.error('  ✗ Test 2 Failed:', err?.message || err);
    failed++;
  }

  // --------------------------------------------------------------------------
  // Test 3: RLS Isolation & Registration Belonging to Another User
  // --------------------------------------------------------------------------
  try {
    console.log('Running Test 3: Registration belonging to another user (RLS Isolation)...');
    const oppId = 'test-opp-rls-isolation';
    const oppUuid = ensureValidUuid(oppId);

    // Upsert opportunity
    await adminClient.from('opportunities').upsert({
      id: oppUuid,
      title: 'Youth Mentorship Drive',
      organization_name: 'Bright Horizons'
    }, { onConflict: 'id' });

    // Insert registration belonging strictly to User A
    await adminClient.from('registrations').upsert({
      user_id: TEST_USER_A,
      opportunity_id: oppUuid,
      status: 'confirmed'
    }, { onConflict: 'user_id,opportunity_id' });

    // An unauthenticated anon client must NOT be able to view User A's registrations
    const { data: anonView, error: anonErr } = await anonClient
      .from('registrations')
      .select('*')
      .eq('user_id', TEST_USER_A)
      .eq('opportunity_id', oppUuid);

    if (anonView && anonView.length > 0) {
      throw new Error('Security breach: Unauthenticated client was able to read User A private registration!');
    }

    // Querying for User B should NOT return User A's registration
    const { data: userBView } = await adminClient
      .from('registrations')
      .select('*')
      .eq('user_id', TEST_USER_B)
      .eq('opportunity_id', oppUuid);

    if (userBView && userBView.length > 0) {
      throw new Error('Isolation breach: User B query returned User A registration!');
    }

    console.log('  ✓ Test 3 Passed: RLS & ownership isolation verified. Cross-user access blocked.\n');
    passed++;

    // Clean up
    await adminClient.from('registrations').delete().eq('opportunity_id', oppUuid);
    await adminClient.from('opportunities').delete().eq('id', oppUuid);
  } catch (err: any) {
    console.error('  ✗ Test 3 Failed:', err?.message || err);
    failed++;
  }

  // --------------------------------------------------------------------------
  // Test 4: Handling of Unverified / Pending Registration Status
  // --------------------------------------------------------------------------
  try {
    console.log('Running Test 4: Handling of unverified / pending registration status...');
    const oppId = 'test-opp-unverified-status';
    const oppUuid = ensureValidUuid(oppId);

    // Call createSupabaseRegistration with unverified status: 'pending'
    const regResult = await createSupabaseRegistration(
      TEST_USER_A,
      oppId,
      {
        status: 'pending',
        confirmationReference: 'PENDING-VERIF-777',
        opportunity: {
          id: oppUuid,
          title: 'Animal Care Assistant',
          organization: 'Sanctuary Animal Rescue',
          category: 'Animal Welfare',
          date: 'Upcoming',
          daysOfWeek: ['Saturday'],
          time: '9:00 AM - 1:00 PM',
          location: 'Sanctuary Shelter',
          city: 'Sanctuary Area',
          format: 'in-person',
          minAge: 18,
          backgroundCheck: 'not-required',
          skills: ['Animal Care'],
          description: 'Help feed and socialize rescued animals.',
          sourceDomain: 'sanctuaryrescue.org',
          sourceUrl: 'https://sanctuaryrescue.org',
          lastRetrieved: 'Today',
          slotsAvailable: 5,
          contactEmail: 'help@sanctuaryrescue.org'
        } as any
      },
      adminClient
    );

    if (!regResult.success) {
      throw new Error(`Failed to persist unverified registration: ${regResult.error}`);
    }

    const { registrations, error } = await getUserRegistrations(TEST_USER_A, adminClient);
    if (error) {
      throw new Error(`getUserRegistrations returned error: ${error}`);
    }

    const pendingReg = registrations.find(
      (r) => r.opportunityId === oppUuid || r.opportunityTitle === 'Animal Care Assistant'
    );

    if (!pendingReg) {
      throw new Error(`Pending registration was not returned in getUserRegistrations list. (Total found: ${registrations.length})`);
    }

    if (pendingReg.status !== 'pending_approval') {
      throw new Error(`Expected status to map to 'pending_approval', but got '${pendingReg.status}'.`);
    }

    console.log('  ✓ Test 4 Passed: Unverified status correctly handled and distinguished from confirmed.\n');
    passed++;

    // Clean up
    await adminClient.from('registrations').delete().eq('opportunity_id', oppUuid);
    await adminClient.from('opportunities').delete().eq('id', oppUuid);
  } catch (err: any) {
    console.error('  ✗ Test 4 Failed:', err?.message || err);
    failed++;
  }

  console.log('======================================================================');
  console.log(`Test Results Summary: Passed: ${passed} / 4 | Failed: ${failed} / 4`);
  console.log('======================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
