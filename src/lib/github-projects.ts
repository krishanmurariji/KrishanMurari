// Project list for the dock's "Projects" window (see
// src/components/apps/ProjectsApp.tsx) — a hand-picked set of repos (see
// SHOWN_REPOS below), fetched live from the public GitHub API at runtime so
// each card's language mix/commit count/latest release stay current without
// a rebuild, but which repos appear at all is curated rather than
// auto-discovered from everything public on the account. No token needed:
// GitHub's REST API allows unauthenticated reads of public repos (60
// req/hour per caller IP — since this runs client-side, that's per visitor).
// Each shown repo costs up to 4 requests (repo, languages, latest release,
// commit count), so 4 repos is ~16 requests per fresh page load — still
// comfortably under that limit for a portfolio visit.
export const GITHUB_USER = 'Krishanmurariji';

// The only repos shown on the Projects page, in display order. Matched
// case-insensitively against the repo name; a repo's fork status and
// whether it has a homepage set don't matter here — if it's listed, it
// shows, regardless (e.g. noor has no homepage set, and horilla-ai-
// recruitment is a fork of horilla-opensource/horilla, and both still
// belong here).
const SHOWN_REPOS = ['noor', 'ally-releases', 'smallmart', 'horilla-ai-recruitment'];

// GitHub's own linguist colors for the languages actually present across
// these repos — not an exhaustive list, just what's there today; an
// unlisted language falls back to FALLBACK_LANGUAGE_COLOR rather than
// guessing.
export const LANGUAGE_COLORS: Record<string, string> = {
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
  Swift: '#F05138',
  'C++': '#f34b7d',
  XML: '#0060ac',
};
export const FALLBACK_LANGUAGE_COLOR = '#8b8b93';

export interface ProjectLanguage {
  name: string;
  color: string;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  // Null when the repo has no homepage set (e.g. a mobile app with no
  // hosted web demo) — the card adapts (see ProjectsApp.tsx) rather than
  // assuming every shown repo has a live URL.
  homepage: string | null;
  repoUrl: string;
  // Every language GitHub reports for the repo (by byte count), top 4,
  // not just the primary one.
  languages: ProjectLanguage[];
  topics: string[];
  // Null when the per-commit-count request itself fails — distinct from 0,
  // which is a real (if unlikely) answer for a brand-new repo.
  commits: number | null;
  // Latest release's tag name, or null when the repo has none.
  releaseTag: string | null;
  // "owner/repo" of the parent this was forked from, or null when it isn't
  // a fork (or the base repo fetch didn't come back with a parent for some
  // other reason).
  forkOf: string | null;
  updatedAt: string;
}

interface GitHubRepo {
  id: number;
  name: string;
  fork: boolean;
  description: string | null;
  homepage: string | null;
  html_url: string;
  topics?: string[];
  updated_at: string;
  parent?: { full_name: string };
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function topLanguages(bytes: Record<string, number> | null): ProjectLanguage[] {
  if (!bytes) return [];
  return Object.entries(bytes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name]) => ({ name, color: LANGUAGE_COLORS[name] ?? FALLBACK_LANGUAGE_COLOR }));
}

// GitHub doesn't expose a total-commit-count field directly — the common
// trick is asking for 1 commit per page and reading the last page number
// off the response's Link header, which costs one request either way (the
// commit body itself is discarded). No Link header at all means everything
// fit on a single page, so the count is just how many commits came back (0
// or 1).
async function fetchCommitCount(owner: string, name: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${name}/commits?per_page=1`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    const link = res.headers.get('Link');
    const lastPageMatch = link?.match(/[?&]page=(\d+)>;\s*rel="last"/);
    if (lastPageMatch) return Number(lastPageMatch[1]);
    const body = (await res.json()) as unknown[];
    return body.length;
  } catch {
    return null;
  }
}

async function fetchOneProject(name: string): Promise<Project | null> {
  const repo = await fetchJson<GitHubRepo>(`https://api.github.com/repos/${GITHUB_USER}/${name}`);
  if (!repo) return null;

  const [languageBytes, release, commits] = await Promise.all([
    fetchJson<Record<string, number>>(`https://api.github.com/repos/${GITHUB_USER}/${name}/languages`),
    fetchJson<{ tag_name: string }>(`https://api.github.com/repos/${GITHUB_USER}/${name}/releases/latest`),
    fetchCommitCount(GITHUB_USER, name),
  ]);

  return {
    id: repo.id,
    name: repo.name,
    description: repo.description?.trim() || 'No description provided.',
    homepage: repo.homepage?.trim() || null,
    repoUrl: repo.html_url,
    languages: topLanguages(languageBytes),
    topics: repo.topics ?? [],
    commits,
    releaseTag: release?.tag_name ?? null,
    forkOf: repo.fork ? (repo.parent?.full_name ?? null) : null,
    updatedAt: repo.updated_at,
  };
}

// Cached at module scope (not per-mount state) so reopening the window
// after the first load doesn't re-fetch — the list only changes when the
// user actually pushes something new to GitHub, not between clicks in one
// visit. The in-flight promise itself is cached too, so two windows opened
// back-to-back before the first request resolves share one fetch instead
// of racing two.
let cache: Project[] | null = null;
let inFlight: Promise<Project[]> | null = null;

export function fetchLiveProjects(): Promise<Project[]> {
  if (cache) return Promise.resolve(cache);
  if (inFlight) return inFlight;

  // One repo's fetch failing (renamed, rate-limited, momentary network
  // blip) shouldn't take the rest of the list down with it — it just drops
  // out silently, same as if it had never been listed.
  inFlight = Promise.all(SHOWN_REPOS.map((name) => fetchOneProject(name).catch(() => null)))
    .then((results) => {
      const projects = results.filter((p): p is Project => p !== null);
      cache = projects;
      return projects;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}
