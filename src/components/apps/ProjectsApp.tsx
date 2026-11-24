// Content for the dock's "Projects" window (see APP_BODIES in
// AppWindow.tsx) — a hand-picked set of repos (see SHOWN_REPOS in
// src/lib/github-projects.ts), fetched live from GitHub at runtime so each
// card's language mix/commit count/latest release stay current without a
// rebuild, but which repos show at all is curated. Each card leads with a
// full-bleed preview standing in for the repo's live site — the actual
// point of this page, since every listed project has one — with its name
// and description floating on a blurred glass strip over that preview
// rather than in a separate block below it, Fork/Code pinned to the top
// corner, and a language pill straddling the card's own bottom edge.
import { useEffect, useState } from 'react';
import { fetchLiveProjects, GITHUB_USER, FALLBACK_LANGUAGE_COLOR, type Project } from '../../lib/github-projects';

// A flat hex->darker-hex blend for the hero gradient's second stop — there's
// no hand-curated dark variant for every language color the way the design
// mockup had, so this derives one instead of guessing at more hex pairs.
function darken(hex: string, amount: number): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!match) return hex;
  const num = parseInt(match[1], 16);
  const channel = (shift: number) => Math.round(((num >> shift) & 0xff) * (1 - amount));
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, '0')).join('')}`;
}

function ProjectCard({ project, isLight }: { project: Project; isLight: boolean }) {
  const cardBg = isLight ? '#ffffff' : '#17171c';
  const cardBorder = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
  const cardShadow = isLight
    ? '0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.05)'
    : '0 1px 2px rgba(0,0,0,0.3), 0 8px 24px rgba(0,0,0,0.35)';
  const textPrimary = isLight ? '#1c1c1e' : '#ffffff';
  const textMuted = isLight ? 'text-black/55' : 'text-white/60';
  const textFaint = isLight ? 'text-black/35' : 'text-white/40';
  const pillBg = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.07)';

  const primaryColor = project.languages[0]?.color ?? FALLBACK_LANGUAGE_COLOR;
  const heroBg = `linear-gradient(135deg, ${primaryColor}, ${darken(primaryColor, 0.65)})`;
  const topicsShown = project.topics.slice(0, 3);
  const extraTopics = project.topics.length - topicsShown.length;

  return (
    <div className="flex flex-col gap-3.5">
      {/* The site preview — stands in for a real screenshot/iframe of the
          live homepage, which needs either a screenshot service or a
          self-hosted headless-browser render; not wired up yet. Wrapped in
          its own positioning context (rather than sharing one with the
          chips/topics rows below) so the language pill's bottom-0 lands on
          this hero's own edge instead of the bottom of the whole card. */}
      <div className="relative">
      <div className="relative h-[230px] overflow-hidden rounded-[20px] transition hover:-translate-y-0.5" style={{ background: heroBg, boxShadow: cardShadow }}>
        <div className="p-[18px] pt-[58px]">
          <div className="h-[7px] w-[34%] rounded" style={{ background: 'rgba(255,255,255,0.5)' }} />
          <div className="mt-2.5 h-[18px] w-[62%] rounded-md" style={{ background: 'rgba(255,255,255,0.28)' }} />
          <div className="mt-2.5 flex gap-1.5">
            <div className="h-6 flex-1 rounded-md" style={{ background: 'rgba(255,255,255,0.16)' }} />
            <div className="h-6 flex-1 rounded-md" style={{ background: 'rgba(255,255,255,0.16)' }} />
            <div className="h-6 flex-1 rounded-md" style={{ background: 'rgba(255,255,255,0.16)' }} />
          </div>
          <div className="mt-3 h-[60px] w-full rounded-lg" style={{ background: 'rgba(255,255,255,0.12)' }} />
        </div>

        {/* Name + description, blurred glass over the preview */}
        <div
          className="absolute inset-x-0 top-0 px-4 py-3"
          style={{ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', background: 'rgba(10,10,14,0.38)' }}
        >
          <div className="truncate text-[15px] font-bold text-white">{project.name}</div>
          <div className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-white/82">{project.description}</div>
        </div>

        <div className="absolute right-3 top-3 flex gap-1.5">
          <a
            href={`${project.repoUrl}/fork`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full px-3 py-1.5 text-[11px] font-bold text-white transition hover:brightness-110"
            style={{ background: 'rgba(10,10,14,0.5)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}
          >
            Fork
          </a>
          <a
            href={project.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full px-3 py-1.5 text-[11px] font-bold text-white transition hover:brightness-110"
            style={{ background: 'rgba(10,10,14,0.5)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}
          >
            Code
          </a>
        </div>

        {!project.homepage && (
          <div
            className="absolute inset-x-0 bottom-0 top-[52px] flex items-center justify-center px-4 text-center text-[11.5px] font-semibold text-white"
            style={{ background: 'rgba(0,0,0,0.55)' }}
          >
            No hosted demo — code only
          </div>
        )}
      </div>

      {/* Language pill, straddling the hero's own bottom edge */}
      {project.languages.length > 0 && (
        <div
          className="absolute bottom-0 left-1/2 flex -translate-x-1/2 translate-y-1/2 items-center gap-2.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[10.5px] font-semibold"
          style={{ background: cardBg, border: `1px solid ${cardBorder}`, boxShadow: cardShadow, color: textPrimary }}
        >
          {project.languages.map((lang) => (
            <span key={lang.name} className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: lang.color }} />
              {lang.name}
            </span>
          ))}
        </div>
      )}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {project.releaseTag && (
          <span className="rounded-full px-2.5 py-1 text-[10.5px] font-semibold" style={{ background: pillBg, color: textPrimary }}>
            {project.releaseTag}
          </span>
        )}
        <span className="rounded-full px-2.5 py-1 text-[10.5px] font-semibold" style={{ background: pillBg, color: textPrimary }}>
          {project.commits !== null ? `${project.commits} commit${project.commits === 1 ? '' : 's'}` : 'commits unavailable'}
        </span>
        {project.forkOf && (
          <span className="rounded-full px-2.5 py-1 text-[10.5px] font-semibold" style={{ background: pillBg, color: textPrimary }}>
            Fork of {project.forkOf}
          </span>
        )}
      </div>

      {topicsShown.length > 0 && (
        <div className="-mt-1.5 flex flex-wrap gap-1.5">
          {topicsShown.map((t) => (
            <span key={t} className={`rounded-full px-2.5 py-0.5 text-[10.5px] ${textMuted}`} style={{ border: `1px solid ${cardBorder}` }}>
              {t}
            </span>
          ))}
          {extraTopics > 0 && <span className={`rounded-full px-2.5 py-0.5 text-[10.5px] ${textFaint}`}>+{extraTopics}</span>}
        </div>
      )}
    </div>
  );
}

export default function ProjectsApp({ isLight = true }: { isLight?: boolean }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLiveProjects()
      .then((p) => {
        if (cancelled) return;
        setProjects(p);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load projects.');
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const bg = isLight ? '#f4f3f7' : '#0c0c10';
  const headingClass = isLight ? 'text-[#1c1c1e]' : 'text-white';
  const subTextClass = isLight ? 'text-black/50' : 'text-white/50';

  return (
    <div data-lenis-prevent className="no-scrollbar h-full w-full overflow-y-auto" style={{ background: bg }}>
      <div className="px-6 pb-2 pt-6">
        <h2 className={`text-lg font-semibold ${headingClass}`}>Projects</h2>
      </div>

      <div className="px-5 pb-6">
        {status === 'loading' && (
          <div className={`flex items-center justify-center gap-2 py-16 text-sm ${subTextClass}`}>
            <span
              className="h-4 w-4 animate-spin rounded-full border-2"
              style={{ borderColor: isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)', borderTopColor: isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.7)' }}
            />
            Loading projects&hellip;
          </div>
        )}

        {status === 'error' && (
          <div className={`flex flex-col items-center gap-2 py-16 text-center text-sm ${subTextClass}`}>
            <p>{error}</p>
            <a
              href={`https://github.com/${GITHUB_USER}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`underline underline-offset-2 ${isLight ? 'text-black/80' : 'text-white/80'}`}
            >
              View on GitHub instead ↗
            </a>
          </div>
        )}

        {status === 'ready' && projects.length === 0 && (
          <div className={`py-16 text-center text-sm ${subTextClass}`}>No public projects with a live URL yet.</div>
        )}

        {status === 'ready' && projects.length > 0 && (
          <div className="@container">
            <div className="grid grid-cols-1 gap-x-5 gap-y-9 @[560px]:grid-cols-2 @[900px]:grid-cols-3 @[1200px]:grid-cols-4">
              {projects.map((p) => (
                <ProjectCard key={p.id} project={p} isLight={isLight} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
