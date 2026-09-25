/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LINKEDIN_CLIENT_ID?: string;
  readonly VITE_GITHUB_CLIENT_ID?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_MICROSOFT_CLIENT_ID?: string;
  readonly VITE_YOUTUBE_API_KEY?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
