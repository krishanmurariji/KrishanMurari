// Content for the dock's "Projects" window (see APP_BODIES in
// AppWindow.tsx) — a hand-picked set of repos (see SHOWN_REPOS in
// src/lib/github-projects.ts), fetched live from GitHub at runtime so each
// card's stars/description/etc. stay current without a rebuild, same as
// before, but which repos show at all is curated rather than everything
// public with a homepage. Each project renders as a small mock browser
// window (matching the desktop's own "fake macOS" chrome — traffic lights,
// an address bar showing the live domain) that tilts toward the cursor in
// 3D, rather than a flat list.
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { fetchLiveProjects, GITHUB_USER, type Project } from '../../lib/github-projects';

// GitHub's own linguist colors for the languages actually present across
// these repos — not an exhaustive list, just what's there today; an
// unlisted language falls back to a neutral gray rather than guessing.
const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Python: '#3572A5',
  Kotlin: '#A97BFF',
  'C#': '#178600',
  Dart: '#00B4AB',
  Java: '#b07219',
  PHP: '#4F5D95',
};
const FALLBACK_COLOR = '#8b8b93';

function TiltCard({ isLight, children }: { isLight: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ rx: py * -10, ry: px * 12 });
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={() => setTilt({ rx: 0, ry: 0 })}
      className="overflow-hidden rounded-2xl shadow-xl"
      style={{
        background: isLight ? '#ffffff' : '#15151a',
        border: isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)',
        transform: `perspective(900px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
        transition: 'transform 0.15s ease-out',
      }}
    >
      {children}
    </div>
  );
}

function ProjectCard({ project, isLight }: { project: Project; isLight: boolean }) {
  const domain = (() => {
    if (!project.homepage) return null;
    try {
      return new URL(project.homepage).hostname.replace(/^www\./, '');
    } catch {
      return project.homepage;
    }
  })();
  const color = (project.language && LANGUAGE_COLORS[project.language]) || FALLBACK_COLOR;
  const subtleText = isLight ? 'text-black/50' : 'text-white/50';

  return (
    <TiltCard isLight={isLight}>
      {/* Mock browser chrome, matching WindowChrome's own traffic lights */}
      <div
        className="flex items-center gap-1.5 px-3 py-2"
        style={{
          background: isLight ? '#eceef1' : '#1e1e24',
          borderBottom: isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#ff5f57' }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#febc2e' }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#28c840' }} />
        <div
          className={`ml-2 min-w-0 flex-1 truncate rounded-md px-2 py-0.5 text-center text-[10px] ${subtleText}`}
          style={{ background: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)' }}
        >
          {domain ?? project.name}
        </div>
      </div>

      {/* No real screenshot service wired up, so the "hero" is a colored
          treatment keyed off the repo's primary language rather than a live
          preview — a monogram over a language-tinted gradient. */}
      <div
        className="relative flex h-24 items-center justify-center"
        style={{ background: `linear-gradient(135deg, ${color}55, ${isLight ? '#f4f3f7' : '#0c0c10'})` }}
      >
        <span className="text-4xl font-black opacity-30" style={{ color }}>
          {project.name.slice(0, 2).toUpperCase()}
        </span>
        {project.stars > 0 && (
          <span className="absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] text-white/80" style={{ background: 'rgba(0,0,0,0.45)' }}>
            ★ {project.stars}
          </span>
        )}
      </div>

      <div className="p-3.5">
        <div className={`truncate text-sm font-semibold ${isLight ? 'text-[#1c1c1e]' : 'text-white'}`}>{project.name}</div>
        <p className={`mt-1 line-clamp-2 text-xs leading-relaxed ${isLight ? 'text-black/55' : 'text-white/60'}`}>{project.description}</p>

        {project.topics.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {project.topics.slice(0, 4).map((t) => (
              <span
                key={t}
                className={`rounded-full px-2 py-0.5 text-[9px] ${isLight ? 'text-black/55' : 'text-white/60'}`}
                style={{ background: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)' }}
              >
                {t}
              </span>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2">
          {project.homepage && (
            <a
              href={project.homepage}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 rounded-full py-1.5 text-center text-xs font-semibold text-black transition hover:brightness-110"
              style={{ background: color }}
            >
              Live ↗
            </a>
          )}
          <a
            href={project.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`rounded-full px-3 py-1.5 text-center text-xs font-medium transition ${
              project.homepage ? '' : 'flex-1'
            } ${isLight ? 'text-black/70 hover:bg-black/5' : 'text-white/80 hover:bg-white/10'}`}
            style={{ border: isLight ? '1px solid rgba(0,0,0,0.14)' : '1px solid rgba(255,255,255,0.14)' }}
          >
            Code ↗
          </a>
        </div>

        {project.language && (
          <div className={`mt-2 flex items-center gap-1.5 text-[10px] ${isLight ? 'text-black/45' : 'text-white/40'}`}>
            <span className="h-2 w-2 rounded-full" style={{ background: color }} />
            {project.language}
          </div>
        )}
      </div>
    </TiltCard>
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
            <div className="grid grid-cols-1 gap-4 @[560px]:grid-cols-2 @[900px]:grid-cols-3 @[1200px]:grid-cols-4">
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
