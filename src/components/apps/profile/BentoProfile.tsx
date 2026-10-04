// Profile window content: a 3-second MagicUI Ripple intro with the site's
// own logo centered on it (see ../../ui/ripple.tsx), then the ripple keeps
// running as a quiet background while a bento grid fades in on top — a
// full-width Hero card (a live GitHub contribution-calendar banner, a big
// centered photo overlapping it by half with the name split either side,
// each half doing a ShinyText shimmer, then the About paragraph
// decrypt-revealing in via DecryptedText), followed by six headed,
// content-sized icon cards, each icon paired with its name: Languages,
// Frameworks, AI Tools, Databases, Integrations, and everyday Tools — kept
// to the specific set the user actually wants shown, not the fuller resume
// list from earlier drafts.
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Ripple } from '../../ui/ripple';
import ShinyText from '../../ui/shiny-text';
import DecryptedText from '../../ui/decrypted-text';
import { NAME, ABOUT_ME, AVATAR_URL, GITHUB_HANDLE } from './shared';

// ghchart.rshah.org renders the actual GitHub-style green contribution
// calendar (real per-day squares, GitHub's own color scale) — the other
// service tried first, github-contribution-stats.vercel.app, turned out to
// render a commits/PRs/issues *stats* card, not a calendar, plus a
// permanent "star this repo" watermark baked into the image.
const CONTRIB_GRAPH_URL = `https://ghchart.rshah.org/${GITHUB_HANDLE}`;

const INTRO_MS = 3000;

function tileClass(isLight: boolean) {
  return `overflow-hidden rounded-2xl shadow-sm backdrop-blur-md ${
    isLight ? 'bg-white/85 ring-1 ring-black/5' : 'bg-white/[0.06] ring-1 ring-white/10'
  }`;
}

// A handful of real technologies have no logo left in the simple-icons set
// at all — Microsoft pulled every one of its own marks (Visual Studio,
// Azure) and OpenAI has none either (confirmed against the live
// simple-icons dataset, not assumed) — so those get a small hand-drawn
// badge instead of either a misleading substitute logo or silently
// dropping a defining technology.
function LogoBadge({ bg, label, textClass = 'text-[11px]' }: { bg: string; label: string; textClass?: string }) {
  return (
    <div
      className={`flex h-8 w-8 items-center justify-center rounded-xl font-bold text-white ${textClass}`}
      style={{ background: bg }}
    >
      {label}
    </div>
  );
}

function OpenAIBadge() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-black">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#fff" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2.2c.5 0 .95.32 1.1.8l.9 2.75 2.75.9c.48.15.8.6.8 1.1s-.32.95-.8 1.1l-2.75.9-.9 2.75c-.15.48-.6.8-1.1.8s-.95-.32-1.1-.8l-.9-2.75-2.75-.9c-.48-.15-.8-.6-.8-1.1s.32-.95.8-1.1l2.75-.9.9-2.75c.15-.48.6-.8 1.1-.8Z" />
        <circle cx="19" cy="17.5" r="2.3" />
        <circle cx="5.5" cy="18.5" r="1.7" />
      </svg>
    </div>
  );
}

function SendGridBadge() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: '#1A82E2' }}>
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#fff" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 11.5 20.5 4 14 20l-2.7-6.3L3 11.5Z" />
      </svg>
    </div>
  );
}

function VsCodeBadge() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: '#007ACC' }}>
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
        <path d="M9 8 4 12l5 4" />
        <path d="M15 8l5 4-5 4" />
      </svg>
    </div>
  );
}

// Codex, Kiro, Twilio and Azure have no marks left in simple-icons either
// (confirmed against the live dataset, same as the others above) — Codex
// gets OpenAI's own black-badge family since it's an OpenAI product, Kiro
// gets AWS navy since it's an AWS tool, Twilio's badge echoes its real
// four-dot mark, and Azure's echoes its angular "blades" mark.
function CodexBadge() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-black">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 6l6 6-6 6" />
        <path d="M13 18h7" />
      </svg>
    </div>
  );
}

function KiroBadge() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: '#232F3E' }}>
      <span className="text-[10px] font-bold text-white">Kiro</span>
    </div>
  );
}

function TwilioBadge() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: '#F22F46' }}>
      <svg viewBox="0 0 24 24" className="h-4 w-4" xmlns="http://www.w3.org/2000/svg">
        <circle cx="8" cy="8" r="3" fill="#fff" />
        <circle cx="16" cy="8" r="3" fill="#fff" />
        <circle cx="8" cy="16" r="3" fill="#fff" />
        <circle cx="16" cy="16" r="3" fill="#fff" />
      </svg>
    </div>
  );
}

function AzureBadge() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: '#0078D4' }}>
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#fff" xmlns="http://www.w3.org/2000/svg">
        <path d="M9.5 3h4.2l-4.6 13.2L2 20.5 9.5 3Z" />
        <path d="M14.3 3.6 20 15.4h-8.6l3-6.9-4.4 5.2 6.4 6.8H4.2l10.1-16.9Z" opacity="0.75" />
      </svg>
    </div>
  );
}

type IconItem = { kind: 'img'; src: string; alt: string } | { kind: 'node'; node: ReactNode; alt: string };

const img = (slug: string, alt: string): IconItem => ({ kind: 'img', src: `https://cdn.simpleicons.org/${slug}/${slug}`, alt });
const badge = (icon: ReactNode, alt: string): IconItem => ({ kind: 'node', node: icon, alt });

// Split into Languages / Frameworks / AI Tools (was one combined card) plus
// Integrations / Databases / Tools — each its own card, per explicit
// feedback. Expanded per the resume plus a second portfolio's own
// Experience-timeline markup (Python/Django/ML internship, Android
// internship) — real technologies, not invented additions.
const LANGUAGE_ICONS: IconItem[] = [
  badge(<LogoBadge bg="#9B4F96" label="C#" />, 'C#'),
  img('typescript', 'TypeScript'),
  img('javascript', 'JavaScript'),
  img('python', 'Python'),
];

const FRAMEWORK_ICONS: IconItem[] = [
  img('angular', 'Angular'),
  img('react', 'React'),
  img('dotnet', 'ASP.Net'),
  img('django', 'Django'),
];

const AI_TOOL_ICONS: IconItem[] = [
  badge(<CodexBadge />, 'Codex'),
  badge(<KiroBadge />, 'Kiro'),
  img('claude', 'Claude'),
  badge(<OpenAIBadge />, 'OpenAI'),
];

const INTEGRATIONS_ICONS: IconItem[] = [
  img('stripe', 'Stripe'),
  badge(<SendGridBadge />, 'SendGrid'),
  badge(<TwilioBadge />, 'Twilio'),
  img('google', 'Google Workspace'),
  badge(<AzureBadge />, 'Azure'),
];

const DATABASE_ICONS: IconItem[] = [
  img('postgresql', 'PostgreSQL'),
  img('mysql', 'MySQL'),
  img('mongodb', 'MongoDB'),
  img('sqlite', 'SQLite'),
];

const TOOLS_ICONS: IconItem[] = [
  badge(<LogoBadge bg="#5C2D91" label="VS" />, 'Visual Studio'),
  badge(<VsCodeBadge />, 'VS Code'),
  img('git', 'Git'),
  img('postman', 'Postman'),
];

function CardHeading({ children, isLight }: { children: ReactNode; isLight: boolean }) {
  return <div className={`text-sm font-semibold sm:text-base ${isLight ? 'text-[#1c1c1e]' : 'text-white'}`}>{children}</div>;
}

// Content-sized, not stretched to match its neighbors — a 6-icon card and a
// 4-icon card don't need to pretend to be the same height, per explicit
// feedback that common card sizing wasn't wanted here. Each icon now
// carries its name underneath, not just a bare logo. The card itself
// staggers in (delayed by its position in the grid) and lifts on hover;
// each icon also nudges up and scales slightly on its own hover.
function IconGridTile({ heading, items, index, isLight }: { heading: string; items: IconItem[]; index: number; isLight: boolean }) {
  return (
    <motion.div
      className={`${tileClass(isLight)} flex flex-col gap-3 p-4 sm:p-5`}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15 + index * 0.08, ease: 'easeOut' }}
      whileHover={{ y: -4, boxShadow: '0 16px 28px -10px rgba(0,0,0,0.2)' }}
    >
      <CardHeading isLight={isLight}>{heading}</CardHeading>
      <div className="flex flex-wrap gap-3">
        {items.map((item, i) => (
          <motion.div
            key={i}
            className="flex w-14 flex-col items-center gap-1 text-center"
            whileHover={{ y: -3, scale: 1.12 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          >
            {item.kind === 'img' ? <img src={item.src} alt={item.alt} className="h-8 w-8 object-contain" /> : item.node}
            <span className={`text-[10px] leading-tight ${isLight ? 'text-black/60' : 'text-white/60'}`}>{item.alt}</span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

// Big, centered photo with the name split either side of it (each half
// shimmering via ShinyText), then the About paragraph decrypt-revealing in
// via DecryptedText once the grid is visible — no designation/location/
// experience text, no logo above the photo, per explicit feedback dropping
// both.
function HeroTile({ isLight }: { isLight: boolean }) {
  const nameColor = isLight ? '#3a3a3e' : '#f4f3f7';
  const nameShine = isLight ? '#ffffff' : '#9a9aa5';
  return (
    <motion.div
      className={`${tileClass(isLight)} relative col-span-2 flex flex-col items-center @[900px]:col-span-3`}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      whileHover={{ y: -4, boxShadow: '0 16px 28px -10px rgba(0,0,0,0.2)' }}
    >
      {/* Live GitHub contribution calendar as a banner strip, padded on all
          sides instead of sitting flush against the card's edges/corners —
          the aspect-ratio lock now lives on the image itself so it still
          fills whatever width the padding leaves it, edge-to-edge within
          its own frame. */}
      <div className={`w-full p-3 sm:p-4 ${isLight ? 'bg-[#f6f8fa]' : 'bg-black/30'}`}>
        <img
          src={CONTRIB_GRAPH_URL}
          alt={`${GITHUB_HANDLE}'s GitHub contribution calendar`}
          className="w-full rounded-lg object-cover"
          style={{ aspectRatio: '663 / 104' }}
        />
      </div>
      <div className="relative flex w-full flex-col items-center gap-4 p-5 sm:gap-6 sm:p-8">
        <div
          className="absolute inset-x-0 top-0 bottom-0 -z-10 opacity-40"
          aria-hidden
          style={{ backgroundImage: 'radial-gradient(circle, rgba(99,102,241,0.25) 1px, transparent 1px)', backgroundSize: '18px 18px' }}
        />
        {/* Photo overlaps the banner above; sized up along with the name
            text per explicit feedback that both felt too small. A thin
            fading rule sits under each half of the name, not one line
            spanning the whole row, since the photo floats above that line
            rather than sitting on it. */}
        <div className="-mt-10 flex items-center justify-center gap-4 sm:-mt-16 sm:gap-8">
          <div className="flex flex-col items-center gap-2">
            <ShinyText text="KRISHAN" color={nameColor} shineColor={nameShine} speed={2.4} className="text-2xl font-bold tracking-wide sm:text-5xl" />
            <span className={`h-px w-20 bg-gradient-to-r from-transparent to-transparent sm:w-32 ${isLight ? 'via-black/25' : 'via-white/25'}`} />
          </div>
          <img
            src={AVATAR_URL}
            alt={NAME}
            className={`h-20 w-20 shrink-0 rounded-full object-cover shadow-md ring-4 sm:h-32 sm:w-32 ${isLight ? 'ring-white' : 'ring-white/15'}`}
          />
          <div className="flex flex-col items-center gap-2">
            <ShinyText text="MURARI" color={nameColor} shineColor={nameShine} speed={2.4} delay={0.4} className="text-2xl font-bold tracking-wide sm:text-5xl" />
            <span className={`h-px w-20 bg-gradient-to-r from-transparent to-transparent sm:w-32 ${isLight ? 'via-black/25' : 'via-white/25'}`} />
          </div>
        </div>
        {/* No max-w cap — the previous max-w-xl held the paragraph to
            576px regardless of how wide the card actually was, leaving
            large empty gutters on either side once the card widened past
            that; it now spans the same width as the photo/banner above. */}
        <p className={`w-full text-justify text-base leading-relaxed sm:text-lg ${isLight ? 'text-black/75' : 'text-white/80'}`}>
          <DecryptedText text={ABOUT_ME} animateOn="view" sequential revealDirection="start" speed={16} maxIterations={36} />
        </p>
      </div>
    </motion.div>
  );
}

export default function BentoProfile({ isLight = true }: { isLight?: boolean }) {
  const [showGrid, setShowGrid] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setShowGrid(true), INTRO_MS);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className={`relative h-full w-full overflow-hidden ${isLight ? 'bg-[#f4f3f7]' : 'bg-black'}`}>
      {/* The ripple runs continuously in both phases — it's the intro's
          whole content at first, then keeps animating quietly behind the
          grid once the grid's translucent cards fade in on top of it. */}
      {/* stone, not indigo — the indigo/purple brand color is the OLD logo;
          the current logo (android-chrome-512x512.png) is a warm gray/olive
          gradient, so the ripple's currentColor is matched to that instead
          (see MenuBar.tsx's own "silvered, not purple" comment for the same
          logo-recolor history). */}
      <div className={`absolute inset-0 ${isLight ? 'text-stone-400/70' : 'text-stone-500/40'}`}>
        <Ripple mainCircleSize={140} numCircles={7} />
      </div>

      <AnimatePresence>
        {!showGrid && (
          <motion.div key="intro" exit={{ opacity: 0 }} transition={{ duration: 0.5 }} className="absolute inset-0 z-10 flex items-center justify-center">
            <img
              src="/android-chrome-512x512.png"
              alt="Logo"
              className="h-20 w-20 object-contain"
              style={{ filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.18))' }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showGrid && (
          <motion.div
            key="grid"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            // data-lenis-prevent: the whole site scrolls via a single global
            // Lenis instance bound to `document` (see SmoothScroll.tsx),
            // which hijacks wheel/trackpad scroll for its own smooth-scroll
            // by default — including over this modal, since it isn't a
            // portal outside that tree. This attribute is the exact escape
            // hatch the codebase already has CSS for (see the
            // `[data-lenis-prevent]` rule in index.css) but wasn't applied
            // here yet, which is why only dragging the scrollbar thumb
            // worked and real wheel/two-finger scroll didn't.
            data-lenis-prevent
            className="@container absolute inset-0 z-10 overflow-y-auto p-6"
          >
            {/* Capped + centered rather than left stuck at a fixed width —
                on a maximized/fullscreen window this grid was leaving most
                of the width sitting empty. A *container* query, not a
                viewport one (lg:) — this window's own rendered width
                toggles between a ~760px cap and 100vw independently of the
                outer browser viewport, so a viewport breakpoint would key
                off the wrong box (same result whether this window is capped
                or fullscreen, since the browser viewport itself never
                changes). The threshold is a custom 900px, not Tailwind's
                built-in @lg (512px) — @lg already sits below this grid's own
                normal ~700px width, which would (and did) turn on the extra
                column even at the ordinary window size. */}
            <div className="mx-auto grid max-w-6xl grid-cols-2 gap-5 @[900px]:grid-cols-3">
              <HeroTile isLight={isLight} />
              <IconGridTile heading="Languages" items={LANGUAGE_ICONS} index={0} isLight={isLight} />
              <IconGridTile heading="Frameworks" items={FRAMEWORK_ICONS} index={1} isLight={isLight} />
              <IconGridTile heading="AI Tools" items={AI_TOOL_ICONS} index={2} isLight={isLight} />
              <IconGridTile heading="Databases" items={DATABASE_ICONS} index={3} isLight={isLight} />
              <IconGridTile heading="Integrations" items={INTEGRATIONS_ICONS} index={4} isLight={isLight} />
              <IconGridTile heading="Tools" items={TOOLS_ICONS} index={5} isLight={isLight} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
