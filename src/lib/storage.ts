// Small localStorage helpers for the handful of user preferences that
// should survive a refresh: theme, display brightness, sound volume, which
// desktop widgets are visible, and their drag-reordered slot order. Wrapped
// in try/catch — localStorage can throw in private-browsing/embedded
// contexts, and a lost preference isn't worth crashing the app over.
const KEYS = {
  theme: 'portfolio:isLight',
  brightness: 'portfolio:brightness',
  volume: 'portfolio:volume',
  widgets: 'portfolio:visibleWidgets',
  widgetOrder: 'portfolio:widgetOrder',
  authUser: 'portfolio:authUser',
  spotifySearches: 'portfolio:spotifySearches',
} as const;

type StorageKey = keyof typeof KEYS;

export function loadBool(key: StorageKey, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(KEYS[key]);
    return raw === null ? fallback : raw === 'true';
  } catch {
    return fallback;
  }
}

export function saveBool(key: StorageKey, value: boolean) {
  try {
    localStorage.setItem(KEYS[key], String(value));
  } catch {
    // ignore — e.g. private browsing with storage disabled
  }
}

export function loadNumber(key: StorageKey, fallback: number): number {
  try {
    const raw = localStorage.getItem(KEYS[key]);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

export function saveNumber(key: StorageKey, value: number) {
  try {
    localStorage.setItem(KEYS[key], String(value));
  } catch {
    // ignore
  }
}

export function loadStringArray(key: StorageKey, fallback: string[]): string[] {
  try {
    const raw = localStorage.getItem(KEYS[key]);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((v) => typeof v === 'string') ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function saveStringArray(key: StorageKey, value: string[]) {
  try {
    localStorage.setItem(KEYS[key], JSON.stringify(value));
  } catch {
    // ignore
  }
}

// Which OAuth provider a signed-in identity came from — started out
// LinkedIn-only (hence the storage key's history), now any of these; see
// lib/oauth.ts for each provider's actual authorize/token/userinfo config.
export type OAuthProvider = 'linkedin' | 'github' | 'google' | 'microsoft';

export const PROVIDER_LABELS: Record<OAuthProvider, string> = {
  linkedin: 'LinkedIn',
  github: 'GitHub',
  google: 'Google',
  microsoft: 'Microsoft',
};

// The identity a visitor's browser has previously signed in with —
// remembered across visits so the lock screen can skip straight to a
// welcome-back state instead of showing the sign-in options again every
// single time.
export interface AuthUser {
  provider: OAuthProvider;
  name: string;
  email: string;
  picture: string | null;
}

export function loadAuthUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(KEYS.authUser);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    const validProvider =
      parsed && typeof parsed.provider === 'string' && ['linkedin', 'github', 'google', 'microsoft'].includes(parsed.provider);
    if (validProvider && typeof parsed.name === 'string' && typeof parsed.email === 'string') {
      return {
        provider: parsed.provider,
        name: parsed.name,
        email: parsed.email,
        picture: typeof parsed.picture === 'string' ? parsed.picture : null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveAuthUser(user: AuthUser) {
  try {
    localStorage.setItem(KEYS.authUser, JSON.stringify(user));
  } catch {
    // ignore
  }
}

export function clearAuthUser() {
  try {
    localStorage.removeItem(KEYS.authUser);
  } catch {
    // ignore
  }
}

// Plain cookie helpers — used only for "remember the last-played track"
// (lib/youtube-player.tsx), which was specifically asked to survive in a
// cookie rather than localStorage. Everything else in this file
// intentionally stays on localStorage; this pair exists purely for that one
// caller rather than as a general-purpose replacement for it.
export function setCookie(name: string, value: string, days: number) {
  try {
    const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
  } catch {
    // ignore — e.g. cookies disabled
  }
}

export function getCookie(name: string): string | null {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}
