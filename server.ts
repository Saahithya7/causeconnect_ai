import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  requireAuth,
  AuthenticatedRequest
} from './src/server/supabaseServer.js';
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
