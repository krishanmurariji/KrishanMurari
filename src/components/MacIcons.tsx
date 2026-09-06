// Original app-icon-style artwork for the dock — each one built from scratch to
// evoke the real macOS app it represents (color identity, general composition,
// visual metaphor), not traced or copied from Apple's actual icon assets. Each
// icon owns its full tile: background squircle, gradient, and glyph baked in
// as one self-contained SVG, the same way a real macOS dock icon is a single
// flat image rather than a generic colored wrapper plus a glyph.
import type { CSSProperties, SVGProps } from 'react';

// Swapped for a real Finder-style icon (Elias, icon-icons.com/icon/finder-macos-bigsur/190173,
// free for commercial use) rather than the hand-built SVG this used to be —
// still matches DockApp['icon']'s ComponentType<{ className?: string; style?:
// CSSProperties }> signature, so nothing downstream (MacDock, AppWindow) needs
// to change.
export const FinderIcon = ({ className, style }: { className?: string; style?: CSSProperties }) => (
  <img src="/icons/finder-macos-v2.png" alt="" className={className} style={style} />
);

export const MacMailIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" {...props}>
    <defs>
      <linearGradient id="mailBg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#8FD3FF" />
        <stop offset="100%" stopColor="#1D6FE0" />
      </linearGradient>
    </defs>
    <rect width="100" height="100" rx="22" fill="url(#mailBg)" />
    <rect x="15" y="29" width="70" height="46" rx="7" fill="#FFFFFF" />
    <path d="M18 33 L50 58 L82 33" stroke="#1D6FE0" strokeWidth="5.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const MacFolderIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" {...props}>
    <defs>
      <linearGradient id="folderFront" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#6CBBFF" />
        <stop offset="100%" stopColor="#2D7FE0" />
      </linearGradient>
    </defs>
    <rect width="100" height="100" rx="22" fill="#EAF4FF" />
    <path d="M14 30 H39 L47 39 H88 A5 5 0 0 1 93 44 V47 H14 Z" fill="#BFDDFF" />
    <rect x="11" y="41" width="78" height="42" rx="9" fill="url(#folderFront)" />
  </svg>
);

export const CertificateIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" {...props}>
    <defs>
      <linearGradient id="certBg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FFE08A" />
        <stop offset="100%" stopColor="#E0A020" />
      </linearGradient>
    </defs>
    <rect width="100" height="100" rx="22" fill="url(#certBg)" />
    <path d="M38 56 L28 88 L50 77 L72 88 L62 56" fill="#FFFFFF" opacity="0.9" />
    <circle cx="50" cy="40" r="23" fill="#FFFFFF" />
    <path d="M39 40 L46 47 L61 31" stroke="#E0A020" strokeWidth="6.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const EducationIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" {...props}>
    <defs>
      <linearGradient id="eduBg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#CBA9FF" />
        <stop offset="100%" stopColor="#7A3FE0" />
      </linearGradient>
    </defs>
    <rect width="100" height="100" rx="22" fill="url(#eduBg)" />
    <path d="M50 26 L90 43 L50 60 L10 43 Z" fill="#FFFFFF" />
    <path d="M29 51 V70 Q50 83 71 70 V51" fill="none" stroke="#FFFFFF" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="90" y1="43" x2="90" y2="67" stroke="#FFFFFF" strokeWidth="4.5" strokeLinecap="round" />
  </svg>
);

// Dock tile for the Spotify-clone app (SpotifyApp.tsx) — same "flat image,
// own background baked in" convention as the icons above. The glyph itself
// is Spotify's real logomark (the three curved soundwave arcs), same path
// used at the smaller sizes in DesktopWidgets.tsx/MacDock.tsx's dock hover
// popup — a brand mark identifying what the app is, same as using the real
// LinkedIn/GitHub/Google/Microsoft marks on the lock screen's sign-in
// buttons elsewhere in this app.
export const SpotifyIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" {...props}>
    <rect width="100" height="100" rx="22" fill="#1ED760" />
    <svg x="18" y="18" width="64" height="64" viewBox="0 0 24 24" fill="#0c0c0c">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141 4.32-1.32 9.72-.66 13.439 1.62.361.181.54.78.301 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  </svg>
);

export const ExperienceIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" {...props}>
    <defs>
      <linearGradient id="expBg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FFC178" />
        <stop offset="100%" stopColor="#E0821F" />
      </linearGradient>
    </defs>
    <rect width="100" height="100" rx="22" fill="url(#expBg)" />
    <path d="M38 42 V33 A6 6 0 0 1 44 27 H56 A6 6 0 0 1 62 33 V42" fill="none" stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="19" y="42" width="62" height="38" rx="8" fill="#FFFFFF" />
    <rect x="19" y="42" width="62" height="14" fill="#E0821F" opacity="0.35" />
  </svg>
);
