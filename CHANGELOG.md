# Changelog

Changes to infrastructure, and to the documentation of it.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Dated rather than versioned — infrastructure is continuously deployed.

## 2026-10-02

### Changed

- **All repositories are public.** Histories were scanned for secrets first
  and commit messages cleaned of tool-generated trailers; the root repo's
  submodule pins were remapped so every historical pin still resolves.

### Fixed

- **App deep links redirected to Today.** The SPA rewrite target was
  `/index.html`, which Pages turns into a 308 to `/`. Now `/`; checked on a
  preview branch before merging. Runbook entry added.

### Changed

- Page routes on `www`, `blog` and `app` send `Cache-Control: no-transform`
  so the zone's Web Analytics beacon is no longer injected (the CSP blocked it
  and every page logged an error). Lighthouse is 100 on every desktop
  category.
- `www` inlines its stylesheet, allowed in the CSP by a hash generated at
  build time; `check-html.py` fails the build if it's missing. Archivo is
  preloaded on `www` and the blog, removing a 0.06 layout shift.
- `www` and `blog` serve `llms.txt` and `/.well-known/ai-catalog.json`; `www`
  registers one read-only WebMCP tool.
- New API tables and columns (trash, habit snooze, summary hour, backup
  attachment) applied by the VM's boot-time migration.
- `blog`: `fflate` pinned to 0.8.3 by an npm override instead of npm's
  suggested fix, which would have downgraded `satori`. `web`: `npm audit fix`
  cleared the `devalue` and `undici` advisories.

### Documented

- `TOPOLOGY.md`: the `app` and `api` records, Brevo's DKIM and why SPF lists
  only Zoho, the third Pages project, per-site CSPs, `no-transform`, SPA
  routing and the agent files.
- `RUNBOOK.md`: API deploys that don't arrive, deep links landing on Today,
  injected-beacon CSP errors; worker commands updated from Compose to Swarm.
- `DECISIONS.md`: the backup email opt-in, server-side undo, signed
  notification buttons, insights without a model, and hashed inline CSS.

## 2026-09-27

### Added

- `api.pacestreak.com` live: a FastAPI app and worker on a GCP `e2-micro` VM,
  reached through a Cloudflare Tunnel with no public inbound port. Neon
  Postgres, Upstash Redis, Brevo for mail.
- `app.pacestreak.com` live as the `pacestreak-app` Pages project.

## 2026-08-30

### Changed

- **`pacestreak` renamed to `pacestreak-web`.** Both Pages projects now match
  the repository they build. The rename was done in the Cloudflare dashboard
  and caused no downtime: the `pages.dev` subdomain does not follow it
  (`pacestreak-web` still serves `pacestreak.pages.dev`), so custom domains,
  certificates, the Git connection and the deployment history were all
  untouched.

### Fixed

- **A decision record that was wrong on the facts.** It claimed Pages projects
  cannot be renamed and priced a rename at real downtime plus two certificate
  re-issues. `wrangler pages project` exposes only `list`, `create` and
  `delete`, and the name appears in the `pages.dev` hostname — which together
  read as immutable. The dashboard renames in place. Rewritten, with the wrong
  inference kept on the record: absence from a CLI is evidence about the CLI,
  not the platform.

### Added

- The Pages naming convention (`pacestreak-<repo>`) in `TOPOLOGY.md`, plus the
  warning that a project's name and its `pages.dev` hostname can disagree
  permanently after a rename — so the project name cannot be inferred from the
  URL.

## 2026-08-29

### Changed

- `PaceStreak/landing` was renamed to `PaceStreak/web`, and the Pages project
  `pacestreak` now builds from it. Every reference here was updated. The old
  placeholder `web` was archived as `web-archived` and is pending deletion.

### Added

- A decision record for splitting the product onto `app.pacestreak.com`,
  separate from the public site on `www` — the caching and indexing policies of
  the two are opposites, and the public site must not gain an auth dependency.
- `TOPOLOGY.md` now states explicitly that `app` and `api` have no DNS records
  on purpose, and that they must be created by attaching a custom domain to a
  deployment rather than by hand — a proxied record pointing at nothing returns
  a `522` that reads as a broken product.

## 2026-08-28

### Added

- Repository created, documenting infrastructure that was already live.
- `TOPOLOGY.md` — DNS records, the redirect rule, Pages projects and
  certificates, with the reasoning for the non-obvious ones (the apex CNAME
  needing Cloudflare's flattening to coexist with Zoho's MX records; `status`
  being the single grey-cloud record).
- `RUNBOOK.md` — eight failure modes, every one of which actually occurred
  while building this, ordered by frequency rather than severity.
- `DECISIONS.md` — five choices that are expensive or impossible to reverse,
  including the AGPL licensing, which is one-way for published code.
