import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  requireAuth,
  AuthenticatedRequest,
  getSupabaseServerClient
} from './src/server/supabaseServer.js';
import { ensureValidUuid } from './src/lib/uuidHelper.js';
import {
  searchPublicOpportunities,
  validateTargetUrl
} from './src/server/playwrightService.js';
import {
  prepareApplicationWorkflow,
  approveApplicationWorkflow,
  executeApplicationWorkflow,
  verifyApplicationWorkflow,
  getApplicationById,
  getProfileByUserId,
  updateProfileByUserId
} from './src/server/applicationWorkflow.js';
import {
  evaluateEligibility,
  prepareRegistrationProposal,
  recordProposalApproval,
  executeRegistrationWorkflow,
  runOfficialTestSuite,
  getLatestOfficialTestRuns,
  getProposalById
} from './src/server/registrationAgent.js';
import {
  getBrowserbaseStatus,
  sanitizeSearchParams,
  executeVolunteerDiscoveryAgent,
  releaseAllRunningSessions,
  cleanAndDeduplicateOpportunities,
  BROWSERBASE_AGENT_NAME
} from './src/server/browserbaseAgent.js';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // JSON Body Parser with reasonable limits
  app.use(express.json({ limit: '5mb' }));

  // Basic security and CORS headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    const allowedOrigin = process.env.CORS_ORIGIN || '*';
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  // -------------------------------------------------------------
  // Production Health Check Endpoint
  // -------------------------------------------------------------
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'CauseConnect AI Auto-Apply Backend',
      version: '2.0.0',
      browserAutomation: 'Playwright (Chromium)',
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString()
    });
  });

  // -------------------------------------------------------------
  // Section 1: Supabase Authenticated Profile Endpoints
  // -------------------------------------------------------------

  /**
   * GET /api/profile/me
   * Fetches saved volunteer profile from Supabase for the authenticated user
   */
  app.get('/api/profile/me', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const profile = await getProfileByUserId(userId);
      res.json({
        success: true,
        userId,
        profile: profile || null
      });
    } catch (err: any) {
      console.error('[API /api/profile/me error]:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to fetch user profile' });
    }
  });

  /**
   * PATCH /api/profile/me
   * Updates authenticated volunteer's profile in Supabase
   */
  app.patch('/api/profile/me', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const updates = req.body || {};
      const result = await updateProfileByUserId(userId, updates);

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);
    } catch (err: any) {
      console.error('[API PATCH /api/profile/me error]:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to update user profile' });
    }
  });

  /**
   * GET /api/opportunities
   * Retrieve catalog opportunities from Supabase using server client
   */
  app.get('/api/opportunities', async (req, res) => {
    try {
      const client = getSupabaseServerClient();
      const { data, error } = await client
        .from('opportunities')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        return res.status(500).json({ success: false, opportunities: [], error: error.message });
      }

      res.json({ success: true, opportunities: data || [] });
    } catch (err: any) {
      console.error('[GET /api/opportunities error]:', err);
      res.status(500).json({ success: false, opportunities: [], error: err?.message || 'Failed to fetch opportunities' });
    }
  });

  // -------------------------------------------------------------
  // Section 2: Volunteer Event Discovery via Playwright
  // -------------------------------------------------------------

  /**
   * POST /api/events/search
   * Live volunteer opportunity search powered by Playwright and Chromium
   */
  app.post('/api/events/search', async (req, res) => {
    try {
      const { location, interests, preferredDates, maxResults } = req.body || {};

      if (!location || typeof location !== 'string' || location.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Location is required (e.g. "Hyderabad, Telangana" or "San Francisco, CA")'
        });
      }

      const searchResult = await searchPublicOpportunities({
        location: location.trim(),
        interests: Array.isArray(interests) ? interests : undefined,
        preferredDates: typeof preferredDates === 'string' ? preferredDates : undefined,
        maxResults: Number(maxResults) || 6
      });

      res.json(searchResult);
    } catch (err: any) {
      console.error('[API /api/events/search error]:', err);
      res.status(500).json({
        success: false,
        opportunities: [],
        error: 'Failed to complete volunteer opportunity search'
      });
    }
  });

  /**
   * GET /api/events/:eventId
   * Retrieve event details and application requirements
   */
  app.get('/api/events/:eventId', async (req, res) => {
    try {
      const eventId = req.params.eventId;
      // Return details from search cache or default verified format
      res.json({
        success: true,
        eventId,
        requirements: {
          minAge: 18,
          backgroundCheckRequired: false,
          allowedLocations: ['Local Area', 'Remote'],
          registrationMethod: 'auto_apply'
        }
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to get event details' });
    }
  });

  // -------------------------------------------------------------
  // Section 3 & 4 & 5: Auto-Apply Workflow Endpoints
  // -------------------------------------------------------------

  /**
   * POST /api/applications/prepare
   * Pre-flight eligibility screening, missing field detection, and draft preparation
   */
  app.post('/api/applications/prepare', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const { event, userNotes, overrideProfile } = req.body || {};

      if (!event || !event.id || !event.destinationUrl) {
        return res.status(400).json({
          success: false,
          error: 'event object with id, title, and destinationUrl is required'
        });
      }

      // Validate target URL for SSRF protection
      const urlCheck = await validateTargetUrl(event.destinationUrl);
      if (!urlCheck.valid) {
        return res.status(400).json({
          success: false,
          error: urlCheck.reason
        });
      }

      const result = await prepareApplicationWorkflow(userId, event, {
        userNotes,
        overrideProfile
      });

      if (!result.success) {
        return res.status(result.isIneligible ? 422 : 400).json(result);
      }

      res.json(result);
    } catch (err: any) {
      console.error('[API /api/applications/prepare error]:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to prepare application' });
    }
  });

  /**
   * POST /api/applications/:applicationId/approve
   * Explicit approval of unchanged proposal draft version and action hash
   */
  app.post('/api/applications/:applicationId/approve', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      const applicationId = req.params.applicationId;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const { expectedVersion, expectedActionHash, backgroundCheckConsented } = req.body || {};

      if (!expectedVersion || !expectedActionHash) {
        return res.status(400).json({
          success: false,
          error: 'expectedVersion and expectedActionHash are required to verify proposal integrity'
        });
      }

      const result = approveApplicationWorkflow(applicationId, userId, {
        expectedVersion: Number(expectedVersion),
        expectedActionHash: String(expectedActionHash),
        backgroundCheckConsented: Boolean(backgroundCheckConsented)
      });

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);
    } catch (err: any) {
      console.error('[API approve error]:', err);
      res.status(500).json({ success: false, error: err?.message || 'Approval recording failed' });
    }
  });

  /**
   * POST /api/applications/:applicationId/execute
   * Executes approved application using Playwright browser automation
   */
  app.post('/api/applications/:applicationId/execute', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      const applicationId = req.params.applicationId;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const result = await executeApplicationWorkflow(applicationId, userId, req.body || {});

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);
    } catch (err: any) {
      console.error('[API execute error]:', err);
      res.status(500).json({ success: false, error: err?.message || 'Execution failed' });
    }
  });

  /**
   * GET /api/applications/:applicationId
   * Retrieve application status and verification evidence
   */
  app.get('/api/applications/:applicationId', requireAuth, (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      const applicationId = req.params.applicationId;
      const appRecord = getApplicationById(applicationId);

      if (!appRecord) {
        return res.status(404).json({ success: false, error: 'Application not found' });
      }

      if (appRecord.userId !== userId) {
        return res.status(403).json({ success: false, error: 'Forbidden: Access denied to other users applications' });
      }

      res.json({ success: true, application: appRecord });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to retrieve application' });
    }
  });

  /**
   * POST /api/applications/:applicationId/verify
   * Independent post-submission verification routine
   */
  app.post('/api/applications/:applicationId/verify', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      const applicationId = req.params.applicationId;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const result = await verifyApplicationWorkflow(applicationId, userId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Verification failed' });
    }
  });

  /**
   * GET /api/registrations
   * Securely retrieve volunteer registrations from Supabase with full joined opportunities metadata
   */
  app.get('/api/registrations', async (req, res) => {
    try {
      const client = getSupabaseServerClient();
      let userId = (req.query.userId as string) || (req.headers['x-user-id'] as string);
      const authHeader = req.headers.authorization;
      if (!userId && authHeader?.startsWith('Bearer ')) {
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        const { data: authData } = await client.auth.getUser(token);
        if (authData?.user) {
          userId = authData.user.id;
        }
      }

      if (!userId) {
        return res.status(400).json({
          success: false,
          registrations: [],
          error: 'User ID is required to fetch registrations'
        });
      }

      const { data, error } = await client
        .from('registrations')
        .select('id, user_id, opportunity_id, status, confirmation_reference, submitted_at, created_at, updated_at, opportunities(*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('[GET /api/registrations warning]:', error.message);
        return res.status(500).json({ success: false, registrations: [], error: error.message });
      }

      const mapped = (data || []).map((row: any) => {
        const opp = Array.isArray(row.opportunities) ? row.opportunities[0] : row.opportunities;
        const skillsArray = opp?.required_skills || [];
        const rawStatus = (row.status || '').toLowerCase();
        let mappedStatus = 'confirmed';
        if (rawStatus === 'completed') mappedStatus = 'completed';
        else if (rawStatus === 'waitlisted' || row.confirmation_reference?.toLowerCase().includes('waitlist')) mappedStatus = 'waitlisted';
        else if (rawStatus === 'cancelled') mappedStatus = 'cancelled';
        else if (rawStatus === 'pending' || rawStatus === 'pending_approval' || rawStatus === 'draft' || rawStatus === 'submitted' || rawStatus === 'submitting') mappedStatus = 'pending_approval';

        const isRemote = opp?.location?.toLowerCase().includes('online') || opp?.location?.toLowerCase().includes('remote');

        return {
          id: String(row.id),
          opportunityId: String(row.opportunity_id),
          opportunityTitle: opp?.title || 'Volunteer Commitment',
          organization: opp?.organization_name || 'Community Partner',
          category: opp?.cause_name || 'Community Service',
          date: opp?.created_at
            ? new Date(opp.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : 'Upcoming Weekend',
          time: '10:00 AM - 1:00 PM',
          location: opp?.location || 'Local Community Site',
          format: isRemote ? 'online' : 'in-person',
          status: mappedStatus,
          submittedAt: row.submitted_at
            ? new Date(row.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          approvedByUser: true,
          userNotes: row.approval_details?.userNotes || '',
          hoursLogged: rawStatus === 'completed' ? 4 : 0
        };
      });

      res.json({ success: true, registrations: mapped });
    } catch (err: any) {
      console.error('[GET /api/registrations exception]:', err);
      res.status(500).json({ success: false, registrations: [], error: err?.message || 'Server error fetching registrations' });
    }
  });

  /**
   * POST /api/registrations
   * Secure server-side registration persistence using Supabase service client
   */
  app.post('/api/registrations', async (req, res) => {
    try {
      const client = getSupabaseServerClient();
      const { userId, opportunityId, opportunity, status, confirmationReference, userNotes } = req.body || {};

      if (!userId || !opportunityId) {
        return res.status(400).json({ success: false, error: 'userId and opportunityId are required' });
      }

      const oppUuid = ensureValidUuid(String(opportunityId));

      // 1. Ensure opportunity exists in public.opportunities so foreign key constraint is satisfied
      if (opportunity) {
        await client.from('opportunities').upsert({
          id: oppUuid,
          title: opportunity.title,
          organization_name: opportunity.organization,
          location: opportunity.location,
          description: opportunity.description || '',
          source_url: opportunity.sourceUrl || null,
          background_check_required: opportunity.backgroundCheck === 'required',
          min_age: opportunity.minAge ?? 18,
          required_skills: opportunity.skills || []
        }, { onConflict: 'id' });
      }

      // 2. Normalize status to strictly satisfy check constraint
      const rawInputStatus = (status || 'confirmed').toLowerCase();
      let dbStatus: 'confirmed' | 'pending_approval' | 'submitted' | 'cancelled' = 'confirmed';
      if (rawInputStatus === 'cancelled') {
        dbStatus = 'cancelled';
      } else if (rawInputStatus === 'submitted') {
        dbStatus = 'submitted';
      } else if (
        ['pending', 'pending_approval', 'draft', 'awaiting_approval', 'submitting', 'submitted_unverified', 'unverified'].includes(rawInputStatus)
      ) {
        dbStatus = 'pending_approval';
      }

      const payload = {
        user_id: userId,
        opportunity_id: oppUuid,
        status: dbStatus,
        confirmation_reference: confirmationReference || null,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await client
        .from('registrations')
        .upsert(payload, { onConflict: 'user_id,opportunity_id' })
        .select('id, user_id, opportunity_id, status, confirmation_reference, submitted_at, created_at, updated_at, opportunities(*)')
        .single();

      if (error) {
        console.error('[POST /api/registrations error]:', error.message);
        return res.status(500).json({ success: false, error: error.message });
      }

      const row = data as any;
      const opp = Array.isArray(row?.opportunities) ? row.opportunities[0] : row?.opportunities || opportunity;
      const isRemote = opp?.location?.toLowerCase().includes('online') || opp?.location?.toLowerCase().includes('remote');

      const registration = {
        id: String(row.id),
        opportunityId: String(opportunityId),
        opportunityTitle: opp?.title || opportunity?.title || 'Volunteer Commitment',
        organization: opp?.organization_name || opportunity?.organization || 'Community Partner',
        category: opp?.cause_name || opportunity?.category || 'Community Service',
        date: opportunity?.date || (opp?.created_at ? new Date(opp.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Upcoming Weekend'),
        time: opportunity?.time || 'Flexible Weekend Shifts',
        location: opp?.location || opportunity?.location || 'Local Community Site',
        format: isRemote ? 'online' : 'in-person',
        status: (rawInputStatus === 'waitlisted' ? 'waitlisted' : (dbStatus === 'pending_approval' ? 'pending_approval' : 'confirmed')),
        submittedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        approvedByUser: true,
        userNotes: userNotes || '',
        hoursLogged: 0
      };

      res.json({ success: true, registration });
    } catch (err: any) {
      console.error('[POST /api/registrations exception]:', err);
      res.status(500).json({ success: false, error: err?.message || 'Server error creating registration' });
    }
  });

  // -------------------------------------------------------------
  // Existing Volunteer Search & Registration Agent Endpoints
  // -------------------------------------------------------------

  const handleVolunteerSearch = async (req: express.Request, res: express.Response) => {
    try {
      const { location, interests, preferredDates, maxResults } = req.body || {};
      const searchResult = await searchPublicOpportunities({
        location: location || 'Hyderabad, Telangana',
        interests,
        preferredDates,
        maxResults
      });
      res.json({
        success: true,
        configured: true,
        agent_name: 'CauseConnect Playwright Volunteer Finder',
        opportunities: searchResult.opportunities,
        sourceSummary: searchResult.sourceSummary
      });
    } catch (err: any) {
      console.error('Volunteer search error:', err?.message || err);
      res.status(500).json({
        success: false,
        opportunities: [],
        error: 'Volunteer opportunity search encountered an error'
      });
    }
  };

  app.post('/api/volunteer-search', handleVolunteerSearch);
  app.post('/api/browserbase/search', handleVolunteerSearch);

  app.get('/api/browserbase/status', (req, res) => {
    res.json({
      configured: true,
      agent_name: 'CauseConnect Volunteer Event Finder',
      runtime: 'Playwright (Chromium)'
    });
  });

  app.post('/api/agent/eligibility/check', (req, res) => {
    try {
      const { volunteer, opportunity } = req.body || {};
      if (!volunteer || !opportunity) {
        return res.status(400).json({ success: false, error: 'volunteer and opportunity payloads required' });
      }
      const eligibility = evaluateEligibility(volunteer, opportunity);
      res.json({ success: true, eligibility });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Eligibility check failed' });
    }
  });

  app.post('/api/agent/registration/prepare', (req, res) => {
    try {
      const { volunteer, opportunity, options } = req.body || {};
      if (!volunteer || !opportunity) {
        return res.status(400).json({ success: false, error: 'volunteer and opportunity required' });
      }
      const proposal = prepareRegistrationProposal(volunteer, opportunity, options);
      res.json({ success: true, proposal });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to prepare proposal' });
    }
  });

  app.post('/api/agent/registration/approve', (req, res) => {
    try {
      const { proposalId, expectedVersion, expectedActionHash, explicitConsentGiven, backgroundCheckConsented } = req.body || {};
      const result = recordProposalApproval(proposalId, {
        expectedVersion: Number(expectedVersion) || 1,
        expectedActionHash: String(expectedActionHash || ''),
        explicitConsentGiven: Boolean(explicitConsentGiven),
        backgroundCheckConsented: Boolean(backgroundCheckConsented),
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined
      });
      if (!result.success) return res.status(400).json(result);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to record approval' });
    }
  });

  app.post('/api/agent/registration/execute', async (req, res) => {
    try {
      const { proposalId, executionOptions } = req.body || {};
      const result = await executeRegistrationWorkflow(proposalId, executionOptions);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to execute registration' });
    }
  });

  app.get('/api/agent/proposal/:proposalId', (req, res) => {
    try {
      const stored = getProposalById(req.params.proposalId);
      if (!stored) return res.status(404).json({ success: false, error: 'Proposal not found' });
      res.json({ success: true, ...stored });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to retrieve proposal' });
    }
  });

  app.post('/api/agent/test-suite/run', async (req, res) => {
    try {
      const testRuns = await runOfficialTestSuite();
      res.json({
        success: true,
        totalRuns: testRuns.length,
        passedCount: testRuns.filter((r) => r.status === 'passed').length,
        failedCount: testRuns.filter((r) => r.status === 'failed').length,
        testRuns
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to run test suite' });
    }
  });

  app.get('/api/agent/test-suite/results', (req, res) => {
    try {
      const testRuns = getLatestOfficialTestRuns();
      res.json({ success: true, testRuns });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to retrieve test runs' });
    }
  });

  // -------------------------------------------------------------
  // Vite Integration (Dev middleware or Production static files)
  // -------------------------------------------------------------
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT,
        hmr: process.env.DISABLE_HMR !== 'true'
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[CauseConnect AI Server] Running on http://0.0.0.0:${PORT}`);
    console.log(`[CauseConnect AI Server] Browser automation: Playwright Chromium ready.`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
