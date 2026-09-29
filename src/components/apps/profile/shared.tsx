// Shared data + icon glyphs for every Profile window design variant (see
// ../ProfileApp.tsx, which switches between them). Kept in one place so the
// four variants show the exact same real facts (from Krishan_Murari_Resume.pdf
// and the site's own footer in ContactSection.tsx) rather than four copies
// that could quietly drift apart.
import type { SVGProps } from 'react';

export const NAME = 'Krishan Murari';
export const DESIGNATION = 'Full Stack Developer';
export const LOCATION = 'Mohali, Punjab, India';
// A short "who I am" line for tight spaces (the Photo widget's hover
// card) — the same bio text now used on GitHub/Twitter, so the site
// matches those profiles rather than reading as a different voice.
export const BIO =
  'Full Stack Developer building scalable apps with C#, ASP.NET Core & Angular — integrating AI (GPT-4o, MCP) into real HRMS, telehealth & SaaS products.';
// Polished, website-ready rewrite of the resume's Professional Summary
// paragraph — same facts (2+ yrs, the stack, the AI integrations, the HRMS/
// telehealth/SaaS delivery), just rewritten in first person with smoother
// flow instead of a resume-bullet cadence, per an explicit "polish this so I
// can use it on the site" request.
export const ABOUT_ME =
  "I'm a Full Stack Developer with 2+ years of experience building scalable web applications using C#, ASP.NET Core, Angular, and TypeScript. I specialize in designing robust REST APIs, integrating AI technologies like OpenAI's GPT-4o, Whisper, Ollama, and the Model Context Protocol, and connecting third-party services such as Stripe, SendGrid, BoldSign, and DIDIT — delivering end-to-end HRMS, telehealth, and SaaS solutions along the way. I also lean on AI-assisted development tools to move faster without compromising code quality.";
export const NATIONALITY = 'India';
// From the resume's Technical Skills / Professional Experience sections.
export const INTEGRATIONS = ['Stripe', 'SendGrid', 'Zoho', 'DIDIT', 'BoldSign', 'Google Workspace APIs', 'ABP.IO'];
export const FRAMEWORKS_TOOLS = ['Avalonia UI', 'Visual Studio', 'VS Code', '.NET WinForms', 'Postman'];
export const PROJECT_STATS = [
  { label: 'Major Projects', value: '5+' },
  { label: 'Technologies & Tools', value: '15+' },
];
// The direct avatars.githubusercontent.com asset, not the github.com/{user}.png
// redirect — the redirect's own 302 response carries no CORS header (even
// though the image it points to does), and a real browser fetch() on it
// throws "Failed to fetch" outright. That silently broke this window's own
// genie-open snapshot (see useSharedSnapshots in AppWindow.tsx, which
// rasterizes every window's hidden DOM copy via html-to-image — a process
// that fetches each <img> itself and fails the whole capture if any of them
// reject), confirmed live in-browser rather than assumed from curl (curl
// has no CORS enforcement at all, so it can't reveal this kind of failure).
export const AVATAR_URL = 'https://avatars.githubusercontent.com/u/144571603?v=4';
export const RESUME_URL =
  'https://1drv.ms/b/c/0233c22d7614ece6/IQDVmW6SVwt7RLgAtEfrvYulAU2hpV47FvgAgRQ3Xs4EV5A?e=F8q1BW';
export const EMAIL = 'murari@krishan.is-a.dev';
export const GITHUB_URL = 'https://github.com/krishanmurariji';
export const LINKEDIN_URL = 'https://www.linkedin.com/in/krishan-murari/';
export const INSTAGRAM_URL = 'https://www.instagram.com/krishanmurariji/';
export const TWITTER_URL = 'https://twitter.com/KrishanMuraari';
export const GITHUB_HANDLE = 'krishanmurariji';
export const LINKEDIN_HANDLE = 'krishan-murari';

// First day actually working — kept as a real date (not a hardcoded "2+
// years" string) so the displayed experience keeps advancing on its own.
export const EXPERIENCE_START = new Date(2024, 3, 16);

export function getExperienceLabel(from: Date): string {
  const now = new Date();
  let years = now.getFullYear() - from.getFullYear();
  let months = now.getMonth() - from.getMonth();
  if (now.getDate() < from.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years <= 0) return `${months} mo${months !== 1 ? 's' : ''}`;
  return months > 0
    ? `${years}+ yr${years > 1 ? 's' : ''} ${months} mo${months !== 1 ? 's' : ''}`
    : `${years}+ yr${years > 1 ? 's' : ''}`;
}

// A few of the slugs originally requested no longer resolve on the
// simpleicons.org CDN — `java`, `css3`, and `sonarqube` were renamed
// upstream (to `openjdk`, `css`, and the umbrella `sonar` mark, since
// SonarQube itself split into Server/Cloud/IDE variants) so those are
// swapped for their current names; `amazonaws` and `visualstudiocode` were
// removed from the icon set entirely with no replacement slug, so those two
// are dropped rather than shown broken.
export const SKILL_SLUGS = [
  'typescript',
  'javascript',
  'dart',
  'openjdk',
  'react',
  'flutter',
  'android',
  'html5',
  'css',
  'nodedotjs',
  'express',
  'nextdotjs',
  'prisma',
  'postgresql',
  'firebase',
  'nginx',
  'vercel',
  'testinglibrary',
  'jest',
  'cypress',
  'docker',
  'git',
  'jira',
  'github',
  'gitlab',
  'androidstudio',
  'sonar',
  'figma',
];
export const SKILL_IMAGES = SKILL_SLUGS.map((slug) => `https://cdn.simpleicons.org/${slug}/${slug}`);

export function ResumeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5A1.5 1.5 0 0 1 7 3.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M14 3.5V7a1 1 0 0 0 1 1h3.5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 12.5h6M9 15.5h6M9 9.5h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function MailGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 7l8 6 8-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PinGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        d="M12 21s-6.5-5.86-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.14-6.5 11-6.5 11Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function ChevronRightGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

