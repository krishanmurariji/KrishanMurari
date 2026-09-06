// Live project list for the dock's "Projects" window (see
// src/components/apps/ProjectsApp.tsx) — fetched from the public GitHub API
// at runtime rather than hand-kept like the Certifications file list, since
// this one really is meant to track whatever the user currently has public
// with a live homepage set, not a fixed snapshot. No token needed: GitHub's
// REST API allows unauthenticated reads of public repos (60 req/hour per
// caller IP — since this runs client-side, that's per visitor, never a
// real-world limit for a portfolio).
export const GITHUB_USER = 'Krishanmurariji';

export interface Project {
  id: number;
  name: string;
  description: string;
  homepage: string;
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
        // Only the user's own work, still public, actually deployed
        // somewhere — a fork or an archived/homepage-less repo isn't
        // something to show off as "a project" here.
        .filter((r) => !r.fork && !r.archived && !!r.homepage?.trim())
        .map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description?.trim() || 'No description provided.',
          homepage: r.homepage!.trim(),
          repoUrl: r.html_url,
          language: r.language,
          topics: r.topics ?? [],
          stars: r.stargazers_count,
          updatedAt: r.updated_at,
        }))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      cache = projects;
      return projects;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}
