#!/usr/bin/env python3
"""Scrapes github.com/<user>?tab=achievements for the real, official GitHub
achievement medals (Pull Shark, Pair Extraordinaire, YOLO, …) this account
has actually earned, and downloads each badge's real image.

Not an API call — GitHub's public GraphQL/REST schema has no "achievements"
field at all, and the earlier attempt to fake this via a third-party
Action's heuristic (lowlighter/metrics's "achievements" plugin, which
guesses at milestones from repo/project data rather than reading real
earned badges) turned out broken against GitHub's current API anyway. The
achievements TAB page itself, though, is public, server-rendered HTML
(no auth, no JS execution needed) — the same approach a working
community tool (wangrunlin/github-achievements-api) uses. Only Python's
stdlib (html.parser, urllib) is used here, no new dependency to install.

Selectors (confirmed against the live page's real markup):
  - each earned achievement is a <details class="... js-achievement-card-details ...">
    carrying a data-achievement-slug attribute
  - its tier multiplier ("x2", "x3", …) is the text of a nested element
    with class achievement-tier-label (absent entirely below tier 2)
  - its badge image is an <img class="achievement-badge-card" src="...">,
    already a real, permanent github.githubassets.com asset URL
"""
import html.parser
import json
import sys
import urllib.request

USER = "krishanmurariji"
URL = f"https://github.com/{USER}?tab=achievements"


class AchievementsParser(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.achievements = []
        self._in_card = False
        self._card_depth = 0
        self._current = None
        self._expect_tier_text = False
        self._seen_slugs = set()

    @staticmethod
    def _classes(attrs):
        for name, value in attrs:
            if name == "class" and value:
                return value.split()
        return []

    @staticmethod
    def _attr(attrs, name):
        for n, v in attrs:
            if n == name:
                return v
        return None

    def handle_starttag(self, tag, attrs):
        classes = self._classes(attrs)
        if tag == "details" and "js-achievement-card-details" in classes:
            self._in_card = True
            self._card_depth = 1
            slug = self._attr(attrs, "data-achievement-slug")
            self._current = {"slug": slug, "tier": 1, "image": None}
            return
        if self._in_card:
            if tag == "details":
                self._card_depth += 1
            if "achievement-tier-label" in classes:
                self._expect_tier_text = True
            if tag == "img" and "achievement-badge-card" in classes:
                self._current["image"] = self._attr(attrs, "src")

    def handle_data(self, data):
        if self._expect_tier_text:
            text = data.strip()
            if text:
                # "x2" -> 2; be defensive about anything unexpected.
                digits = "".join(ch for ch in text if ch.isdigit())
                if digits:
                    self._current["tier"] = int(digits)
                self._expect_tier_text = False

    def handle_endtag(self, tag):
        if self._in_card and tag == "details":
            self._card_depth -= 1
            if self._card_depth == 0:
                self._in_card = False
                slug = self._current.get("slug")
                image = self._current.get("image")
                if slug and image and slug not in self._seen_slugs:
                    self._seen_slugs.add(slug)
                    self.achievements.append(self._current)
                self._current = None


def fetch(url: str) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; krishan-portfolio-stats-bot/1.0)",
            "Accept": "text/html",
        },
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.read().decode("utf-8", errors="replace")


def main():
    html_text = fetch(URL)
    parser = AchievementsParser()
    parser.feed(html_text)

    import os

    out_dir = "public/achievements"
    os.makedirs(out_dir, exist_ok=True)

    result = []
    for ach in parser.achievements:
        slug = ach["slug"]
        dest = f"{out_dir}/{slug}.png"
        try:
            img_bytes = urllib.request.urlopen(
                urllib.request.Request(ach["image"], headers={"User-Agent": "Mozilla/5.0"}),
                timeout=20,
            ).read()
        except Exception as exc:  # noqa: BLE001 - one bad image shouldn't kill the whole run
            print(f"Skipping {slug}: failed to download badge image: {exc}", file=sys.stderr)
            continue
        with open(dest, "wb") as f:
            f.write(img_bytes)
        result.append({"slug": slug, "tier": ach["tier"], "image": f"/achievements/{slug}.png"})

    with open("public/github-achievements.json", "w") as f:
        json.dump({"achievements": result}, f, indent=2)
        f.write("\n")

    print(f"Found {len(result)} earned achievement(s): {', '.join(a['slug'] for a in result) or '(none)'}")


if __name__ == "__main__":
    main()
