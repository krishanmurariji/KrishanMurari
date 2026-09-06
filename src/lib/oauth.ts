// Multi-provider "Sign in" (OAuth2/OpenID Connect) — client-side half only,
// generalized from what started as LinkedIn-only support. The authorize
// redirect below needs just each provider's public Client ID (safe to
// expose, it identifies the app, not a secret), so it can run entirely in
// the browser. Completing a login — exchanging the `code` a provider
// redirects back with for an access token, then fetching the visitor's
// name/email/photo — requires that provider's Client Secret, which must
// never reach client code; that half lives behind a real server endpoint
// (dev/oauth-plugin.ts in dev). This module only builds the outgoing
// redirect and parses what a provider sends back; see LockScreen.tsx for
// how the callback is handled.
import type { OAuthProvider } from './storage';

interface ProviderConfig {
  clientId: string | undefined;
  authorizeUrl: string;
  scope: string;
}

const PROVIDERS: Record<OAuthProvider, ProviderConfig> = {
  linkedin: {
    clientId: import.meta.env.VITE_LINKEDIN_CLIENT_ID as string | undefined,
    authorizeUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    scope: 'openid profile email',
  },
  github: {
    clientId: import.meta.env.VITE_GITHUB_CLIENT_ID as string | undefined,
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    // user:email (not just read:user) since a GitHub account's email can be
    // private — dev/oauth-plugin.ts falls back to a separate /user/emails
    // fetch when /user's own `email` field comes back null.
    scope: 'read:user user:email',
  },
  google: {
    clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined,
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    scope: 'openid email profile',
  },
  microsoft: {
    clientId: import.meta.env.VITE_MICROSOFT_CLIENT_ID as string | undefined,
    // /consumers/, not /common/ — this app is registered with signInAudience
    // "PersonalMicrosoftAccount" (personal accounts only, not work/school),
    // and Microsoft rejects a personal-only app's requests through /common/
    // with AADSTS9002331 ("configured for use by Microsoft Account users
    // only... use the /consumers endpoint"). If the app registration is
    // ever changed to also allow org accounts (signInAudience
    // "AzureADandPersonalMicrosoftAccount"), this should go back to
    // /common/ so both account types keep working.
    authorizeUrl: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
    scope: 'openid profile email User.Read',
  },
};

export function isOAuthConfigured(provider: OAuthProvider): boolean {
  return !!PROVIDERS[provider].clientId;
}

const STATE_KEY = 'oauth_state';
const REDIRECT_URI_KEY = 'oauth_redirect_uri';
const PROVIDER_KEY = 'oauth_provider';

function redirectUri(): string {
  // Must exactly match a redirect URL registered on the provider's app —
  // most of these do plain string comparison, so even a trailing slash it
  // doesn't have on file is a mismatch (confirmed live for LinkedIn: the
  // registered entry is "http://localhost:3001", no slash, while `pathname`
  // at root is "/", which would send "http://localhost:3001/" and get
  // rejected). Dropping a bare root path avoids that; a real sub-path still
  // comes through as-is.
  const path = window.location.pathname === '/' ? '' : window.location.pathname;
  return `${window.location.origin}${path}`;
}

export function beginOAuthSignIn(provider: OAuthProvider): void {
  const cfg = PROVIDERS[provider];
  if (!cfg.clientId) return;
  const state = crypto.randomUUID();
  const uri = redirectUri();
  sessionStorage.setItem(STATE_KEY, state);
  sessionStorage.setItem(PROVIDER_KEY, provider);
  // The token exchange (consumeOAuthCallback's caller) has to send the
  // provider's token endpoint the exact same redirect_uri used here — not
  // recompute it, since by the time the callback lands the visitor could in
  // principle be on a different path. Stashing the exact value used avoids
  // that whole class of mismatch.
  sessionStorage.setItem(REDIRECT_URI_KEY, uri);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: uri,
    scope: cfg.scope,
    state,
  });
  window.location.href = `${cfg.authorizeUrl}?${params.toString()}`;
}

export interface OAuthCallback {
  provider: OAuthProvider;
  code: string;
  state: string;
  redirectUri: string;
}

// A provider redirecting back with `?error=` (the visitor declined consent,
// a misconfigured redirect URI/scope, etc.) is a real, distinct outcome from
// "no callback happened at all" — collapsing it to the same `null` an
// earlier version of this returned meant the lock screen had no way to tell
// the two apart, so an actual failure just looked like nothing happened:
// no error message, no consent screen, visitor still not signed in, with
// nothing in the UI explaining why.
export type OAuthCallbackResult = { ok: true; callback: OAuthCallback } | { ok: false; error: string } | null;

// Reads `?code=&state=` (or `?error=`) off the current URL (the provider's
// redirect back) and clears them from the address bar either way, so a page
// refresh doesn't re-trigger the same callback. Returns null only when
// there's genuinely no callback in the URL at all.
export function consumeOAuthCallback(): OAuthCallbackResult {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const errorDescription = url.searchParams.get('error_description');
  if (!code && !error) return null;

  const expectedState = sessionStorage.getItem(STATE_KEY);
  const savedRedirectUri = sessionStorage.getItem(REDIRECT_URI_KEY);
  const savedProvider = sessionStorage.getItem(PROVIDER_KEY) as OAuthProvider | null;
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(REDIRECT_URI_KEY);
  sessionStorage.removeItem(PROVIDER_KEY);
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  url.searchParams.delete('error');
  url.searchParams.delete('error_description');
  window.history.replaceState({}, '', url.toString());

  if (error) return { ok: false, error: errorDescription || error };
  if (!code || !state || state !== expectedState || !savedRedirectUri || !savedProvider) {
    return { ok: false, error: 'state mismatch or missing callback data' };
  }
  return { ok: true, callback: { provider: savedProvider, code, state, redirectUri: savedRedirectUri } };
}
