# AGENTS.md — infra

Documentation of PaceStreak's DNS, Cloudflare, hosting and operations. Nothing
here is applied automatically.

Workspace-wide rules (CSP, cookies, privacy, commit conventions, what is
already decided) live in the root
[`AGENTS.md`](https://github.com/PaceStreak/pacestreak/blob/main/AGENTS.md).
Read it first; this file only adds what is specific to this repository.

## Rules for this repo

- Keep `TOPOLOGY.md`, `RUNBOOK.md` and `DECISIONS.md` true to what is
  live. Check the live state (`dig`, `curl -I`, `wrangler pages deployment
  list`) before writing; don't document from memory.
- A decision record says what was chosen, what was rejected and why, with a
  date and a status. Update the status when it is implemented.
- **Never hand-create a DNS record** ahead of a deployment (522 is worse than
  NXDOMAIN). Never touch the Zoho or Brevo mail records when changing hosting.
- No secret values, keys or tokens, ever. The Cloudflare token available is
  `zone:read` only; cache purges and Pages settings need the dashboard.
- The GCP project is deleted (11 October 2026); never recreate a host there.
  The API is a Cloudflare Worker on the Workers **Free** plan (since
  2026-10-19): 10 ms CPU, 50 D1 queries per invocation, 5 crons per account.
  Check those limits before documenting anything that would exceed them.
  `api` deploys through Workers Builds on push to `main`, migrations first.

## The docs site (`site/`)

An Astro site that renders the root `*.md` files for `docs.pacestreak.com`.
It reads them in place (content collection, glob loader, base `..`), so the
Markdown is the only source: edit the Markdown, never a copy.

```bash
cd site
npm ci
npm run dev                 # :4321
npm run build && python3 check-html.py dist   # dist/ is the Pages output
npm run check               # astro check
npm run format:check        # prettier
npm run lint:md             # markdownlint on the root documents
npm run freshness           # org repos vs src/data/repos.ts, live URLs, openapi.json
npm run sync:openapi        # refresh the vendored src/data/openapi.json from api main
```

- **Broken links fail the build.** Cross-document links (`./RUNBOOK.md#x`)
  become site routes; a link to a missing file or a missing `#anchor` is an
  error. Anchors are GitHub's (github-slugger), so a link that works on
  GitHub works on the site.
- **CSP is `style-src 'self'` and `script-src 'self'`, no 'unsafe-inline'.**
  Shiki colours become classes (`transformerStyleToClass`) served from
  `/code.css`; the theme is set by the external `/theme.js`.
  `check-html.py` fails on any `style=`, inline `<style>`, inline script or
  foreign-origin resource. `assetsInlineLimit: 0` and
  `inlineStylesheets: "never"` in `astro.config.mjs` are load-bearing.
- The site is `noindex` (`X-Robots-Tag`, meta robots, `robots.txt`
  `Disallow: /`).
- `DECISIONS.md` cards read each record's date and status from its first
  lines (`**Date:** … · **Status:** …` or `**Decided <date>. Status: …**`);
  keep one of those shapes so the index stays right.
- The topology diagram is drawn from the "DNS records" table in
  `TOPOLOGY.md`; the build fails if it can no longer read the hostnames.
- `site/src/data/repos.ts` holds the facts about every repository. Check them
  against the repository and bump `verified` when you change one; CI fails
  when the org gains or loses a repository or a live URL stops answering, and
  warns after 60 days without re-verification.
- `/api` (the API reference) is rendered at build time from
  `site/src/data/openapi.json`, a vendored copy of `PaceStreak/api` main's
  `openapi.json`. Never edit it by hand: `npm run sync:openapi` and commit.
  `npm run freshness` fails when it drifts from api main.
- `.github/workflows/site.yml` must be pushed over SSH (`GITHUB_TOKEN` cannot
  write workflows).

## Commits

Conventional commits, subject says what, body says why. Commit as
`AlzyWelzy <welzyalzy@gmail.com>`. **Never credit an AI tool**: no
`Co-Authored-By` trailer and no "Generated with" line, in commits or PRs.
This repository is public, so never commit a secret.
