// Project list for the dock's "Projects" window (see
// src/components/apps/ProjectsApp.tsx) — a hand-picked set of repos (see
// SHOWN_REPOS below), fetched live from the public GitHub API at runtime so
// each card's stars/description/etc. stay current without a rebuild, but
// which repos appear at all is curated rather than auto-discovered from
// everything public on the account. No token needed: GitHub's REST API
// allows unauthenticated reads of public repos (60 req/hour per caller IP —
// since this runs client-side, that's per visitor, never a real-world limit
// for a portfolio).
export const GITHUB_USER = 'Krishanmurariji';

// The only repos shown on the Projects page, in display order. Matched
// case-insensitively against the repo name; a repo's fork/archived status
// and whether it has a homepage set don't matter here — if it's listed, it
// shows, regardless (e.g. noor has no homepage set, and horilla-ai-
// recruitment is a fork of horilla-opensource/horilla, and both still
// belong here).
const SHOWN_REPOS = ['noor', 'ally-releases', 'smallmart', 'horilla-ai-recruitment'];

export interface Project {
  id: number;
  name: string;
  description: string;
  // Null when the repo has no homepage set (e.g. a mobile app with no
  // hosted web demo) — the card adapts (see ProjectsApp.tsx) rather than
  // assuming every shown repo has a live URL.
  homepage: string | null;
  repoUrl: string;
  language: string | null;
  topics: string[];
  stars: number;
  updatedAt: string;
}

interface GitHubRepo {
  id: number;
  name: string;
  fork: boolean;
  archived: boolean;
  description: string | null;
  homepage: string | null;
  html_url: string;
  language: string | null;
  topics?: string[];
  stargazers_count: number;
  updated_at: string;
}

// Cached at module scope (not per-mount state) so reopening the window
// after the first load doesn't re-fetch — the whole list only changes when
// the user actually pushes something new to GitHub, not between clicks in
// one visit. The in-flight promise itself is cached too, so two windows
// opened back-to-back before the first request resolves share one fetch
// instead of racing two.
let cache: Project[] | null = null;
let inFlight: Promise<Project[]> | null = null;

export function fetchLiveProjects(): Promise<Project[]> {
  if (cache) return Promise.resolve(cache);
  if (inFlight) return inFlight;

  inFlight = fetch(`https://api.github.com/users/${GITHUB_USER}/repos?per_page=100&type=owner&sort=updated`, {
    headers: { Accept: 'application/vnd.github+json' },
  })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || `GitHub API request failed (${res.status})`);
      }
      return res.json() as Promise<GitHubRepo[]>;
    })
    .then((repos) => {
      const projects = repos
        .filter((r) => SHOWN_REPOS.includes(r.name.toLowerCase()))
        .map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description?.trim() || 'No description provided.',
          homepage: r.homepage?.trim() || null,
          repoUrl: r.html_url,
          language: r.language,
          topics: r.topics ?? [],
          stars: r.stargazers_count,
          updatedAt: r.updated_at,
        }))
        .sort((a, b) => SHOWN_REPOS.indexOf(a.name.toLowerCase()) - SHOWN_REPOS.indexOf(b.name.toLowerCase()));
      cache = projects;
      return projects;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}
