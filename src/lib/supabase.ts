import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Permanent verified project credentials
const DEFAULT_SUPABASE_URL = 'https://sgndetrsmhlkelqjsumz.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_tmYz69ggBOYLpW9zTsQvEA_ZRxNrcWD';

// Clean up any stale localStorage overrides from previous manual debugging sessions
if (typeof window !== 'undefined' && window.localStorage) {
  try {
    localStorage.removeItem('causeconnect_supabase_url');
    localStorage.removeItem('causeconnect_supabase_anon_key');
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

export function isValidSupabaseUrl(val?: string | null): boolean {
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim();
  return (trimmed.startsWith('https://') || trimmed.startsWith('http://')) && trimmed.includes('.supabase.co');
}

export function isValidPublishableKey(val?: string | null): boolean {
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim();
  // Must NOT be a URL
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return false;
  // Security constraint: Never use secret / service-role key in client bundle
  if (trimmed.startsWith('sb_secret_')) return false;
  return trimmed.length >= 20;
}

function resolveConfig() {
  const env = (import.meta as any).env || {};

  // Inspect all candidate sources for valid Supabase URL
  const urlCandidates = [
    env.VITE_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_URL,
    DEFAULT_SUPABASE_URL
  ];

  let url = DEFAULT_SUPABASE_URL;
  for (const c of urlCandidates) {
    if (isValidSupabaseUrl(c)) {
      url = c.trim();
      break;
    }
  }

  // Inspect all candidate sources for valid publishable/anon key
  const keyCandidates = [
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    env.VITE_SUPABASE_ANON_KEY,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    // In case VITE_SUPABASE_URL mistakenly contains the publishable key in environment:
    env.VITE_SUPABASE_URL,
    DEFAULT_SUPABASE_KEY
  ];

  let anonKey = DEFAULT_SUPABASE_KEY;
  for (const c of keyCandidates) {
    if (isValidPublishableKey(c)) {
      anonKey = c.trim();
      break;
    }
  }

  return { url, anonKey };
}

const config = resolveConfig();

export function isSupabaseConfigured(): boolean {
  return isValidSupabaseUrl(config.url) && isValidPublishableKey(config.anonKey);
}

export function getSupabaseConfig() {
  return {
    url: config.url,
    anonKey: config.anonKey ? `${config.anonKey.slice(0, 16)}...${config.anonKey.slice(-4)}` : '',
    isConfigured: isSupabaseConfigured(),
    keyType: config.anonKey.startsWith('sb_publishable_') ? 'publishable' : 'anon'
  };
}

// Initialize ONE reusable singleton Supabase client at application startup
function initClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    console.warn('Supabase credentials missing or invalid.');
    return null;
  }

  try {
    return createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'causeconnect-supabase-auth-token'
      }
    });
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err);
    return null;
  }
}

export const supabase: SupabaseClient | null = initClient();
