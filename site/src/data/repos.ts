// Facts about every repository in the PaceStreak GitHub organisation.
//
// The docs site builds from the infra repository alone, so it cannot read the
// other repositories. These facts were copied from each repository's README,
// AGENTS.md, package.json, wrangler.jsonc and workflows on the `verified`
// date. scripts/check-freshness.mjs fails CI when the organisation gains or
// loses a repository, when a live URL stops answering, and warns when an
// entry has not been re-verified for 60 days. Re-check against the repository
// and bump `verified` when you touch an entry; never write from memory.

export interface Repo {
  /** GitHub repository name, exactly. */
  name: string;
  slug: string;
  title: string;
  summary: string;
  /** Production URL. `live: false` until it is actually serving. */
  url?: string;
  live?: boolean;
  stack: string[];
  branch: string;
  licence: string;
  visibility: "public" | "private";
  deploy: string;
  deployKind: "pages" | "workers" | "github-pages" | "none";
  ci: string[];
  rules: string[];
  /** Files that exist in the repository, linked from its page. */
  files: { readme: boolean; agents: boolean };
  verified: string;
}

export const ORG_URL = "https://github.com/PaceStreak";

export const repos: Repo[] = [
  {
    name: "pacestreak",
    slug: "pacestreak",
    title: "Workspace root",
    summary:
      "The root repository. It holds the workspace-wide AGENTS.md, HANDOFF.md and README.md, and pins every other repository as a git submodule.",
    stack: ["Git submodules", "Markdown"],
    branch: "main",
    licence: "None stated",
    visibility: "public",
    deploy:
      "Nothing deploys. Committing inside a component does not move the root's pin: run `git add <component>` at the root and commit.",
    deployKind: "none",
    ci: [],
    rules: [
      "AGENTS.md here is the single source of workspace rules; CLAUDE.md only imports it.",
      "Clone with `git clone --recurse-submodules`.",
      "Push the submodules before the root, or the pins point at commits nobody can fetch.",
    ],
    files: { readme: true, agents: true },
    verified: "2026-10-21",
  },
  {
    name: "web",
    slug: "web",
    title: "Public site",
    summary:
      "The marketing site at www.pacestreak.com, the first thing a stranger sees. Marketing only: no login, no session check, no API call.",
    url: "https://www.pacestreak.com",
    stack: ["Astro 7", "Tailwind CSS v4", "Static output"],
    branch: "main",
    licence: "AGPL-3.0",
    visibility: "public",
    deploy:
      "Push to `main`: the Git-connected Cloudflare Pages project `pacestreak-web` builds it (`npm run build`, which also writes the CSP style hashes).",
    deployKind: "pages",
    ci: [
      "npm ci",
      "Build",
      "check-html.py over the built HTML",
      "Assert required files were emitted (404.html, robots.txt)",
    ],
    rules: [
      "Marketing only: never add a login, a session check or an API call.",
      "Every product claim reads from `src/data/product.ts`. No pricing claims, ever.",
      "CSP `default-src 'self'` with no 'unsafe-inline'; the inlined stylesheet is allowed by hash.",
      "`assetsInlineLimit: 0` is load-bearing.",
      "`robots.txt` allows everything and is not interchangeable with app's.",
    ],
    files: { readme: true, agents: true },
    verified: "2026-10-21",
  },
  {
    name: "blog",
    slug: "blog",
    title: "Blog",
    summary:
      "Notes on building PaceStreak in the open, at blog.pacestreak.com: the streak engine, privacy, infrastructure and every release.",
    url: "https://blog.pacestreak.com",
    stack: ["Astro 7", "Tailwind CSS v4", "Shiki", "Static output"],
    branch: "main",
    licence: "AGPL-3.0",
    visibility: "public",
    deploy:
      "Push to `main`: the Git-connected Cloudflare Pages project `pacestreak-blog` builds it.",
    deployKind: "pages",
    ci: [
      "Prettier format check",
      "astro check (validates post frontmatter)",
      "Build",
      "Assert 404.html, robots.txt, sitemap and RSS were emitted",
      "Assert every post has a share card",
      "markdownlint",
    ],
    rules: [
      "A post is one Markdown file in `src/content/blog/`; frontmatter is validated.",
      "Write posts from the code, not from memory: every repository is public.",
      "`style-src` allows 'unsafe-inline' for Shiki; `script-src` stays 'self'.",
      "`404.html` must exist in dist; CI asserts it.",
    ],
    files: { readme: true, agents: true },
    verified: "2026-10-21",
  },
  {
    name: "app",
    slug: "app",
    title: "The product",
    summary:
      "The signed-in PaceStreak product at app.pacestreak.com: a PWA covering habits, training logs, week-based streaks, progress, social and notifications.",
    url: "https://app.pacestreak.com",
    stack: [
      "React 19",
      "Vite 8",
      "TypeScript 7",
      "React Router",
      "TanStack Query",
      "Tailwind CSS v4",
      "Vitest",
      "Playwright",
    ],
    branch: "main",
    licence: "AGPL-3.0",
    visibility: "public",
    deploy:
      "Push to `main`: the Git-connected Cloudflare Pages project `pacestreak-app` builds it. There is no deploy workflow.",
    deployKind: "pages",
    ci: [
      "npm ci, unit tests (Vitest), build",
      "Build output keeps the CSP and routing guarantees (404, noindex, no inline scripts)",
      "End-to-end tests with Playwright against a real API",
    ],
    rules: [
      "`noindex` with `robots.txt` `Disallow: /`; never copy web's robots.txt here.",
      "`connect-src` names https://api.pacestreak.com; change it in the same commit as the API base URL.",
      "Cloudflare Turnstile is the one third-party origin; never add another.",
      "A new top-level route must be added to `src/routes.json`, or it 404s.",
      "Habits, food, body and journal data never appear on a social surface.",
      "No Prettier config: match the surrounding style by hand.",
    ],
    files: { readme: true, agents: true },
    verified: "2026-10-21",
  },
  {
    name: "api",
    slug: "api",
    title: "API",
    summary:
      "The backend at api.pacestreak.com: 272 routes under /v1, a scheduler and a job queue, in one Cloudflare Worker on the Workers Free plan.",
    url: "https://api.pacestreak.com/health",
    stack: [
      "TypeScript 7",
      "Hono",
      "Cloudflare Workers",
      "D1 via Drizzle",
      "Zod",
      "R2",
      "Queues",
      "Vitest in workerd",
      "Biome",
    ],
    branch: "main",
    licence: "AGPL-3.0",
    visibility: "public",
    deploy:
      "Push to `main`: Workers Builds is connected to `PaceStreak/api` `main`. It builds with `pnpm run build`, then runs `pnpm wrangler d1 migrations apply pacestreak --remote && pnpm wrangler deploy`, so a push migrates and deploys. (Until 2026-10-21 the deploy command was `npx wrangler deploy`, without migrations.) Staging is still deployed by hand with `--env staging`.",
    deployKind: "workers",
    ci: [
      "Runtime types are current",
      "Typecheck",
      "Lint and format (Biome)",
      "Module boundaries",
      "Migrations match the schema",
      "Tests",
      "Ported test names (pytest parity)",
      "Bundle builds within budget",
      "gitleaks (working tree)",
      "Nightly backup of D1 into Neon (backup.yml, 23:30 IST)",
    ],
    rules: [
      "Free plan: 10 ms CPU per request, 50 D1 queries per invocation (the code budgets 45), 5 cron triggers per account.",
      "Never run `wrangler triggers deploy` casually: it counts as a production deployment.",
      "Secrets live in Worker secrets and the gitignored `.dev.vars`, never in the repository.",
      "The earlier Python (FastAPI) service is kept on branch `old`.",
    ],
    files: { readme: true, agents: true },
    verified: "2026-10-21",
  },
  {
    name: "status",
    slug: "status",
    title: "Status page",
    summary:
      "Uptime monitoring and the public status page at status.pacestreak.com, powered by Upptime: GitHub Actions, Issues and Pages, with no server.",
    url: "https://status.pacestreak.com",
    stack: ["Upptime", "GitHub Actions", "GitHub Pages"],
    branch: "master",
    licence: "MIT",
    visibility: "public",
    deploy:
      "GitHub Pages, built by Upptime's generated workflows. The record is DNS-only (grey cloud) so GitHub can issue its certificate.",
    deployKind: "github-pages",
    ci: [
      "Uptime checks every five minutes (uptime.yml)",
      "Response time, graphs, summary and site workflows generated by Upptime",
    ],
    rules: [
      "`.upptimerc.yml` is the single source of truth; the workflows are generated from it, never edit them by hand.",
      "Set each monitor's `slug` explicitly, or renaming it orphans its history.",
      "Monitors www, the apex, blog, app, the API's /health and /health/worker, and each TLS certificate.",
    ],
    files: { readme: true, agents: false },
    verified: "2026-10-21",
  },
  {
    name: ".github",
    slug: "dot-github",
    title: "Organisation profile",
    summary:
      "The PaceStreak GitHub organisation profile (`profile/README.md`) and the default community health files.",
    stack: ["Markdown"],
    branch: "main",
    licence: "MIT",
    visibility: "public",
    deploy: "Nothing to deploy: GitHub renders the profile from `main`.",
    deployKind: "none",
    ci: [],
    rules: [
      "The profile describes only what the product does today. No pricing claims.",
      "`SECURITY.md` is duplicated in each repository on purpose; change all copies together.",
      "Workflow files cannot be pushed with GITHUB_TOKEN; use SSH.",
    ],
    files: { readme: false, agents: true },
    verified: "2026-10-21",
  },
  {
    name: "infra",
    slug: "infra",
    title: "Infrastructure docs",
    summary:
      "DNS, Cloudflare configuration, deployment topology and runbooks, as Markdown, plus this documentation site, built from that Markdown.",
    url: "https://docs.pacestreak.com",
    live: true,
    stack: ["Markdown", "Astro 7", "Tailwind CSS v4", "Shiki"],
    branch: "main",
    licence: "AGPL-3.0",
    visibility: "public",
    deploy:
      "The Markdown is documentation, not automation: nothing is applied. Push to `main`: the Git-connected Cloudflare Pages project `pacestreak-docs` builds `site/` (`npm ci && npm run build`, output `dist`) and serves docs.pacestreak.com.",
    deployKind: "pages",
    ci: [
      "Site: Prettier, astro check, build, check-html.py",
      "markdownlint on the root documents",
      "Freshness: every org repository is listed here, every live URL answers",
    ],
    rules: [
      "Keep TOPOLOGY.md, RUNBOOK.md and DECISIONS.md true to what is live; check before writing.",
      "Never hand-create a DNS record ahead of a deployment: a 522 is worse than NXDOMAIN.",
      "No secret values, keys or tokens, ever.",
    ],
    files: { readme: true, agents: true },
    verified: "2026-10-21",
  },
];

export const repoUrl = (r: Repo) => `${ORG_URL}/${r.name}`;
export const repoFile = (r: Repo, file: string) =>
  `${ORG_URL}/${r.name}/blob/${r.branch}/${file}`;
