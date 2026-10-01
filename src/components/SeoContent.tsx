// Real, crawlable introduction text — visually hidden (`sr-only`: off-screen,
// never `display:none`/`visibility:hidden`, which search engines weight
// lower) but present in the DOM from the very first paint, unconditionally
// (not gated behind the loader or the lock screen the way the rest of the
// desktop is).
//
// Why this exists: the visible site is a from-scratch macOS desktop
// simulation — a 3D cube, a lock screen, app windows you open by clicking
// dock icons. None of that is a problem for a sighted mouse user, but two
// audiences never see any of the actual words "Krishan Murari", his title,
// or what he does, because they never click anything: a screen reader user
// landing on a decorative cube and a row of icon buttons with nothing
// introducing who this site belongs to, and a search engine crawler, which
// renders the page's initial state but doesn't click dock icons to open the
// Profile/Experience windows where that content actually lives (the 3D
// "revealed name" in Scene.tsx is a WebGL mesh too — literal pixels, not
// DOM text, invisible to both). A name search ("Krishan Murari", "Murari")
// needs actual on-page body text matching that query, not just a <title>
// and meta tags, to be read as a real page about that person rather than a
// content-free shell. This block is that text for both audiences at once —
// a genuine, accurate bio (sourced from the same facts api/chat.ts's
// assistant uses) rather than keyword-stuffed filler, since this is
// read as real content, not an SEO trick.
export default function SeoContent() {
  return (
    <div className="sr-only">
      <h1>Krishan Murari — Full Stack Developer &amp; Software Engineer</h1>
      <p>
        Krishan Murari is a Full Stack Developer based in Mohali, Punjab, India, building scalable web applications
        with C#, ASP.NET Core, Angular, and TypeScript. He specializes in designing robust REST APIs, integrating AI
        technologies such as OpenAI&rsquo;s GPT-4o, Whisper, Ollama, and the Model Context Protocol, and connecting
        third-party services like Stripe, SendGrid, BoldSign, and DIDIT — delivering end-to-end HRMS, telehealth, and
        SaaS solutions.
      </p>
      <h2>Experience</h2>
      <ul>
        <li>
          Associate Software Engineer at Ariel Software Solutions Pvt. Ltd. (May 2026 – Present), Mohali, Punjab,
          India — building Biomatrix, an MCP-integrated tool for Claude to read and update Google Drive/Docs files,
          and customizing the Horilla HRMS platform with Microsoft Teams, Google/Outlook email intake, and OpenAI
          resume parsing.
        </li>
        <li>
          Full Stack Developer at Vineforce IT Services Pvt. Ltd. (April 2024 – February 2026), Mohali, Punjab, India
          — shipped Mortho.ai (an AI-powered orthopedic telehealth platform with OpenAI Whisper transcription and
          GPT-4o clinical notes), Excis Compliance (a global workforce management SaaS with Stripe billing and
          Syncfusion scheduling), and Vineforce Teams (a cross-platform time-tracking desktop app).
        </li>
      </ul>
      <h2>Skills</h2>
      <p>
        C#, ASP.NET Core, Angular, TypeScript, SQL Server, Microsoft Azure, Python, .NET WinForms, Avalonia UI,
        OpenAI GPT-4o, Whisper, Ollama, Model Context Protocol, Claude, Stripe, SendGrid, DIDIT, BoldSign, Google
        Workspace APIs, Syncfusion, PrimeNG, React, Next.js, Node.js, PostgreSQL, Docker.
      </p>
      <h2>Contact</h2>
      <p>
        Email <a href="mailto:murari@krishan.is-a.dev">murari@krishan.is-a.dev</a>, or find Krishan Murari on{' '}
        <a href="https://github.com/krishanmurariji" target="_blank" rel="noopener noreferrer">GitHub</a>,{' '}
        <a href="https://www.linkedin.com/in/krishan-murari/" target="_blank" rel="noopener noreferrer">LinkedIn</a>,{' '}
        <a href="https://www.instagram.com/krishanmurariji/" target="_blank" rel="noopener noreferrer">Instagram</a>,
        and{' '}
        <a href="https://twitter.com/KrishanMuraari" target="_blank" rel="noopener noreferrer">Twitter / X</a>.
      </p>
    </div>
  );
}
