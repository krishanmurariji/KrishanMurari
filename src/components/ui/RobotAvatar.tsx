// A small hand-drawn robot mascot for the "Chat Now" assistant — built as a
// plain inline SVG (gradients + a soft highlight ellipse standing in for a
// specular glint) rather than a downloaded 3D render, so there's no
// external asset, no licensing question, and it scales crisply at any size.
// Same self-contained-icon convention as MacIcons.tsx's flat app tiles.
import { useId } from 'react';
import type { SVGProps } from 'react';

export default function RobotAvatar(props: SVGProps<SVGSVGElement>) {
  // Gradient/pattern ids must be unique per instance — this renders more
  // than once on the same page (the chat header, plus one per assistant
  // message bubble), and two <svg> elements sharing a literal id="..." on
  // their <linearGradient> would leave every instance after the first
  // referencing whichever definition the DOM happens to resolve first.
  const uid = useId();
  return (
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" {...props}>
      <defs>
        <linearGradient id={`${uid}-head`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#dfe6ee" />
        </linearGradient>
        <linearGradient id={`${uid}-ear`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5aa9ff" />
          <stop offset="100%" stopColor="#2f7fe0" />
        </linearGradient>
        <linearGradient id={`${uid}-antenna`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6fb6ff" />
          <stop offset="100%" stopColor="#2f7fe0" />
        </linearGradient>
        <radialGradient id={`${uid}-eye`} cx="35%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#bfe4ff" />
        </radialGradient>
      </defs>

      {/* Antenna */}
      <rect x="47" y="8" width="6" height="14" rx="3" fill={`url(#${uid}-antenna)`} />
      <circle cx="50" cy="8" r="7" fill={`url(#${uid}-antenna)`} />
      <circle cx="47.5" cy="5.5" r="2" fill="#ffffff" opacity="0.7" />

      {/* Ears */}
      <rect x="8" y="38" width="14" height="24" rx="7" fill={`url(#${uid}-ear)`} />
      <rect x="78" y="38" width="14" height="24" rx="7" fill={`url(#${uid}-ear)`} />

      {/* Head */}
      <rect x="18" y="20" width="64" height="58" rx="24" fill={`url(#${uid}-head)`} />
      {/* Glossy highlight, standing in for a specular glint on a real 3D render */}
      <ellipse cx="38" cy="34" rx="16" ry="8" fill="#ffffff" opacity="0.55" />

      {/* Face screen */}
      <rect x="28" y="34" width="44" height="32" rx="14" fill="#161b22" />
      <circle cx="41" cy="50" r="5" fill={`url(#${uid}-eye)`} />
      <circle cx="59" cy="50" r="5" fill={`url(#${uid}-eye)`} />
      <path d="M40 58c3 3 5 4 10 4s7-1 10-4" stroke={`url(#${uid}-eye)`} strokeWidth="2.6" strokeLinecap="round" fill="none" />
    </svg>
  );
}
