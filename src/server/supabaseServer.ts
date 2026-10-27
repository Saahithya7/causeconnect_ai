import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const DEFAULT_SUPABASE_URL = 'https://sgndetrsmhlkelqjsumz.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_tmYz69ggBOYLpW9zTsQvEA_ZRxNrcWD';

function isValidSupabaseUrl(val?: string | null): boolean {
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim();
  return (trimmed.startsWith('https://') || trimmed.startsWith('http://')) && trimmed.includes('.supabase.co');
}

function resolveServerUrl(): string {
  if (isValidSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)) return process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
  if (isValidSupabaseUrl(process.env.SUPABASE_URL)) return process.env.SUPABASE_URL!.trim();
  if (isValidSupabaseUrl(process.env.VITE_SUPABASE_URL)) return process.env.VITE_SUPABASE_URL!.trim();
  return DEFAULT_SUPABASE_URL;
}

function resolveServerKey(): string {
  // If SUPABASE_SERVICE_ROLE_KEY is provided and not a placeholder
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (serviceKey && serviceKey.length >= 20 && !serviceKey.includes('your_supabase')) {
    return serviceKey;
  }

  // Verified publishable key candidates
  const pubCandidates = [
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    DEFAULT_SUPABASE_KEY
  ];

  for (const c of pubCandidates) {
    if (c && typeof c === 'string' && c.trim().length >= 20 && !c.trim().startsWith('http')) {
      return c.trim();
    }
  }

  return DEFAULT_SUPABASE_KEY;
}

const SUPABASE_URL = resolveServerUrl();
const SUPABASE_KEY = resolveServerKey();

let supabaseServerClient: SupabaseClient | null = null;

export function getSupabaseServerClient(): SupabaseClient {
  if (!supabaseServerClient) {
    supabaseServerClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }
  return supabaseServerClient;
}

export function createUserSupabaseClient(token: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });
}

export interface AuthenticatedUser {
  id: string;
  email?: string;
  role?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/**
 * Server-side Supabase JWT verification middleware
 * Extracts Bearer token, validates with Supabase Auth, and attaches verified user.
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // If running in development/local demo test without token, allow demo user header if explicitly passed
    const devUserId = req.headers['x-user-id'] as string;
    if (devUserId && process.env.NODE_ENV !== 'production') {
      req.user = { id: devUserId, email: `${devUserId}@causeconnect.local` };
      next();
      return;
    }

    res.status(401).json({
      success: false,
      error: 'Authentication required. Missing or malformed Bearer token in Authorization header.'
    });
    return;
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  try {
    const client = getSupabaseServerClient();
    const { data, error } = await client.auth.getUser(token);

    if (error || !data?.user) {
      // In development fallback, if user provided their user ID directly
      const devUserId = req.headers['x-user-id'] as string;
      if (devUserId && process.env.NODE_ENV !== 'production') {
        req.user = { id: devUserId, email: `${devUserId}@causeconnect.local` };
        next();
        return;
      }

      res.status(401).json({
        success: false,
        error: `Invalid or expired session token: ${error?.message || 'Unauthorized'}`
      });
      return;
    }

    req.user = {
      id: data.user.id,
      email: data.user.email,
      role: data.user.role
    };

    next();
  } catch (err: any) {
    console.error('[Auth Middleware Error]:', err?.message || err);
    res.status(500).json({
      success: false,
      error: 'Failed to verify authentication session'
    });
  }
}
