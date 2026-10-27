#!/usr/bin/env bash
# Builds public/github-stats.json from GitHub's own REST + Search API —
# deliberately NOT a third-party badge/rendering service. This repo has been
# through three of those in a row (github-profile-trophy's hosted endpoint
# going dead, a shields.io badge that wasn't the right fit, and
# lowlighter/metrics's achievements plugin breaking against GitHub's
# removed Classic Projects API) so this script only calls api.github.com
# directly, with plain curl + jq (both preinstalled on ubuntu-latest), no
# third-party Action and no rendering dependency at all.
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

user_json=$(gh_get "$API/users/$USER")
public_repos=$(echo "$user_json" | jq '.public_repos')
followers=$(echo "$user_json" | jq '.followers')
following=$(echo "$user_json" | jq '.following')
created_at=$(echo "$user_json" | jq -r '.created_at')

created_year=$(date -u -d "$created_at" +%Y)
current_year=$(date -u +%Y)
years=$(( current_year - created_year ))
if [ "$years" -lt 1 ]; then years_label="<1+"; else years_label="${years}+"; fi

total_commits=$(gh_get "$API/search/commits?q=author:$USER" | jq '.total_count')

# Sum stars + tally the most-used language across every owned repo
# (paginated — a single page only covers the first 100 repos).
stars=0
declare -A lang_count
page=1
while :; do
  repos_page=$(gh_get "$API/users/$USER/repos?per_page=100&type=owner&page=$page")
  count=$(echo "$repos_page" | jq 'length')
  if [ "$count" -eq 0 ]; then break; fi
  page_stars=$(echo "$repos_page" | jq '[.[].stargazers_count] | add')
  stars=$(( stars + page_stars ))
  while IFS= read -r lang; do
    # Not "[ "$lang" = null ] && continue" — under `set -e`, that construct
    # aborts the whole script the moment the condition is false (its exit
    # status propagates since the right side never runs to mask it).
    if [ "$lang" = "null" ]; then
      continue
    fi
    lang_count["$lang"]=$(( ${lang_count["$lang"]:-0} + 1 ))
  done < <(echo "$repos_page" | jq -r '.[].language')
  page=$(( page + 1 ))
done

top_language="N/A"
top_count=0
for lang in "${!lang_count[@]}"; do
  if [ "${lang_count[$lang]}" -gt "$top_count" ]; then
    top_count=${lang_count[$lang]}
    top_language=$lang
  fi
done

prs_merged=$(gh_get "$API/search/issues?q=author:$USER+is:pr+is:merged" | jq '.total_count')
issues_opened=$(gh_get "$API/search/issues?q=author:$USER+is:issue" | jq '.total_count')

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
  --argjson publicRepos "$public_repos" \
  --argjson followers "$followers" \
  --argjson following "$following" \
  --argjson stars "$stars" \
  --argjson prsMerged "$prs_merged" \
  --argjson issuesOpened "$issues_opened" \
  --arg yearsLabel "$years_label" \
  --arg topLanguage "$top_language" \
  '{
    generatedAt: $generatedAt,
    totalCommits: $totalCommits,
    openSourceContributions: $openSourceContributions,
    badges: [
      {key: "repos", label: "Public Repos", value: $publicRepos},
      {key: "followers", label: "Followers", value: $followers},
      {key: "stars", label: "Stars Earned", value: $stars},
      {key: "prs", label: "PRs Merged", value: $prsMerged},
      {key: "issues", label: "Issues Opened", value: $issuesOpened},
      {key: "years", label: "Years on GitHub", value: $yearsLabel},
      {key: "language", label: "Top Language", value: $topLanguage},
      {key: "following", label: "Following", value: $following}
    ]
  }' > public/github-stats.json

echo "Wrote public/github-stats.json:"
cat public/github-stats.json
