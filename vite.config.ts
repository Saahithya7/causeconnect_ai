import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  // Sanitize Supabase environment variables if inverted by environment injection
  const defaultUrl = 'https://sgndetrsmhlkelqjsumz.supabase.co';
  const defaultKey = 'sb_publishable_tmYz69ggBOYLpW9zTsQvEA_ZRxNrcWD';

  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith('http')
    ? process.env.NEXT_PUBLIC_SUPABASE_URL
    : (process.env.VITE_SUPABASE_URL?.startsWith('http') ? process.env.VITE_SUPABASE_URL : defaultUrl);

  const rawKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')
    ? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    : (process.env.VITE_SUPABASE_ANON_KEY?.startsWith('sb_publishable_')
        ? process.env.VITE_SUPABASE_ANON_KEY
        : (process.env.VITE_SUPABASE_URL?.startsWith('sb_publishable_') ? process.env.VITE_SUPABASE_URL : defaultKey));

  process.env.VITE_SUPABASE_URL = rawUrl;
  process.env.VITE_SUPABASE_ANON_KEY = rawKey;
  process.env.NEXT_PUBLIC_SUPABASE_URL = rawUrl;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = rawKey;

  return {
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(rawUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(rawKey),
      'import.meta.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(rawUrl),
      'import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(rawKey),
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
