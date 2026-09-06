import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import {oauthDevPlugin} from './dev/oauth-plugin';
import {emailDevPlugin} from './dev/email-plugin';

export default defineConfig(({mode}) => {
  // loadEnv (not dotenv) so this picks up .env.local the same way Vite
  // itself does for import.meta.env — with an empty prefix filter so it
  // also loads secrets like LINKEDIN_CLIENT_SECRET/GITHUB_CLIENT_SECRET,
  // which deliberately have no VITE_ prefix (that prefix is what tells Vite
  // to bundle a var into client code; a secret must never qualify for
  // that). Only assigned into process.env when not already set, so a real
  // deployment's own env vars always win over anything in a
  // checked-in-adjacent .env.local.
  const env = loadEnv(mode, process.cwd(), '');
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }

  return {
    plugins: [react(), tailwindcss(), oauthDevPlugin(), emailDevPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
