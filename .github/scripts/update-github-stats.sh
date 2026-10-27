#!/usr/bin/env bash
# Builds public/github-stats.json — just the two numbers the stats strip's
# left/right ends show (total commits, open-source PR contributions) —
# from GitHub's own REST + Search API directly, deliberately NOT a
# third-party badge/rendering service. This repo has been through three of
# those in a row for the strip's center badges (github-profile-trophy's
# hosted endpoint going dead, a shields.io badge that wasn't the right fit,
# and lowlighter/metrics's achievements plugin breaking against GitHub's
# removed Classic Projects API) — those are now real achievement medals
# instead, scraped by fetch-github-achievements.py, not computed here.
set -euo pipefail

USER="krishanmurariji"
API="https://api.github.com"

gh_get() {
  local url="$1" response http_code body
  response=$(curl -sS -w '\n%{http_code}' \
    -H "Authorization: Bearer ${GH_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    -H "User-Agent: krishan-portfolio-stats-bot" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "$url")
  http_code="${response##*$'\n'}"
  body="${response%$'\n'"$http_code"}"
  if [ "$http_code" -ge 400 ]; then
    echo "GitHub API error ($http_code) for $url:" >&2
    echo "$body" >&2
    exit 1
  fi
  echo "$body"
}

# Unlike most qualifiers, a `repo:` qualifier naming a repo that doesn't
# exist makes the whole Search API call 422 ("Validation Failed") rather
# than just contributing zero matches — confirmed from a real failed run,
# not assumed. So any repo name that's a guess (rather than a value this
# script already knows exists, like $USER's own account) gets checked here
# first, via the plain repo-info endpoint, which 404s cleanly instead.
repo_exists() {
  local status
  status=$(curl -sS -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer ${GH_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    -H "User-Agent: krishan-portfolio-stats-bot" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "$API/repos/$1")
  [ "$status" = "200" ]
}

total_commits=$(gh_get "$API/search/commits?q=author:$USER" | jq '.total_count')

# Open-source contributions to specific external projects: is-a-dev/register
# (the free-subdomain registry this site's own krishan.is-a.dev domain comes
# from) and Horilla's HRMS. The Horilla project's exact repo name has shown
# up under two different full names in different sources, and a confirmed
# real run of this script already proved horilla-opensource/horilla is NOT
# one of them (422 "resources do not exist"), so each candidate is checked
# with repo_exists first rather than guessed into the search query directly.
isadev_prs=$(gh_get "$API/search/issues?q=repo:is-a-dev/register+author:$USER+is:pr+is:merged" | jq '.total_count')

horilla_prs=0
for horilla_repo in horilla-opensource/horilla horilla/horilla-hr; do
  if repo_exists "$horilla_repo"; then
    horilla_prs=$(gh_get "$API/search/issues?q=repo:$horilla_repo+author:$USER+is:pr+is:merged" | jq '.total_count')
    break
  fi
done
open_source_prs=$(( isadev_prs + horilla_prs ))

mkdir -p public
jq -n \
  --arg generatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson totalCommits "$total_commits" \
  --argjson openSourceContributions "$open_source_prs" \
  '{
    generatedAt: $generatedAt,
    totalCommits: $totalCommits,
    openSourceContributions: $openSourceContributions
  }' > public/github-stats.json

echo "Wrote public/github-stats.json:"
cat public/github-stats.json
