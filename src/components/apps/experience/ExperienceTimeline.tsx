// Experience window content. A short "eye" intro (see ./EyeIntro.tsx —
// adapted from a plain CSS animation the user supplied) plays once, the
// same "intro plays, then content fades in" pattern BentoProfile already
// uses for the Profile window's own logo/ripple intro — including for the
// hidden copy AppWindow renders purely to snapshot for the dock's genie
// zoom (see useSharedSnapshots in AppWindow.tsx): that snapshot is taken at
// a fixed 50ms after mount, which lands inside the eye intro for BOTH
// copies, so the genie zoom and the just-opened window show the same eye
// animation instead of the genie showing the real content and the window
// then cutting to the intro. Once the intro's done, a company switcher
// (segmented tabs, not one long infinite-scroll list) and an accordion of
// that company's projects take over, on the same background gradient the
// eye intro uses so the cut from intro to content doesn't jump.
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { EXPERIENCE, formatDuration, formatRange, totalExperienceLabel } from './data';
import type { CompanyEntry, ProjectEntry, TechItem } from './data';
import EyeIntro from './EyeIntro';

// The eye animation's own CSS keyframes are a fixed 4s infinite loop (see
// EyeIntro.tsx) — showing it for exactly one full cycle means the intro
// exits right as the loop would seam back to its start, instead of cutting
// off mid-blink at an arbitrary point.
const INTRO_MS = 4000;

const BG_GRADIENT = 'linear-gradient(-45deg, #8691b3, #edeef3)';

function ChevronIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg" {...props}>
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

function TechPill({ item }: { item: TechItem }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] px-2.5 py-1 text-[11px] font-medium text-black/70 ring-1 ring-black/5">
      {item.icon && (
        // crossOrigin is required for the dock's genie snapshot (see
        // useSharedSnapshots in AppWindow.tsx) to actually read this canvas
        // back afterward — cdn.simpleicons.org does send CORS headers, but
        // without opting into that here too, the browser still treats a
        // canvas that drew this image as tainted the moment anything tries
        // to call getImageData/toDataURL on it, which silently threw the
        // whole snapshot out for every project with any tech pill at all.
        <img
          src={`https://cdn.simpleicons.org/${item.icon}/${item.icon}`}
          alt=""
          aria-hidden
          crossOrigin="anonymous"
          className="h-3 w-3 object-contain"
        />
      )}
      {item.label}
    </span>
  );
}

function ProjectAccordion({ project, accent, defaultOpen }: { project: ProjectEntry; accent: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="overflow-hidden rounded-xl bg-white/70 shadow-sm ring-1 ring-black/5 backdrop-blur-md">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: accent }} />
          <span className="text-sm font-semibold text-[#1c1c1e] sm:text-base">{project.name}</span>
        </div>
        <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.2 }} className="shrink-0 text-black/35">
          <ChevronIcon className="h-4 w-4" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="space-y-3 px-4 pb-4">
              <p className="text-sm leading-relaxed text-black/65">{project.description}</p>
              <div className="flex flex-wrap gap-1.5">
                {project.tech.map((item, i) => (
                  <TechPill key={i} item={item} />
                ))}
              </div>
              <ul className="space-y-1.5">
                {project.bullets.map((b, i) => (
                  <li key={i} className="flex gap-2 text-sm leading-relaxed text-black/75">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-black/30" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CompanyLogo({ logo, company }: { logo: CompanyEntry['logo']; company: string }) {
  if (logo.on === 'dark') {
    return (
      <div className="flex h-10 items-center rounded-lg bg-[#0b1220] px-3">
        <img src={logo.src} alt={company} className="h-6 w-auto object-contain" />
      </div>
    );
  }
  return (
    <div className="flex h-10 items-center rounded-lg bg-white px-2 ring-1 ring-black/5">
      <img src={logo.src} alt={company} className="h-6 w-auto object-contain" />
    </div>
  );
}

function CompanyDetail({ entry }: { entry: CompanyEntry }) {
  const current = entry.end === null;
  return (
    <div>
      <div className="rounded-2xl bg-white/70 p-5 shadow-sm ring-1 ring-black/5 backdrop-blur-md sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <CompanyLogo logo={entry.logo} company={entry.company} />
            <div>
              <a
                href={entry.companyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-[#1c1c1e] hover:underline sm:text-base"
              >
                {entry.company}
              </a>
              <div className="text-sm font-medium sm:text-base" style={{ color: entry.accent }}>
                {entry.role}
              </div>
            </div>
          </div>
          {current && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Current
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-black/55 sm:text-sm">
          <span>{formatRange(entry.start, entry.end)}</span>
          <span>·</span>
          <span>{formatDuration(entry.start, entry.end)}</span>
          <span>·</span>
          <span>{entry.location}</span>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-black/65">{entry.summary}</p>
      </div>

      <div className="mt-4 space-y-3">
        {entry.projects.map((project, i) => (
          <ProjectAccordion key={project.name} project={project} accent={entry.accent} defaultOpen={i === 0} />
        ))}
      </div>
    </div>
  );
}

export default function ExperienceTimeline({ interactive }: { interactive?: boolean }) {
  // Both this copy and the hidden one AppWindow renders purely to snapshot
  // for the dock's genie zoom start the intro identically — the snapshot
  // is taken 50ms after mount, well inside the intro, so the genie zoom and
  // the window that opens from it show the same eye animation instead of
  // the genie showing the real content and the window then cutting to the
  // intro.
  const [showContent, setShowContent] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => setShowContent(true), INTRO_MS);
    return () => window.clearTimeout(t);
  }, []);

  const active = EXPERIENCE[activeIndex];

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: BG_GRADIENT }}>
      <AnimatePresence>
        {!showContent && (
          <motion.div key="intro" exit={{ opacity: 0 }} transition={{ duration: 0.5 }} className="absolute inset-0 z-20">
            <EyeIntro />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showContent && (
          <motion.div
            key="content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="relative z-10 flex h-full flex-col text-[#1c1c1e]"
          >
            <div className="flex min-h-0 w-full flex-1 flex-col px-6">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 pb-1 pt-5">
                <h2 className="text-xl font-bold sm:text-2xl">Experience</h2>
                <span className="rounded-full bg-black/[0.05] px-3 py-1 text-xs font-semibold text-black/60 ring-1 ring-black/5">
                  {totalExperienceLabel()} total experience
                </span>
              </div>

              {/* Company switcher — a segmented control instead of one long
                  scroll, so each company reads as its own focused view
                  rather than everything being shown at once. */}
              <div className="flex shrink-0 gap-2 py-4">
                {EXPERIENCE.map((entry, i) => {
                  const isActive = i === activeIndex;
                  return (
                    <button
                      key={entry.company}
                      type="button"
                      onClick={() => setActiveIndex(i)}
                      className="relative rounded-full px-4 py-2 text-sm font-medium transition-colors"
                      style={{ color: isActive ? '#1c1c1e' : 'rgba(28,28,30,0.5)' }}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="exp-tab-highlight"
                          className="absolute inset-0 rounded-full bg-white/70 shadow-sm"
                          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                        />
                      )}
                      <span className="relative">{entry.company.split(' ')[0]}</span>
                    </button>
                  );
                })}
              </div>

              <div data-lenis-prevent className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-6">
                {/* Keyed by company so switching tabs remounts fresh — each
                    company's projects should start from their own
                    default-open state, not whatever was left expanded on
                    the previously viewed company. */}
                <CompanyDetail key={active.company} entry={active} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
