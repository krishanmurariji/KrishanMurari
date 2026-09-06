// Real employment data, straight from the resume (Vineforce's three
// projects) plus the user's own account of what they're doing at Ariel
// right now (Biomatrix, Horilla HR) — dates, companies, and role titles are
// all as given, not inferred. Companies verified against their own live
// sites (vineforce.net, arielsoftwares.com) for exact names, URLs, and
// brand colors instead of guessing.
export interface TechItem {
  label: string;
  // simple-icons slug — omitted for tools with no mark in the set (Azure,
  // SQL Server, Telnyx, DIDIT, BoldSign, Syncfusion, ApexCharts, Microsoft
  // Teams/Outlook, .NET WinForms, MCP, C#, OpenAI — confirmed absent
  // against the live simple-icons dataset), which then render as a plain
  // text pill instead of a misleading substitute icon.
  icon?: string;
}

export interface ProjectEntry {
  name: string;
  description: string;
  tech: TechItem[];
  bullets: string[];
}

export interface CompanyEntry {
  company: string;
  companyUrl: string;
  // Vineforce's logo is a dark wordmark that reads fine straight on a white
  // card; Ariel's is white-on-transparent (built for a dark header) and
  // needs a dark chip behind it to stay legible — 'light'/'dark' picks
  // which treatment a given logo needs, not the company's own theme.
  logo: { src: string; on: 'light' | 'dark' };
  role: string;
  location: string;
  accent: string;
  start: Date;
  end: Date | null;
  summary: string;
  projects: ProjectEntry[];
}

const t = (label: string, icon?: string): TechItem => ({ label, icon });

export const EXPERIENCE: CompanyEntry[] = [
  {
    company: 'Ariel Software Solutions Pvt. Ltd.',
    companyUrl: 'https://www.arielsoftwares.com',
    logo: { src: '/logos/ariel.webp', on: 'dark' },
    role: 'Associate Software Engineer',
    location: 'Mohali, Punjab, India',
    accent: '#2563EB',
    start: new Date(2026, 4, 18),
    end: null,
    summary:
      'Custom software development company delivering enterprise and SaaS solutions across healthcare, real estate, logistics, and finance.',
    projects: [
      {
        name: 'Biomatrix',
        description:
          'An MCP-integrated tool that lets Claude read and update files directly inside a user’s Google Drive and Google Docs.',
        tech: [t('MCP'), t('Claude', 'claude'), t('Google Drive', 'googledrive'), t('Google Docs', 'googledocs')],
        bullets: [
          'Built MCP (Model Context Protocol) tools that expose Google Drive and Google Docs file operations as actions Claude can call directly.',
          'Integrated the MCP server with Claude so document updates happen in real time from a conversation, with no manual file handling.',
        ],
      },
      {
        name: 'Horilla HR (HRMS)',
        description: 'Customizing the open-source Horilla HRMS platform to match internal hiring and communication workflows.',
        tech: [t('Microsoft Teams'), t('Google', 'google'), t('Microsoft Outlook'), t('Ollama', 'ollama'), t('OpenAI')],
        bullets: [
          'Integrated Microsoft Teams so meetings can be scheduled and joined directly from the HRMS.',
          'Built Google- and Outlook-authenticated email intake, with incoming mail parsed by a local Ollama AI model.',
          'Integrated OpenAI to auto-fill candidate resume fields during the hiring workflow.',
        ],
      },
    ],
  },
  {
    company: 'Vineforce IT Services Pvt. Ltd.',
    companyUrl: 'https://www.vineforce.net',
    logo: { src: '/logos/vineforce.svg', on: 'light' },
    role: 'Full Stack Developer',
    location: 'Onsite – Mohali, Punjab, India',
    accent: '#4A73CF',
    start: new Date(2024, 3, 16),
    end: new Date(2026, 1, 24),
    summary:
      'A software product company building SaaS platforms and enterprise tools for global clients. Owned features end-to-end across multiple live products — from database schema and API design through to Angular frontend delivery.',
    projects: [
      {
        name: 'Mortho.ai — AI-Powered Orthopedic Telehealth Platform',
        description:
          'An orthopedic telehealth platform that automates doctor-patient consultations end-to-end — from live audio capture to AI-generated clinical notes and automated patient follow-up calls.',
        tech: [
          t('ASP.NET Core', 'dotnet'),
          t('Angular', 'angular'),
          t('Python', 'python'),
          t('.NET WinForms'),
          t('SQL Server'),
          t('Azure'),
          t('OpenAI GPT-4o & Whisper'),
          t('Telnyx Voice AI'),
          t('PrimeNG', 'primeng'),
        ],
        bullets: [
          'Built a WinForms desktop app that records live consultations and streams audio to a Python backend running OpenAI Whisper for transcription.',
          'Integrated GPT-4o nano to generate structured clinical notes from transcripts, surfaced in the doctor’s web dashboard for review and approval.',
          'Built a Telnyx Voice AI calling system that automatically phones patients post-consultation, reads recovery notes, and handles questions in real time using GPT-4o mini.',
          'Developed the full Angular dashboard for doctors to manage patients, approve notes, and track consultation history.',
        ],
      },
      {
        name: 'Excis Compliance — Global Workforce Management SaaS',
        description:
          'A SaaS platform for managing global workforce operations — employee onboarding, shift scheduling, leave management, subscription billing, and compliance analytics.',
        tech: [
          t('ASP.NET Core', 'dotnet'),
          t('Angular', 'angular'),
          t('SQL Server'),
          t('Azure'),
          t('Stripe', 'stripe'),
          t('Syncfusion Scheduler'),
          t('PrimeNG', 'primeng'),
          t('SendGrid'),
          t('Zoho', 'zoho'),
          t('DIDIT'),
          t('BoldSign'),
          t('ngx-charts'),
          t('ApexCharts'),
        ],
        bullets: [
          'Integrated Stripe for the full subscription billing lifecycle — plan selection, invoicing, renewals, and payment failure recovery.',
          'Built a multi-timezone shift scheduling module using Syncfusion Scheduler with a drag-and-drop manager interface.',
          'Developed leave management with approval workflows and automated SendGrid / Zoho notifications on every status change.',
          'Built the employee onboarding flow — DIDIT identity verification followed by BoldSign e-signature — access granted only after both steps complete.',
          'Designed real-time analytics dashboards using ngx-charts and ApexCharts for headcount, shift coverage, and compliance visibility.',
        ],
      },
      {
        name: 'Vineforce Teams — Cross-Platform Time Tracking Tool',
        description:
          'A cross-platform desktop app that runs silently in the background, captures employee activity and screenshots, and syncs productivity data to a manager dashboard.',
        tech: [t('C#'), t('ASP.NET Core', 'dotnet'), t('Avalonia UI', 'avaloniaui'), t('.NET WinForms'), t('SQL Server'), t('Azure Blob Storage')],
        bullets: [
          'Built the core background tracking engine — keyboard/mouse activity capture, periodic screenshots, and productivity scoring.',
          'Implemented the screenshot upload pipeline to Azure Blob Storage via an ASP.NET Core API, rendered in the manager dashboard with timestamps.',
          'Contributed to migrating the app from WinForms to Avalonia UI, enabling the same codebase to run on Windows, macOS, and Linux.',
        ],
      },
    ],
  },
];

// LinkedIn-style "1 yr 10 mos" formatting, and a combined total across both
// roles rather than the raw span from first start to today — those two
// jobs don't touch (Vineforce ended Feb 2026, Ariel started May 2026), so a
// naive "today minus first start" would silently count the gap as
// experience.
export function formatDuration(start: Date, end: Date | null): string {
  const endDate = end ?? new Date();
  let months = (endDate.getFullYear() - start.getFullYear()) * 12 + (endDate.getMonth() - start.getMonth());
  if (endDate.getDate() < start.getDate()) months -= 1;
  months = Math.max(months, 0);
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} yr${years > 1 ? 's' : ''}`);
  if (remMonths > 0 || years === 0) parts.push(`${remMonths} mo${remMonths !== 1 ? 's' : ''}`);
  return parts.join(' ');
}

export function formatRange(start: Date, end: Date | null): string {
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  return `${fmt(start)} – ${end ? fmt(end) : 'Present'}`;
}

export function totalExperienceLabel(): string {
  const totalMonths = EXPERIENCE.reduce((sum, e) => {
    const endDate = e.end ?? new Date();
    let months = (endDate.getFullYear() - e.start.getFullYear()) * 12 + (endDate.getMonth() - e.start.getMonth());
    if (endDate.getDate() < e.start.getDate()) months -= 1;
    return sum + Math.max(months, 0);
  }, 0);
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (years === 0) return `${months} mo${months !== 1 ? 's' : ''}`;
  return `${years}+ yr${years > 1 ? 's' : ''}`;
}
