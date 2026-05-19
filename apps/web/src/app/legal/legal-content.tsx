import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { marked } from 'marked';

/**
 * Server-side Markdown → HTML for the legal pages (Privacy / Offer).
 *
 * Content lives in `apps/web/content/legal/{slug}.md`. The Markdown is
 * authored by the operator and TRUSTED — no user-submitted content flows
 * through this path. `marked` does NOT sanitise output HTML; raw `<script>`
 * or `<iframe>` in the source MD would render as-is. The current operator
 * MD files contain no raw HTML; if a future operator pastes some, treat
 * them as code-review surface or add DOMPurify before render.
 *
 * Codex audit (2026-05-19): slug is hard-bounded to a literal union AND
 * runtime-validated against an explicit allowlist before fs access, so a
 * future caller that bypasses TS (`as any`, dynamic route) cannot drive
 * path traversal via `slug='../../etc/passwd'`. `path.join` normalises
 * but doesn't restrict; the allowlist is the actual gate.
 */
const CONTENT_DIR = path.join(process.cwd(), 'content', 'legal');

export type LegalSlug = 'privacy' | 'offer';

const ALLOWED_SLUGS = new Set<LegalSlug>(['privacy', 'offer']);

export async function renderLegalDoc(slug: LegalSlug): Promise<string> {
  if (!ALLOWED_SLUGS.has(slug)) {
    throw new Error(`renderLegalDoc: slug "${slug}" not in allowlist`);
  }
  const filePath = path.join(CONTENT_DIR, `${slug}.md`);
  const raw = await readFile(filePath, 'utf-8');
  // marked.parse can return a Promise<string> when async extensions are
  // registered. None here, but await the result either way for safety.
  const html = await Promise.resolve(marked.parse(raw, { async: false, gfm: true }));
  return html as string;
}

export function LegalLayout({
  title,
  bodyHtml,
}: {
  title: string;
  bodyHtml: string;
}) {
  return (
    <main style={legalStyles.page}>
      <div style={legalStyles.container}>
        <a href="/" style={legalStyles.backLink}>
          ← На главную
        </a>
        <h1 style={legalStyles.title}>{title}</h1>
        <article
          style={legalStyles.article}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted operator-authored legal text from content/legal/*.md
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      </div>
    </main>
  );
}

const legalStyles = {
  page: {
    minHeight: '100vh',
    background: '#fdfaf3',
    color: '#1c1a16',
    padding: '48px 24px 96px',
    boxSizing: 'border-box' as const,
  },
  container: {
    maxWidth: 760,
    margin: '0 auto',
  },
  backLink: {
    display: 'inline-block',
    marginBottom: 24,
    color: '#7a4b00',
    textDecoration: 'none',
    fontSize: 14,
  },
  title: {
    fontSize: 32,
    fontWeight: 600,
    lineHeight: 1.2,
    marginBottom: 32,
  },
  article: {
    fontSize: 15,
    lineHeight: 1.7,
    color: '#2d2a26',
  },
};
