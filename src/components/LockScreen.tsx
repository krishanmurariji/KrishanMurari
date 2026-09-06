// A macOS-style lock screen shown once between the loading cube and the
// interactive desktop — nothing of the desktop itself (menu bar, dock,
// widgets) renders until this is dismissed (see the isLocked gate around
// them in App.tsx), so the only thing visible through it is the cube. No
// blur/tint of any kind over the scene — this overlay is plain transparent,
// so the cube shows through exactly as sharp as it already is; only the
// clock/avatar/buttons themselves carry any background. Everything —
// clock, guest avatar, sign-in options, "continue without signing in" —
// sits in one centered column biased toward the top third, same as a real
// macOS lock screen, leaving the cube clearly visible in the space below
// it. Dismissing it either way — sign in or skip — is what lets the cube's
// own solve-and-open reveal run (see the `locked` prop threaded into
// Scene/RubiksCube), so the reveal reads as "the desktop unlocking."
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { beginOAuthSignIn, consumeOAuthCallback, isOAuthConfigured } from '../lib/oauth';
import { loadAuthUser, type AuthUser } from '../lib/storage';
import { InteractiveHoverButton } from './ui/interactive-hover-button';
import { BB8Toggle } from './ui/bb8-toggle';

// Only ticks while `active` — this component (and its 3D scene behind it)
// is mounted for the whole session, not just while the lock screen is
// actually shown, so a plain unconditional setInterval would keep
// re-rendering it every second forever, including all through the loader
// and the entire time the desktop is in use.
function useClock(active: boolean) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

function LinkedInGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M18.3362 18.339H15.6707V14.1622C15.6707 13.1662 15.6505 11.8845 14.2817 11.8845C12.892 11.8845 12.6797 12.9683 12.6797 14.0887V18.339H10.0142V9.75H12.5747V10.9207H12.6092C12.967 10.2457 13.837 9.53325 15.1367 9.53325C17.8375 9.53325 18.337 11.3108 18.337 13.6245V18.339H18.3362ZM7.00373 8.57475C6.14573 8.57475 5.45648 7.88025 5.45648 7.026C5.45648 6.1725 6.14648 5.47875 7.00373 5.47875C7.85873 5.47875 8.55173 6.1725 8.55173 7.026C8.55173 7.88025 7.85798 8.57475 7.00373 8.57475ZM8.34023 18.339H5.66723V9.75H8.34023V18.339ZM19.6697 3H4.32923C3.59498 3 3.00098 3.5805 3.00098 4.29675V19.7033C3.00098 20.4202 3.59498 21 4.32923 21H19.6675C20.401 21 21.001 20.4202 21.001 19.7033V4.29675C21.001 3.5805 20.401 3 19.6675 3H19.6697Z" />
    </svg>
  );
}

function GitHubGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.833.092-.647.35-1.088.636-1.338-2.221-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.026 2.747-1.026.546 1.378.202 2.397.1 2.65.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.748 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
    </svg>
  );
}

// Google's real 4-color "G" — unlike the other glyphs above, this doesn't
// use `currentColor`: Google's brand guidelines call for the mark to stay
// full-color regardless of the button's own state, so it's a fixed SVG
// rather than something ProviderButton's color prop can tint.
function GoogleGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

// Microsoft's four-color square logo — same reasoning as GoogleGlyph above,
// fixed brand colors rather than something ProviderButton's color prop can
// tint.
function MicrosoftGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 23 23" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
      <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}

// Ported from a pasted styled-components snippet (an outlined pill with a
// brand-colored border/text that fills solid on hover, text turning white)
// — this project has no styled-components dependency, so it's rebuilt with
// Tailwind + a plain group-hover-driven circle instead of that snippet's
// ::before/box-shadow trick, same visual result: a dot that grows from
// off-center-left until it covers the whole pill. Shared by every provider
// button below — only the brand color, glyph, and label actually differ.
function ProviderButton({
  color,
  glyph,
  label,
  onClick,
  disabled,
}: {
  color: string;
  glyph: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group relative flex cursor-pointer items-center justify-center gap-2.5 overflow-hidden rounded-full px-6 py-2.5 text-sm font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      style={{ border: `1.5px solid ${color}`, color }}
    >
      <span
        className="absolute left-[22%] top-1/2 z-0 h-2.5 w-2.5 -translate-y-1/2 scale-0 rounded-full transition-transform duration-500 ease-out group-hover:scale-[40]"
        style={{ background: color }}
        aria-hidden
      />
      <span className="relative z-10 flex items-center gap-2.5 transition-colors duration-300 group-hover:text-white">
        {glyph}
        {label}
      </span>
    </button>
  );
}

type CallbackState = 'idle' | 'exchanging' | 'error';

export default function LockScreen({
  visible,
  isLight,
  onSetLight,
  onSkip,
  onSignedIn,
}: {
  visible: boolean;
  isLight: boolean;
  onSetLight: (value: boolean) => void;
  onSkip: () => void;
  onSignedIn: (user: AuthUser) => void;
}) {
  const now = useClock(visible);
  const [callbackState, setCallbackState] = useState<CallbackState>('idle');
  const [callbackError, setCallbackError] = useState<string | null>(null);
  const linkedInConfigured = isOAuthConfigured('linkedin');
  const gitHubConfigured = isOAuthConfigured('github');
  const googleConfigured = isOAuthConfigured('google');
  const microsoftConfigured = isOAuthConfigured('microsoft');
  // A browser that's signed in before skips straight to a welcome-back
  // state instead of the sign-in options — read once on mount (lazy
  // initializer), same pattern as the site's other persisted preferences
  // (see loadBool/App.tsx).
  const [returningUser, setReturningUser] = useState<AuthUser | null>(() => loadAuthUser());

  // Runs once on mount, regardless of `visible` — a provider's redirect back
  // lands on a fresh page load, before this component has necessarily
  // re-entered its "shown" state, so the callback has to be caught here
  // rather than gated behind `visible`.
  useEffect(() => {
    const result = consumeOAuthCallback();
    if (!result) return;
    if (result.ok === false) {
      // Surfaced instead of silently discarded — a provider redirecting
      // back with an error (declined consent, redirect URI/scope
      // misconfiguration, etc.) used to look identical to "the visitor
      // never clicked a sign-in button at all": no error shown, no console
      // trace, just back on the lock screen. Logging it is what makes that
      // failure mode debuggable instead of a silent dead end.
      console.error('[oauth] sign-in failed:', result.error);
      setCallbackState('error');
      setCallbackError(result.error);
      return;
    }
    const callback = result.callback;
    setCallbackState('exchanging');
    // The exchange itself — trading `code` for a token, then fetching
    // name/email/photo — has to happen server-side (it needs that
    // provider's Client Secret, which can never ship to the browser). See
    // dev/oauth-plugin.ts.
    fetch(`/api/auth/${callback.provider}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: callback.code, redirectUri: callback.redirectUri }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'not configured');
        }
        return res.json();
      })
      .then((user: { name: string; email: string; picture?: string }) => {
        setCallbackState('idle');
        const authUser: AuthUser = { provider: callback.provider, name: user.name, email: user.email, picture: user.picture ?? null };
        setReturningUser(authUser);
        onSignedIn(authUser);
      })
      .catch((err) => {
        console.error('[oauth] token exchange failed:', err);
        setCallbackState('error');
        setCallbackError(err instanceof Error ? err.message : String(err));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-read the saved identity every time the lock screen is (re-)shown —
  // covers re-locking after a sign-out (which clears storage but doesn't
  // touch this component's own state) as well as any other re-lock, not
  // just mount.
  useEffect(() => {
    if (visible) setReturningUser(loadAuthUser());
  }, [visible]);

  // Signed-in visitors don't have to sit and look at their own name —
  // proceed on its own after a beat, but let a click skip the wait.
  useEffect(() => {
    if (!returningUser || !visible) return;
    const id = window.setTimeout(onSkip, 1800);
    return () => window.clearTimeout(id);
  }, [returningUser, visible, onSkip]);

  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const date = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  const textColor = isLight ? '#1c1c1e' : '#f5f5f7';
  const invertedTextColor = isLight ? '#f5f5f7' : '#1c1c1e';
  const subColor = isLight ? 'rgba(28,28,30,0.6)' : 'rgba(245,245,247,0.65)';
  const cardBg = isLight ? 'rgba(255,255,255,0.6)' : 'rgba(30,30,34,0.5)';
  const cardRing = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="lock-screen"
          initial={{ y: 0, opacity: 1 }}
          exit={{ y: '-100%', transition: { duration: 0.7, ease: [0.65, 0, 0.35, 1] } }}
          className="fixed inset-0 z-[9999] flex flex-col overflow-hidden"
        >
          {/* Clock, anchored near the top. */}
          <div className="relative z-10 flex flex-col items-center pt-[7vh] sm:pt-[8vh]">
            <div
              className="text-[52px] font-semibold leading-none tracking-tight sm:text-[68px]"
              style={{ color: textColor, fontVariantNumeric: 'tabular-nums' }}
            >
              {time}
            </div>
            <div className="mt-2 text-base font-medium sm:text-lg" style={{ color: subColor }}>
              {date}
            </div>
          </div>

          {/* Avatar — pinned just above the viewport's vertical center
              (independent of the clock's own height above it), so it sits
              directly above the cube's own center rather than wherever the
              clock block happens to end. A returning, signed-in browser
              shows its real photo here instead of the generic silhouette,
              and the whole thing is clickable to skip the auto-continue
              wait below. The theme toggle sits right below it either way. */}
          <div className="absolute inset-x-0 z-10 flex flex-col items-center gap-4" style={{ top: '29vh' }}>
            <div
              role={returningUser ? 'button' : undefined}
              onClick={returningUser ? onSkip : undefined}
              className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full shadow-xl ring-1 sm:h-28 sm:w-28"
              style={{
                background: cardBg,
                boxShadow: `inset 0 0 0 1px ${cardRing}`,
                cursor: returningUser ? 'pointer' : 'default',
                pointerEvents: returningUser ? 'auto' : 'none',
              }}
            >
              {returningUser?.picture ? (
                <img src={returningUser.picture} alt={returningUser.name} className="h-full w-full object-cover" />
              ) : (
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke={subColor} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21a8 8 0 10-16 0" />
                  <circle cx="12" cy="8" r="4.5" />
                </svg>
              )}
            </div>

            <BB8Toggle theme={isLight ? 'light' : 'dark'} onThemeChange={(t) => onSetLight(t === 'light')} />
          </div>

          {/* Deliberately empty — the cube (centered in the scene behind
              this overlay) fills this gap, untouched by any UI. */}
          <div className="flex-1" />

          {/* Anchored near the bottom, below the cube: sign-in options for
              a fresh visitor, or just a welcome-back line for a browser
              that's already signed in (see the auto-continue effect above). */}
          <div className="relative z-10 flex flex-col items-center gap-3 pb-[8vh] sm:pb-[9vh]">
            {returningUser ? (
              <button type="button" onClick={onSkip} className="text-[15px] font-semibold" style={{ color: textColor }}>
                Welcome, {returningUser.name}
              </button>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-center gap-3 px-4">
                  <ProviderButton
                    color="#0077B5"
                    glyph={<LinkedInGlyph size={20} />}
                    label="LinkedIn"
                    onClick={linkedInConfigured ? () => beginOAuthSignIn('linkedin') : undefined}
                    disabled={!linkedInConfigured}
                  />
                  <ProviderButton
                    color="#24292f"
                    glyph={<GitHubGlyph size={20} />}
                    label="GitHub"
                    onClick={gitHubConfigured ? () => beginOAuthSignIn('github') : undefined}
                    disabled={!gitHubConfigured}
                  />
                  <ProviderButton
                    color="#3c4043"
                    glyph={<GoogleGlyph size={18} />}
                    label="Google"
                    onClick={googleConfigured ? () => beginOAuthSignIn('google') : undefined}
                    disabled={!googleConfigured}
                  />
                  <ProviderButton
                    color="#5e5e5e"
                    glyph={<MicrosoftGlyph size={18} />}
                    label="Microsoft"
                    onClick={microsoftConfigured ? () => beginOAuthSignIn('microsoft') : undefined}
                    disabled={!microsoftConfigured}
                  />
                </div>
                {!linkedInConfigured && !gitHubConfigured && !googleConfigured && !microsoftConfigured && (
                  <div className="text-[11px]" style={{ color: subColor }}>Sign-in isn&rsquo;t configured yet</div>
                )}
                {callbackState === 'exchanging' && <div className="text-[11px]" style={{ color: subColor }}>Finishing sign-in&hellip;</div>}
                {callbackState === 'error' && (
                  <div className="max-w-xs text-center text-[11px]" style={{ color: subColor }}>
                    Couldn&rsquo;t complete sign-in{callbackError ? `: ${callbackError}` : ' — try again later'}
                  </div>
                )}

                <InteractiveHoverButton
                  text="Not now"
                  onClick={onSkip}
                  className="mt-1"
                  bg={cardBg}
                  border={cardRing}
                  textColor={textColor}
                  dotColor={textColor}
                  hoverTextColor={invertedTextColor}
                />
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
